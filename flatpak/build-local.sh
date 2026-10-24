#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
app_id="io.github.paullinux_gn.gradnotes"
branch="50"
version="$(node -p 'require(process.argv[1]).version' "$root/package.json")"
output="$root/artifacts/Grad-Notes-$version.flatpak"

for ref in "org.gnome.Sdk//$branch" "org.gnome.Platform//$branch"; do
  flatpak info "$ref" >/dev/null || {
    printf 'Required Flatpak runtime is missing: %s\n' "$ref" >&2
    exit 1
  }
done

if [[ -e "$output" ]]; then
  printf 'Refusing to overwrite existing package: %s\n' "$output" >&2
  exit 1
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/grad-notes-flatpak.XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
mkdir -p "$root/artifacts"

npm --prefix "$root" run build

export CARGO_TARGET_DIR="$root/gtk4/target/flatpak"
export CARGO_HOME="$root/gtk4/target/cargo-home"
mkdir -p "$CARGO_HOME"

# Compile against the matching GNOME SDK instead of trying to link its GTK
# libraries from the host operating system. Rust comes from the SDK extension.
flatpak run --devel --share=network --filesystem="$root" --command=sh "org.gnome.Sdk//$branch" -c \
  'export PATH="/usr/lib/sdk/rust-stable/bin:$PATH"; export CARGO_HOME="$1/gtk4/target/cargo-home"; export CARGO_TARGET_DIR="$1/gtk4/target/flatpak"; cargo build --release --manifest-path "$1/gtk4/Cargo.toml"' \
  sh "$root"

build_dir="$work/build"
repo_dir="$work/repo"
flatpak build-init "$build_dir" "$app_id" org.gnome.Sdk org.gnome.Platform "$branch"
mkdir -p \
  "$build_dir/files/bin" \
  "$build_dir/files/share/grad-notes" \
  "$build_dir/files/share/applications" \
  "$build_dir/files/share/metainfo" \
  "$build_dir/files/share/icons/hicolor/512x512/apps"
install -m 755 "$CARGO_TARGET_DIR/release/grad-notes-gtk4" "$build_dir/files/bin/grad-notes"
cp -a "$root/dist" "$build_dir/files/share/grad-notes/dist"
install -m 644 "$root/flatpak/io.github.paullinux_gn.gradnotes.desktop" "$build_dir/files/share/applications/io.github.paullinux_gn.gradnotes.desktop"
install -m 644 "$root/flatpak/io.github.paullinux_gn.gradnotes.metainfo.xml" "$build_dir/files/share/metainfo/io.github.paullinux_gn.gradnotes.metainfo.xml"
install -m 644 "$root/src-tauri/icons/icon.png" "$build_dir/files/share/icons/hicolor/512x512/apps/io.github.paullinux_gn.gradnotes.png"

flatpak build-finish "$build_dir" \
  --command=grad-notes \
  --env=GRAD_NOTES_RESOURCE_DIR=/app/share/grad-notes \
  --share=ipc \
  --socket=wayland \
  --socket=fallback-x11 \
  --device=dri \
  --filesystem=xdg-download
flatpak build-export "$repo_dir" "$build_dir" stable
flatpak build-bundle "$repo_dir" "$output" "$app_id" stable
printf 'Created %s\n' "$output"
