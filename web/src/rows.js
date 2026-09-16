export function buildRows(lines, deletions) {
  const byAfter = new Map()
  for (const deletion of deletions) {
    const list = byAfter.get(deletion.after) ?? []
    list.push(deletion)
    byAfter.set(deletion.after, list)
  }

  const rows = []
  const emit = (after) => {
    for (const deletion of byAfter.get(after) ?? []) {
      rows.push({ kind: 'deletion', after: deletion.after, count: deletion.count })
    }
    byAfter.delete(after)
  }

  emit(0)
  for (const line of lines) {
    rows.push({ kind: 'line', n: line.n, text: line.text, state: line.state })
    emit(line.n)
  }

  for (const list of byAfter.values()) {
    for (const deletion of list) {
      rows.push({ kind: 'deletion', after: deletion.after, count: deletion.count })
    }
  }

  return rows
}
