const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

export function parseHunks(diffText) {
  const addedLines = []
  const deletions = []

  for (const line of diffText.split('\n')) {
    const match = HUNK.exec(line)
    if (!match) continue

    const oldCount = match[2] === undefined ? 1 : Number(match[2])
    const newStart = Number(match[3])
    const newCount = match[4] === undefined ? 1 : Number(match[4])

    if (newCount === 0) {
      deletions.push({ after: newStart, count: oldCount })
      continue
    }

    for (let n = newStart; n < newStart + newCount; n += 1) addedLines.push(n)
  }

  return { addedLines, deletions }
}
