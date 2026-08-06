#!/bin/sh
set -eu

command -v brew >/dev/null 2>&1 || {
  echo "Homebrew is required: https://brew.sh" >&2
  exit 1
}

brew install rustup node pnpm sqlcipher
rustup toolchain install stable --profile default
rustup default stable

RUST_BIN="$(dirname "$(rustup which rustc)")"
mkdir -p "$HOME/.cargo/bin"
for rust_command in cargo rustc rustdoc rustfmt cargo-clippy clippy-driver; do
  ln -sf "$RUST_BIN/$rust_command" "$HOME/.cargo/bin/$rust_command"
done
case ":$PATH:" in
  *":$HOME/.cargo/bin:"*) ;;
  *) export PATH="$HOME/.cargo/bin:$RUST_BIN:$PATH" ;;
esac

if ! grep -q 'Rust toolchain managed by Homebrew rustup' "$HOME/.zshrc" 2>/dev/null; then
  {
    echo ''
    echo '# Rust toolchain managed by Homebrew rustup'
    echo 'export PATH="$HOME/.cargo/bin:$PATH"'
    echo 'if command -v rustup >/dev/null 2>&1; then'
    echo '  export PATH="$(dirname "$(rustup which rustc 2>/dev/null)"):$PATH"'
    echo 'fi'
  } >> "$HOME/.zshrc"
fi

if ! grep -q 'Rust toolchain managed by Homebrew rustup' "$HOME/.zprofile" 2>/dev/null; then
  {
    echo ''
    echo '# Rust toolchain managed by Homebrew rustup'
    echo 'export PATH="$HOME/.cargo/bin:$PATH"'
    echo 'if command -v rustup >/dev/null 2>&1; then'
    echo '  export PATH="$(dirname "$(rustup which rustc 2>/dev/null)"):$HOME/.cargo/bin:$PATH"'
    echo 'fi'
  } >> "$HOME/.zprofile"
fi

echo "Bootstrap complete. Cargo is available in this shell."
echo "For an already-open terminal, run: source ~/.zprofile ~/.zshrc"
echo "Then run: pnpm install && cargo test --workspace"
