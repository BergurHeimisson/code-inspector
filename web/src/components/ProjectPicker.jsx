import { useEffect, useState } from 'react'
import { ArrowUp, Folder, GitBranch, X } from 'lucide-react'
import { api } from '../api.js'

export default function ProjectPicker({ open, recents, onOpen, onClose }) {
  const [listing, setListing] = useState(null)
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false

    api
      .fsList(target ?? '~')
      .then((result) => {
        if (!cancelled) {
          setListing(result)
          setError(null)
        }
      })
      .catch((problem) => {
        if (!cancelled) setError(problem.message)
      })

    return () => {
      cancelled = true
    }
  }, [open, target])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50">
      <div className="flex h-[70vh] w-[36rem] flex-col rounded-lg border border-border bg-surface text-text">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className="font-semibold">Select project</span>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        {recents.length > 0 && (
          <div className="border-b border-border px-2 py-2">
            <div className="px-2 pb-1 text-[11px] uppercase tracking-wide opacity-50">Recent</div>
            {recents.map((path) => (
              <button
                key={path}
                type="button"
                onClick={() => onOpen(path)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-black/5 dark:hover:bg-white/10"
              >
                <GitBranch aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
                <span className="truncate">{path}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
          <button
            type="button"
            aria-label="Go up"
            disabled={!listing?.parent}
            onClick={() => setTarget(listing.parent)}
            className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <span className="truncate font-mono text-xs opacity-70">{listing?.path ?? ''}</span>
          <button
            type="button"
            aria-label="Open this folder"
            disabled={!listing?.isGitRepo}
            onClick={() => onOpen(listing.path)}
            className="ml-auto shrink-0 rounded border border-text bg-text/10 px-2 py-1 text-[11px] font-semibold text-text hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
          >
            Open this folder
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && <div className="px-2 py-1 text-sm text-deleted">{error}</div>}
          {listing?.entries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center gap-2 rounded px-2 hover:bg-black/5 dark:hover:bg-white/5"
            >
              <button
                type="button"
                onClick={() => setTarget(entry.path)}
                className="flex flex-1 items-center gap-2 py-1 text-left text-sm"
              >
                <Folder aria-hidden="true" className="size-4 shrink-0 opacity-60" />
                <span className="truncate">{entry.name}</span>
              </button>
              {entry.isGitRepo && (
                <button
                  type="button"
                  aria-label={`Open ${entry.name}`}
                  onClick={() => onOpen(entry.path)}
                  className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Open
                </button>
              )}
            </div>
          ))}
        </div>

        <form
          className="border-t border-border p-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed.trim() !== '') onOpen(typed.trim())
          }}
        >
          <input
            aria-label="Project path"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="/path/to/repo"
            className="w-full rounded border border-border bg-transparent px-2 py-1 font-mono text-xs"
          />
        </form>
      </div>
    </div>
  )
}
