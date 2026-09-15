import { describe, it, expect } from 'vitest'
import { buildTree } from './tree.js'

const file = (path) => ({ path, oldPath: null, status: 'M', added: 1, removed: 0, binary: false })

describe('buildTree', () => {
  it('returns an empty list for no files', () => {
    expect(buildTree([])).toEqual([])
  })

  it('puts root-level files at the top level', () => {
    const tree = buildTree([file('README.md')])
    expect(tree).toEqual([
      { type: 'file', name: 'README.md', path: 'README.md', file: file('README.md') }
    ])
  })

  it('nests a file under its directory', () => {
    const tree = buildTree([file('src/a.js'), file('src/b.js')])
    expect(tree).toHaveLength(1)
    expect(tree[0].type).toBe('dir')
    expect(tree[0].name).toBe('src')
    expect(tree[0].children.map((c) => c.name)).toEqual(['a.js', 'b.js'])
  })

  it('collapses a chain of single-child directories', () => {
    const tree = buildTree([file('src/feed/parse.js')])
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('src/feed')
    expect(tree[0].path).toBe('src/feed')
    expect(tree[0].children.map((c) => c.name)).toEqual(['parse.js'])
  })

  it('does not collapse a directory with two children', () => {
    const tree = buildTree([file('src/feed/parse.js'), file('src/tts/speak.js')])
    expect(tree[0].name).toBe('src')
    expect(tree[0].children.map((c) => c.name)).toEqual(['feed', 'tts'])
  })

  it('does not collapse a directory whose only child is a file', () => {
    const tree = buildTree([file('src/a.js')])
    expect(tree[0].name).toBe('src')
  })

  it('sorts directories before files', () => {
    const tree = buildTree([file('zebra.md'), file('alpha/one.js')])
    expect(tree.map((n) => n.name)).toEqual(['alpha', 'zebra.md'])
  })

  it('carries the original file record on leaves', () => {
    const record = file('src/a.js')
    const tree = buildTree([record])
    expect(tree[0].children[0].file).toBe(record)
  })
})
