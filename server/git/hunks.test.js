import { describe, it, expect, afterEach } from 'vitest'
import { parseHunks } from './hunks.js'
import { git } from './run.js'
import { makeRepo } from '../../tests/helpers/repo.js'

describe('parseHunks', () => {
  it('returns nothing for an empty diff', () => {
    expect(parseHunks('')).toEqual({ addedLines: [], deletions: [] })
  })

  it('marks a block of added lines', () => {
    const diff = [
      'diff --git a/x.js b/x.js',
      '--- a/x.js',
      '+++ b/x.js',
      '@@ -3,0 +4,3 @@',
      '+one',
      '+two',
      '+three'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({ addedLines: [4, 5, 6], deletions: [] })
  })

  it('treats an omitted count as one line', () => {
    const diff = '@@ -7 +7 @@\n-old\n+new\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [7], deletions: [] })
  })

  it('records a pure deletion as a marker and no added lines', () => {
    const diff = '@@ -10,3 +9,0 @@\n-a\n-b\n-c\n'
    expect(parseHunks(diff)).toEqual({
      addedLines: [],
      deletions: [{ after: 9, count: 3 }]
    })
  })

  it('records a deletion at the top of the file as after line zero', () => {
    const diff = '@@ -1,2 +0,0 @@\n-a\n-b\n'
    expect(parseHunks(diff)).toEqual({
      addedLines: [],
      deletions: [{ after: 0, count: 2 }]
    })
  })

  it('marks a modification as added lines without a deletion marker', () => {
    const diff = '@@ -4,5 +4,2 @@\n-a\n-b\n-c\n-d\n-e\n+x\n+y\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [4, 5], deletions: [] })
  })

  it('handles several hunks in one file', () => {
    const diff = [
      '@@ -1 +1 @@',
      '-a',
      '+A',
      '@@ -20,2 +20,0 @@',
      '-x',
      '-y',
      '@@ -30,0 +29,2 @@',
      '+p',
      '+q'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({
      addedLines: [1, 29, 30],
      deletions: [{ after: 20, count: 2 }]
    })
  })

  it('ignores a trailing no-newline marker', () => {
    const diff = '@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [1], deletions: [] })
  })

  it('ignores rename and mode headers', () => {
    const diff = [
      'diff --git a/old.js b/new.js',
      'similarity index 88%',
      'rename from old.js',
      'rename to new.js',
      'old mode 100644',
      'new mode 100755',
      '@@ -2 +2 @@',
      '-a',
      '+b'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({ addedLines: [2], deletions: [] })
  })

  it('ignores a hunk section heading after the second @@', () => {
    const diff = '@@ -5,0 +6,1 @@ export function parse(x) {\n+  added\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [6], deletions: [] })
  })

  it('returns nothing for a diff with only a binary notice', () => {
    const diff = 'diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [], deletions: [] })
  })
})

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('parseHunks against real git output', () => {
  it('agrees with git for a mixed edit', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\nd\ne\n')
    const first = repo.commit('first')
    repo.write('x.js', 'a\nB\nc\nNEW\nd\n')

    const diff = await git(repo.dir, ['diff', '-U0', first, '--', 'x.js'])
    const { addedLines, deletions } = parseHunks(diff)

    expect(addedLines).toContain(2)
    expect(addedLines).toContain(4)
    expect(deletions.every((d) => d.count > 0)).toBe(true)
  })
})
