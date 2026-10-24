# Flatpak build

`build-local.sh` creates `artifacts/Grad-Notes-<version>.flatpak` using the
GNOME 50 runtime, SDK, and matching Rust SDK extension. It builds the web
interface and GTK app, then packages them with Flatpak's command-line tools.
It does not install the package.

The Flatpak keeps its database and files in Flatpak's private app-data folder.
It will start with a separate, empty workspace; the existing native app data
is left untouched.

To install the package after building, open it in GNOME Software or run:

```sh
flatpak install --user ./artifacts/Grad-Notes-<version>.flatpak
```

The app id is `io.github.paullinux_gn.gradnotes`.
