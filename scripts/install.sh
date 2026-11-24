#!/usr/bin/env bash
# Installs Shrimpy into the account that runs it, on macOS or Linux, with no admin rights:
#
#   curl -fsSL https://raw.githubusercontent.com/zachmeador/shrimpy/main/scripts/install.sh | bash
#
# It installs the latest release, or the version it's given, as in `bash -s -- 1.0.0`. Each version
# and the Node it runs on get a folder of their own in ~/.local/share/shrimpy, and ~/.local/bin/shrimpy
# runs the version installed last.
#
# All the work is in install_shrimpy, called on the last line, so a download cut off partway does nothing.

REPO=zachmeador/shrimpy
MARK="# Written by Shrimpy's install script."

say() { printf '%s\n' "$*"; }

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Installing Shrimpy needs $1, which isn't on the PATH."
}

# A word the shell reads back as it is.
quoted() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

latest_version() {
  local url
  url=$(curl -fsS -o /dev/null -w '%{redirect_url}' "https://github.com/$REPO/releases/latest") ||
    fail "Couldn't reach GitHub to find Shrimpy's latest release."
  case "$url" in
    */releases/tag/v*) say "${url##*/releases/tag/v}" ;;
    *) fail "Shrimpy has no release on GitHub yet. Give the version to install, such as 1.0.0." ;;
  esac
}

# Adds ~/.local/bin to the login shell's PATH, unless the login shell has it already.
add_to_path() {
  local bin="$1" shell="${SHELL:-/bin/sh}" login_path file line
  login_path=$("$shell" -lc 'printf "\nPATH=%s\n" "$PATH"' </dev/null 2>/dev/null | sed -n 's/^PATH=//p' | tail -n 1) || true
  case ":$login_path:" in *":$bin:"*) return 0 ;; esac
  line='export PATH="$HOME/.local/bin:$PATH"'
  case "$(basename "$shell")" in
    zsh) file="${ZDOTDIR:-$HOME}/.zprofile" ;;
    bash)
      if [ -f "$HOME/.bash_profile" ]; then
        file="$HOME/.bash_profile"
      elif [ -f "$HOME/.bash_login" ]; then
        file="$HOME/.bash_login"
      else
        file="$HOME/.profile"
      fi
      ;;
    fish)
      file="$HOME/.config/fish/conf.d/shrimpy.fish"
      line='set -gx PATH $HOME/.local/bin $PATH'
      mkdir -p "$(dirname "$file")"
      ;;
    *) file="$HOME/.profile" ;;
  esac
  printf '\n%s\n%s\n' "$MARK" "$line" >>"$file"
  say "Added $bin to the PATH in $file."
}

install_shrimpy() {
  set -euo pipefail

  local share="$HOME/.local/share/shrimpy"
  local bin="$HOME/.local/bin"
  local command="$bin/shrimpy"
  local pattern='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'

  [ "$#" -le 1 ] || fail "Give one version, such as 1.0.0, or none for the latest release."
  if [ "$(id -u)" = 0 ] && [ -n "${SUDO_USER:-}" ]; then
    fail "Run this without sudo. Shrimpy installs into the account that runs it."
  fi

  local os arch libc
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "Shrimpy installs on macOS and Linux, and this is $(uname -s)." ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=arm64 ;;
    x86_64 | amd64) arch=x64 ;;
    *) fail "Shrimpy installs on arm64 and x64, and this is $(uname -m)." ;;
  esac
  if [ "$os" = linux ]; then
    libc=$(ldd --version 2>&1 || true)
    case "$libc" in *musl*) fail "Node has no official build for Linux with musl, which this is, so Shrimpy can't install here." ;; esac
  fi
  need curl
  need tar
  command -v sha256sum >/dev/null 2>&1 || need shasum

  if [ -L "$command" ] || { [ -e "$command" ] && ! grep -qF "$MARK" "$command"; }; then
    fail "$command is there already, and this script didn't write it. Move it aside and run this again."
  fi

  local version="${1:-}"
  [ -n "$version" ] || version=$(latest_version)
  version="${version#v}"
  [[ $version =~ $pattern ]] || fail "\"$version\" isn't a version. Give one such as 1.0.0."

  # Each download goes here first, and is renamed into place once whole. It isn't local, since the
  # trap that removes it runs after this function has returned.
  mkdir -p "$share"
  rm -rf "$share"/.install.*
  staging=$(mktemp -d "$share/.install.XXXXXX")
  trap 'rm -rf "$staging"' EXIT
  trap 'exit 1' HUP INT TERM

  local release="$share/versions/$version"
  local source="$release"
  if [ -d "$release" ]; then
    say "Shrimpy $version is in $release already."
  else
    say "Downloading Shrimpy $version."
    source="$staging/shrimpy"
    mkdir "$source"
    curl -fsSL -o "$staging/shrimpy.tar.gz" "https://github.com/$REPO/archive/refs/tags/v$version.tar.gz" ||
      fail "Couldn't download Shrimpy $version from GitHub. Is there a release $version?"
    tar -xzf "$staging/shrimpy.tar.gz" -C "$source" --strip-components=1
  fi

  [ -f "$source/.node-version" ] || fail "Shrimpy $version doesn't name the Node it runs on, so this script can't install it."
  local node_version
  node_version=$(tr -d ' \tv\r\n' <"$source/.node-version")
  local node="$share/node/$node_version"
  if [ ! -x "$node/bin/node" ]; then
    local name="node-v$node_version-$os-$arch"
    say "Downloading Node $node_version."
    curl -fsSL -o "$staging/$name.tar.gz" "https://nodejs.org/dist/v$node_version/$name.tar.gz" ||
      fail "Couldn't download Node $node_version for $os-$arch from nodejs.org."
    curl -fsSL -o "$staging/SHASUMS256.txt" "https://nodejs.org/dist/v$node_version/SHASUMS256.txt" ||
      fail "Couldn't download Node $node_version's checksums from nodejs.org."
    local expected
    expected=$(awk -v file="$name.tar.gz" '$2 == file { print $1 }' "$staging/SHASUMS256.txt")
    [ -n "$expected" ] && [ "$(sha256 "$staging/$name.tar.gz")" = "$expected" ] ||
      fail "The Node downloaded from nodejs.org doesn't match its checksum, so nothing was installed."
    mkdir "$staging/node"
    tar -xzf "$staging/$name.tar.gz" -C "$staging/node" --strip-components=1
    local problem
    if ! problem=$("$staging/node/bin/node" --version 2>&1 >/dev/null); then
      case "$problem" in
        *libatomic*) fail "Node needs libatomic, which this machine doesn't have. Install it as an administrator, as the package libatomic1 on Debian and Ubuntu, and run this again." ;;
        *) fail "Node $node_version doesn't run here, so nothing was installed: $problem" ;;
      esac
    fi
    mkdir -p "$share/node"
    mv "$staging/node" "$node"
  fi

  if [ "$source" != "$release" ]; then
    say "Installing Shrimpy's dependencies."
    (cd "$source" && PATH="$node/bin:$PATH" TMPDIR="$staging" "$node/bin/npm" ci --omit=dev --ignore-scripts --no-audit --no-fund --no-update-notifier --no-progress --loglevel=error </dev/null) ||
      fail "npm couldn't install Shrimpy's dependencies, so nothing was installed."
    mkdir -p "$share/versions"
    mv "$source" "$release"
  fi

  mkdir -p "$bin"
  {
    printf '#!/bin/sh\n%s\n' "$MARK"
    printf 'exec %s %s "$@"\n' "$(quoted "$node/bin/node")" "$(quoted "$release/bin/shrimpy.js")"
  } >"$staging/command"
  chmod 755 "$staging/command"
  mv -f "$staging/command" "$command"

  add_to_path "$bin"
  case ":$PATH:" in
    *":$bin:"*) say "Shrimpy $version is installed. Run shrimpy to start." ;;
    *) say "Shrimpy $version is installed. Run $command to start, or open a new terminal and run shrimpy." ;;
  esac
}

install_shrimpy "$@"
