import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ci-state-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = dir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(dir, { recursive: true, force: true })
})

describe('state', () => {
  it('returns empty state when no file exists', async () => {
    const { loadState } = await import('./state.js')
    expect(await loadState()).toEqual({
      lastProject: null,
      recents: [],
      visited: {},
      paneWidth: 280,
      theme: null,
      scheme: null
    })
  })

  it('persists a patch across reloads', async () => {
    const { saveState, loadState } = await import('./state.js')
    await saveState({ paneWidth: 400 })
    expect((await loadState()).paneWidth).toBe(400)
  })

  it('remembers a project as last and most recent', async () => {
    const { rememberProject } = await import('./state.js')
    const state = await rememberProject('/repos/alpha')
    expect(state.lastProject).toBe('/repos/alpha')
    expect(state.recents).toEqual(['/repos/alpha'])
  })

  it('moves a repeated project to the front without duplicating it', async () => {
    const { rememberProject } = await import('./state.js')
    await rememberProject('/repos/alpha')
    await rememberProject('/repos/beta')
    const state = await rememberProject('/repos/alpha')
    expect(state.recents).toEqual(['/repos/alpha', '/repos/beta'])
  })

  it('caps recents at five entries', async () => {
    const { rememberProject } = await import('./state.js')
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
      await rememberProject(`/repos/${name}`)
    }
    const { loadState } = await import('./state.js')
    const state = await loadState()
    expect(state.recents).toHaveLength(5)
    expect(state.recents[0]).toBe('/repos/f')
    expect(state.recents).not.toContain('/repos/a')
  })
})

describe('markVisited', () => {
  it('records a file under its repo with the signature it was seen at', async () => {
    const { markVisited } = await import('./state.js')
    const state = await markVisited('/repo/a', 'server/app.js', '12/3', ['server/app.js'])

    expect(state.visited).toEqual({ '/repo/a': { 'server/app.js': '12/3' } })
  })

  it('keeps entries for other repositories untouched', async () => {
    const { markVisited } = await import('./state.js')
    await markVisited('/repo/a', 'a.js', '1/0', ['a.js'])
    const state = await markVisited('/repo/b', 'b.js', '2/0', ['b.js'])

    expect(state.visited['/repo/a']).toEqual({ 'a.js': '1/0' })
    expect(state.visited['/repo/b']).toEqual({ 'b.js': '2/0' })
  })

  it('drops files that have left the change list', async () => {
    const { markVisited } = await import('./state.js')
    await markVisited('/repo/a', 'gone.js', '1/0', ['gone.js', 'kept.js'])
    const state = await markVisited('/repo/a', 'kept.js', '2/0', ['kept.js'])

    expect(state.visited['/repo/a']).toEqual({ 'kept.js': '2/0' })
  })

  it('overwrites the signature when the same file is opened again', async () => {
    const { markVisited } = await import('./state.js')
    await markVisited('/repo/a', 'a.js', '1/0', ['a.js'])
    const state = await markVisited('/repo/a', 'a.js', '9/4', ['a.js'])

    expect(state.visited['/repo/a']).toEqual({ 'a.js': '9/4' })
  })
})
