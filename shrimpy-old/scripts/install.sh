#!/usr/bin/env bash
set -euo pipefail

repo="${SHRIMPY_REPO:-zachmeador/shrimpy}"
ref="${SHRIMPY_REF:-main}"
install_dir="${SHRIMPY_INSTALL_DIR:-$HOME/.local/share/shrimpy/app}"
bin_dir="${SHRIMPY_BIN_DIR:-$HOME/.local/bin}"
path_profile=""

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

shell_profile_path() {
  local shell_name="${SHELL:-}"
  shell_name="${shell_name##*/}"
  case "$shell_name" in
    zsh)
      echo "${ZDOTDIR:-$HOME}/.zshrc"
      ;;
    bash)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        echo "$HOME/.bash_profile"
      else
        echo "$HOME/.bashrc"
      fi
      ;;
    *)
      return 1
      ;;
  esac
}

shell_double_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  printf '%s\n' "$value"
}

install_path_profile() {
  if [[ "${SHRIMPY_NO_PATH_PROFILE:-}" == "1" ]]; then
    return 1
  fi

  local profile
  if ! profile="$(shell_profile_path)"; then
    return 1
  fi

  local quoted_bin_dir
  quoted_bin_dir="$(shell_double_quote "$bin_dir")"
  local block
  block="$(cat <<EOF
# Shrimpy PATH
if [[ ":\$PATH:" != *":$quoted_bin_dir:"* ]]; then
  export PATH="$quoted_bin_dir:\$PATH"
fi
EOF
)"

  mkdir -p "$(dirname "$profile")"
  touch "$profile"
  if grep -Fq "# Shrimpy PATH" "$profile" || grep -Fq -- "$bin_dir" "$profile"; then
    path_profile="$profile"
    return 0
  fi

  if [[ -s "$profile" ]]; then
    printf '\n%s\n' "$block" >> "$profile"
  else
    printf '%s\n' "$block" > "$profile"
  fi
  path_profile="$profile"
}

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

has_user_git_changes() {
  local dir="$1"
  if ! git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "error: install directory has a .git directory but is not a readable git worktree: $dir" >&2
    exit 1
  fi
  [[ -n "$(git -C "$dir" status --porcelain --untracked-files=all -- . \
    ":(exclude)package-lock.json")" ]]
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

if [[ -d "$install_dir/.git" && "${SHRIMPY_FORCE:-}" != "1" ]] && has_user_git_changes "$install_dir"; then
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
npm prune --omit=dev --package-lock=false

echo "Installing app to $install_dir"
rm -rf "$install_dir"
mv "$stage" "$install_dir"

installed_commit="$(git -C "$install_dir" rev-parse HEAD)"
install_metadata="$install_parent/.shrimpy-install.json"
node - "$install_metadata" "$install_dir" "$clone_url" "$ref" "$installed_commit" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [metadataPath, installDir, origin, requestedRef, installedCommit] = process.argv.slice(2);
const value = {
  schemaVersion: 1,
  managed: true,
  installDir: path.resolve(installDir),
  origin,
  requestedRef,
  installedRef: requestedRef,
  installedCommit,
};
const temporaryPath = `${metadataPath}.${process.pid}.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
fs.renameSync(temporaryPath, metadataPath);
NODE

echo "Linking commands in $bin_dir"
mkdir -p "$bin_dir"
ln -sfn "$install_dir/dist/cli.js" "$bin_dir/shrimpy"
ln -sfn "$install_dir/dist/gateway.js" "$bin_dir/shrimpy-gateway"
ln -sfn "$install_dir/dist/web/server.js" "$bin_dir/shrimpy-web"

path_missing=0
if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
  path_missing=1
  install_path_profile || true
fi

if [[ "${SHRIMPY_NO_AUTO_COMPLETION:-}" != "1" && "${SHELL:-}" == */zsh ]]; then
  echo "Installing zsh completion"
  if ! "$bin_dir/shrimpy" completion install zsh; then
    echo "warning: zsh completion install failed; run 'shrimpy completion install zsh' later" >&2
  fi
fi

echo
echo "Shrimpy installed."
if [[ "$path_missing" == "1" ]]; then
  echo "This terminal's PATH does not include $bin_dir yet."
  if [[ -n "$path_profile" ]]; then
    echo "Added $bin_dir to $path_profile for new shells."
  else
    echo "Add $bin_dir to PATH before running bare shrimpy."
  fi
  echo "For this terminal, run: export PATH=\"$bin_dir:\$PATH\""
fi
echo
echo "Next:"
if [[ "$path_missing" == "1" ]]; then
  echo "  $bin_dir/shrimpy setup"
  echo "  $bin_dir/shrimpy status"
else
  echo "  shrimpy setup"
  echo "  shrimpy status"
fi
