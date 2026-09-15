import { describe, it, expect, afterEach } from 'vitest'
import { resolveBase, EMPTY_TREE } from './base.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

async function repoWithRemote() {
  const r = await makeRepo()
  r.write('a.txt', 'one\n')
  const first = r.commit('first')
  r.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
  r.run('update-ref', 'refs/remotes/origin/main', first)
  r.run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  r.run('branch', '--set-upstream-to=origin/main', 'main')
  return { r, first }
}

// The remote URL is never contacted; only the local refs/remotes entries matter.

describe('resolveBase auto', () => {
  it('uses the merge base with the tracking ref on a feature branch', async () => {
    const { r, first } = await repoWithRemote()
    repo = r
    r.run('checkout', '-b', 'feature')
    r.write('b.txt', 'two\n')
    r.commit('second')
    const { base } = await resolveBase(r.dir, { mode: 'auto' })
    expect(base).toBe(first)
  })

  it('yields the last pushed commit when working directly on main', async () => {
    const { r, first } = await repoWithRemote()
    repo = r
    r.write('c.txt', 'three\n')
    r.commit('unpushed')
    const { base } = await resolveBase(r.dir, { mode: 'auto' })
    expect(base).toBe(first)
  })

  it('falls back to the root commit when there is no remote', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const root = repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(root)
  })

  it('falls back to the empty tree when there are no commits', async () => {
    repo = await makeRepo()
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(EMPTY_TREE)
  })

  it('handles a detached HEAD without throwing', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const root = repo.commit('first')
    repo.run('checkout', '--detach', root)
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(root)
  })
})

describe('resolveBase explicit modes', () => {
  it('worktree mode bases on HEAD', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    expect(await resolveBase(repo.dir, { mode: 'worktree' }))
      .toEqual({ base: 'HEAD', label: 'working tree' })
  })

  it('commits mode bases on HEAD~n', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    const { base } = await resolveBase(repo.dir, { mode: 'commits', n: 1 })
    expect(base).toBe('HEAD~1')
  })

  it('ref mode uses the given ref verbatim', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    expect(await resolveBase(repo.dir, { mode: 'ref', ref: 'main' }))
      .toEqual({ base: 'main', label: 'vs main' })
  })
})
