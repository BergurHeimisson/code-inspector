export function splitZ(text) {
  return text.split('\0').filter((token) => token !== '')
}

// Renames and copies emit three tokens (status, oldPath, newPath); everything
// else emits two. A truncated stream just stops instead of reading past the end.
export function parseNameStatusZ(text) {
  const tokens = splitZ(text)
  const records = []
  let i = 0

  while (i < tokens.length) {
    const code = tokens[i]
    const status = code[0]

    if (code.startsWith('R') || code.startsWith('C')) {
      const oldPath = tokens[i + 1]
      const path = tokens[i + 2]
      if (path === undefined) break
      records.push({ status, path, oldPath })
      i += 3
    } else {
      const path = tokens[i + 1]
      if (path === undefined) break
      records.push({ status, path, oldPath: null })
      i += 2
    }
  }

  return records
}

// A rename's inline path field is empty, and the old/new paths follow as
// separate tokens; everything else is one self-contained token.
export function parseNumstatZ(text) {
  const tokens = splitZ(text)
  const records = []
  let i = 0

  while (i < tokens.length) {
    const [added, removed, inlinePath] = tokens[i].split('\t')
    let path = inlinePath
    let oldPath = null

    if (path === '') {
      oldPath = tokens[i + 1]
      path = tokens[i + 2]
      if (path === undefined) break
      i += 3
    } else {
      if (path === undefined) break
      i += 1
    }

    const binary = added === '-' || removed === '-'
    records.push({
      path,
      oldPath,
      added: binary ? 0 : Number(added),
      removed: binary ? 0 : Number(removed),
      binary
    })
  }

  return records
}
