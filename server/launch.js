import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitTry } from './git/run.js'
import { loadState } from './state.js'

const execFileAsync = promisify(execFile)

const TAILSCALE_BINARY = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

export async function initialProject(cwd) {
  const here = await gitTry(cwd, ['rev-parse', '--show-toplevel'])
  if (here) return here

  const { lastProject } = await loadState()
  if (!lastProject) return null

  const remembered = await gitTry(lastProject, ['rev-parse', '--show-toplevel'])
  return remembered ?? null
}

export async function tailnetAddress({ binary = TAILSCALE_BINARY } = {}) {
  try {
    const { stdout } = await execFileAsync(binary, ['ip', '-4'], { encoding: 'utf8' })
    return stdout.trim().split('\n')[0] || null
  } catch {
    return null
  }
}
