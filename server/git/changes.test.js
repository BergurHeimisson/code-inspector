import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedFiles } from './changes.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('changedFiles', () => {
  it('reports a modified file with its line counts', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\ntwo\n')
    const base = repo.commit('first')
    repo.write('a.txt', 'one\nTWO\nthree\n')

    expect(await changedFiles(repo.dir, base)).toEqual([
      { path: 'a.txt', oldPath: null, status: 'M', added: 2, removed: 1, binary: false }
    ])
  })

  it('reports a committed addition and an uncommitted one together', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    repo.write('c.txt', 'three\n')

    const result = await changedFiles(repo.dir, base)
    expect(result.map((f) => [f.path, f.status])).toEqual([
      ['b.txt', 'A'],
      ['c.txt', '?']
    ])
  })

  it('reports a deleted file', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\ntwo\n')
    const base = repo.commit('first')
    repo.run('rm', 'a.txt')

    expect(await changedFiles(repo.dir, base)).toEqual([
      { path: 'a.txt', oldPath: null, status: 'D', added: 0, removed: 2, binary: false }
    ])
  })

  it('reports a rename with its old path', async () => {
    repo = await makeRepo()
    repo.write('old.txt', 'one\ntwo\nthree\nfour\n')
    const base = repo.commit('first')
    repo.run('mv', 'old.txt', 'new.txt')

    const result = await changedFiles(repo.dir, base)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('new.txt')
    expect(result[0].oldPath).toBe('old.txt')
    expect(result[0].status).toBe('R')
  })

  it('flags a binary file and reports zero counts', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    writeFileSync(join(repo.dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
    repo.run('add', '-A')

    const result = await changedFiles(repo.dir, base)
    const png = result.find((f) => f.path === 'logo.png')
    expect(png.binary).toBe(true)
    expect(png.added).toBe(0)
  })

  it('handles paths containing spaces', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('a folder/my file.txt', 'hi\n')

    const result = await changedFiles(repo.dir, base)
    expect(result[0].path).toBe('a folder/my file.txt')
  })

  it('returns an empty list when nothing changed', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    expect(await changedFiles(repo.dir, base)).toEqual([])
  })

  it('reports the line count of an untracked multi-line file', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('notes.txt', 'one\ntwo\nthree\nfour\nfive\nsix\nseven\n')

    const result = await changedFiles(repo.dir, base)
    const notes = result.find((f) => f.path === 'notes.txt')
    expect(notes.status).toBe('?')
    expect(notes.added).toBe(7)
    expect(notes.removed).toBe(0)
    expect(notes.binary).toBe(false)
  })

  it('counts the same for an untracked file missing a trailing newline', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('notes.txt', 'one\ntwo\nthree\nfour\nfive\nsix\nseven')

    const result = await changedFiles(repo.dir, base)
    const notes = result.find((f) => f.path === 'notes.txt')
    expect(notes.added).toBe(7)
  })

  it('reports zero for an empty untracked file', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('empty.txt', '')

    const result = await changedFiles(repo.dir, base)
    const empty = result.find((f) => f.path === 'empty.txt')
    expect(empty.added).toBe(0)
    expect(empty.binary).toBe(false)
  })

  it('sniffs an untracked binary file itself, not via git', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    writeFileSync(join(repo.dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))

    const result = await changedFiles(repo.dir, base)
    const png = result.find((f) => f.path === 'logo.png')
    expect(png.status).toBe('?')
    expect(png.binary).toBe(true)
    expect(png.added).toBe(0)
  })

  it('does not count lines in an untracked file above the size cap', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    const line = 'x'.repeat(79) + '\n'
    const big = line.repeat(70000) // ~5.6 MiB, above the 5 MiB cap
    writeFileSync(join(repo.dir, 'huge.txt'), big)

    const result = await changedFiles(repo.dir, base)
    const huge = result.find((f) => f.path === 'huge.txt')
    expect(huge.added).toBe(0)
    expect(huge.binary).toBe(false)
  })
})
