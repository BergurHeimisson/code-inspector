import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { git, gitTry } from './run.js'
import { parseHunks } from './hunks.js'

function toLines(text) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? [] : body.split('\n')
}

async function statusOf(repoPath, base, relPath) {
  // Rename detection needs both the old and new path in the diffed set, so
  // this cannot be restricted to a single pathspec — a pathspec-limited diff
  // never shows git the deleted counterpart and renames come back as 'A'.
  const diff = await gitTry(repoPath, ['diff', '--name-status', '-z', '--find-renames', base])
  const tokens = (diff ?? '').split('\0').filter((token) => token !== '')

  let i = 0
  while (i < tokens.length) {
    const code = tokens[i]
    if (code.startsWith('R') || code.startsWith('C')) {
      const [oldPath, newPath] = [tokens[i + 1], tokens[i + 2]]
      if (newPath === relPath) return { status: 'R', oldPath }
      i += 3
    } else {
      if (tokens[i + 1] === relPath) return { status: code[0], oldPath: null }
      i += 2
    }
  }

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

  // Same rename-detection constraint as statusOf: without the old path in
  // the diffed set, git can't pair a rename and reports the whole file as
  // added.
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
