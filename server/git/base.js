import { gitTry } from './run.js'

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

async function findUpstream(repoPath) {
  const tracking = await gitTry(repoPath, [
    'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'
  ])
  if (tracking) return tracking

  const head = await gitTry(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head

  for (const candidate of ['origin/main', 'origin/master']) {
    if (await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', candidate])) return candidate
  }
  return null
}

async function resolveAuto(repoPath) {
  const head = await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  if (!head) return { base: EMPTY_TREE, label: 'empty repository' }

  const upstream = await findUpstream(repoPath)
  if (upstream) {
    const mergeBase = await gitTry(repoPath, ['merge-base', 'HEAD', upstream])
    if (mergeBase) return { base: mergeBase, label: `vs ${upstream}` }
  }

  const roots = await gitTry(repoPath, ['rev-list', '--max-parents=0', 'HEAD'])
  if (roots) {
    const root = roots.split('\n').filter(Boolean).pop()
    return { base: root, label: 'full history' }
  }
  return { base: EMPTY_TREE, label: 'empty repository' }
}

export async function resolveBase(repoPath, range = { mode: 'auto' }) {
  switch (range.mode) {
    case 'worktree':
      return { base: 'HEAD', label: 'working tree' }
    case 'commits':
      return { base: `HEAD~${range.n}`, label: `last ${range.n} commits` }
    case 'ref':
      return { base: range.ref, label: `vs ${range.ref}` }
    default:
      return resolveAuto(repoPath)
  }
}
