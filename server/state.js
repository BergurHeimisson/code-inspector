import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, STATE_FILE } from './paths.js'

const EMPTY_STATE = { lastProject: null, recents: [], paneWidth: 280, theme: null, scheme: null }
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
