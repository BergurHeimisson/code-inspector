# code-inspector — Design

**Date:** 2026-09-15
**Status:** Approved design, pre-implementation

## Purpose

A local web UI that shows, at a glance, every file an AI agent changed on the
current branch of a git repository. A file tree on the left, the full content of
the selected file on the right with changed lines tinted orange and unchanged
lines green.

The value is *review speed*. Reading `git diff` hunk-by-hunk loses the shape of
the file; seeing the whole file with the agent's edits lit up preserves it.

A later phase may add AI analysis that flags "dangerous" changes needing close
inspection. Nothing in this design should make that harder, but none of it is
built now.

## Constraints

- Installed as a global CLI: `cd <any repo> && code-inspector`. This is a hard
  requirement, not a nice-to-have.
- React with Tailwind CSS v4.3.
- Dark theme by default, with a working light toggle.
- All colours configurable from a config file, no rebuild required.
- Remembers the last project worked on.

## Scope of "changes"

Committed work on the branch **plus** the uncommitted working tree, resolved in
a single pass.

### Base resolution

The base ref is `merge-base(HEAD, upstream)`, where upstream is the first of:

1. the current branch's tracking ref (`@{upstream}`)
2. `origin/HEAD`
3. `origin/main`, then `origin/master`

On a feature branch this yields the branch point. On a repo where work happens
directly on `main` — which is the normal case in several of your projects
— it yields the last pushed commit, so the view becomes *unpushed commits plus
uncommitted changes*. One rule, a sensible answer in both cases.

If no remote exists at all, the base falls back to the root commit.

### Range override

A dropdown in the header overrides the default:

| Option | Base |
|---|---|
| `auto` (default) | as resolved above |
| `working tree` | `HEAD` |
| `last N commits` | `HEAD~N` |
| `vs <ref>` | user-entered ref |

## Architecture

One npm project, two halves, one process at runtime.

```
code-inspector/
├── bin/code-inspector          # shell launcher (symlinked onto PATH)
├── server/                     # Express: git, fs browse, config, static
├── web/                        # React + Vite + Tailwind v4.3
└── docs/superpowers/specs/
```

- **Dev:** `npm run dev` — Vite on 5173 proxying `/api` to the server on 5174.
- **Installed:** the launcher resolves its own install directory through symlinks,
  starts the server on a free port, serves the prebuilt bundle, and opens the
  browser. Startup prints both the `localhost` and the tailnet URL.
- **Binding:** `127.0.0.1` only.

### Why not the alternatives

- *Two permanent processes (`concurrently`)*: cannot be installed as a CLI.
- *Tauri/Electron*: an entire extra toolchain for an app that renders text.

## Git layer

Every read is `git diff <base>` against the **working tree**, so committed and
uncommitted changes arrive together with no merging of two sources.

### Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/project?path=` | branch, resolved base, remote, repo name |
| `GET /api/changes?path=&range=` | `[{path, status, added, removed}]` |
| `GET /api/file?path=&file=&range=` | `{lines: [{n, text, state}], deletions: [{after, count}]}` |
| `GET /api/fs/list?path=` | subdirectories, each flagged `isGitRepo` |
| `GET/PUT /api/state` | `lastProject`, `recents`, pane width |
| `GET /api/config` | colour tokens and display settings |

### File change list

`git diff --numstat <base>` for tracked changes, plus `git status --porcelain`
for untracked files.

### Per-file line states

`git diff -U0 <base> -- <file>` is parsed into:

- the set of new-file line numbers that are added or modified → `state: "added"`
- deletion markers keyed to the line they follow → the `deletions` array

paired with the file's current bytes on disk. Every other line is
`state: "unchanged"`.

Special cases:

- **Untracked file** — every line `added`.
- **Deleted file** — content read from HEAD, every line `state: "deleted"`.
- **Binary file** — listed in the tree, right pane renders a stub.
- **File over `maxFileBytes`** (default 2 MB) — same stub treatment.
- **Renames** — shown at the new path, with the old path in the file header.

The response is deliberately flat: the client does a per-line colour lookup and
nothing more.

### Safety

`/api/fs/list` rejects any path that does not resolve inside `$HOME`, after
symlink resolution. Hidden directories and `node_modules` are filtered from
listings.

## UI

```
┌──────────────────────────────────────────────────────────────┐
│ jetlog   ⑂ main   [auto ▾]  ↻   📁 switch   ☀/☾             │
├────────────────────┬─────────────────────────────────────────┤
│ ▾ src              │  src/feed/parse.ts        +24 −6        │
│   ▾ feed           │  ───────────────────────────────────    │
│     ● parse.ts +24 │   12 │ import { z } from 'zod'          │
│     ● fetch.ts  +3 │   13 │                                  │
│   ▾ tts            │   14 │ const Schema = z.object({        │ orange
│     ● speak.ts +51 │   15 │   title: z.string(),             │ orange
│ ▾ tests            │   16 │ })                               │ orange
│     ● parse.test   │   17 │                                  │
│                    │      ⌐ 3 lines deleted                  │
│ 4 files +78 −11    │   18 │ export function parse(x) {       │
└────────────────────┴─────────────────────────────────────────┘
```

### Left pane — tree

Built client-side from the flat path list. Single-child directories collapse
into one row (`src/feed`) so deep monorepo paths do not consume the pane. Each
file row carries a status dot and `+N −N`. The footer totals the branch.

### Right pane — file

A virtualised line list; a monorepo file can run to thousands of lines. Line
number gutter, full-width background tint per line, deletion markers as thin
collapsed rows that expand on click.

**No syntax highlighting in v1.** Line colour is the signal; token colours would
compete with it. Revisit behind a config flag if it is missed.

### Keyboard

| Key | Action |
|---|---|
| `j` / `k` | next / previous file |
| `n` / `p` | next / previous change within the file |
| `r` | refresh |

`n`/`p` is what makes a 2000-line file with three edits genuinely glanceable.

Refresh is manual. File-watching auto-refresh is deferred: it would fight the
user while an agent is mid-write.

### Icons

`lucide-react`, every icon button carrying an `aria-label`.

## Project selection

- **On launch:** if the working directory is inside a git repo, open that repo.
  Otherwise reopen `state.lastProject`. Otherwise show the picker.
- **Picker:** a modal listing `recents` (last 5) at the top, below it a folder
  browser driven by `/api/fs/list` — click a directory to descend, breadcrumb to
  ascend, git repos badged and openable. A path input at the bottom for direct
  entry.

## Config and state

Both files live in `~/.config/code-inspector/`, created with defaults on first
run. The CLI is global, so the repo root would be the wrong home for them.

### `config.json` — hand-edited, never rewritten by the app

```json
{
  "defaultTheme": "dark",
  "maxFileBytes": 2097152,
  "lineHeight": 20,
  "themes": {
    "dark": {
      "added": "#d98a30",
      "unchanged": "#2f6b4a",
      "deleted": "#8a3030",
      "surface": "#1e1f29",
      "text": "#f8f8f2",
      "border": "#44475a"
    },
    "light": {
      "added": "#b35c00",
      "unchanged": "#1c6b3f",
      "deleted": "#a11a1a",
      "surface": "#ffffff",
      "text": "#1e1f29",
      "border": "#d0d2e0"
    }
  }
}
```

### `state.json` — owned and rewritten by the app

```json
{
  "lastProject": "/Users/…/ai_code/jetlog",
  "recents": ["/Users/…/ai_code/jetlog"],
  "paneWidth": 280,
  "theme": "dark"
}
```

### Theming

The client fetches `config.json` and writes the active theme's tokens as CSS
custom properties on `:root`. Tailwind v4.3 consumes them through `@theme`.
Editing `config.json` and refreshing the page restyles the app with no rebuild.
The toggle swaps which token set is written and persists the choice to
`state.json`.

## Testing

Test-driven, Vitest plus React Testing Library.

**Hunk parser** — the component most likely to be subtly wrong, so it carries the
heaviest coverage. Table-driven tests over real `git diff -U0` fixtures:
additions, deletions, pure-deletion hunks, mixed hunks, missing trailing
newline, renames, empty files.

**Git layer** — a helper builds a throwaway repo in a temp directory and runs
real `git` against it. No mocking of git.

**Base resolution** — fixture repos covering: feature branch with upstream,
`main` with upstream, branch with no remote, detached HEAD.

**Components** — tree building including single-child collapse; line state to
colour mapping; keyboard navigation.

## Out of scope

Deferred deliberately, listed so they are not mistaken for oversights:

- AI analysis of dangerous changes (the motivating future phase)
- Syntax highlighting
- File-watching auto-refresh
- Editing or staging from the UI
- Multi-repo or submodule aggregation
- Any non-localhost access
