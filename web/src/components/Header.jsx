import { useState } from 'react'
import { GitBranch, FolderOpen, RefreshCw, Sun, Moon } from 'lucide-react'

const MODES = [
  ['auto', 'auto'],
  ['worktree', 'working tree'],
  ['commits', 'last N commits'],
  ['ref', 'vs ref']
]

// Local state mirrors the DOM value between keystrokes. The parent's `range`
// prop only reflects what it decided to keep, which may lag a fast typist —
// without this, each `change` event would fight the previous render's value.
function CommitsInput({ n, onRangeChange }) {
  const [text, setText] = useState(String(n ?? 1))

  const handleChange = (event) => {
    const { value } = event.target
    setText(value)
    onRangeChange({ mode: 'commits', n: Number(value) || 1 })
  }

  return (
    <input
      aria-label="Number of commits"
      type="number"
      min="1"
      value={text}
      onChange={handleChange}
      className="w-16 rounded border border-border bg-surface px-2 py-1 text-xs text-text"
    />
  )
}

function RefInput({ refValue, onRangeChange }) {
  const [text, setText] = useState(refValue ?? '')

  const handleChange = (event) => {
    setText(event.target.value)
    onRangeChange({ mode: 'ref', ref: event.target.value })
  }

  return (
    <input
      aria-label="Base ref"
      type="text"
      value={text}
      onChange={handleChange}
      className="w-40 rounded border border-border bg-surface px-2 py-1 text-xs text-text"
    />
  )
}

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded p-1.5 opacity-80 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
    >
      {children}
    </button>
  )
}

export default function Header({
  project,
  range,
  theme,
  onRangeChange,
  onRefresh,
  onSwitchProject,
  onToggleTheme
}) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  const changeMode = (mode) => {
    if (mode === 'commits') return onRangeChange({ mode: 'commits', n: range.n ?? 1 })
    if (mode === 'ref') return onRangeChange({ mode: 'ref', ref: range.ref ?? '' })
    return onRangeChange({ mode })
  }

  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-2">
      {project ? (
        <>
          <span className="font-semibold">{project.name}</span>
          <span className="flex items-center gap-1 text-sm opacity-70">
            <GitBranch aria-hidden="true" className="size-3.5" />
            {project.branch}
          </span>
          <span className="text-xs opacity-50">{project.label}</span>
        </>
      ) : (
        <span className="opacity-60">No project</span>
      )}

      <select
        aria-label="Change range"
        value={range.mode}
        onChange={(event) => changeMode(event.target.value)}
        className="ml-4 rounded border border-border bg-surface px-2 py-1 text-xs text-text"
      >
        {MODES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {range.mode === 'commits' && (
        <CommitsInput key="commits" n={range.n} onRangeChange={onRangeChange} />
      )}

      {range.mode === 'ref' && (
        <RefInput key="ref" refValue={range.ref} onRangeChange={onRangeChange} />
      )}

      <div className="ml-auto flex items-center gap-1">
        <IconButton label="Refresh" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label="Switch project" onClick={onSwitchProject}>
          <FolderOpen aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton label={`Switch to ${nextTheme} theme`} onClick={onToggleTheme}>
          {theme === 'dark' ? (
            <Sun aria-hidden="true" className="size-4" />
          ) : (
            <Moon aria-hidden="true" className="size-4" />
          )}
        </IconButton>
      </div>
    </header>
  )
}
