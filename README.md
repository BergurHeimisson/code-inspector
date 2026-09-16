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
