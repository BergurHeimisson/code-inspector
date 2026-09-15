import { useMemo, useRef } from 'react'
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

function DeletionRow({ count }) {
  return (
    <div
      className="flex items-center gap-2 px-3 font-mono text-[11px] italic"
      style={{ backgroundColor: TINT.deleted }}
    >
      <span className="opacity-80">{`${count} line${count === 1 ? '' : 's'} deleted`}</span>
    </div>
  )
}

function LineRow({ row }) {
  return (
    <div
      data-state={row.state}
      data-line={row.n}
      className="flex font-mono text-[12.5px] leading-[20px]"
      style={{ backgroundColor: TINT[row.state] }}
    >
      <span className="w-14 shrink-0 select-none pr-3 text-right opacity-40">{row.n}</span>
      <pre className="m-0 whitespace-pre">{row.text}</pre>
    </div>
  )
}

export default function FileView({ view, lineHeight }) {
  const scrollRef = useRef(null)
  const rows = useMemo(
    () => (view ? buildRows(view.lines, view.deletions) : []),
    [view]
  )

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => lineHeight,
    overscan: 30
  })

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
                  {row.kind === 'line' ? <LineRow row={row} /> : <DeletionRow count={row.count} />}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
