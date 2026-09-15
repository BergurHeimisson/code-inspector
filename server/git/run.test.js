import { describe, it, expect, afterEach } from 'vitest'
import { git, gitTry } from './run.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('git', () => {
  it('returns stdout of a successful command', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'hello\n')
    repo.commit('first')
    const out = await git(repo.dir, ['log', '--oneline'])
    expect(out).toContain('first')
  })

  it('throws on a failing command', async () => {
    repo = await makeRepo()
    await expect(git(repo.dir, ['rev-parse', 'nope'])).rejects.toThrow()
  })
})

describe('gitTry', () => {
  it('returns trimmed stdout on success', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'hello\n')
    repo.commit('first')
    expect(await gitTry(repo.dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main')
  })

  it('returns null on failure instead of throwing', async () => {
    repo = await makeRepo()
    expect(await gitTry(repo.dir, ['rev-parse', 'nope'])).toBeNull()
  })
})
