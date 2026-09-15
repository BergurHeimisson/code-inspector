import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, parseRange } from './app.js'
import { makeRepo } from '../tests/helpers/repo.js'

let repo
let server
let baseUrl
let configDir

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'ci-app-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = configDir
  const app = createApp({ distDir: null })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await new Promise((resolve) => server.close(resolve))
  await rm(configDir, { recursive: true, force: true })
  await repo?.cleanup()
  repo = null
})

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`)
  return { status: response.status, body: await response.json() }
}

describe('parseRange', () => {
  it('defaults to auto', () => {
    expect(parseRange(undefined)).toEqual({ mode: 'auto' })
    expect(parseRange('auto')).toEqual({ mode: 'auto' })
  })

  it('parses worktree, commits and ref', () => {
    expect(parseRange('worktree')).toEqual({ mode: 'worktree' })
    expect(parseRange('commits:5')).toEqual({ mode: 'commits', n: 5 })
    expect(parseRange('ref:origin/main')).toEqual({ mode: 'ref', ref: 'origin/main' })
  })

  it('rejects a non-numeric commit count', () => {
    expect(() => parseRange('commits:abc')).toThrow()
  })
})

describe('GET /api/project', () => {
  it('reports the branch and resolved base', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')

    const { status, body } = await get(`/api/project?path=${encodeURIComponent(repo.dir)}`)
    expect(status).toBe(200)
    expect(body.branch).toBe('main')
    expect(body.root).toBe(repo.dir)
    expect(body.label).toBe('full history')
  })

  it('resolves a subdirectory to the repository root', async () => {
    repo = await makeRepo()
    repo.write('src/a.txt', 'one\n')
    repo.commit('first')

    const sub = join(repo.dir, 'src')
    const { body } = await get(`/api/project?path=${encodeURIComponent(sub)}`)
    expect(body.root).toBe(repo.dir)
  })

  it('returns 404 for a directory that is not a repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { status } = await get(`/api/project?path=${encodeURIComponent(plain)}`)
    expect(status).toBe(404)
    await rm(plain, { recursive: true, force: true })
  })

  it('returns 400 when path is missing', async () => {
    const { status } = await get('/api/project')
    expect(status).toBe(400)
  })
})

describe('GET /api/changes', () => {
  it('lists changed files', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('a.txt', 'ONE\n')

    const { body } = await get(`/api/changes?path=${encodeURIComponent(repo.dir)}`)
    expect(body.files.map((f) => f.path)).toEqual(['a.txt'])
  })

  it('honours an explicit worktree range', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')

    const query = `path=${encodeURIComponent(repo.dir)}&range=worktree`
    const { body } = await get(`/api/changes?${query}`)
    expect(body.files).toEqual([])
    expect(body.label).toBe('working tree')
  })
})

describe('GET /api/file', () => {
  it('returns line states for a file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const query = `path=${encodeURIComponent(repo.dir)}&file=${encodeURIComponent('x.js')}`
    const { body } = await get(`/api/file?${query}`)
    expect(body.lines.map((l) => l.state)).toEqual(['unchanged', 'added'])
  })

  it('returns 400 when file is missing', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    const { status } = await get(`/api/file?path=${encodeURIComponent(repo.dir)}`)
    expect(status).toBe(400)
  })
})

describe('GET /api/fs/list', () => {
  it('returns 403 for a path outside the home directory', async () => {
    const { status, body } = await get('/api/fs/list?path=%2Fetc')
    expect(status).toBe(403)
    expect(body.error).toBeTruthy()
  })
})

describe('config and state endpoints', () => {
  it('serves the default config', async () => {
    const { body } = await get('/api/config')
    expect(body.defaultTheme).toBe('dark')
    expect(body.themes.dark.added).toBeTruthy()
  })

  it('round-trips a state patch', async () => {
    const response = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paneWidth: 333 })
    })
    expect((await response.json()).paneWidth).toBe(333)
    expect((await get('/api/state')).body.paneWidth).toBe(333)
  })

  it('remembers a project', async () => {
    const response = await fetch(`${baseUrl}/api/state/project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/repos/alpha' })
    })
    const body = await response.json()
    expect(body.lastProject).toBe('/repos/alpha')
    expect(body.recents).toEqual(['/repos/alpha'])
  })
})
