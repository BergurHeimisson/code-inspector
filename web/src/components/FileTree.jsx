import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { buildTree } from '../tree.js'

const DOT_COLOR = {
  A: 'var(--color-added)',
  '?': 'var(--color-added)',
  D: 'var(--color-deleted)',
  M: 'var(--color-border)',
  R: 'var(--color-border)'
}

function Counts({ added, removed }) {
  return (
    <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] opacity-70">
      {added > 0 && <span className="text-added">{`+${added}`}</span>}
      {added > 0 && removed > 0 && ' '}
      {removed > 0 && <span className="text-deleted">{`−${removed}`}</span>}
    </span>
  )
}

export function signatureOf(file) {
  return `${file.added}/${file.removed}`
}

function FileRow({ node, depth, visited, selectedPath, onSelect }) {
  const selected = node.path === selectedPath
  const seen = visited?.[node.path] === signatureOf(node.file)
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      aria-current={selected ? 'true' : undefined}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      className={`flex w-full items-center gap-2 py-0.5 pr-2 text-left text-sm ${
        selected ? 'bg-black/10 dark:bg-white/10' : 'hover:bg-black/5 dark:hover:bg-white/10'
      }`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: DOT_COLOR[node.file.status] ?? 'var(--color-border)' }}
      />
      <span className="truncate" style={seen ? { color: 'var(--color-visited)' } : undefined}>
        {node.name}
      </span>
      <Counts added={node.file.added} removed={node.file.removed} />
    </button>
  )
}

function DirRow({ node, depth, visited, selectedPath, onSelect }) {
  const [open, setOpen] = useState(true)
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-sm opacity-80 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <Chevron aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </button>
      {open &&
        node.children.map((child) => (
          <Row
            key={child.path}
            node={child}
            depth={depth + 1}
            visited={visited}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </>
  )
}

function Row(props) {
  return props.node.type === 'dir' ? <DirRow {...props} /> : <FileRow {...props} />
}

export default function FileTree({ files, visited, range, selectedPath, onSelect }) {
  const tree = buildTree(files)
  const added = files.reduce((sum, f) => sum + f.added, 0)
  const removed = files.reduce((sum, f) => sum + f.removed, 0)

  if (files.length === 0) {
    return (
      <div className="p-4 text-sm opacity-60">
        <div>No changes</div>
        {range?.mode === 'auto' && (
          <div className="mt-2">
            Nothing unpushed on this branch and no local edits. Pick another range
            in the range dropdown to look further back.
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <Row
            key={node.path}
            node={node}
            depth={0}
            visited={visited}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="border-t border-border px-3 py-1.5 font-mono text-[11px] opacity-70">
        {`${files.length} files +${added} −${removed}`}
      </div>
    </div>
  )
}
