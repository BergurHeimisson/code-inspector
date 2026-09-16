import { readdir, realpath, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, sep } from 'node:path'

const EXCLUDED = new Set(['node_modules'])

function outsideHome(path) {
  const error = new Error(`Path is outside the home directory: ${path}`)
  error.code = 'EOUTSIDEHOME'
  return error
}

async function isGitRepo(path) {
  try {
    await access(join(path, '.git'))
    return true
  } catch {
    return false
  }
}

export async function listDirectory(requestedPath, { home = homedir() } = {}) {
  if (requestedPath === '~') requestedPath = home

  const realHome = await realpath(home)

  let resolved
  try {
    resolved = await realpath(requestedPath)
  } catch {
    throw outsideHome(requestedPath)
  }

  if (resolved !== realHome && !resolved.startsWith(realHome + sep)) {
    throw outsideHome(requestedPath)
  }

  const dirents = await readdir(resolved, { withFileTypes: true })
  const directories = dirents.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !EXCLUDED.has(entry.name)
  )

  const entries = await Promise.all(
    directories.map(async (entry) => {
      const path = join(resolved, entry.name)
      return { name: entry.name, path, isGitRepo: await isGitRepo(path) }
    })
  )

  entries.sort((a, b) => a.name.localeCompare(b.name))

  return {
    path: resolved,
    parent: resolved === realHome ? null : dirname(resolved),
    isGitRepo: await isGitRepo(resolved),
    entries
  }
}
