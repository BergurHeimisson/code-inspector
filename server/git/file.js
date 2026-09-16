import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { git, gitTry } from './run.js'
import { parseHunks } from './hunks.js'
import { parseNameStatusZ } from './parse.js'

function toLines(text) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? [] : body.split('\n')
}

function findStatus(text, relPath) {
  // Renames and copies both render as 'R' with an oldPath: FileView shows
  // "renamed from …" and has no separate copy state, so the collapse here
  // is deliberate even though the shared parser reports 'C' distinctly.
  const record = parseNameStatusZ(text).find((r) => r.path === relPath)
  if (!record) return null
  if (record.status === 'R' || record.status === 'C') {
    return { status: 'R', oldPath: record.oldPath }
  }
  return { status: record.status, oldPath: null }
}

async function statusOf(repoPath, base, relPath) {
  // Cheap path first: a diff restricted to this one pathspec is correct for
  // every status except a rename, because rename detection needs the old
  // path in the diffed set too. 'M', 'D', 'C' and a directly-reported 'R'
  // are trustworthy straight from this restricted diff.
  const restricted = await gitTry(repoPath, [
    'diff', '--name-status', '-z', '--find-renames', base, '--', relPath
  ])
  const restrictedResult = findStatus(restricted ?? '', relPath)
  if (restrictedResult && restrictedResult.status !== 'A') return restrictedResult

  // 'A' or no record at all is exactly what a hidden rename looks like from
  // the restricted diff, so only now pay for the expensive whole-tree diff
  // that lets git pair the old and new path. Use git, not gitTry: if this
  // overflows maxBuffer or otherwise fails, surfacing the error beats
  // silently falling through to a wrong status below.
  const full = await git(repoPath, ['diff', '--name-status', '-z', '--find-renames', base])
  const fullResult = findStatus(full, relPath)
  if (fullResult) return fullResult

  const tracked = await gitTry(repoPath, ['ls-files', '--error-unmatch', '--', relPath])
  return { status: tracked ? 'M' : '?', oldPath: null }
}

function stub(path, oldPath, status, flags) {
  return {
    path,
    oldPath,
    status,
    binary: flags.binary ?? false,
    tooLarge: flags.tooLarge ?? false,
    lines: [],
    deletions: []
  }
}

function uniform(path, oldPath, status, texts, state) {
  return {
    path,
    oldPath,
    status,
    binary: false,
    tooLarge: false,
    lines: texts.map((text, i) => ({ n: i + 1, text, state })),
    deletions: []
  }
}

export async function fileLines(repoPath, base, relPath, { maxFileBytes }) {
  const { status, oldPath } = await statusOf(repoPath, base, relPath)

  if (status === 'D') {
    const content = await git(repoPath, ['show', `${base}:${relPath}`])
    return uniform(relPath, oldPath, status, toLines(content), 'deleted')
  }

  const fullPath = join(repoPath, relPath)
  const { size } = await stat(fullPath)
  if (size > maxFileBytes) return stub(relPath, oldPath, status, { tooLarge: true })

  const buffer = await readFile(fullPath)
  if (buffer.subarray(0, 8000).includes(0)) {
    return stub(relPath, oldPath, status, { binary: true })
  }

  const texts = toLines(buffer.toString('utf8'))

  if (status === '?') return uniform(relPath, oldPath, status, texts, 'added')

  // Must keep --find-renames identical to statusOf's calls: a mismatch here
  // would let one call detect a rename the other misses and reinstate the
  // whole-file-orange bug.
  const pathspec = oldPath ? [oldPath, relPath] : [relPath]
  const diff = await git(repoPath, ['diff', '-U0', '--find-renames', base, '--', ...pathspec])
  const { addedLines, deletions } = parseHunks(diff)
  const added = new Set(addedLines)

  return {
    path: relPath,
    oldPath,
    status,
    binary: false,
    tooLarge: false,
    lines: texts.map((text, i) => ({
      n: i + 1,
      text,
      state: added.has(i + 1) ? 'added' : 'unchanged'
    })),
    deletions
  }
}
