import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, STATE_FILE } from './paths.js'

const EMPTY_STATE = {
  lastProject: null,
  recents: [],
  visited: {},
  paneWidth: 280,
  theme: null,
  scheme: null
}
const MAX_RECENTS = 5

export async function loadState() {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(await readFile(STATE_FILE(), 'utf8')) }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export async function saveState(patch) {
  const next = { ...(await loadState()), ...patch }
  await mkdir(configDir(), { recursive: true })
  await writeFile(STATE_FILE(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export async function rememberProject(repoPath) {
  const { recents } = await loadState()
  const next = [repoPath, ...recents.filter((p) => p !== repoPath)].slice(0, MAX_RECENTS)
  return saveState({ lastProject: repoPath, recents: next })
}

// Visited marks are keyed by repository so two projects cannot overwrite each
// other, and store the +added/-removed signature the file was read at: once the
// counts move, the file has changed since it was verified and the mark lapses.
export async function markVisited(repoPath, filePath, signature, currentPaths) {
  const { visited } = await loadState()
  const present = new Set(currentPaths)
  const repo = { ...(visited[repoPath] ?? {}), [filePath]: signature }

  for (const path of Object.keys(repo)) {
    if (!present.has(path)) delete repo[path]
  }
  return saveState({ visited: { ...visited, [repoPath]: repo } })
}
