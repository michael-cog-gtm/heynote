#!/usr/bin/env bash
# Install Heynote's dependencies without the @vscode/ripgrep postinstall, which
# queries api.github.com and fails with HTTP 403 from rate-limited/shared IPs
# (plain `npm ci` can then hang for ~20 minutes in retries). Works on Linux,
# macOS and Windows (Git Bash). Usage: bash scripts/install-deps.sh
set -euo pipefail
cd "$(dirname "$0")/.."

RG_VERSION="v15.0.0"
# On Windows the bare `npm`/`npx` are bash shims that break when `bash` resolves
# to the WSL stub (Devin's non-TTY shells); the .cmd launchers always work.
NPM=npm; NPX=npx
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) NPM=npm.cmd; NPX=npx.cmd ;; esac
case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)            RG_TARGET="x86_64-unknown-linux-musl";  RG_EXT="tar.gz" ;;
    Linux-aarch64|Linux-arm64) RG_TARGET="aarch64-unknown-linux-gnu"; RG_EXT="tar.gz" ;;
    Darwin-arm64)            RG_TARGET="aarch64-apple-darwin";       RG_EXT="tar.gz" ;;
    Darwin-x86_64)           RG_TARGET="x86_64-apple-darwin";        RG_EXT="tar.gz" ;;
    MINGW*|MSYS*|CYGWIN*)    RG_TARGET="x86_64-pc-windows-msvc";     RG_EXT="zip" ;;
    *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

echo "==> npm ci --ignore-scripts"
"$NPM" ci --no-audit --no-fund --ignore-scripts
echo "==> electron postinstall"
node node_modules/electron/install.js
echo "==> patch-package"
"$NPX" patch-package

RG_BIN_DIR="node_modules/@vscode/ripgrep/bin"
RG_BIN="$RG_BIN_DIR/rg"; [ "$RG_EXT" = "zip" ] && RG_BIN="$RG_BIN.exe"
if [ ! -x "$RG_BIN" ] && [ ! -f "$RG_BIN" ]; then
    echo "==> ripgrep ${RG_VERSION} (${RG_TARGET})"
    mkdir -p "$RG_BIN_DIR"
    URL="https://github.com/microsoft/ripgrep-prebuilt/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_TARGET}.${RG_EXT}"
    if [ "$RG_EXT" = "zip" ]; then
        curl -fsSL -o "$RG_BIN_DIR/rg.zip" "$URL"
        (cd "$RG_BIN_DIR" && unzip -oq rg.zip && rm -f rg.zip)
    else
        curl -fsSL "$URL" | tar -xz -C "$RG_BIN_DIR"
        chmod +x "$RG_BIN"
    fi
fi
echo "==> playwright chromium"
"$NPX" playwright install chromium
echo "==> done"
