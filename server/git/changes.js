import { git } from './run.js'
import { parseNameStatusZ, parseNumstatZ } from './parse.js'

async function numstat(repoPath, base) {
  const records = parseNumstatZ(await git(repoPath, ['diff', '--numstat', '-z', '--find-renames', base]))
  const byPath = new Map()

  for (const { path, oldPath, added, removed, binary } of records) {
    byPath.set(path, { oldPath, added, removed, binary })
  }
  return byPath
}

async function nameStatus(repoPath, base) {
  const records = parseNameStatusZ(
    await git(repoPath, ['diff', '--name-status', '-z', '--find-renames', base])
  )
  const byPath = new Map()

  for (const { status, path } of records) byPath.set(path, status)
  return byPath
}

// Untracked files are deliberately absent: `git diff` only reports what is in
// the index or a commit, so a file has to be staged before it shows up here.
export async function changedFiles(repoPath, base) {
  const [stats, statuses] = await Promise.all([
    numstat(repoPath, base),
    nameStatus(repoPath, base)
  ])

  const files = []

  for (const [path, entry] of stats) {
    files.push({
      path,
      oldPath: entry.oldPath,
      status: statuses.get(path) ?? 'M',
      added: entry.added,
      removed: entry.removed,
      binary: entry.binary
    })
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
