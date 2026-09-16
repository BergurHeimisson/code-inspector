function emptyDir(name, path) {
  return { type: 'dir', name, path, children: [], index: new Map() }
}

function insert(root, record) {
  const segments = record.path.split('/')
  const fileName = segments.pop()

  let node = root
  let prefix = ''

  for (const segment of segments) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`
    if (!node.index.has(segment)) {
      const child = emptyDir(segment, prefix)
      node.index.set(segment, child)
      node.children.push(child)
    }
    node = node.index.get(segment)
  }

  node.children.push({ type: 'file', name: fileName, path: record.path, file: record })
}

function collapse(node) {
  if (node.type === 'file') return node

  let current = node
  while (current.children.length === 1 && current.children[0].type === 'dir') {
    const only = current.children[0]
    current = {
      type: 'dir',
      name: `${current.name}/${only.name}`,
      path: only.path,
      children: only.children
    }
  }

  return {
    type: 'dir',
    name: current.name,
    path: current.path,
    children: sort(current.children.map(collapse))
  }
}

function sort(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function buildTree(files) {
  const root = emptyDir('', '')
  for (const record of files) insert(root, record)
  return sort(root.children.map(collapse))
}
