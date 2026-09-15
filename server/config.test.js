import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ci-config-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = dir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(dir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('writes the defaults on first run and returns them', async () => {
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)

    const onDisk = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'))
    expect(onDisk.themes.dark.added).toBe(DEFAULT_CONFIG.themes.dark.added)
  })

  it('merges a partial user config over the defaults', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ themes: { dark: { added: '#ff0000' } } })
    )
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()

    expect(config.themes.dark.added).toBe('#ff0000')
    expect(config.themes.dark.surface).toBe(DEFAULT_CONFIG.themes.dark.surface)
    expect(config.themes.light).toEqual(DEFAULT_CONFIG.themes.light)
  })

  it('falls back to the defaults when the file is unparseable', async () => {
    await writeFile(join(dir, 'config.json'), '{ not json')
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    expect(await loadConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('rejects a value of the wrong shape (object where a scalar is expected) and keeps merging siblings', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ maxFileBytes: {}, lineHeight: 30 })
    )
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()

    expect(config.maxFileBytes).toBe(DEFAULT_CONFIG.maxFileBytes)
    expect(config.lineHeight).toBe(30)
  })

  it('rejects a value of the wrong scalar type (string where a number is expected)', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({ maxFileBytes: '2097152' }))
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()

    expect(config.maxFileBytes).toBe(DEFAULT_CONFIG.maxFileBytes)
  })

  it('still merges a valid nested partial normally', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ themes: { light: { added: '#123456' } } })
    )
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()

    expect(config.themes.light.added).toBe('#123456')
    expect(config.themes.light.surface).toBe(DEFAULT_CONFIG.themes.light.surface)
  })

  it('preserves an unknown key not present in the defaults', async () => {
    await writeFile(join(dir, 'config.json'), JSON.stringify({ futureFlag: true }))
    const { loadConfig } = await import('./config.js')
    const config = await loadConfig()

    expect(config.futureFlag).toBe(true)
  })

  it('resolves to the defaults rather than throwing when the config directory cannot be written', async () => {
    await chmod(dir, 0o500)
    try {
      const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
      await expect(loadConfig()).resolves.toEqual(DEFAULT_CONFIG)
    } finally {
      await chmod(dir, 0o700)
    }
  })
})
