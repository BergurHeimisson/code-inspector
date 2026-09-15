import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listDirectory } from './browse.js'

let home

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'ci-home-')))
  await mkdir(join(home, 'projects/alpha/.git'), { recursive: true })
  await mkdir(join(home, 'projects/notes'), { recursive: true })
  await mkdir(join(home, 'projects/.hidden'), { recursive: true })
  await mkdir(join(home, 'projects/node_modules'), { recursive: true })
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('listDirectory', () => {
  it('lists directories and flags git repositories', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    expect(listing.entries).toEqual([
      { name: 'alpha', path: join(home, 'projects/alpha'), isGitRepo: true },
      { name: 'notes', path: join(home, 'projects/notes'), isGitRepo: false }
    ])
  })

  it('excludes dot-directories and node_modules', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    const names = listing.entries.map((e) => e.name)
    expect(names).not.toContain('.hidden')
    expect(names).not.toContain('node_modules')
  })

  it('reports the parent directory', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    expect(listing.parent).toBe(home)
  })

  it('reports no parent at the home directory', async () => {
    const listing = await listDirectory(home, { home })
    expect(listing.parent).toBeNull()
  })

  it('rejects a path outside the home directory', async () => {
    await expect(listDirectory('/etc', { home })).rejects.toMatchObject({
      code: 'EOUTSIDEHOME'
    })
  })

  it('rejects a symlink inside home that escapes home', async () => {
    await symlink('/etc', join(home, 'escape'))
    await expect(listDirectory(join(home, 'escape'), { home })).rejects.toMatchObject({
      code: 'EOUTSIDEHOME'
    })
  })

  it('rejects a path that only shares a name prefix with home', async () => {
    const sibling = `${home}-elsewhere`
    await mkdir(sibling, { recursive: true })
    try {
      await expect(listDirectory(sibling, { home })).rejects.toMatchObject({
        code: 'EOUTSIDEHOME'
      })
    } finally {
      await rm(sibling, { recursive: true, force: true })
    }
  })
})
