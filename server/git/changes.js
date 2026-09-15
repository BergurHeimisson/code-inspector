import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { git } from './run.js'

const UNTRACKED_PREFIX = '?? '
const COUNT_LIMIT = 5 * 1024 * 1024

function splitZ(text) {
  return text.split('\0').filter((token) => token !== '')
}

async function numstat(repoPath, base) {
  const tokens = splitZ(await git(repoPath, ['diff', '--numstat', '-z', '--find-renames', base]))
  const byPath = new Map()

  for (let i = 0; i < tokens.length; i += 1) {
    const [added, removed, inlinePath] = tokens[i].split('\t')
    let path = inlinePath
    let oldPath = null

    if (path === '') {
      oldPath = tokens[i + 1]
      path = tokens[i + 2]
      i += 2
    }

    const binary = added === '-' || removed === '-'
    byPath.set(path, {
      oldPath,
      added: binary ? 0 : Number(added),
      removed: binary ? 0 : Number(removed),
      binary
    })
  }
  return byPath
}

async function nameStatus(repoPath, base) {
  const tokens = splitZ(await git(repoPath, ['diff', '--name-status', '-z', '--find-renames', base]))
  const byPath = new Map()

  for (let i = 0; i < tokens.length; i += 2) {
    const code = tokens[i]
    if (code.startsWith('R')) {
      byPath.set(tokens[i + 2], 'R')
      i += 1
      continue
    }
    byPath.set(tokens[i + 1], code[0])
  }
  return byPath
}

async function untrackedPaths(repoPath) {
  const tokens = splitZ(
    await git(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  )
  return tokens
    .filter((token) => token.startsWith(UNTRACKED_PREFIX))
    .map((token) => token.slice(UNTRACKED_PREFIX.length))
}

async function countLines(fullPath) {
  try {
    const { size } = await stat(fullPath)
    if (size > COUNT_LIMIT) return { added: 0, binary: false }

    const buffer = await readFile(fullPath)
    if (buffer.subarray(0, 8000).includes(0)) return { added: 0, binary: true }

    const text = buffer.toString('utf8')
    if (text === '') return { added: 0, binary: false }
    return { added: text.replace(/\n$/, '').split('\n').length, binary: false }
  } catch {
    return { added: 0, binary: false }
  }
}

export async function changedFiles(repoPath, base) {
  const [stats, statuses, newPaths] = await Promise.all([
    numstat(repoPath, base),
    nameStatus(repoPath, base),
    untrackedPaths(repoPath)
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

  for (const path of newPaths) {
    const { added, binary } = await countLines(join(repoPath, path))
    files.push({ path, oldPath: null, status: '?', added, removed: 0, binary })
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
