import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileLines } from './file.js'
import { makeRepo } from '../../tests/helpers/repo.js'

const OPTS = { maxFileBytes: 2 * 1024 * 1024 }

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

const states = (view) => view.lines.map((l) => l.state)

describe('fileLines', () => {
  it('tints only the changed lines of a modified file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\nc\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(states(view)).toEqual(['unchanged', 'added', 'unchanged'])
    expect(view.lines[1].text).toBe('B')
    expect(view.status).toBe('M')
  })

  it('numbers lines from one', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines.map((l) => l.n)).toEqual([1, 2])
  })

  it('marks every line of an untracked file as added', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('new.js', 'x\ny\n')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('?')
    expect(states(view)).toEqual(['added', 'added'])
  })

  it('marks every line of a committed new file as added', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('new.js', 'x\ny\n')
    repo.commit('add new')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('A')
    expect(states(view)).toEqual(['added', 'added'])
  })

  it('shows a deleted file from the base with every line deleted', async () => {
    repo = await makeRepo()
    repo.write('gone.js', 'x\ny\n')
    const base = repo.commit('first')
    repo.run('rm', 'gone.js')

    const view = await fileLines(repo.dir, base, 'gone.js', OPTS)
    expect(view.status).toBe('D')
    expect(states(view)).toEqual(['deleted', 'deleted'])
    expect(view.lines[0].text).toBe('x')
  })

  it('reports deletion markers positioned in the new file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\nd\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nd\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.deletions).toEqual([{ after: 1, count: 2 }])
  })

  it('carries the old path for a rename', async () => {
    repo = await makeRepo()
    repo.write('old.js', 'a\nb\nc\nd\n')
    const base = repo.commit('first')
    repo.run('mv', 'old.js', 'new.js')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('R')
    expect(view.oldPath).toBe('old.js')
  })

  it('flags a binary file and returns no lines', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    writeFileSync(join(repo.dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x41]))

    const view = await fileLines(repo.dir, base, 'blob.bin', OPTS)
    expect(view.binary).toBe(true)
    expect(view.lines).toEqual([])
  })

  it('flags a file above the size limit and returns no lines', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('big.txt', 'x\n'.repeat(1000))

    const view = await fileLines(repo.dir, base, 'big.txt', { maxFileBytes: 100 })
    expect(view.tooLarge).toBe(true)
    expect(view.lines).toEqual([])
  })

  it('does not invent a trailing blank line', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines).toHaveLength(2)
  })

  it('keeps a genuine trailing blank line', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\n\n')
    const base = repo.commit('first')
    repo.write('x.js', 'A\n\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines.map((l) => l.text)).toEqual(['A', ''])
  })
})
