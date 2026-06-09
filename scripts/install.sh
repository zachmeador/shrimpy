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
  SHRIMPY_REPO         GitHub owner/repo or git clone URL to install from (default: zachmeador/shrimpy)
  SHRIMPY_REF          Branch, tag, or commit to install (default: main)
  SHRIMPY_INSTALL_DIR  App install directory (default: ~/.local/share/shrimpy/app)
  SHRIMPY_BIN_DIR      Directory for command symlinks (default: ~/.local/bin)
  SHRIMPY_FORCE        Set to 1 to replace a git-backed install with local changes
  SHRIMPY_NO_AUTO_COMPLETION
                       Set to 1 to skip automatic zsh completion install

Example:
  curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | env SHRIMPY_REF=v0.3.0 bash
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
need git
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

stage="$(mktemp -d "$install_parent/.shrimpy-stage.XXXXXXXXXX")"
trap 'rm -rf "$stage"' EXIT

clone_url="$repo"
case "$repo" in
  http://*|https://*|ssh://*|git://*|file://*|git@*) ;;
  *) clone_url="https://github.com/$repo.git" ;;
esac

has_git_changes() {
  local dir="$1"
  if ! git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: install directory has a .git directory but is not a readable git worktree: $dir" >&2
    exit 1
  fi
  if ! git -C "$dir" diff --quiet --ignore-submodules --; then
    return 0
  fi
  if ! git -C "$dir" diff --cached --quiet --ignore-submodules --; then
    return 0
  fi
  [[ -n "$(git -C "$dir" ls-files --others --exclude-standard)" ]]
}

checkout_ref() {
  local ref="$1"
  local target=""
  if git rev-parse --verify --quiet "origin/$ref^{commit}" >/dev/null; then
    git checkout -B "$ref" "origin/$ref"
    git branch --set-upstream-to="origin/$ref" "$ref" >/dev/null
    return
  elif git rev-parse --verify --quiet "refs/tags/$ref^{commit}" >/dev/null; then
    target="refs/tags/$ref"
  elif git rev-parse --verify --quiet "$ref^{commit}" >/dev/null; then
    target="$ref"
  else
    echo "error: unable to resolve Shrimpy ref: $ref" >&2
    exit 1
  fi
  git checkout --detach "$target"
}

if [[ -d "$install_dir/.git" && "${SHRIMPY_FORCE:-}" != "1" ]] && has_git_changes "$install_dir"; then
  echo "error: install directory has local git changes: $install_dir" >&2
  echo "Commit or move those changes, or set SHRIMPY_FORCE=1 to replace the install-managed checkout." >&2
  exit 1
fi

echo "Cloning Shrimpy from $clone_url"
git clone "$clone_url" "$stage"

cd "$stage"
echo "Fetching refs"
git fetch --tags origin "+refs/heads/*:refs/remotes/origin/*"

echo "Checking out $ref"
checkout_ref "$ref"
echo "Checked out $(git rev-parse --short HEAD)"

echo "Installing dependencies"
npm ci

echo "Building Shrimpy"
npm run build

echo "Pruning development dependencies"
npm prune --omit=dev

echo "Installing app to $install_dir"
rm -rf "$install_dir"
mv "$stage" "$install_dir"

echo "Linking commands in $bin_dir"
mkdir -p "$bin_dir"
ln -sfn "$install_dir/dist/cli.js" "$bin_dir/shrimpy"
ln -sfn "$install_dir/dist/gateway.js" "$bin_dir/shrimpy-gateway"
ln -sfn "$install_dir/dist/web/server.js" "$bin_dir/shrimpy-web"

if [[ "${SHRIMPY_NO_AUTO_COMPLETION:-}" != "1" && "${SHELL##*/}" == "zsh" ]]; then
  echo "Installing zsh completion"
  if ! "$bin_dir/shrimpy" completion install zsh; then
    echo "warning: zsh completion install failed; run 'shrimpy completion install zsh' later" >&2
  fi
fi

echo
echo "Shrimpy installed."
if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
  echo "Add $bin_dir to PATH before running shrimpy."
fi
echo
echo "Next:"
echo "  shrimpy setup init"
echo "  shrimpy status"
