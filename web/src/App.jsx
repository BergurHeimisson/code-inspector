import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api.js'
import { applyTheme, resolveTheme } from './theme.js'
import { useKeyboard } from './useKeyboard.js'
import Header from './components/Header.jsx'
import FileTree from './components/FileTree.jsx'
import FileView from './components/FileView.jsx'
import ProjectPicker from './components/ProjectPicker.jsx'

export default function App() {
  const [config, setConfig] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [recents, setRecents] = useState([])
  const [paneWidth, setPaneWidth] = useState(280)
  const [root, setRoot] = useState(null)
  const [project, setProject] = useState(null)
  const [changes, setChanges] = useState(null)
  const [selected, setSelected] = useState(null)
  const [view, setView] = useState(null)
  const [range, setRange] = useState({ mode: 'auto' })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState(null)

  const files = changes?.files ?? []

  useEffect(() => {
    Promise.all([api.config(), api.state(), api.initial()])
      .then(([loadedConfig, state, initial]) => {
        setConfig(loadedConfig)
        setRecents(state.recents ?? [])
        setPaneWidth(state.paneWidth ?? 280)

        const active = resolveTheme(loadedConfig, state)
        setTheme(active)
        applyTheme(loadedConfig.themes[active], active)

        if (initial.path) {
          api
            .rememberProject(initial.path)
            .then((updated) => setRecents(updated.recents ?? []))
            .catch(() => {})
          setRoot(initial.path)
        } else {
          setPickerOpen(true)
        }
      })
      .catch((problem) => setError(problem.message))
  }, [])

  useEffect(() => {
    if (!root) return
    let cancelled = false

    setError(null)
    Promise.all([api.project(root, range), api.changes(root, range)])
      .then(([loadedProject, loadedChanges]) => {
        if (cancelled) return
        setProject(loadedProject)
        setChanges(loadedChanges)
        setSelected(loadedChanges.files[0]?.path ?? null)
        setView(null)
      })
      .catch((problem) => {
        if (!cancelled) setError(problem.message)
      })

    return () => {
      cancelled = true
    }
  }, [root, range])

  useEffect(() => {
    if (!root || !selected) return
    let cancelled = false

    api
      .file(root, selected, range)
      .then((loaded) => {
        if (!cancelled) setView(loaded)
      })
      .catch((problem) => {
        if (!cancelled) setError(problem.message)
      })

    return () => {
      cancelled = true
    }
  }, [root, selected, range])

  const openProject = useCallback((path) => {
    setPickerOpen(false)
    setRoot(path)
    api
      .rememberProject(path)
      .then((state) => setRecents(state.recents ?? []))
      .catch(() => {})
  }, [])

  const refresh = useCallback(() => {
    setRange((current) => ({ ...current }))
  }, [])

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (config) applyTheme(config.themes[next], next)
    api.saveState({ theme: next }).catch(() => {})
  }, [theme, config])

  const step = useCallback(
    (delta) => {
      if (files.length === 0) return
      const index = files.findIndex((file) => file.path === selected)
      const next = Math.min(files.length - 1, Math.max(0, index + delta))
      setSelected(files[next].path)
    },
    [files, selected]
  )

  const jumpChange = useCallback((delta) => {
    const marks = [...document.querySelectorAll('[data-state="added"]')]
    if (marks.length === 0) return
    const target = delta > 0 ? marks[0] : marks[marks.length - 1]
    target.scrollIntoView({ block: 'center' })
  }, [])

  const handlers = useMemo(
    () => ({
      j: () => step(1),
      k: () => step(-1),
      n: () => jumpChange(1),
      p: () => jumpChange(-1),
      r: refresh
    }),
    [step, jumpChange, refresh]
  )

  useKeyboard(handlers)

  return (
    <div className="flex h-screen flex-col bg-surface text-text">
      <Header
        project={project}
        range={range}
        theme={theme}
        onRangeChange={setRange}
        onRefresh={refresh}
        onSwitchProject={() => setPickerOpen(true)}
        onToggleTheme={toggleTheme}
      />

      {error && <div className="border-b border-border px-4 py-2 text-sm text-deleted">{error}</div>}

      <div className="flex min-h-0 flex-1">
        <aside
          style={{ width: `${paneWidth}px` }}
          className="shrink-0 overflow-hidden border-r border-border"
        >
          <FileTree files={files} selectedPath={selected} onSelect={setSelected} />
        </aside>
        <main className="min-w-0 flex-1">
          <FileView view={view} lineHeight={config?.lineHeight ?? 20} />
        </main>
      </div>

      <ProjectPicker
        open={pickerOpen}
        recents={recents}
        onOpen={openProject}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  )
}
