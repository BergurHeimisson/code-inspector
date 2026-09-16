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
