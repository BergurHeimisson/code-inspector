#!/bin/sh
# install.sh — build and install code-inspector
#
# Symlinks the launcher onto your PATH. By default that is ~/.local/bin, which
# needs no password; --system links into /usr/local/bin instead and needs sudo.
# Keeping the default per-user avoids ending up with two entries where the one
# earlier in PATH wins and every later install looks like it did nothing.
#
#   ./install.sh           per-user, ~/.local/bin/code-inspector
#   ./install.sh --system  system-wide, /usr/local/bin/code-inspector
#
# Requires: Node 20+

set -e

BIN_NAME="code-inspector"
app_dir="$(cd "$(dirname "$0")" && pwd)"
system_install=0

usage() {
    awk 'NR > 1 { if (!/^#/) exit; sub(/^# ?/, ""); print }' "$0"
}

for arg in "$@"; do
    case "$arg" in
        --system) system_install=1 ;;
        --user) system_install=0 ;;
        -h|--help) usage; exit 0 ;;
        *)
            echo "install.sh: unknown option: $arg" >&2
            echo "Try: ./install.sh --help" >&2
            exit 1
            ;;
    esac
done

if ! command -v node > /dev/null 2>&1; then
    echo "install.sh: Node is not installed or not on PATH." >&2
    echo "  macOS:  brew install node" >&2
    echo "  Linux:  https://nodejs.org/" >&2
    exit 1
fi

if [ "$system_install" -eq 1 ]; then
    bin_dir="/usr/local/bin"
else
    bin_dir="$HOME/.local/bin"
fi
link="$bin_dir/$BIN_NAME"

cd "$app_dir"
echo "==> Building..."
npm install --silent
npm run build

echo "==> Linking into $bin_dir..."
if [ "$system_install" -eq 1 ]; then
    # sudo cannot prompt without a terminal — say so rather than failing with
    # its own opaque "a password is required".
    if ! sudo -v -p "Root Password: "; then
        echo "" >&2
        echo "install.sh: could not get root. Either run this from a terminal," >&2
        echo "or install without sudo:  ./install.sh" >&2
        exit 1
    fi
    sudo mkdir -p "$bin_dir"
    sudo ln -sf "$app_dir/bin/$BIN_NAME" "$link"
else
    mkdir -p "$bin_dir"
    ln -sf "$app_dir/bin/$BIN_NAME" "$link"
fi

# A copy in the other location shadows this one if it comes earlier in PATH,
# which makes a successful install look like it did nothing.
if [ "$system_install" -eq 1 ]; then
    other="$HOME/.local/bin/$BIN_NAME"
else
    other="/usr/local/bin/$BIN_NAME"
fi
if [ -e "$other" ]; then
    echo ""
    echo "Note: another $BIN_NAME exists at $other."
    echo "  Whichever directory comes first in PATH wins. Remove the stale one:"
    echo "    rm -f $other"
fi

case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
        echo ""
        echo "Note: $bin_dir is not on your PATH. Add it to your shell profile:"
        echo "  export PATH=\"$bin_dir:\$PATH\""
        ;;
esac

echo ""
echo "Done. Run '$BIN_NAME' from inside any git repository."
echo "Uninstall: rm -f $link"
