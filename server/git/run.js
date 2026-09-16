import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MAX_BUFFER = 64 * 1024 * 1024

export async function git(repoPath, args, { maxBuffer = MAX_BUFFER, encoding = 'utf8' } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    maxBuffer,
    encoding,
    windowsHide: true
  })
  return stdout
}

export async function gitTry(repoPath, args, opts) {
  try {
    return (await git(repoPath, args, opts)).trim()
  } catch {
    return null
  }
}
