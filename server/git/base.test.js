import { describe, it, expect, afterEach } from 'vitest'
import { resolveBase, EMPTY_TREE } from './base.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

// The remote URL is never contacted; only the local refs/remotes entries matter.

describe('resolveBase auto', () => {
  it('tier 1: uses @{upstream} when set on the branch', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const commitA = repo.commit('commit-A')
    repo.write('b.txt', 'two\n')
    const commitB = repo.commit('commit-B')

    repo.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
    // origin/feature points to commitB (tier 1)
    repo.run('update-ref', 'refs/remotes/origin/feature', commitB)
    // origin/HEAD and origin/main point to commitA (tiers 2-3)
    repo.run('update-ref', 'refs/remotes/origin/main', commitA)
    repo.run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')

    // Create feature branch with upstream to origin/feature
    repo.run('checkout', '-b', 'feature', commitB)
    repo.run('branch', '--set-upstream-to=origin/feature', 'feature')

    const { base, label } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(commitB)
    expect(label).toBe('vs origin/feature')
  })

  it('tier 2: falls back to origin/HEAD when no @{upstream}', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const commitA = repo.commit('commit-A')
    repo.write('b.txt', 'two\n')
    const commitB = repo.commit('commit-B')

    repo.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
    // origin/feature points to commitA (tier 2, via origin/HEAD)
    repo.run('update-ref', 'refs/remotes/origin/feature', commitA)
    // origin/HEAD -> origin/feature
    repo.run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/feature')
    // origin/main points to commitB (tier 3)
    repo.run('update-ref', 'refs/remotes/origin/main', commitB)

    // Already on main, just move to commitB
    repo.run('reset', '--hard', commitB)

    const { base, label } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(commitA)
    expect(label).toBe('vs origin/feature')
  })

  it('tier 3: falls back to origin/main when no upstream or origin/HEAD', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('commit-root')
    repo.write('b.txt', 'two\n')
    const commitMain = repo.commit('commit-main')
    repo.write('c.txt', 'three\n')
    const commitMaster = repo.commit('commit-master')

    repo.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
    // origin/main points to commitMain (tier 3, not root)
    repo.run('update-ref', 'refs/remotes/origin/main', commitMain)
    // origin/master points to commitMaster (to test that main is checked first)
    repo.run('update-ref', 'refs/remotes/origin/master', commitMaster)

    // Already on main, reset to HEAD
    repo.run('reset', '--hard', commitMaster)

    const { base, label } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(commitMain)
    expect(label).toBe('vs origin/main')
  })

  it('tier 4: falls back to origin/master when no main, HEAD, or @{upstream}', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('commit-root')
    repo.write('b.txt', 'two\n')
    const commitMaster = repo.commit('commit-master')
    repo.write('c.txt', 'three\n')
    const commitHead = repo.commit('commit-head')

    repo.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
    // origin/master points to commitMaster (tier 4, not root)
    repo.run('update-ref', 'refs/remotes/origin/master', commitMaster)

    // Already on main, reset to HEAD
    repo.run('reset', '--hard', commitHead)

    const { base, label } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(commitMaster)
    expect(label).toBe('vs origin/master')
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

  it('on main branch with unpushed commits, uses the tracked commit', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const first = repo.commit('first')
    repo.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
    repo.run('update-ref', 'refs/remotes/origin/main', first)
    repo.run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    repo.run('branch', '--set-upstream-to=origin/main', 'main')

    repo.write('c.txt', 'three\n')
    repo.commit('unpushed')
    const { base, label } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(first)
    expect(label).toBe('vs origin/main')
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
