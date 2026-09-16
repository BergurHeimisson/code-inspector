import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile, realpath } from 'node:fs/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

export async function makeRepo() {
  // realpath: on macOS, tmpdir() sits under a /var symlink to /private/var;
  // `git rev-parse --show-toplevel` resolves it, so callers comparing paths
  // need the resolved form too.
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'code-inspector-')))
  const run = (...args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

  run('init', '-b', 'main')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'Test')
  run('config', 'commit.gpgsign', 'false')

  const write = (relPath, text) => {
    const full = join(dir, relPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }

  const commit = (message) => {
    run('add', '-A')
    run('commit', '-m', message)
    return run('rev-parse', 'HEAD')
  }

  return {
    dir,
    run,
    write,
    commit,
    cleanup: () => rm(dir, { recursive: true, force: true })
  }
}
