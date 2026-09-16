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

  it('reports a committed addition but not an untracked file', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    repo.write('c.txt', 'three\n')

    const result = await changedFiles(repo.dir, base)
    expect(result.map((f) => [f.path, f.status])).toEqual([['b.txt', 'A']])
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
    repo.run('add', 'a folder/my file.txt')

    const result = await changedFiles(repo.dir, base)
    expect(result[0].path).toBe('a folder/my file.txt')
  })

  it('returns an empty list when nothing changed', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    expect(await changedFiles(repo.dir, base)).toEqual([])
  })

  it('omits untracked files entirely', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('notes.txt', 'one\ntwo\nthree\n')
    writeFileSync(join(repo.dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))

    expect(await changedFiles(repo.dir, base)).toEqual([])
  })

  it('still reports a new file once it is staged', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('staged.txt', 'one\ntwo\n')
    repo.run('add', 'staged.txt')

    const result = await changedFiles(repo.dir, base)
    expect(result.map((f) => [f.path, f.status, f.added])).toEqual([['staged.txt', 'A', 2]])
  })
})
