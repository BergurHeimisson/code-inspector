# code-inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web UI, launched as `code-inspector` from inside any git repo, that shows every file changed on the current branch as a tree on the left and full colour-coded file content on the right.

**Architecture:** One Express server owns all git and filesystem access and exposes a small JSON API; a React SPA renders it. In development Vite proxies `/api` to the server; when installed, the server also serves the prebuilt bundle, so there is a single process at runtime. All diff interpretation happens server-side and arrives at the client as a flat per-line array, so the UI does a colour lookup and nothing more.

**Tech Stack:** Node 26 (ESM), Express 5.2, React 19.3, Vite 8.3, Tailwind CSS 4.3, Vitest 5.0, React Testing Library 16.3, lucide-react 1.46, @tanstack/react-virtual 3.14.

**Spec:** `docs/superpowers/specs/2026-09-15-code-inspector-design.md`

## Global Constraints

- **Language:** plain JavaScript, ESM only (`"type": "module"`). No TypeScript, no build step for server code. The spec does not specify a language; this is the decision. Shared modules are imported directly by both halves.
- **Tailwind CSS 4.3.3** exactly — the `@tailwindcss/vite` plugin, `@import "tailwindcss"` in CSS. No `tailwind.config.js`; configuration lives in `@theme`.
- **Dark theme is the default.** A light toggle must work. All colours come from `config.json` via CSS custom properties — never hardcoded in components.
- **Server binds `127.0.0.1` only.** Never `0.0.0.0`.
- **`/api/fs/list` rejects any path that does not resolve inside `$HOME`** after `fs.realpath`.
- **Config and state live in `~/.config/code-inspector/`**, not in the repo.
- **Every icon button carries an `aria-label`.** Icons come from `lucide-react`; prefer icons over text buttons.
- **Comment sparingly.** Prefer self-documenting code. Comments explain *why*, never *what*.
- **Commit after every task.** Commit messages end with the two attribution lines shown in Task 1, Step 6.
- **Git is never mocked.** Server tests build throwaway repositories in temp directories and run real `git` against them.

## File Structure

```
code-inspector/
├── bin/code-inspector              # POSIX launcher, symlinked onto PATH
├── install.sh                      # symlink installer
├── package.json
├── vite.config.js
├── vitest.config.js
├── server/
│   ├── start.js                    # CLI entry: cwd detect, port, open browser
│   ├── app.js                      # express app factory, mounts routes
│   ├── paths.js                    # ~/.config/code-inspector resolution
│   ├── config.js                   # config.json load + defaults
│   ├── state.js                    # state.json load/save
│   ├── browse.js                   # safe directory listing
│   ├── git/
│   │   ├── run.js                  # execFile wrapper around git
│   │   ├── base.js                 # base ref resolution
│   │   ├── hunks.js                # pure diff-hunk parser
│   │   ├── changes.js              # changed-file list
│   │   └── file.js                 # per-file line states
│   └── routes/
│       └── api.js                  # all /api/* routes
├── web/
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── index.css
│       ├── api.js                  # fetch wrappers
│       ├── theme.js                # tokens -> CSS custom properties
│       ├── tree.js                 # pure path-list -> tree
│       ├── useKeyboard.js
│       └── components/
│           ├── Header.jsx
│           ├── FileTree.jsx
│           ├── FileView.jsx
│           └── ProjectPicker.jsx
└── tests/
    └── helpers/repo.js             # throwaway git repo builder
```

Each server module owns one question: `base.js` answers "what am I diffing against", `hunks.js` answers "which lines changed", `file.js` answers "what does this file look like now". They are separately testable and none imports a route.

---

### Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `vite.config.js`, `vitest.config.js`, `.gitignore`
- Create: `web/index.html`, `web/src/main.jsx`, `web/src/App.jsx`, `web/src/index.css`
- Test: `web/src/App.test.jsx`

**Interfaces:**
- Consumes: nothing
- Produces: `npm test` (Vitest, two projects: `server` in node env, `web` in jsdom), `npm run dev` (Vite + server concurrently), `npm run build` (Vite build to `web/dist`).

- [ ] **Step 1: Create the package manifest**

```bash
cd ~/ai_code/code-inspector
cat > package.json <<'EOF'
{
  "name": "code-inspector",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": { "code-inspector": "./bin/code-inspector" },
  "scripts": {
    "dev": "concurrently -n server,web -c cyan,magenta \"node server/start.js --dev\" \"vite\"",
    "build": "vite build",
    "start": "node server/start.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@tanstack/react-virtual": "3.14.13",
    "express": "5.2.1",
    "lucide-react": "1.46.0",
    "open": "11.0.4",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.3.3",
    "@testing-library/jest-dom": "7.0.1",
    "@testing-library/react": "16.3.3",
    "@vitejs/plugin-react": "6.1.1",
    "concurrently": "10.0.5",
    "jsdom": "30.0.1",
    "tailwindcss": "4.3.3",
    "vite": "8.3.0",
    "vitest": "5.0.1"
  }
}
EOF
npm install
```

- [ ] **Step 2: Create the Vite and Vitest configs**

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:5174' }
  },
  build: { outDir: 'dist', emptyOutDir: true }
})
```

`vitest.config.js`:

```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['server/**/*.test.js', 'tests/**/*.test.js'],
          testTimeout: 20000
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['web/**/*.test.{js,jsx}'],
          setupFiles: ['./web/src/setupTests.js']
        }
      }
    ]
  }
})
```

`.gitignore`:

```
node_modules/
web/dist/
```

- [ ] **Step 3: Write the failing test**

`web/src/setupTests.js`:

```js
import '@testing-library/jest-dom/vitest'
```

`web/src/App.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App.jsx'

describe('App', () => {
  it('renders the application name', () => {
    render(<App />)
    expect(screen.getByText('code-inspector')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run --project web`
Expected: FAIL — cannot resolve `./App.jsx`.

- [ ] **Step 5: Write the minimal implementation**

`web/index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>code-inspector</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`web/src/index.css` — the `@theme` block declares the token names; Task 10 fills their values at runtime from `config.json`:

```css
@import "tailwindcss";

@theme {
  --color-surface: #1e1f29;
  --color-text: #f8f8f2;
  --color-border: #44475a;
  --color-added: #d98a30;
  --color-unchanged: #2f6b4a;
  --color-deleted: #8a3030;
}

body {
  background-color: var(--color-surface);
  color: var(--color-text);
  margin: 0;
}
```

`web/src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)
```

`web/src/App.jsx`:

```jsx
export default function App() {
  return <div className="h-screen bg-surface text-text">code-inspector</div>
}
```

- [ ] **Step 6: Run test to verify it passes, then commit**

Run: `npx vitest run --project web`
Expected: PASS — 1 test.

```bash
git add -A
git commit -m "chore: scaffold vite, react, tailwind and vitest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 2: Git command wrapper and the test-repo helper

**Files:**
- Create: `server/git/run.js`
- Create: `tests/helpers/repo.js`
- Test: `server/git/run.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `git(repoPath, args, opts?) -> Promise<string>` — stdout, throws on non-zero exit.
  - `gitTry(repoPath, args) -> Promise<string|null>` — trimmed stdout, `null` on any failure.
  - `makeRepo(files?) -> Promise<{dir, run, write, commit, cleanup}>` where `run(...args)` invokes git synchronously, `write(relPath, text)` writes a file, `commit(msg)` stages all and commits.

- [ ] **Step 1: Write the failing test**

`server/git/run.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { git, gitTry } from './run.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('git', () => {
  it('returns stdout of a successful command', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'hello\n')
    repo.commit('first')
    const out = await git(repo.dir, ['log', '--oneline'])
    expect(out).toContain('first')
  })

  it('throws on a failing command', async () => {
    repo = await makeRepo()
    await expect(git(repo.dir, ['rev-parse', 'nope'])).rejects.toThrow()
  })
})

describe('gitTry', () => {
  it('returns trimmed stdout on success', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'hello\n')
    repo.commit('first')
    expect(await gitTry(repo.dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main')
  })

  it('returns null on failure instead of throwing', async () => {
    repo = await makeRepo()
    expect(await gitTry(repo.dir, ['rev-parse', 'nope'])).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/git/run.test.js`
Expected: FAIL — cannot resolve `./run.js`.

- [ ] **Step 3: Write the test-repo helper**

`tests/helpers/repo.js`:

```js
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

export async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'code-inspector-'))
  const run = (...args) =>
    execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

  run('init', '-b', 'main')
  run('config', 'user.email', 'test@example.com')
  run('config', 'user.name', 'Test')
  run('config', 'commit.gpgsign', 'false')

  const write = (relPath, text) => {
    const full = join(dir, relPath)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }

  const commit = (message) => {
    run('add', '-A')
    run('commit', '-m', message)
    return run('rev-parse', 'HEAD')
  }

  return {
    dir,
    run,
    write,
    commit,
    cleanup: () => rm(dir, { recursive: true, force: true })
  }
}
```

- [ ] **Step 4: Write the git wrapper**

`server/git/run.js`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const MAX_BUFFER = 64 * 1024 * 1024

export async function git(repoPath, args, { maxBuffer = MAX_BUFFER, encoding = 'utf8' } = {}) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    maxBuffer,
    encoding,
    windowsHide: true
  })
  return stdout
}

export async function gitTry(repoPath, args, opts) {
  try {
    return (await git(repoPath, args, opts)).trim()
  } catch {
    return null
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/git/run.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add server/git/run.js server/git/run.test.js tests/helpers/repo.js
git commit -m "feat: add git command wrapper and test repo helper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 3: Base ref resolution

**Files:**
- Create: `server/git/base.js`
- Test: `server/git/base.test.js`

**Interfaces:**
- Consumes: `git`, `gitTry` from `server/git/run.js`
- Produces: `resolveBase(repoPath, range) -> Promise<{base: string, label: string}>`
  - `range` is `{mode: 'auto'}` | `{mode: 'worktree'}` | `{mode: 'commits', n: number}` | `{mode: 'ref', ref: string}`
  - `base` is always a revision string usable as `git diff <base>`.
  - `EMPTY_TREE` is exported: `'4b825dc642cb6eb9a060e54bf8d69288fbee4904'`, used when the repo has no commits.

The `auto` rule, from the spec: `merge-base(HEAD, upstream)` where upstream is the first of `@{upstream}`, `origin/HEAD`, `origin/main`, `origin/master`; with no remote at all, the root commit; with no commits at all, the empty tree.

- [ ] **Step 1: Write the failing test**

`server/git/base.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { resolveBase, EMPTY_TREE } from './base.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

async function repoWithRemote() {
  const r = await makeRepo()
  r.write('a.txt', 'one\n')
  const first = r.commit('first')
  r.run('remote', 'add', 'origin', 'https://example.invalid/repo.git')
  r.run('update-ref', 'refs/remotes/origin/main', first)
  r.run('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
  r.run('branch', '--set-upstream-to=origin/main', 'main')
  return { r, first }
}

// The remote URL is never contacted; only the local refs/remotes entries matter.

describe('resolveBase auto', () => {
  it('uses the merge base with the tracking ref on a feature branch', async () => {
    const { r, first } = await repoWithRemote()
    repo = r
    r.run('checkout', '-b', 'feature')
    r.write('b.txt', 'two\n')
    r.commit('second')
    const { base } = await resolveBase(r.dir, { mode: 'auto' })
    expect(base).toBe(first)
  })

  it('yields the last pushed commit when working directly on main', async () => {
    const { r, first } = await repoWithRemote()
    repo = r
    r.write('c.txt', 'three\n')
    r.commit('unpushed')
    const { base } = await resolveBase(r.dir, { mode: 'auto' })
    expect(base).toBe(first)
  })

  it('falls back to the root commit when there is no remote', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const root = repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(root)
  })

  it('falls back to the empty tree when there are no commits', async () => {
    repo = await makeRepo()
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(EMPTY_TREE)
  })

  it('handles a detached HEAD without throwing', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const root = repo.commit('first')
    repo.run('checkout', '--detach', root)
    const { base } = await resolveBase(repo.dir, { mode: 'auto' })
    expect(base).toBe(root)
  })
})

describe('resolveBase explicit modes', () => {
  it('worktree mode bases on HEAD', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    expect(await resolveBase(repo.dir, { mode: 'worktree' }))
      .toEqual({ base: 'HEAD', label: 'working tree' })
  })

  it('commits mode bases on HEAD~n', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    const { base } = await resolveBase(repo.dir, { mode: 'commits', n: 1 })
    expect(base).toBe('HEAD~1')
  })

  it('ref mode uses the given ref verbatim', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    expect(await resolveBase(repo.dir, { mode: 'ref', ref: 'main' }))
      .toEqual({ base: 'main', label: 'vs main' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/git/base.test.js`
Expected: FAIL — cannot resolve `./base.js`.

- [ ] **Step 3: Write the implementation**

`server/git/base.js`:

```js
import { gitTry } from './run.js'

export const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'

async function findUpstream(repoPath) {
  const tracking = await gitTry(repoPath, [
    'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'
  ])
  if (tracking) return tracking

  const head = await gitTry(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (head) return head

  for (const candidate of ['origin/main', 'origin/master']) {
    if (await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', candidate])) return candidate
  }
  return null
}

async function resolveAuto(repoPath) {
  const head = await gitTry(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD'])
  if (!head) return { base: EMPTY_TREE, label: 'empty repository' }

  const upstream = await findUpstream(repoPath)
  if (upstream) {
    const mergeBase = await gitTry(repoPath, ['merge-base', 'HEAD', upstream])
    if (mergeBase) return { base: mergeBase, label: `vs ${upstream}` }
  }

  const roots = await gitTry(repoPath, ['rev-list', '--max-parents=0', 'HEAD'])
  if (roots) {
    const root = roots.split('\n').filter(Boolean).pop()
    return { base: root, label: 'full history' }
  }
  return { base: EMPTY_TREE, label: 'empty repository' }
}

export async function resolveBase(repoPath, range = { mode: 'auto' }) {
  switch (range.mode) {
    case 'worktree':
      return { base: 'HEAD', label: 'working tree' }
    case 'commits':
      return { base: `HEAD~${range.n}`, label: `last ${range.n} commits` }
    case 'ref':
      return { base: range.ref, label: `vs ${range.ref}` }
    default:
      return resolveAuto(repoPath)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/git/base.test.js`
Expected: PASS — 8 tests. The detached-HEAD case passes through the root-commit branch because `@{upstream}` fails on a detached HEAD.

- [ ] **Step 5: Commit**

```bash
git add server/git/base.js server/git/base.test.js
git commit -m "feat: resolve the diff base ref from branch, upstream or range

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---
### Task 4: The hunk parser

**Files:**
- Create: `server/git/hunks.js`
- Test: `server/git/hunks.test.js`

**Interfaces:**
- Consumes: nothing — this module is pure, it takes text and returns data.
- Produces: `parseHunks(diffText) -> {addedLines: number[], deletions: [{after: number, count: number}]}`
  - `addedLines` are line numbers **in the new file** that are added or modified.
  - `deletions[].after` is the new-file line number the removed lines sat after; `0` means they were removed from the top of the file.

This is the module most likely to be subtly wrong, so it gets the heaviest coverage. The input is always `git diff -U0` output, so hunks carry no context lines.

**The rule, stated once:** for a hunk header `@@ -oldStart,oldCount +newStart,newCount @@`, an omitted count means `1`. If `newCount` is `0` the hunk is a pure deletion and produces a deletion marker. Otherwise the hunk produces `newCount` added line numbers starting at `newStart`, and produces **no** deletion marker even when `oldCount` exceeds `newCount` — a modification is shown by tinting the replacement lines, not by also drawing a deletion stub beside them.

- [ ] **Step 1: Write the failing test**

`server/git/hunks.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { parseHunks } from './hunks.js'

describe('parseHunks', () => {
  it('returns nothing for an empty diff', () => {
    expect(parseHunks('')).toEqual({ addedLines: [], deletions: [] })
  })

  it('marks a block of added lines', () => {
    const diff = [
      'diff --git a/x.js b/x.js',
      '--- a/x.js',
      '+++ b/x.js',
      '@@ -3,0 +4,3 @@',
      '+one',
      '+two',
      '+three'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({ addedLines: [4, 5, 6], deletions: [] })
  })

  it('treats an omitted count as one line', () => {
    const diff = '@@ -7 +7 @@\n-old\n+new\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [7], deletions: [] })
  })

  it('records a pure deletion as a marker and no added lines', () => {
    const diff = '@@ -10,3 +9,0 @@\n-a\n-b\n-c\n'
    expect(parseHunks(diff)).toEqual({
      addedLines: [],
      deletions: [{ after: 9, count: 3 }]
    })
  })

  it('records a deletion at the top of the file as after line zero', () => {
    const diff = '@@ -1,2 +0,0 @@\n-a\n-b\n'
    expect(parseHunks(diff)).toEqual({
      addedLines: [],
      deletions: [{ after: 0, count: 2 }]
    })
  })

  it('marks a modification as added lines without a deletion marker', () => {
    const diff = '@@ -4,5 +4,2 @@\n-a\n-b\n-c\n-d\n-e\n+x\n+y\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [4, 5], deletions: [] })
  })

  it('handles several hunks in one file', () => {
    const diff = [
      '@@ -1 +1 @@',
      '-a',
      '+A',
      '@@ -20,2 +20,0 @@',
      '-x',
      '-y',
      '@@ -30,0 +29,2 @@',
      '+p',
      '+q'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({
      addedLines: [1, 29, 30],
      deletions: [{ after: 20, count: 2 }]
    })
  })

  it('ignores a trailing no-newline marker', () => {
    const diff = '@@ -1 +1 @@\n-a\n+b\n\\ No newline at end of file\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [1], deletions: [] })
  })

  it('ignores rename and mode headers', () => {
    const diff = [
      'diff --git a/old.js b/new.js',
      'similarity index 88%',
      'rename from old.js',
      'rename to new.js',
      'old mode 100644',
      'new mode 100755',
      '@@ -2 +2 @@',
      '-a',
      '+b'
    ].join('\n')
    expect(parseHunks(diff)).toEqual({ addedLines: [2], deletions: [] })
  })

  it('ignores a hunk section heading after the second @@', () => {
    const diff = '@@ -5,0 +6,1 @@ export function parse(x) {\n+  added\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [6], deletions: [] })
  })

  it('returns nothing for a diff with only a binary notice', () => {
    const diff = 'diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n'
    expect(parseHunks(diff)).toEqual({ addedLines: [], deletions: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/git/hunks.test.js`
Expected: FAIL — cannot resolve `./hunks.js`.

- [ ] **Step 3: Write the implementation**

`server/git/hunks.js`:

```js
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
      if (oldCount > 0) deletions.push({ after: newStart, count: oldCount })
      continue
    }

    for (let n = newStart; n < newStart + newCount; n += 1) addedLines.push(n)
  }

  return { addedLines, deletions }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/git/hunks.test.js`
Expected: PASS — 11 tests.

- [ ] **Step 5: Add a test that pins the parser to real git output**

Append to `server/git/hunks.test.js`:

```js
import { afterEach } from 'vitest'
import { git } from './run.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('parseHunks against real git output', () => {
  it('agrees with git for a mixed edit', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\nd\ne\n')
    const first = repo.commit('first')
    repo.write('x.js', 'a\nB\nc\nNEW\nd\n')

    const diff = await git(repo.dir, ['diff', '-U0', first, '--', 'x.js'])
    const { addedLines, deletions } = parseHunks(diff)

    expect(addedLines).toContain(2)
    expect(addedLines).toContain(4)
    expect(deletions.every((d) => d.count > 0)).toBe(true)
  })
})
```

- [ ] **Step 6: Run the file and commit**

Run: `npx vitest run server/git/hunks.test.js`
Expected: PASS — 12 tests.

```bash
git add server/git/hunks.js server/git/hunks.test.js
git commit -m "feat: parse git diff hunks into line states

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 5: The changed-file list

**Files:**
- Create: `server/git/changes.js`
- Test: `server/git/changes.test.js`

**Interfaces:**
- Consumes: `git` from `server/git/run.js`
- Produces: `changedFiles(repoPath, base) -> Promise<ChangedFile[]>` where

```js
// ChangedFile
{
  path: string,         // path in the new tree
  oldPath: string|null, // set only for renames
  status: 'A'|'M'|'D'|'R'|'?',
  added: number,        // 0 for binary
  removed: number,      // 0 for binary
  binary: boolean
}
```

Results are sorted by `path`. Untracked files come from `git status` and are reported with status `'?'`, `removed: 0`, and `added` equal to their line count (0 if binary or unreadable).

- [ ] **Step 1: Write the failing test**

`server/git/changes.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { changedFiles } from './changes.js'
import { makeRepo } from '../../tests/helpers/repo.js'

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

describe('changedFiles', () => {
  it('reports a modified file with its line counts', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\ntwo\n')
    const base = repo.commit('first')
    repo.write('a.txt', 'one\nTWO\nthree\n')

    expect(await changedFiles(repo.dir, base)).toEqual([
      { path: 'a.txt', oldPath: null, status: 'M', added: 2, removed: 1, binary: false }
    ])
  })

  it('reports a committed addition and an uncommitted one together', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')
    repo.write('c.txt', 'three\n')

    const result = await changedFiles(repo.dir, base)
    expect(result.map((f) => [f.path, f.status])).toEqual([
      ['b.txt', 'A'],
      ['c.txt', '?']
    ])
  })

  it('reports a deleted file', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\ntwo\n')
    const base = repo.commit('first')
    repo.run('rm', 'a.txt')

    expect(await changedFiles(repo.dir, base)).toEqual([
      { path: 'a.txt', oldPath: null, status: 'D', added: 0, removed: 2, binary: false }
    ])
  })

  it('reports a rename with its old path', async () => {
    repo = await makeRepo()
    repo.write('old.txt', 'one\ntwo\nthree\nfour\n')
    const base = repo.commit('first')
    repo.run('mv', 'old.txt', 'new.txt')

    const result = await changedFiles(repo.dir, base)
    expect(result).toHaveLength(1)
    expect(result[0].path).toBe('new.txt')
    expect(result[0].oldPath).toBe('old.txt')
    expect(result[0].status).toBe('R')
  })

  it('flags a binary file and reports zero counts', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    writeFileSync(join(repo.dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))
    repo.run('add', '-A')

    const result = await changedFiles(repo.dir, base)
    const png = result.find((f) => f.path === 'logo.png')
    expect(png.binary).toBe(true)
    expect(png.added).toBe(0)
  })

  it('handles paths containing spaces', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('a folder/my file.txt', 'hi\n')

    const result = await changedFiles(repo.dir, base)
    expect(result[0].path).toBe('a folder/my file.txt')
  })

  it('returns an empty list when nothing changed', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    expect(await changedFiles(repo.dir, base)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/git/changes.test.js`
Expected: FAIL — cannot resolve `./changes.js`.

- [ ] **Step 3: Write the implementation**

`server/git/changes.js`:

```js
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { git } from './run.js'

const UNTRACKED_PREFIX = '?? '
const COUNT_LIMIT = 5 * 1024 * 1024

function splitZ(text) {
  return text.split('\0').filter((token) => token !== '')
}

async function numstat(repoPath, base) {
  const tokens = splitZ(await git(repoPath, ['diff', '--numstat', '-z', '--find-renames', base]))
  const byPath = new Map()

  for (let i = 0; i < tokens.length; i += 1) {
    const [added, removed, inlinePath] = tokens[i].split('\t')
    let path = inlinePath
    let oldPath = null

    if (path === '') {
      oldPath = tokens[i + 1]
      path = tokens[i + 2]
      i += 2
    }

    const binary = added === '-' || removed === '-'
    byPath.set(path, {
      oldPath,
      added: binary ? 0 : Number(added),
      removed: binary ? 0 : Number(removed),
      binary
    })
  }
  return byPath
}

async function nameStatus(repoPath, base) {
  const tokens = splitZ(await git(repoPath, ['diff', '--name-status', '-z', '--find-renames', base]))
  const byPath = new Map()

  for (let i = 0; i < tokens.length; i += 2) {
    const code = tokens[i]
    if (code.startsWith('R')) {
      byPath.set(tokens[i + 2], 'R')
      i += 1
      continue
    }
    byPath.set(tokens[i + 1], code[0])
  }
  return byPath
}

async function untrackedPaths(repoPath) {
  const tokens = splitZ(
    await git(repoPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  )
  return tokens
    .filter((token) => token.startsWith(UNTRACKED_PREFIX))
    .map((token) => token.slice(UNTRACKED_PREFIX.length))
}

async function countLines(fullPath) {
  try {
    const { size } = await stat(fullPath)
    if (size > COUNT_LIMIT) return { added: 0, binary: false }

    const buffer = await readFile(fullPath)
    if (buffer.subarray(0, 8000).includes(0)) return { added: 0, binary: true }

    const text = buffer.toString('utf8')
    if (text === '') return { added: 0, binary: false }
    return { added: text.replace(/\n$/, '').split('\n').length, binary: false }
  } catch {
    return { added: 0, binary: false }
  }
}

export async function changedFiles(repoPath, base) {
  const [stats, statuses, newPaths] = await Promise.all([
    numstat(repoPath, base),
    nameStatus(repoPath, base),
    untrackedPaths(repoPath)
  ])

  const files = []

  for (const [path, entry] of stats) {
    files.push({
      path,
      oldPath: entry.oldPath,
      status: statuses.get(path) ?? 'M',
      added: entry.added,
      removed: entry.removed,
      binary: entry.binary
    })
  }

  for (const path of newPaths) {
    const { added, binary } = await countLines(join(repoPath, path))
    files.push({ path, oldPath: null, status: '?', added, removed: 0, binary })
  }

  return files.sort((a, b) => a.path.localeCompare(b.path))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/git/changes.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/git/changes.js server/git/changes.test.js
git commit -m "feat: list changed files with line counts and status

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 6: Per-file line states

**Files:**
- Create: `server/git/file.js`
- Test: `server/git/file.test.js`

**Interfaces:**
- Consumes: `git`, `gitTry` from `server/git/run.js`; `parseHunks` from `server/git/hunks.js`
- Produces: `fileLines(repoPath, base, relPath, {maxFileBytes}) -> Promise<FileView>` where

```js
// FileView
{
  path: string,
  oldPath: string|null,
  status: 'A'|'M'|'D'|'R'|'?',
  binary: boolean,
  tooLarge: boolean,
  lines: [{ n: number, text: string, state: 'added'|'unchanged'|'deleted' }],
  deletions: [{ after: number, count: number }]
}
```

When `binary` or `tooLarge` is true, `lines` and `deletions` are empty and the client renders a stub.

- [ ] **Step 1: Write the failing test**

`server/git/file.test.js`:

```js
import { describe, it, expect, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileLines } from './file.js'
import { makeRepo } from '../../tests/helpers/repo.js'

const OPTS = { maxFileBytes: 2 * 1024 * 1024 }

let repo
afterEach(async () => { await repo?.cleanup(); repo = null })

const states = (view) => view.lines.map((l) => l.state)

describe('fileLines', () => {
  it('tints only the changed lines of a modified file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\nc\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(states(view)).toEqual(['unchanged', 'added', 'unchanged'])
    expect(view.lines[1].text).toBe('B')
    expect(view.status).toBe('M')
  })

  it('numbers lines from one', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines.map((l) => l.n)).toEqual([1, 2])
  })

  it('marks every line of an untracked file as added', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('new.js', 'x\ny\n')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('?')
    expect(states(view)).toEqual(['added', 'added'])
  })

  it('marks every line of a committed new file as added', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('new.js', 'x\ny\n')
    repo.commit('add new')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('A')
    expect(states(view)).toEqual(['added', 'added'])
  })

  it('shows a deleted file from the base with every line deleted', async () => {
    repo = await makeRepo()
    repo.write('gone.js', 'x\ny\n')
    const base = repo.commit('first')
    repo.run('rm', 'gone.js')

    const view = await fileLines(repo.dir, base, 'gone.js', OPTS)
    expect(view.status).toBe('D')
    expect(states(view)).toEqual(['deleted', 'deleted'])
    expect(view.lines[0].text).toBe('x')
  })

  it('reports deletion markers positioned in the new file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\nc\nd\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nd\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.deletions).toEqual([{ after: 1, count: 2 }])
  })

  it('carries the old path for a rename', async () => {
    repo = await makeRepo()
    repo.write('old.js', 'a\nb\nc\nd\n')
    const base = repo.commit('first')
    repo.run('mv', 'old.js', 'new.js')

    const view = await fileLines(repo.dir, base, 'new.js', OPTS)
    expect(view.status).toBe('R')
    expect(view.oldPath).toBe('old.js')
  })

  it('flags a binary file and returns no lines', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    writeFileSync(join(repo.dir, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02, 0x41]))

    const view = await fileLines(repo.dir, base, 'blob.bin', OPTS)
    expect(view.binary).toBe(true)
    expect(view.lines).toEqual([])
  })

  it('flags a file above the size limit and returns no lines', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    const base = repo.commit('first')
    repo.write('big.txt', 'x\n'.repeat(1000))

    const view = await fileLines(repo.dir, base, 'big.txt', { maxFileBytes: 100 })
    expect(view.tooLarge).toBe(true)
    expect(view.lines).toEqual([])
  })

  it('does not invent a trailing blank line', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    const base = repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines).toHaveLength(2)
  })

  it('keeps a genuine trailing blank line', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\n\n')
    const base = repo.commit('first')
    repo.write('x.js', 'A\n\n')

    const view = await fileLines(repo.dir, base, 'x.js', OPTS)
    expect(view.lines.map((l) => l.text)).toEqual(['A', ''])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/git/file.test.js`
Expected: FAIL — cannot resolve `./file.js`.

- [ ] **Step 3: Write the implementation**

`server/git/file.js`:

```js
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { git, gitTry } from './run.js'
import { parseHunks } from './hunks.js'

function toLines(text) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? [] : body.split('\n')
}

async function statusOf(repoPath, base, relPath) {
  const diff = await gitTry(repoPath, [
    'diff', '--name-status', '-z', '--find-renames', base, '--', relPath
  ])
  const tokens = (diff ?? '').split('\0').filter((token) => token !== '')

  if (tokens.length === 0) {
    const tracked = await gitTry(repoPath, ['ls-files', '--error-unmatch', '--', relPath])
    return { status: tracked ? 'M' : '?', oldPath: null }
  }

  const code = tokens[0]
  if (code.startsWith('R')) return { status: 'R', oldPath: tokens[1] }
  return { status: code[0], oldPath: null }
}

function stub(path, oldPath, status, flags) {
  return {
    path,
    oldPath,
    status,
    binary: flags.binary ?? false,
    tooLarge: flags.tooLarge ?? false,
    lines: [],
    deletions: []
  }
}

function uniform(path, oldPath, status, texts, state) {
  return {
    path,
    oldPath,
    status,
    binary: false,
    tooLarge: false,
    lines: texts.map((text, i) => ({ n: i + 1, text, state })),
    deletions: []
  }
}

export async function fileLines(repoPath, base, relPath, { maxFileBytes }) {
  const { status, oldPath } = await statusOf(repoPath, base, relPath)

  if (status === 'D') {
    const content = await git(repoPath, ['show', `${base}:${relPath}`])
    return uniform(relPath, oldPath, status, toLines(content), 'deleted')
  }

  const fullPath = join(repoPath, relPath)
  const { size } = await stat(fullPath)
  if (size > maxFileBytes) return stub(relPath, oldPath, status, { tooLarge: true })

  const buffer = await readFile(fullPath)
  if (buffer.subarray(0, 8000).includes(0)) {
    return stub(relPath, oldPath, status, { binary: true })
  }

  const texts = toLines(buffer.toString('utf8'))

  if (status === '?') return uniform(relPath, oldPath, status, texts, 'added')

  const diff = await git(repoPath, ['diff', '-U0', '--find-renames', base, '--', relPath])
  const { addedLines, deletions } = parseHunks(diff)
  const added = new Set(addedLines)

  return {
    path: relPath,
    oldPath,
    status,
    binary: false,
    tooLarge: false,
    lines: texts.map((text, i) => ({
      n: i + 1,
      text,
      state: added.has(i + 1) ? 'added' : 'unchanged'
    })),
    deletions
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/git/file.test.js`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add server/git/file.js server/git/file.test.js
git commit -m "feat: build per-line change states for a single file

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---
### Task 7: Config and state files

**Files:**
- Create: `server/paths.js`, `server/config.js`, `server/state.js`
- Test: `server/config.test.js`, `server/state.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `configDir()`, `CONFIG_FILE()`, `STATE_FILE()` from `server/paths.js` — functions, not constants, so a test can change the directory between cases. All three honour the `CODE_INSPECTOR_CONFIG_DIR` environment variable, which exists so tests never touch the real `~/.config`.
  - `DEFAULT_CONFIG` and `loadConfig() -> Promise<Config>` from `server/config.js`. Writes `DEFAULT_CONFIG` to disk on first run, then merges the user's file over the defaults so a partial config is legal.
  - `loadState() -> Promise<State>`, `saveState(patch) -> Promise<State>`, `rememberProject(repoPath) -> Promise<State>` from `server/state.js`.

```js
// Config
{
  defaultTheme: 'dark'|'light',
  maxFileBytes: number,
  lineHeight: number,
  themes: { dark: Tokens, light: Tokens }
}
// Tokens: { surface, text, border, added, unchanged, deleted } — all CSS colour strings

// State
{ lastProject: string|null, recents: string[], paneWidth: number, theme: 'dark'|'light'|null }
```

`rememberProject` sets `lastProject` and moves the path to the front of `recents`, capped at 5, with no duplicates.

- [ ] **Step 1: Write the failing tests**

`server/config.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ci-config-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = dir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(dir, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('writes the defaults on first run and returns them', async () => {
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()
    expect(config).toEqual(DEFAULT_CONFIG)

    const onDisk = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8'))
    expect(onDisk.themes.dark.added).toBe(DEFAULT_CONFIG.themes.dark.added)
  })

  it('merges a partial user config over the defaults', async () => {
    await writeFile(
      join(dir, 'config.json'),
      JSON.stringify({ themes: { dark: { added: '#ff0000' } } })
    )
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    const config = await loadConfig()

    expect(config.themes.dark.added).toBe('#ff0000')
    expect(config.themes.dark.surface).toBe(DEFAULT_CONFIG.themes.dark.surface)
    expect(config.themes.light).toEqual(DEFAULT_CONFIG.themes.light)
  })

  it('falls back to the defaults when the file is unparseable', async () => {
    await writeFile(join(dir, 'config.json'), '{ not json')
    const { loadConfig, DEFAULT_CONFIG } = await import('./config.js')
    expect(await loadConfig()).toEqual(DEFAULT_CONFIG)
  })
})
```

`server/state.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ci-state-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = dir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(dir, { recursive: true, force: true })
})

describe('state', () => {
  it('returns empty state when no file exists', async () => {
    const { loadState } = await import('./state.js')
    expect(await loadState()).toEqual({
      lastProject: null,
      recents: [],
      paneWidth: 280,
      theme: null
    })
  })

  it('persists a patch across reloads', async () => {
    const { saveState, loadState } = await import('./state.js')
    await saveState({ paneWidth: 400 })
    expect((await loadState()).paneWidth).toBe(400)
  })

  it('remembers a project as last and most recent', async () => {
    const { rememberProject } = await import('./state.js')
    const state = await rememberProject('/repos/alpha')
    expect(state.lastProject).toBe('/repos/alpha')
    expect(state.recents).toEqual(['/repos/alpha'])
  })

  it('moves a repeated project to the front without duplicating it', async () => {
    const { rememberProject } = await import('./state.js')
    await rememberProject('/repos/alpha')
    await rememberProject('/repos/beta')
    const state = await rememberProject('/repos/alpha')
    expect(state.recents).toEqual(['/repos/alpha', '/repos/beta'])
  })

  it('caps recents at five entries', async () => {
    const { rememberProject } = await import('./state.js')
    for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
      await rememberProject(`/repos/${name}`)
    }
    const { loadState } = await import('./state.js')
    const state = await loadState()
    expect(state.recents).toHaveLength(5)
    expect(state.recents[0]).toBe('/repos/f')
    expect(state.recents).not.toContain('/repos/a')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run server/config.test.js server/state.test.js`
Expected: FAIL — cannot resolve `./config.js` and `./state.js`.

- [ ] **Step 3: Write the path resolver**

`server/paths.js`:

```js
import { homedir } from 'node:os'
import { join } from 'node:path'

export function configDir() {
  return process.env.CODE_INSPECTOR_CONFIG_DIR ?? join(homedir(), '.config', 'code-inspector')
}

export const CONFIG_FILE = () => join(configDir(), 'config.json')
export const STATE_FILE = () => join(configDir(), 'state.json')
```

These are functions rather than constants so the environment variable can change between tests.

- [ ] **Step 4: Write the config loader**

`server/config.js`:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, CONFIG_FILE } from './paths.js'

export const DEFAULT_CONFIG = {
  defaultTheme: 'dark',
  maxFileBytes: 2097152,
  lineHeight: 20,
  themes: {
    dark: {
      surface: '#1e1f29',
      text: '#f8f8f2',
      border: '#44475a',
      added: '#d98a30',
      unchanged: '#2f6b4a',
      deleted: '#8a3030'
    },
    light: {
      surface: '#ffffff',
      text: '#1e1f29',
      border: '#d0d2e0',
      added: '#b35c00',
      unchanged: '#1c6b3f',
      deleted: '#a11a1a'
    }
  }
}

function merge(defaults, override) {
  if (override === null || typeof override !== 'object' || Array.isArray(override)) {
    return defaults
  }
  const result = { ...defaults }
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      typeof defaults[key] === 'object' && defaults[key] !== null
        ? merge(defaults[key], value)
        : value
  }
  return result
}

export async function loadConfig() {
  const file = CONFIG_FILE()
  try {
    return merge(DEFAULT_CONFIG, JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') {
      await mkdir(configDir(), { recursive: true })
      await writeFile(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`)
    }
    return DEFAULT_CONFIG
  }
}
```

- [ ] **Step 5: Write the state store**

`server/state.js`:

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { configDir, STATE_FILE } from './paths.js'

const EMPTY_STATE = { lastProject: null, recents: [], paneWidth: 280, theme: null }
const MAX_RECENTS = 5

export async function loadState() {
  try {
    return { ...EMPTY_STATE, ...JSON.parse(await readFile(STATE_FILE(), 'utf8')) }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export async function saveState(patch) {
  const next = { ...(await loadState()), ...patch }
  await mkdir(configDir(), { recursive: true })
  await writeFile(STATE_FILE(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export async function rememberProject(repoPath) {
  const { recents } = await loadState()
  const next = [repoPath, ...recents.filter((p) => p !== repoPath)].slice(0, MAX_RECENTS)
  return saveState({ lastProject: repoPath, recents: next })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run server/config.test.js server/state.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 7: Commit**

```bash
git add server/paths.js server/config.js server/state.js server/config.test.js server/state.test.js
git commit -m "feat: load config defaults and persist project state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 8: Safe directory browsing

**Files:**
- Create: `server/browse.js`
- Test: `server/browse.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `listDirectory(requestedPath, {home}) -> Promise<Listing>` where

```js
// Listing
{
  path: string,          // the resolved absolute path
  parent: string|null,   // null when the path is the home directory
  entries: [{ name: string, path: string, isGitRepo: boolean }]
}
```

`home` defaults to `os.homedir()` and is injectable so tests can point it at a temp directory.

**Security rule:** the requested path is resolved with `fs.realpath` and must be the home directory or inside it. Anything else throws an `Error` with `code = 'EOUTSIDEHOME'`. Symlinks are resolved *before* the check, so a symlink inside home pointing at `/etc` is rejected.

Entries are directories only, sorted by name, excluding dot-directories and `node_modules`.

- [ ] **Step 1: Write the failing test**

`server/browse.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, mkdir, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listDirectory } from './browse.js'

let home

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'ci-home-')))
  await mkdir(join(home, 'projects/alpha/.git'), { recursive: true })
  await mkdir(join(home, 'projects/notes'), { recursive: true })
  await mkdir(join(home, 'projects/.hidden'), { recursive: true })
  await mkdir(join(home, 'projects/node_modules'), { recursive: true })
})

afterEach(async () => {
  await rm(home, { recursive: true, force: true })
})

describe('listDirectory', () => {
  it('lists directories and flags git repositories', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    expect(listing.entries).toEqual([
      { name: 'alpha', path: join(home, 'projects/alpha'), isGitRepo: true },
      { name: 'notes', path: join(home, 'projects/notes'), isGitRepo: false }
    ])
  })

  it('excludes dot-directories and node_modules', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    const names = listing.entries.map((e) => e.name)
    expect(names).not.toContain('.hidden')
    expect(names).not.toContain('node_modules')
  })

  it('reports the parent directory', async () => {
    const listing = await listDirectory(join(home, 'projects'), { home })
    expect(listing.parent).toBe(home)
  })

  it('reports no parent at the home directory', async () => {
    const listing = await listDirectory(home, { home })
    expect(listing.parent).toBeNull()
  })

  it('rejects a path outside the home directory', async () => {
    await expect(listDirectory('/etc', { home })).rejects.toMatchObject({
      code: 'EOUTSIDEHOME'
    })
  })

  it('rejects a symlink inside home that escapes home', async () => {
    await symlink('/etc', join(home, 'escape'))
    await expect(listDirectory(join(home, 'escape'), { home })).rejects.toMatchObject({
      code: 'EOUTSIDEHOME'
    })
  })

  it('rejects a path that only shares a name prefix with home', async () => {
    await expect(listDirectory(`${home}-elsewhere`, { home })).rejects.toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/browse.test.js`
Expected: FAIL — cannot resolve `./browse.js`.

- [ ] **Step 3: Write the implementation**

`server/browse.js`:

```js
import { readdir, realpath, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, sep } from 'node:path'

const EXCLUDED = new Set(['node_modules'])

function outsideHome(path) {
  const error = new Error(`Path is outside the home directory: ${path}`)
  error.code = 'EOUTSIDEHOME'
  return error
}

async function isGitRepo(path) {
  try {
    await access(join(path, '.git'))
    return true
  } catch {
    return false
  }
}

export async function listDirectory(requestedPath, { home = homedir() } = {}) {
  const realHome = await realpath(home)

  let resolved
  try {
    resolved = await realpath(requestedPath)
  } catch {
    throw outsideHome(requestedPath)
  }

  if (resolved !== realHome && !resolved.startsWith(realHome + sep)) {
    throw outsideHome(requestedPath)
  }

  const dirents = await readdir(resolved, { withFileTypes: true })
  const directories = dirents.filter(
    (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !EXCLUDED.has(entry.name)
  )

  const entries = await Promise.all(
    directories.map(async (entry) => {
      const path = join(resolved, entry.name)
      return { name: entry.name, path, isGitRepo: await isGitRepo(path) }
    })
  )

  entries.sort((a, b) => a.name.localeCompare(b.name))

  return {
    path: resolved,
    parent: resolved === realHome ? null : dirname(resolved),
    entries
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/browse.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/browse.js server/browse.test.js
git commit -m "feat: browse directories within the home tree

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 9: The HTTP API

**Files:**
- Create: `server/routes/api.js`, `server/app.js`
- Test: `server/app.test.js`

**Interfaces:**
- Consumes: `resolveBase` (`git/base.js`), `changedFiles` (`git/changes.js`), `fileLines` (`git/file.js`), `listDirectory` (`browse.js`), `loadConfig` (`config.js`), `loadState`/`saveState`/`rememberProject` (`state.js`)
- Produces: `createApp({distDir}) -> express.Application`

**Range query format.** One query parameter, `range`, encoded as a string so the client never builds JSON into a URL:

| `range` value | Parsed to |
|---|---|
| absent or `auto` | `{mode: 'auto'}` |
| `worktree` | `{mode: 'worktree'}` |
| `commits:5` | `{mode: 'commits', n: 5}` |
| `ref:origin/main` | `{mode: 'ref', ref: 'origin/main'}` |

`parseRange` is exported from `server/routes/api.js` so it can be tested directly.

**Endpoints.** Every endpoint taking `path` first validates it is a git work tree via `git rev-parse --show-toplevel`, and uses the returned top level rather than the raw input, so launching from a subdirectory works.

| Method and path | Success body |
|---|---|
| `GET /api/project?path=` | `{root, name, branch, base, label}` |
| `GET /api/changes?path=&range=` | `{root, base, label, files: ChangedFile[]}` |
| `GET /api/file?path=&file=&range=` | `FileView` |
| `GET /api/fs/list?path=` | `Listing` |
| `GET /api/config` | `Config` |
| `GET /api/state` | `State` |
| `PUT /api/state` | `State` (accepts a partial body) |
| `POST /api/state/project` | `State` (body `{path}`; calls `rememberProject`) |

Errors return `{error: string}` with status `400` for a bad request, `403` for `EOUTSIDEHOME`, `404` for a path that is not a repository, and `500` otherwise.

- [ ] **Step 1: Write the failing test**

`server/app.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, parseRange } from './app.js'
import { makeRepo } from '../tests/helpers/repo.js'

let repo
let server
let baseUrl
let configDir

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'ci-app-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = configDir
  const app = createApp({ distDir: null })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await new Promise((resolve) => server.close(resolve))
  await rm(configDir, { recursive: true, force: true })
  await repo?.cleanup()
  repo = null
})

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`)
  return { status: response.status, body: await response.json() }
}

describe('parseRange', () => {
  it('defaults to auto', () => {
    expect(parseRange(undefined)).toEqual({ mode: 'auto' })
    expect(parseRange('auto')).toEqual({ mode: 'auto' })
  })

  it('parses worktree, commits and ref', () => {
    expect(parseRange('worktree')).toEqual({ mode: 'worktree' })
    expect(parseRange('commits:5')).toEqual({ mode: 'commits', n: 5 })
    expect(parseRange('ref:origin/main')).toEqual({ mode: 'ref', ref: 'origin/main' })
  })

  it('rejects a non-numeric commit count', () => {
    expect(() => parseRange('commits:abc')).toThrow()
  })
})

describe('GET /api/project', () => {
  it('reports the branch and resolved base', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')

    const { status, body } = await get(`/api/project?path=${encodeURIComponent(repo.dir)}`)
    expect(status).toBe(200)
    expect(body.branch).toBe('main')
    expect(body.root).toBe(repo.dir)
    expect(body.label).toBe('full history')
  })

  it('resolves a subdirectory to the repository root', async () => {
    repo = await makeRepo()
    repo.write('src/a.txt', 'one\n')
    repo.commit('first')

    const sub = join(repo.dir, 'src')
    const { body } = await get(`/api/project?path=${encodeURIComponent(sub)}`)
    expect(body.root).toBe(repo.dir)
  })

  it('returns 404 for a directory that is not a repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { status } = await get(`/api/project?path=${encodeURIComponent(plain)}`)
    expect(status).toBe(404)
    await rm(plain, { recursive: true, force: true })
  })

  it('returns 400 when path is missing', async () => {
    const { status } = await get('/api/project')
    expect(status).toBe(400)
  })
})

describe('GET /api/changes', () => {
  it('lists changed files', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('a.txt', 'ONE\n')

    const { body } = await get(`/api/changes?path=${encodeURIComponent(repo.dir)}`)
    expect(body.files.map((f) => f.path)).toEqual(['a.txt'])
  })

  it('honours an explicit worktree range', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    repo.write('b.txt', 'two\n')
    repo.commit('second')

    const query = `path=${encodeURIComponent(repo.dir)}&range=worktree`
    const { body } = await get(`/api/changes?${query}`)
    expect(body.files).toEqual([])
    expect(body.label).toBe('working tree')
  })
})

describe('GET /api/file', () => {
  it('returns line states for a file', async () => {
    repo = await makeRepo()
    repo.write('x.js', 'a\nb\n')
    repo.commit('first')
    repo.write('x.js', 'a\nB\n')

    const query = `path=${encodeURIComponent(repo.dir)}&file=${encodeURIComponent('x.js')}`
    const { body } = await get(`/api/file?${query}`)
    expect(body.lines.map((l) => l.state)).toEqual(['unchanged', 'added'])
  })

  it('returns 400 when file is missing', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')
    const { status } = await get(`/api/file?path=${encodeURIComponent(repo.dir)}`)
    expect(status).toBe(400)
  })
})

describe('GET /api/fs/list', () => {
  it('returns 403 for a path outside the home directory', async () => {
    const { status, body } = await get('/api/fs/list?path=%2Fetc')
    expect(status).toBe(403)
    expect(body.error).toBeTruthy()
  })
})

describe('config and state endpoints', () => {
  it('serves the default config', async () => {
    const { body } = await get('/api/config')
    expect(body.defaultTheme).toBe('dark')
    expect(body.themes.dark.added).toBeTruthy()
  })

  it('round-trips a state patch', async () => {
    const response = await fetch(`${baseUrl}/api/state`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paneWidth: 333 })
    })
    expect((await response.json()).paneWidth).toBe(333)
    expect((await get('/api/state')).body.paneWidth).toBe(333)
  })

  it('remembers a project', async () => {
    const response = await fetch(`${baseUrl}/api/state/project`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/repos/alpha' })
    })
    const body = await response.json()
    expect(body.lastProject).toBe('/repos/alpha')
    expect(body.recents).toEqual(['/repos/alpha'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/app.test.js`
Expected: FAIL — cannot resolve `./app.js`.

- [ ] **Step 3: Write the routes**

`server/routes/api.js`:

```js
import { Router } from 'express'
import { basename } from 'node:path'
import { gitTry } from '../git/run.js'
import { resolveBase } from '../git/base.js'
import { changedFiles } from '../git/changes.js'
import { fileLines } from '../git/file.js'
import { listDirectory } from '../browse.js'
import { loadConfig } from '../config.js'
import { loadState, saveState, rememberProject } from '../state.js'

export function parseRange(value) {
  if (!value || value === 'auto') return { mode: 'auto' }
  if (value === 'worktree') return { mode: 'worktree' }

  if (value.startsWith('commits:')) {
    const n = Number(value.slice('commits:'.length))
    if (!Number.isInteger(n) || n < 1) throw badRequest(`Invalid commit count in range: ${value}`)
    return { mode: 'commits', n }
  }

  if (value.startsWith('ref:')) {
    const ref = value.slice('ref:'.length)
    if (ref === '') throw badRequest('Empty ref in range')
    return { mode: 'ref', ref }
  }

  throw badRequest(`Unrecognised range: ${value}`)
}

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

async function repoRoot(rawPath) {
  if (!rawPath) throw badRequest('Missing path parameter')
  const root = await gitTry(rawPath, ['rev-parse', '--show-toplevel'])
  if (!root) {
    const error = new Error(`Not a git repository: ${rawPath}`)
    error.status = 404
    throw error
  }
  return root
}

export function apiRouter() {
  const router = Router()

  router.get('/project', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      const branch = (await gitTry(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD'
      const { base, label } = await resolveBase(root, parseRange(req.query.range))
      res.json({ root, name: basename(root), branch, base, label })
    } catch (error) {
      next(error)
    }
  })

  router.get('/changes', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      const { base, label } = await resolveBase(root, parseRange(req.query.range))
      res.json({ root, base, label, files: await changedFiles(root, base) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/file', async (req, res, next) => {
    try {
      const root = await repoRoot(req.query.path)
      if (!req.query.file) throw badRequest('Missing file parameter')
      const { base } = await resolveBase(root, parseRange(req.query.range))
      const { maxFileBytes } = await loadConfig()
      res.json(await fileLines(root, base, req.query.file, { maxFileBytes }))
    } catch (error) {
      next(error)
    }
  })

  router.get('/fs/list', async (req, res, next) => {
    try {
      if (!req.query.path) throw badRequest('Missing path parameter')
      res.json(await listDirectory(req.query.path))
    } catch (error) {
      next(error)
    }
  })

  router.get('/config', async (req, res, next) => {
    try {
      res.json(await loadConfig())
    } catch (error) {
      next(error)
    }
  })

  router.get('/state', async (req, res, next) => {
    try {
      res.json(await loadState())
    } catch (error) {
      next(error)
    }
  })

  router.put('/state', async (req, res, next) => {
    try {
      res.json(await saveState(req.body ?? {}))
    } catch (error) {
      next(error)
    }
  })

  router.post('/state/project', async (req, res, next) => {
    try {
      if (!req.body?.path) throw badRequest('Missing path in body')
      res.json(await rememberProject(req.body.path))
    } catch (error) {
      next(error)
    }
  })

  return router
}
```

- [ ] **Step 4: Write the app factory**

`server/app.js`:

```js
import express from 'express'
import { apiRouter, parseRange } from './routes/api.js'

export { parseRange }

function statusFor(error) {
  if (error.status) return error.status
  if (error.code === 'EOUTSIDEHOME') return 403
  return 500
}

export function createApp({ distDir = null } = {}) {
  const app = express()
  app.use(express.json())
  app.use('/api', apiRouter())

  app.use('/api', (error, req, res, next) => {
    res.status(statusFor(error)).json({ error: error.message })
  })

  if (distDir) {
    app.use(express.static(distDir))
    app.get('/{*splat}', (req, res) => res.sendFile('index.html', { root: distDir }))
  }

  return app
}
```

The `/{*splat}` wildcard is Express 5 syntax; Express 4's bare `*` no longer parses.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/app.test.js`
Expected: PASS — 14 tests.

- [ ] **Step 6: Run the whole server suite and commit**

Run: `npx vitest run --project server`
Expected: PASS — all server tests green.

```bash
git add server/app.js server/routes/api.js server/app.test.js
git commit -m "feat: expose git, config and state over an HTTP API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 10: The CLI entry point

**Files:**
- Create: `server/start.js`, `server/launch.js`
- Test: `server/launch.test.js`

**Interfaces:**
- Consumes: `createApp` (`app.js`), `gitTry` (`git/run.js`), `loadState`/`rememberProject` (`state.js`)
- Produces:
  - `initialProject(cwd) -> Promise<string|null>` from `server/launch.js` — the repository root containing `cwd`, else `state.lastProject` if it still exists as a repository, else `null`.
  - `tailnetUrl(port) -> Promise<string|null>` from `server/launch.js` — the Tailscale IPv4 URL, or `null` when Tailscale is absent.
  - `server/start.js` is the executable entry: binds `127.0.0.1` on a free port, prints both URLs, opens the browser unless `--no-open`, and serves `web/dist` unless `--dev` is passed (in which case Vite serves the UI and this process is API-only on port 5174).

The Tailscale CLI lives inside the app bundle on macOS; the path is `/Applications/Tailscale.app/Contents/MacOS/Tailscale`.

- [ ] **Step 1: Write the failing test**

`server/launch.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeRepo } from '../tests/helpers/repo.js'

let repo
let configDir

beforeEach(async () => {
  configDir = await mkdtemp(join(tmpdir(), 'ci-launch-'))
  process.env.CODE_INSPECTOR_CONFIG_DIR = configDir
  vi.resetModules()
})

afterEach(async () => {
  delete process.env.CODE_INSPECTOR_CONFIG_DIR
  await rm(configDir, { recursive: true, force: true })
  await repo?.cleanup()
  repo = null
})

describe('initialProject', () => {
  it('prefers the repository containing the working directory', async () => {
    repo = await makeRepo()
    repo.write('src/a.txt', 'one\n')
    repo.commit('first')

    const { initialProject } = await import('./launch.js')
    expect(await initialProject(join(repo.dir, 'src'))).toBe(repo.dir)
  })

  it('falls back to the remembered project outside a repository', async () => {
    repo = await makeRepo()
    repo.write('a.txt', 'one\n')
    repo.commit('first')

    const { rememberProject } = await import('./state.js')
    await rememberProject(repo.dir)

    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBe(repo.dir)
    await rm(plain, { recursive: true, force: true })
  })

  it('returns null when the remembered project no longer exists', async () => {
    const { rememberProject } = await import('./state.js')
    await rememberProject('/repos/deleted-long-ago')

    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBeNull()
    await rm(plain, { recursive: true, force: true })
  })

  it('returns null with nothing remembered and no repository', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'ci-plain-'))
    const { initialProject } = await import('./launch.js')
    expect(await initialProject(plain)).toBeNull()
    await rm(plain, { recursive: true, force: true })
  })
})

describe('tailnetUrl', () => {
  it('returns null rather than throwing when Tailscale is absent', async () => {
    const { tailnetUrl } = await import('./launch.js')
    const url = await tailnetUrl(5174, { binary: '/nonexistent/tailscale' })
    expect(url).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/launch.test.js`
Expected: FAIL — cannot resolve `./launch.js`.

- [ ] **Step 3: Write the launch helpers**

`server/launch.js`:

```js
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gitTry } from './git/run.js'
import { loadState } from './state.js'

const execFileAsync = promisify(execFile)

const TAILSCALE_BINARY = '/Applications/Tailscale.app/Contents/MacOS/Tailscale'

export async function initialProject(cwd) {
  const here = await gitTry(cwd, ['rev-parse', '--show-toplevel'])
  if (here) return here

  const { lastProject } = await loadState()
  if (!lastProject) return null

  const remembered = await gitTry(lastProject, ['rev-parse', '--show-toplevel'])
  return remembered ?? null
}

export async function tailnetUrl(port, { binary = TAILSCALE_BINARY } = {}) {
  try {
    const { stdout } = await execFileAsync(binary, ['ip', '-4'], { encoding: 'utf8' })
    const address = stdout.trim().split('\n')[0]
    return address ? `http://${address}:${port}` : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/launch.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Write the entry point**

`server/start.js`:

```js
#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import open from 'open'
import { createApp } from './app.js'
import { initialProject, tailnetUrl } from './launch.js'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const dev = argv.includes('--dev')
const shouldOpen = !argv.includes('--no-open') && !dev

const app = createApp({ distDir: dev ? null : join(here, '..', 'web', 'dist') })
const port = dev ? 5174 : 0

const server = app.listen(port, '127.0.0.1', async () => {
  const actualPort = server.address().port
  const local = `http://127.0.0.1:${actualPort}`
  const project = await initialProject(process.cwd())

  console.log(`code-inspector  ${local}`)
  const tailnet = await tailnetUrl(actualPort)
  if (tailnet) console.log(`                ${tailnet}`)
  console.log(project ? `project         ${project}` : 'project         none — pick one in the UI')

  if (shouldOpen) await open(local)
})
```

In dev mode the browser is not opened and the port is fixed at 5174, because Vite owns the browser tab and proxies to this port.

- [ ] **Step 6: Wire the initial project into the API**

The UI needs to know what `initialProject` decided. Add this route to `server/routes/api.js`, inside `apiRouter()` before `return router`:

```js
  router.get('/initial', async (req, res, next) => {
    try {
      res.json({ path: await initialProject(process.env.CODE_INSPECTOR_CWD ?? process.cwd()) })
    } catch (error) {
      next(error)
    }
  })
```

Add its import to the top of the same file, beside the other imports:

```js
import { initialProject } from '../launch.js'
```

And in `server/start.js`, before `app.listen`, record the launch directory so it survives any later `process.chdir`:

```js
process.env.CODE_INSPECTOR_CWD = process.cwd()
```

- [ ] **Step 7: Verify the server starts and commit**

Run: `node server/start.js --dev --no-open &` then `curl -s http://127.0.0.1:5174/api/config | head -c 80` then `kill %1`
Expected: JSON config printed.

Run: `npx vitest run --project server`
Expected: PASS.

```bash
git add server/start.js server/launch.js server/launch.test.js server/routes/api.js
git commit -m "feat: add the CLI entry point and initial project resolution

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---
### Task 11: The API client and runtime theming

**Files:**
- Create: `web/src/api.js`, `web/src/theme.js`
- Test: `web/src/theme.test.js`

**Interfaces:**
- Consumes: the endpoints from Task 9
- Produces:
  - `api` from `web/src/api.js` with methods `initial()`, `project(path, range)`, `changes(path, range)`, `file(path, file, range)`, `fsList(path)`, `config()`, `state()`, `saveState(patch)`, `rememberProject(path)`. Every method returns parsed JSON and throws an `Error` carrying `.status` on a non-2xx response.
  - `rangeToParam(range) -> string` from `web/src/api.js`, the inverse of the server's `parseRange`.
  - `applyTheme(tokens, root?) -> void` and `resolveTheme(config, state) -> 'dark'|'light'` from `web/src/theme.js`.

`applyTheme` writes each token as the CSS custom property Tailwind reads: `surface` becomes `--color-surface`, `added` becomes `--color-added`, and so on. It also toggles the `dark` class on the root element so any Tailwind `dark:` variant stays in step.

- [ ] **Step 1: Write the failing test**

`web/src/theme.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme, resolveTheme } from './theme.js'

describe('applyTheme', () => {
  let root

  beforeEach(() => {
    root = document.createElement('div')
  })

  it('writes every token as a CSS custom property', () => {
    applyTheme(
      {
        surface: '#111111',
        text: '#eeeeee',
        border: '#333333',
        added: '#d98a30',
        unchanged: '#2f6b4a',
        deleted: '#8a3030'
      },
      root
    )

    expect(root.style.getPropertyValue('--color-surface')).toBe('#111111')
    expect(root.style.getPropertyValue('--color-added')).toBe('#d98a30')
    expect(root.style.getPropertyValue('--color-deleted')).toBe('#8a3030')
  })

  it('ignores tokens it does not know', () => {
    applyTheme({ surface: '#111111', bogus: 'nope' }, root)
    expect(root.style.getPropertyValue('--color-bogus')).toBe('')
  })
})

describe('resolveTheme', () => {
  const config = { defaultTheme: 'dark' }

  it('prefers the remembered theme', () => {
    expect(resolveTheme(config, { theme: 'light' })).toBe('light')
  })

  it('falls back to the config default', () => {
    expect(resolveTheme(config, { theme: null })).toBe('dark')
  })

  it('falls back to dark when nothing is set', () => {
    expect(resolveTheme({}, {})).toBe('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/theme.test.js`
Expected: FAIL — cannot resolve `./theme.js`.

- [ ] **Step 3: Write the theme module**

`web/src/theme.js`:

```js
const TOKENS = ['surface', 'text', 'border', 'added', 'unchanged', 'deleted']

export function applyTheme(tokens, root = document.documentElement) {
  for (const name of TOKENS) {
    if (tokens?.[name]) root.style.setProperty(`--color-${name}`, tokens[name])
  }
}

export function resolveTheme(config, state) {
  return state?.theme ?? config?.defaultTheme ?? 'dark'
}
```

- [ ] **Step 4: Write the API client**

`web/src/api.js`:

```js
export function rangeToParam(range) {
  switch (range?.mode) {
    case 'worktree':
      return 'worktree'
    case 'commits':
      return `commits:${range.n}`
    case 'ref':
      return `ref:${range.ref}`
    default:
      return 'auto'
  }
}

async function request(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(body.error ?? `Request failed: ${response.status}`)
    error.status = response.status
    throw error
  }
  return body
}

const query = (params) => new URLSearchParams(params).toString()

const json = (method, body) => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
})

export const api = {
  initial: () => request('/api/initial'),
  project: (path, range) =>
    request(`/api/project?${query({ path, range: rangeToParam(range) })}`),
  changes: (path, range) =>
    request(`/api/changes?${query({ path, range: rangeToParam(range) })}`),
  file: (path, file, range) =>
    request(`/api/file?${query({ path, file, range: rangeToParam(range) })}`),
  fsList: (path) => request(`/api/fs/list?${query({ path })}`),
  config: () => request('/api/config'),
  state: () => request('/api/state'),
  saveState: (patch) => request('/api/state', json('PUT', patch)),
  rememberProject: (path) => request('/api/state/project', json('POST', { path }))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run web/src/theme.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add web/src/api.js web/src/theme.js web/src/theme.test.js
git commit -m "feat: add the api client and runtime theme tokens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 12: Building the file tree

**Files:**
- Create: `web/src/tree.js`
- Test: `web/src/tree.test.js`

**Interfaces:**
- Consumes: `ChangedFile[]` from `api.changes()`
- Produces: `buildTree(files) -> Node[]` where

```js
// Node
{ type: 'dir', name: string, path: string, children: Node[] }
{ type: 'file', name: string, path: string, file: ChangedFile }
```

**Ordering:** directories before files, each group sorted by name.

**Collapse rule:** a directory whose only child is another directory merges with it, and its `name` becomes the joined segments (`src/feed`). `path` stays the full path of the deepest merged directory. A directory with one *file* child does not collapse.

- [ ] **Step 1: Write the failing test**

`web/src/tree.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildTree } from './tree.js'

const file = (path) => ({ path, oldPath: null, status: 'M', added: 1, removed: 0, binary: false })

describe('buildTree', () => {
  it('returns an empty list for no files', () => {
    expect(buildTree([])).toEqual([])
  })

  it('puts root-level files at the top level', () => {
    const tree = buildTree([file('README.md')])
    expect(tree).toEqual([
      { type: 'file', name: 'README.md', path: 'README.md', file: file('README.md') }
    ])
  })

  it('nests a file under its directory', () => {
    const tree = buildTree([file('src/a.js'), file('src/b.js')])
    expect(tree).toHaveLength(1)
    expect(tree[0].type).toBe('dir')
    expect(tree[0].name).toBe('src')
    expect(tree[0].children.map((c) => c.name)).toEqual(['a.js', 'b.js'])
  })

  it('collapses a chain of single-child directories', () => {
    const tree = buildTree([file('src/feed/parse.js')])
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('src/feed')
    expect(tree[0].path).toBe('src/feed')
    expect(tree[0].children.map((c) => c.name)).toEqual(['parse.js'])
  })

  it('does not collapse a directory with two children', () => {
    const tree = buildTree([file('src/feed/parse.js'), file('src/tts/speak.js')])
    expect(tree[0].name).toBe('src')
    expect(tree[0].children.map((c) => c.name)).toEqual(['feed', 'tts'])
  })

  it('does not collapse a directory whose only child is a file', () => {
    const tree = buildTree([file('src/a.js')])
    expect(tree[0].name).toBe('src')
  })

  it('sorts directories before files', () => {
    const tree = buildTree([file('zebra.md'), file('alpha/one.js')])
    expect(tree.map((n) => n.name)).toEqual(['alpha', 'zebra.md'])
  })

  it('carries the original file record on leaves', () => {
    const record = file('src/a.js')
    const tree = buildTree([record])
    expect(tree[0].children[0].file).toBe(record)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/tree.test.js`
Expected: FAIL — cannot resolve `./tree.js`.

- [ ] **Step 3: Write the implementation**

`web/src/tree.js`:

```js
function emptyDir(name, path) {
  return { type: 'dir', name, path, children: [], index: new Map() }
}

function insert(root, record) {
  const segments = record.path.split('/')
  const fileName = segments.pop()

  let node = root
  let prefix = ''

  for (const segment of segments) {
    prefix = prefix === '' ? segment : `${prefix}/${segment}`
    if (!node.index.has(segment)) {
      const child = emptyDir(segment, prefix)
      node.index.set(segment, child)
      node.children.push(child)
    }
    node = node.index.get(segment)
  }

  node.children.push({ type: 'file', name: fileName, path: record.path, file: record })
}

function collapse(node) {
  if (node.type === 'file') return node

  let current = node
  while (current.children.length === 1 && current.children[0].type === 'dir') {
    const only = current.children[0]
    current = {
      type: 'dir',
      name: `${current.name}/${only.name}`,
      path: only.path,
      children: only.children
    }
  }

  return {
    type: 'dir',
    name: current.name,
    path: current.path,
    children: sort(current.children.map(collapse))
  }
}

function sort(nodes) {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function buildTree(files) {
  const root = emptyDir('', '')
  for (const record of files) insert(root, record)
  return sort(root.children.map(collapse))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/tree.test.js`
Expected: PASS — 8 tests. `collapse` rebuilds every directory node field by field, so the internal `index` map used during insertion never reaches the returned tree.

- [ ] **Step 5: Commit**

```bash
git add web/src/tree.js web/src/tree.test.js
git commit -m "feat: build a collapsed file tree from changed paths

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 13: The file tree pane

**Files:**
- Create: `web/src/components/FileTree.jsx`
- Test: `web/src/components/FileTree.test.jsx`

**Interfaces:**
- Consumes: `buildTree` from `web/src/tree.js`
- Produces: `<FileTree files selectedPath onSelect />`
  - `files` is `ChangedFile[]`
  - `selectedPath` is a string or `null`
  - `onSelect(path)` fires when a file row is clicked

Directories start expanded and toggle on click. The selected file row carries `aria-current="true"`. A footer summarises `N files +A −R`. Status dots use `--color-added` for `A`/`?`, `--color-deleted` for `D`, and `--color-border` for `M`/`R`.

- [ ] **Step 1: Write the failing test**

`web/src/components/FileTree.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FileTree from './FileTree.jsx'

const file = (path, extra = {}) => ({
  path,
  oldPath: null,
  status: 'M',
  added: 2,
  removed: 1,
  binary: false,
  ...extra
})

describe('FileTree', () => {
  it('renders nothing but an empty note for no files', () => {
    render(<FileTree files={[]} selectedPath={null} onSelect={() => {}} />)
    expect(screen.getByText('No changes')).toBeInTheDocument()
  })

  it('renders directories and files', () => {
    render(
      <FileTree
        files={[file('src/feed/parse.js'), file('README.md')]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('src/feed')).toBeInTheDocument()
    expect(screen.getByText('parse.js')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('calls onSelect with the full path when a file is clicked', async () => {
    const onSelect = vi.fn()
    render(
      <FileTree files={[file('src/a.js')]} selectedPath={null} onSelect={onSelect} />
    )
    await userEvent.click(screen.getByText('a.js'))
    expect(onSelect).toHaveBeenCalledWith('src/a.js')
  })

  it('marks the selected file', () => {
    render(
      <FileTree files={[file('src/a.js')]} selectedPath="src/a.js" onSelect={() => {}} />
    )
    expect(screen.getByText('a.js').closest('button')).toHaveAttribute('aria-current', 'true')
  })

  it('collapses and expands a directory', async () => {
    render(<FileTree files={[file('src/a.js')]} selectedPath={null} onSelect={() => {}} />)
    expect(screen.getByText('a.js')).toBeInTheDocument()

    await userEvent.click(screen.getByText('src'))
    expect(screen.queryByText('a.js')).not.toBeInTheDocument()

    await userEvent.click(screen.getByText('src'))
    expect(screen.getByText('a.js')).toBeInTheDocument()
  })

  it('shows per-file line counts', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 24, removed: 6 })]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('+24')).toBeInTheDocument()
    expect(screen.getByText('−6')).toBeInTheDocument()
  })

  it('summarises the branch in the footer', () => {
    render(
      <FileTree
        files={[file('a.js', { added: 10, removed: 2 }), file('b.js', { added: 5, removed: 1 })]}
        selectedPath={null}
        onSelect={() => {}}
      />
    )
    expect(screen.getByText('2 files +15 −3')).toBeInTheDocument()
  })
})
```

Install the interaction library this test needs:

```bash
npm install -D @testing-library/user-event@14.6.7
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/FileTree.test.jsx`
Expected: FAIL — cannot resolve `./FileTree.jsx`.

- [ ] **Step 3: Write the component**

`web/src/components/FileTree.jsx`:

```jsx
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

function FileRow({ node, depth, selectedPath, onSelect }) {
  const selected = node.path === selectedPath
  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      aria-current={selected ? 'true' : undefined}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
      className={`flex w-full items-center gap-2 py-0.5 pr-2 text-left text-sm ${
        selected ? 'bg-white/10' : 'hover:bg-white/5'
      }`}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: DOT_COLOR[node.file.status] ?? 'var(--color-border)' }}
      />
      <span className="truncate">{node.name}</span>
      <Counts added={node.file.added} removed={node.file.removed} />
    </button>
  )
}

function DirRow({ node, depth, selectedPath, onSelect }) {
  const [open, setOpen] = useState(true)
  const Chevron = open ? ChevronDown : ChevronRight

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className="flex w-full items-center gap-1 py-0.5 pr-2 text-left text-sm opacity-80 hover:bg-white/5"
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

export default function FileTree({ files, selectedPath, onSelect }) {
  const tree = buildTree(files)
  const added = files.reduce((sum, f) => sum + f.added, 0)
  const removed = files.reduce((sum, f) => sum + f.removed, 0)

  if (files.length === 0) {
    return <div className="p-4 text-sm opacity-60">No changes</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto py-1">
        {tree.map((node) => (
          <Row
            key={node.path}
            node={node}
            depth={0}
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
```

The `text-added`, `text-deleted` and `border-border` utilities exist because the `@theme` block in Task 1 declares `--color-added`, `--color-deleted` and `--color-border`; Tailwind 4 generates the utilities from those names.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/components/FileTree.test.jsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/FileTree.jsx web/src/components/FileTree.test.jsx package.json package-lock.json
git commit -m "feat: render the changed-file tree pane

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 14: The file content pane

**Files:**
- Create: `web/src/rows.js`, `web/src/components/FileView.jsx`
- Test: `web/src/rows.test.js`, `web/src/components/FileView.test.jsx`

**Interfaces:**
- Consumes: `FileView` from `api.file()`
- Produces:
  - `buildRows(lines, deletions) -> Row[]` from `web/src/rows.js` where a `Row` is either `{kind: 'line', n, text, state}` or `{kind: 'deletion', after, count}`
  - `<FileView view lineHeight />` from `web/src/components/FileView.jsx`

A deletion whose `after` is `0` sorts before the first line. Deletion rows render as a single thin row reading `N lines deleted`, tinted with `--color-deleted`.

The list is virtualised with `@tanstack/react-virtual` because a monorepo file can run to thousands of lines.

- [ ] **Step 1: Write the failing row-builder test**

`web/src/rows.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { buildRows } from './rows.js'

const line = (n, state = 'unchanged') => ({ n, text: `l${n}`, state })

describe('buildRows', () => {
  it('returns lines unchanged when there are no deletions', () => {
    expect(buildRows([line(1), line(2)], [])).toEqual([
      { kind: 'line', n: 1, text: 'l1', state: 'unchanged' },
      { kind: 'line', n: 2, text: 'l2', state: 'unchanged' }
    ])
  })

  it('inserts a deletion row after the line it follows', () => {
    const rows = buildRows([line(1), line(2)], [{ after: 1, count: 3 }])
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion', 'line'])
    expect(rows[1]).toEqual({ kind: 'deletion', after: 1, count: 3 })
  })

  it('places a deletion after line zero at the very top', () => {
    const rows = buildRows([line(1)], [{ after: 0, count: 2 }])
    expect(rows.map((r) => r.kind)).toEqual(['deletion', 'line'])
  })

  it('places a deletion past the last line at the end', () => {
    const rows = buildRows([line(1)], [{ after: 9, count: 1 }])
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion'])
  })

  it('handles several deletions', () => {
    const rows = buildRows(
      [line(1), line(2), line(3)],
      [{ after: 1, count: 1 }, { after: 3, count: 2 }]
    )
    expect(rows.map((r) => r.kind)).toEqual(['line', 'deletion', 'line', 'line', 'deletion'])
  })

  it('handles an empty file with a deletion', () => {
    expect(buildRows([], [{ after: 0, count: 4 }])).toEqual([
      { kind: 'deletion', after: 0, count: 4 }
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/rows.test.js`
Expected: FAIL — cannot resolve `./rows.js`.

- [ ] **Step 3: Write the row builder**

`web/src/rows.js`:

```js
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
```

- [ ] **Step 4: Run the row test, then write the component test**

Run: `npx vitest run web/src/rows.test.js`
Expected: PASS — 6 tests.

`web/src/components/FileView.test.jsx`:

```jsx
import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileView from './FileView.jsx'

// jsdom reports every element as zero-sized, which makes the virtualiser
// render nothing. Give it a viewport so rows are produced.
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0 }
  }
})

const view = (overrides = {}) => ({
  path: 'src/a.js',
  oldPath: null,
  status: 'M',
  binary: false,
  tooLarge: false,
  lines: [
    { n: 1, text: 'const a = 1', state: 'unchanged' },
    { n: 2, text: 'const b = 2', state: 'added' }
  ],
  deletions: [],
  ...overrides
})

describe('FileView', () => {
  it('shows a prompt when nothing is selected', () => {
    render(<FileView view={null} lineHeight={20} />)
    expect(screen.getByText('Select a file')).toBeInTheDocument()
  })

  it('renders the file path in the header', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('src/a.js')).toBeInTheDocument()
  })

  it('renders line numbers and text', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('const a = 1')).toBeInTheDocument()
    expect(screen.getByText('const b = 2')).toBeInTheDocument()
  })

  it('tags each line with its change state', () => {
    render(<FileView view={view()} lineHeight={20} />)
    expect(screen.getByText('const a = 1').closest('[data-state]'))
      .toHaveAttribute('data-state', 'unchanged')
    expect(screen.getByText('const b = 2').closest('[data-state]'))
      .toHaveAttribute('data-state', 'added')
  })

  it('renders a deletion marker', () => {
    render(<FileView view={view({ deletions: [{ after: 1, count: 3 }] })} lineHeight={20} />)
    expect(screen.getByText('3 lines deleted')).toBeInTheDocument()
  })

  it('renders a singular deletion marker', () => {
    render(<FileView view={view({ deletions: [{ after: 1, count: 1 }] })} lineHeight={20} />)
    expect(screen.getByText('1 line deleted')).toBeInTheDocument()
  })

  it('shows a stub for a binary file', () => {
    render(<FileView view={view({ binary: true, lines: [] })} lineHeight={20} />)
    expect(screen.getByText('Binary file')).toBeInTheDocument()
  })

  it('shows a stub for an oversized file', () => {
    render(<FileView view={view({ tooLarge: true, lines: [] })} lineHeight={20} />)
    expect(screen.getByText('File too large to display')).toBeInTheDocument()
  })

  it('shows the old path for a rename', () => {
    render(<FileView view={view({ status: 'R', oldPath: 'src/old.js' })} lineHeight={20} />)
    expect(screen.getByText('renamed from src/old.js')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the component test to verify it fails**

Run: `npx vitest run web/src/components/FileView.test.jsx`
Expected: FAIL — cannot resolve `./FileView.jsx`.

- [ ] **Step 6: Write the component**

`web/src/components/FileView.jsx`:

```jsx
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
```

`color-mix` keeps the tint translucent so the configured colour reads as a background wash rather than a solid block, while the token itself stays exactly what the user wrote in `config.json`.

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run web/src/components/FileView.test.jsx`
Expected: PASS — 9 tests.

- [ ] **Step 8: Commit**

```bash
git add web/src/rows.js web/src/rows.test.js web/src/components/FileView.jsx web/src/components/FileView.test.jsx
git commit -m "feat: render full file content with per-line change tints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 15: The header

**Files:**
- Create: `web/src/components/Header.jsx`
- Test: `web/src/components/Header.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond prop shapes
- Produces: `<Header project range theme onRangeChange onRefresh onSwitchProject onToggleTheme />`
  - `project` is `{root, name, branch, label}` or `null`
  - `range` is the range object from Task 3
  - `onRangeChange(range)` receives a new range object

The range control is a `<select>` with the four modes. Choosing `last N commits` reveals a number input; choosing `vs ref` reveals a text input. Both commit their value on `change`.

- [ ] **Step 1: Write the failing test**

`web/src/components/Header.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Header from './Header.jsx'

const project = { root: '/repos/jetlog', name: 'jetlog', branch: 'main', label: 'vs origin/main' }

const setup = (overrides = {}) => {
  const props = {
    project,
    range: { mode: 'auto' },
    theme: 'dark',
    onRangeChange: vi.fn(),
    onRefresh: vi.fn(),
    onSwitchProject: vi.fn(),
    onToggleTheme: vi.fn(),
    ...overrides
  }
  render(<Header {...props} />)
  return props
}

describe('Header', () => {
  it('shows the project name, branch and base label', () => {
    setup()
    expect(screen.getByText('jetlog')).toBeInTheDocument()
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('vs origin/main')).toBeInTheDocument()
  })

  it('shows a placeholder with no project', () => {
    setup({ project: null })
    expect(screen.getByText('No project')).toBeInTheDocument()
  })

  it('refreshes when the refresh button is pressed', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Refresh'))
    expect(props.onRefresh).toHaveBeenCalled()
  })

  it('switches project when the switch button is pressed', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Switch project'))
    expect(props.onSwitchProject).toHaveBeenCalled()
  })

  it('toggles the theme', async () => {
    const props = setup()
    await userEvent.click(screen.getByLabelText('Switch to light theme'))
    expect(props.onToggleTheme).toHaveBeenCalled()
  })

  it('labels the toggle for the other direction in light mode', () => {
    setup({ theme: 'light' })
    expect(screen.getByLabelText('Switch to dark theme')).toBeInTheDocument()
  })

  it('emits a worktree range', async () => {
    const props = setup()
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'worktree')
    expect(props.onRangeChange).toHaveBeenCalledWith({ mode: 'worktree' })
  })

  it('emits a commit-count range from the revealed input', async () => {
    const props = setup({ range: { mode: 'commits', n: 3 } })
    const input = screen.getByLabelText('Number of commits')
    await userEvent.clear(input)
    await userEvent.type(input, '5')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'commits', n: 5 })
  })

  it('emits a ref range from the revealed input', async () => {
    const props = setup({ range: { mode: 'ref', ref: '' } })
    await userEvent.type(screen.getByLabelText('Base ref'), 'develop')
    expect(props.onRangeChange).toHaveBeenLastCalledWith({ mode: 'ref', ref: 'develop' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/Header.test.jsx`
Expected: FAIL — cannot resolve `./Header.jsx`.

- [ ] **Step 3: Write the component**

`web/src/components/Header.jsx`:

```jsx
import { GitBranch, FolderOpen, RefreshCw, Sun, Moon } from 'lucide-react'

const MODES = [
  ['auto', 'auto'],
  ['worktree', 'working tree'],
  ['commits', 'last N commits'],
  ['ref', 'vs ref']
]

function IconButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded p-1.5 opacity-80 hover:bg-white/10 hover:opacity-100"
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
        className="ml-4 rounded border border-border bg-transparent px-2 py-1 text-xs"
      >
        {MODES.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {range.mode === 'commits' && (
        <input
          aria-label="Number of commits"
          type="number"
          min="1"
          value={range.n ?? 1}
          onChange={(event) =>
            onRangeChange({ mode: 'commits', n: Number(event.target.value) || 1 })
          }
          className="w-16 rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
      )}

      {range.mode === 'ref' && (
        <input
          aria-label="Base ref"
          type="text"
          value={range.ref ?? ''}
          onChange={(event) => onRangeChange({ mode: 'ref', ref: event.target.value })}
          className="w-40 rounded border border-border bg-transparent px-2 py-1 text-xs"
        />
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run web/src/components/Header.test.jsx`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/Header.jsx web/src/components/Header.test.jsx
git commit -m "feat: add the header with range, refresh and theme controls

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 16: The project picker

**Files:**
- Create: `web/src/components/ProjectPicker.jsx`
- Test: `web/src/components/ProjectPicker.test.jsx`

**Interfaces:**
- Consumes: `api.fsList`, `api.state` from `web/src/api.js`
- Produces: `<ProjectPicker open recents onOpen onClose />`
  - `onOpen(path)` fires with a chosen repository path
  - the component fetches its own directory listings through `api.fsList`

Recents sit at the top as one-click buttons. Below them a listing of the current directory: every entry navigates on click, and entries with `isGitRepo` also show an **Open** button. A breadcrumb-free "Up" control uses the `parent` from the listing. A path input at the bottom opens whatever is typed.

- [ ] **Step 1: Write the failing test**

`web/src/components/ProjectPicker.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjectPicker from './ProjectPicker.jsx'
import { api } from '../api.js'

vi.mock('../api.js', () => ({
  api: { fsList: vi.fn() }
}))

const listing = {
  path: '/home/me/ai_code',
  parent: '/home/me',
  entries: [
    { name: 'jetlog', path: '/home/me/ai_code/jetlog', isGitRepo: true },
    { name: 'notes', path: '/home/me/ai_code/notes', isGitRepo: false }
  ]
}

beforeEach(() => {
  api.fsList.mockReset()
  api.fsList.mockResolvedValue(listing)
})

describe('ProjectPicker', () => {
  it('renders nothing when closed', () => {
    render(<ProjectPicker open={false} recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Select project')).not.toBeInTheDocument()
  })

  it('lists recents as one-click buttons', async () => {
    const onOpen = vi.fn()
    render(
      <ProjectPicker
        open
        recents={['/home/me/ai_code/jetlog']}
        onOpen={onOpen}
        onClose={() => {}}
      />
    )
    await userEvent.click(await screen.findByText('/home/me/ai_code/jetlog'))
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code/jetlog')
  })

  it('lists directories from the api', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(await screen.findByText('jetlog')).toBeInTheDocument()
    expect(screen.getByText('notes')).toBeInTheDocument()
  })

  it('navigates into a directory on click', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await userEvent.click(await screen.findByText('notes'))
    await waitFor(() =>
      expect(api.fsList).toHaveBeenLastCalledWith('/home/me/ai_code/notes')
    )
  })

  it('opens a git repository from its Open button', async () => {
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.click(await screen.findByLabelText('Open jetlog'))
    expect(onOpen).toHaveBeenCalledWith('/home/me/ai_code/jetlog')
  })

  it('offers Open only for git repositories', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await screen.findByLabelText('Open jetlog')
    expect(screen.queryByLabelText('Open notes')).not.toBeInTheDocument()
  })

  it('navigates up to the parent', async () => {
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    await userEvent.click(await screen.findByLabelText('Go up'))
    await waitFor(() => expect(api.fsList).toHaveBeenLastCalledWith('/home/me'))
  })

  it('opens a typed path', async () => {
    const onOpen = vi.fn()
    render(<ProjectPicker open recents={[]} onOpen={onOpen} onClose={() => {}} />)
    await userEvent.type(await screen.findByLabelText('Project path'), '/somewhere/else{Enter}')
    expect(onOpen).toHaveBeenCalledWith('/somewhere/else')
  })

  it('surfaces an error from the api', async () => {
    api.fsList.mockRejectedValue(new Error('Path is outside the home directory'))
    render(<ProjectPicker open recents={[]} onOpen={() => {}} onClose={() => {}} />)
    expect(await screen.findByText('Path is outside the home directory')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/components/ProjectPicker.test.jsx`
Expected: FAIL — cannot resolve `./ProjectPicker.jsx`.

- [ ] **Step 3: Write the component**

`web/src/components/ProjectPicker.jsx`:

```jsx
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
            className="ml-auto rounded p-1 hover:bg-white/10"
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
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left font-mono text-xs hover:bg-white/10"
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
            className="rounded p-1 hover:bg-white/10 disabled:opacity-30"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <span className="truncate font-mono text-xs opacity-70">{listing?.path ?? ''}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {error && <div className="px-2 py-1 text-sm text-deleted">{error}</div>}
          {listing?.entries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-2 rounded px-2 hover:bg-white/5">
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
                  className="rounded border border-border px-2 py-0.5 text-[11px] hover:bg-white/10"
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
```

The initial listing requests `'~'`; add this expansion to `listDirectory` in `server/browse.js`, as the first statement of the function body:

```js
  if (requestedPath === '~') requestedPath = home
```

Add a matching server test to `server/browse.test.js`:

```js
  it('expands a tilde to the home directory', async () => {
    const listing = await listDirectory('~', { home })
    expect(listing.path).toBe(home)
  })
```

- [ ] **Step 4: Run both test files to verify they pass**

Run: `npx vitest run web/src/components/ProjectPicker.test.jsx server/browse.test.js`
Expected: PASS — 9 web tests and 8 server tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ProjectPicker.jsx web/src/components/ProjectPicker.test.jsx server/browse.js server/browse.test.js
git commit -m "feat: add the project picker with recents and a folder browser

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 17: Wiring the application together

**Files:**
- Create: `web/src/useKeyboard.js`
- Modify: `web/src/App.jsx` (replace the Task 1 placeholder entirely)
- Test: `web/src/useKeyboard.test.jsx`, `web/src/App.test.jsx` (replace the Task 1 test entirely)

**Interfaces:**
- Consumes: `api` (`api.js`), `applyTheme`/`resolveTheme` (`theme.js`), `Header`, `FileTree`, `FileView`, `ProjectPicker`
- Produces: `useKeyboard(handlers)` from `web/src/useKeyboard.js`, where `handlers` is `{j, k, n, p, r}` mapping single keys to callbacks. The hook ignores events whose target is an `input`, `textarea` or `select`, and events carrying a modifier key.

**App behaviour:**

1. On mount, fetch `api.config()`, `api.state()` and `api.initial()` in parallel; apply the resolved theme; if `initial().path` is set, open it, otherwise open the picker.
2. Opening a project calls `api.rememberProject(path)`, then `api.project` and `api.changes`.
3. Selecting a file calls `api.file`; the first file is selected automatically when a change list arrives and nothing is selected.
4. Changing the range refetches `project` and `changes` and clears the selection.
5. `j`/`k` move through the flattened change list; `n`/`p` scroll to the next/previous line whose `data-state` is `added`; `r` refetches.
6. Toggling the theme applies it and persists it via `api.saveState({theme})`.

- [ ] **Step 1: Write the failing keyboard test**

`web/src/useKeyboard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useKeyboard } from './useKeyboard.js'

function Harness({ handlers }) {
  useKeyboard(handlers)
  return <input aria-label="field" />
}

describe('useKeyboard', () => {
  it('calls the handler for a bare key', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('r')
    expect(r).toHaveBeenCalled()
  })

  it('ignores keys with no handler', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('q')
    expect(r).not.toHaveBeenCalled()
  })

  it('ignores keys typed into an input', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.type(screen.getByLabelText('field'), 'r')
    expect(r).not.toHaveBeenCalled()
  })

  it('ignores modified keys', async () => {
    const r = vi.fn()
    render(<Harness handlers={{ r }} />)
    await userEvent.keyboard('{Meta>}r{/Meta}')
    expect(r).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run web/src/useKeyboard.test.jsx`
Expected: FAIL — cannot resolve `./useKeyboard.js`.

- [ ] **Step 3: Write the hook**

`web/src/useKeyboard.js`:

```js
import { useEffect, useRef } from 'react'

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

export function useKeyboard(handlers) {
  const latest = useRef(handlers)
  latest.current = handlers

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (FORM_TAGS.has(event.target?.tagName)) return

      const handler = latest.current[event.key]
      if (!handler) return

      event.preventDefault()
      handler()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
```

- [ ] **Step 4: Run the hook test, then replace the App test**

Run: `npx vitest run web/src/useKeyboard.test.jsx`
Expected: PASS — 4 tests.

Replace the whole of `web/src/App.test.jsx` with:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App.jsx'
import { api } from './api.js'

vi.mock('./api.js', () => ({
  api: {
    initial: vi.fn(),
    project: vi.fn(),
    changes: vi.fn(),
    file: vi.fn(),
    fsList: vi.fn(),
    config: vi.fn(),
    state: vi.fn(),
    saveState: vi.fn(),
    rememberProject: vi.fn()
  },
  rangeToParam: (range) => range.mode
}))

const CONFIG = {
  defaultTheme: 'dark',
  maxFileBytes: 2097152,
  lineHeight: 20,
  themes: {
    dark: {
      surface: '#1e1f29',
      text: '#f8f8f2',
      border: '#44475a',
      added: '#d98a30',
      unchanged: '#2f6b4a',
      deleted: '#8a3030'
    },
    light: {
      surface: '#ffffff',
      text: '#1e1f29',
      border: '#d0d2e0',
      added: '#b35c00',
      unchanged: '#1c6b3f',
      deleted: '#a11a1a'
    }
  }
}

const PROJECT = { root: '/repos/jetlog', name: 'jetlog', branch: 'main', base: 'abc', label: 'vs origin/main' }

const CHANGES = {
  root: '/repos/jetlog',
  base: 'abc',
  label: 'vs origin/main',
  files: [
    { path: 'src/a.js', oldPath: null, status: 'M', added: 2, removed: 1, binary: false },
    { path: 'src/b.js', oldPath: null, status: 'A', added: 5, removed: 0, binary: false }
  ]
}

const FILE = {
  path: 'src/a.js',
  oldPath: null,
  status: 'M',
  binary: false,
  tooLarge: false,
  lines: [{ n: 1, text: 'const a = 1', state: 'added' }],
  deletions: []
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset?.()
  api.config.mockResolvedValue(CONFIG)
  api.state.mockResolvedValue({ lastProject: null, recents: [], paneWidth: 280, theme: null })
  api.initial.mockResolvedValue({ path: '/repos/jetlog' })
  api.project.mockResolvedValue(PROJECT)
  api.changes.mockResolvedValue(CHANGES)
  api.file.mockResolvedValue(FILE)
  api.rememberProject.mockResolvedValue({ lastProject: '/repos/jetlog', recents: ['/repos/jetlog'] })
  api.saveState.mockResolvedValue({})
  api.fsList.mockResolvedValue({ path: '/home/me', parent: null, entries: [] })
})

describe('App', () => {
  it('opens the initial project and lists its changes', async () => {
    render(<App />)
    expect(await screen.findByText('jetlog')).toBeInTheDocument()
    expect(await screen.findByText('a.js')).toBeInTheDocument()
    expect(screen.getByText('b.js')).toBeInTheDocument()
  })

  it('remembers the opened project', async () => {
    render(<App />)
    await waitFor(() => expect(api.rememberProject).toHaveBeenCalledWith('/repos/jetlog'))
  })

  it('selects the first file automatically', async () => {
    render(<App />)
    await waitFor(() =>
      expect(api.file).toHaveBeenCalledWith('/repos/jetlog', 'src/a.js', { mode: 'auto' })
    )
  })

  it('loads a file when its row is clicked', async () => {
    render(<App />)
    await userEvent.click(await screen.findByText('b.js'))
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )
  })

  it('refetches when the range changes', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await userEvent.selectOptions(screen.getByLabelText('Change range'), 'worktree')
    await waitFor(() =>
      expect(api.changes).toHaveBeenLastCalledWith('/repos/jetlog', { mode: 'worktree' })
    )
  })

  it('refetches when r is pressed', async () => {
    render(<App />)
    await screen.findByText('a.js')
    const before = api.changes.mock.calls.length
    await userEvent.keyboard('r')
    await waitFor(() => expect(api.changes.mock.calls.length).toBeGreaterThan(before))
  })

  it('moves to the next file when j is pressed', async () => {
    render(<App />)
    await screen.findByText('a.js')
    await userEvent.keyboard('j')
    await waitFor(() =>
      expect(api.file).toHaveBeenLastCalledWith('/repos/jetlog', 'src/b.js', { mode: 'auto' })
    )
  })

  it('persists a theme toggle', async () => {
    render(<App />)
    await screen.findByText('jetlog')
    await userEvent.click(screen.getByLabelText('Switch to light theme'))
    await waitFor(() => expect(api.saveState).toHaveBeenCalledWith({ theme: 'light' }))
  })

  it('opens the picker when there is no initial project', async () => {
    api.initial.mockResolvedValue({ path: null })
    render(<App />)
    expect(await screen.findByText('Select project')).toBeInTheDocument()
  })

  it('shows an error when loading the project fails', async () => {
    api.project.mockRejectedValue(new Error('Not a git repository: /repos/jetlog'))
    render(<App />)
    expect(await screen.findByText('Not a git repository: /repos/jetlog')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the App test to verify it fails**

Run: `npx vitest run web/src/App.test.jsx`
Expected: FAIL — the placeholder App renders only its name.

- [ ] **Step 6: Write the application**

`web/src/App.jsx`:

```jsx
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
        applyTheme(loadedConfig.themes[active])

        if (initial.path) setRoot(initial.path)
        else setPickerOpen(true)
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
    if (config) applyTheme(config.themes[next])
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
```

The pane width comes from `state.json` and is applied on load. No drag handle ships in v1 — the value is there so it can be set by hand and so a resizer can be added later without a state migration.

`jumpChange` reads the rendered DOM rather than the row model because the virtualiser only mounts visible rows; scrolling to the first mounted change and letting the user press again is the behaviour that matches what is on screen.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — every server and web test green.

- [ ] **Step 8: Commit**

```bash
git add web/src/App.jsx web/src/App.test.jsx web/src/useKeyboard.js web/src/useKeyboard.test.jsx
git commit -m "feat: wire the panes, keyboard and theme into the application

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

### Task 18: Install as a CLI

**Files:**
- Create: `bin/code-inspector`, `install.sh`, `README.md`
- Test: manual verification, described below

**Interfaces:**
- Consumes: `server/start.js`
- Produces: a `code-inspector` command on `PATH` that works from any directory.

The launcher must resolve its own location through symlinks, because `install.sh` symlinks it into `/usr/local/bin` rather than copying it.

- [ ] **Step 1: Write the launcher**

`bin/code-inspector`:

```sh
#!/bin/sh
set -e

target="$0"
while [ -L "$target" ]; do
  link=$(readlink "$target")
  case "$link" in
    /*) target="$link" ;;
    *) target="$(dirname "$target")/$link" ;;
  esac
done

app_dir="$(cd "$(dirname "$target")/.." && pwd)"

if [ ! -d "$app_dir/web/dist" ]; then
  echo "code-inspector: no build found, running npm run build" >&2
  (cd "$app_dir" && npm run build >/dev/null)
fi

exec node "$app_dir/server/start.js" "$@"
```

Make it executable:

```bash
chmod +x bin/code-inspector
```

- [ ] **Step 2: Write the installer**

`install.sh`:

```sh
#!/bin/sh
set -e

app_dir="$(cd "$(dirname "$0")" && pwd)"
bin_dir="/usr/local/bin"
link="$bin_dir/code-inspector"

cd "$app_dir"
npm install
npm run build

if [ ! -d "$bin_dir" ]; then
  echo "Creating $bin_dir (requires sudo)"
  sudo mkdir -p "$bin_dir"
fi

if [ -w "$bin_dir" ]; then
  ln -sf "$app_dir/bin/code-inspector" "$link"
else
  echo "Linking into $bin_dir (requires sudo)"
  sudo ln -sf "$app_dir/bin/code-inspector" "$link"
fi

echo "Installed: $link -> $app_dir/bin/code-inspector"
echo "Run 'code-inspector' from inside any git repository."
```

```bash
chmod +x install.sh
```

- [ ] **Step 3: Build and install**

Run:

```bash
npm run build
./install.sh
```

Expected: the build writes `web/dist`, and the final line reports the symlink.

- [ ] **Step 4: Verify it runs from another repository**

Run:

```bash
cd ~/ai_code/code-inspector && code-inspector --no-open
```

Expected: the process prints a `http://127.0.0.1:<port>` line, a tailnet line if Tailscale is running, and `project ~/ai_code/code-inspector`. Open the printed URL and confirm the tree lists the files changed on this branch and that clicking one shows its content with changed lines tinted. Then stop it with Ctrl-C.

- [ ] **Step 5: Verify the config round trip**

Run:

```bash
sed -i '' 's/"added": "#d98a30"/"added": "#ff00ff"/' ~/.config/code-inspector/config.json
```

Reload the browser tab. Expected: changed lines are now magenta. Restore the original value afterwards.

- [ ] **Step 6: Write the README**

`README.md`:

```markdown
# code-inspector

A local web UI for reviewing everything changed on the current branch of a git
repository. File tree on the left, full file content on the right with changed
lines tinted.

## Install

    ./install.sh

Links `code-inspector` into `/usr/local/bin`.

## Use

    cd ~/any/git/repo
    code-inspector

The launch directory wins; outside a repository it reopens the last project, or
offers a picker.

### Range

The header dropdown selects what "changed" means:

| Option | Base |
|---|---|
| auto | merge base with the upstream branch, else the root commit |
| working tree | HEAD |
| last N commits | HEAD~N |
| vs ref | any ref you type |

### Keys

| Key | Action |
|---|---|
| j / k | next / previous file |
| n / p | next / previous change in the file |
| r | refresh |

## Configuration

`~/.config/code-inspector/config.json` holds the colour tokens for both themes,
the default theme, the maximum file size and the line height. Edit it and reload
the page; no rebuild is needed.

`~/.config/code-inspector/state.json` is written by the app and holds the last
project, the recent list and the theme choice.

## Development

    npm run dev     # vite on 5173, api on 5174
    npm test
```

- [ ] **Step 7: Commit**

```bash
git add bin/code-inspector install.sh README.md
git commit -m "feat: install code-inspector as a global CLI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01DjeyT6uVBUtew4b5BZK24t"
```

---

## Verification

After Task 18, confirm the whole thing:

- [ ] `npm test` — every suite green
- [ ] `npm run build` — succeeds with no warnings about missing modules
- [ ] `code-inspector --no-open` from a repository with uncommitted changes lists both committed and uncommitted files
- [ ] `code-inspector --no-open` from a directory that is not a repository opens the picker
- [ ] The theme toggle flips the page and survives a reload
- [ ] Editing a colour in `config.json` and reloading changes the tint
