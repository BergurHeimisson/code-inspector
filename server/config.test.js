import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
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
})
