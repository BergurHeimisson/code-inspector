import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { buildRows } from '../rows.js'

const TINT = {
  added: 'color-mix(in srgb, var(--color-added) 26%, transparent)',
  unchanged: 'color-mix(in srgb, var(--color-unchanged) 14%, transparent)',
  deleted: 'color-mix(in srgb, var(--color-deleted) 26%, transparent)'
}

function Stub({ children }) {
  return <div className="p-6 text-sm opacity-60">{children}</div>
}

function DeletionRow({ count, lineHeight }) {
  return (
    <div
      className="flex items-center gap-2 px-3 font-mono text-[11px] italic"
      style={{ backgroundColor: TINT.deleted, height: `${lineHeight}px` }}
    >
      <span className="opacity-80">{`${count} line${count === 1 ? '' : 's'} deleted`}</span>
    </div>
  )
}

// Consecutive changed rows are one navigation stop, not one per line.
export function changeGroupStarts(rows) {
  const starts = []
  let inGroup = false
  rows.forEach((row, index) => {
    const changed = row.kind === 'deletion' || row.state === 'added' || row.state === 'deleted'
    if (changed && !inGroup) starts.push(index)
    inGroup = changed
  })
  return starts
}

function LineRow({ row, lineHeight }) {
  return (
    <div
      data-state={row.state}
      data-line={row.n}
      className="flex font-mono text-[12.5px]"
      style={{
        backgroundColor: TINT[row.state],
        height: `${lineHeight}px`,
        lineHeight: `${lineHeight}px`
      }}
    >
      <span className="w-14 shrink-0 select-none pr-3 text-right opacity-40">{row.n}</span>
      <pre className="m-0 whitespace-pre">{row.text}</pre>
    </div>
  )
}

const FileView = forwardRef(function FileView({ view, lineHeight }, ref) {
  const scrollRef = useRef(null)
  const cursorRef = useRef(-1)
  const rows = useMemo(
    () => (view ? buildRows(view.lines, view.deletions) : []),
    [view]
  )
  const changeStarts = useMemo(() => changeGroupStarts(rows), [rows])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => lineHeight,
    overscan: 30
  })

  useEffect(() => {
    cursorRef.current = -1
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [view?.path])

  useImperativeHandle(ref, () => ({
    jumpChange(delta) {
      const total = changeStarts.length
      if (total === 0) return null

      cursorRef.current =
        cursorRef.current === -1
          ? (delta > 0 ? 0 : total - 1)
          : ((cursorRef.current + delta) % total + total) % total

      const index = changeStarts[cursorRef.current]
      virtualizer.scrollToIndex(index, { align: 'center' })
      return index
    }
  }), [changeStarts, virtualizer])

  if (!view) return <Stub>Select a file</Stub>

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline gap-3 border-b border-border px-4 py-2">
        <span className="font-mono text-sm">{view.path}</span>
        {view.oldPath && (
          <span className="text-xs opacity-60">{`renamed from ${view.oldPath}`}</span>
        )}
      </div>

      {view.binary && <Stub>Binary file</Stub>}
      {view.tooLarge && <Stub>File too large to display</Stub>}

      {!view.binary && !view.tooLarge && (
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              return (
                <div
                  key={item.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${item.size}px`,
                    transform: `translateY(${item.start}px)`
                  }}
                >
                  {row.kind === 'line'
                    ? <LineRow row={row} lineHeight={lineHeight} />
                    : <DeletionRow count={row.count} lineHeight={lineHeight} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
})

export default FileView
