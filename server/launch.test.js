import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeRepo } from '../tests/helpers/repo.js'

let repo
let configDir

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'ci-launch-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = configDir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(configDir, { recursive: true, force: true })
  await repo?.cleanup()
  repo = null
})

describe('initialProject', () => {
  it('prefers the repository containing the working directory', async () => {
    repo = await makeRepo()
    repo.write('src/a.txt', 'one\n')
    repo.commit('first')

    const { initialProject } = await import('./launch.js')
    expect(await initialProject(join(repo.dir, 'src'))).toBe(repo.dir)
  })

  it('falls back to the remembered project outside a repository', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')

    const { rememberProject } = await import('./state.js')
    await rememberProject(repo.dir)

    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBe(repo.dir)
    await rm(plain, { recursive: true, force: true })
  })

  it('returns null when the remembered project no longer exists', async () => {
    const { rememberProject } = await import('./state.js')
    await rememberProject('/repos/deleted-long-ago')

    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBeNull()
    await rm(plain, { recursive: true, force: true })
  })

  it('returns null with nothing remembered and no repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBeNull()
    await rm(plain, { recursive: true, force: true })
  })
})

describe('tailnetAddress', () => {
  it('returns null rather than throwing when Tailscale is absent', async () => {
    const { tailnetAddress } = await import('./launch.js')
    expect(await tailnetAddress({ binary: '/nonexistent/tailscale' })).toBeNull()
  })

  it('returns the first address the CLI reports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ci-ts-'))
    const fake = join(dir, 'tailscale')
    await writeFile(fake, '#!/bin/sh\nprintf "100.64.0.1\\n100.64.0.2\\n"\n', { mode: 0o755 })

    const { tailnetAddress } = await import('./launch.js')
    expect(await tailnetAddress({ binary: fake })).toBe('100.64.0.1')

    await rm(dir, { recursive: true, force: true })
  })
})
