#!/usr/bin/env bash
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
app_id="io.github.paullinux_gn.gradnotes"
branch="50"
output="$root/artifacts/Grad-Notes-0.5.4.flatpak"

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

sdk_dir="$(flatpak info --show-location "org.gnome.Sdk//$branch")/files"
export PKG_CONFIG_SYSROOT_DIR="$sdk_dir"
export PKG_CONFIG_LIBDIR="$sdk_dir/lib/x86_64-linux-gnu/pkgconfig:$sdk_dir/share/pkgconfig:$sdk_dir/lib/pkgconfig"
export PKG_CONFIG_ALLOW_CROSS=1
export CARGO_TARGET_DIR="$root/gtk4/target/flatpak"
cargo build --release --manifest-path "$root/gtk4/Cargo.toml"

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
