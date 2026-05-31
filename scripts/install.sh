#!/usr/bin/env bash
set -euo pipefail

repo="${SHRIMPY_REPO:-zachmeador/shrimpy}"
ref="${SHRIMPY_REF:-main}"
install_dir="${SHRIMPY_INSTALL_DIR:-$HOME/.local/share/shrimpy/app}"
bin_dir="${SHRIMPY_BIN_DIR:-$HOME/.local/bin}"

usage() {
  cat <<'USAGE'
Install Shrimpy from GitHub.

Environment:
  SHRIMPY_REPO         GitHub owner/repo to install from (default: zachmeador/shrimpy)
  SHRIMPY_REF          Branch, tag, or commit to install (default: main)
  SHRIMPY_INSTALL_DIR  App install directory (default: ~/.local/share/shrimpy/app)
  SHRIMPY_BIN_DIR      Directory for command symlinks (default: ~/.local/bin)

Example:
  curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.2.0 bash
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

case "$(uname -s)" in
  Linux|Darwin) ;;
  *)
    echo "error: this installer supports Linux and macOS only" >&2
    exit 1
    ;;
esac

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing required command: $1" >&2
    exit 1
  }
}

need bash
need curl
need tar
need node
need npm

node -e '
const min = [22, 19, 0];
const cur = process.versions.node.split(".").map(Number);
for (let i = 0; i < min.length; i += 1) {
  if (cur[i] > min[i]) process.exit(0);
  if (cur[i] < min[i]) process.exit(1);
}
' || {
  echo "error: Shrimpy requires Node >= 22.19.0" >&2
  echo "found: $(node --version)" >&2
  exit 1
}

case "$install_dir" in
  ""|"/"|"$HOME"|"$HOME/.local"|"$HOME/.local/share")
    echo "error: refusing unsafe install directory: $install_dir" >&2
    exit 1
    ;;
esac

install_parent="$(dirname "$install_dir")"
mkdir -p "$install_parent"

tmp="$(mktemp -d "${TMPDIR:-/tmp}/shrimpy-install.XXXXXXXXXX")"
stage="$(mktemp -d "$install_parent/.shrimpy-stage.XXXXXXXXXX")"
trap 'rm -rf "$tmp" "$stage"' EXIT

echo "Downloading Shrimpy from github.com/$repo@$ref"
curl -fsSL "https://github.com/$repo/archive/$ref.tar.gz" |
  tar -xz --strip-components=1 -C "$tmp"

echo "Installing dependencies"
cd "$tmp"
npm ci

echo "Building Shrimpy"
npm run build

echo "Pruning development dependencies"
npm prune --omit=dev

echo "Installing app to $install_dir"
cp -R "$tmp"/. "$stage"
rm -rf "$install_dir"
mv "$stage" "$install_dir"

echo "Linking commands in $bin_dir"
mkdir -p "$bin_dir"
ln -sfn "$install_dir/dist/cli.js" "$bin_dir/shrimpy"
ln -sfn "$install_dir/dist/gateway.js" "$bin_dir/shrimpy-gateway"
ln -sfn "$install_dir/dist/web/server.js" "$bin_dir/shrimpy-web"

echo
echo "Shrimpy installed."
if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
  echo "Add $bin_dir to PATH before running shrimpy."
fi
echo
echo "Next:"
echo "  shrimpy setup init"
echo "  shrimpy status"
