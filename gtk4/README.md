# Grad Notes for GNOME (GTK 4 / libadwaita)

This is the GTK 4 desktop shell for Grad Notes. It uses a native libadwaita
window, header bar and sidebar, and runs the existing Svelte application in
WebKitGTK. Its Rust backend reads and writes the same local Grad Notes
database and file library as the Tauri app.

From the repository root, run `npm run app:gtk4` to build the web interface and
launch the GTK app. Run `npm run bundle:gtk4` to build the optimized desktop
executable; it is written to `gtk4/target/release/`. For UI
development against Vite, run `npm run app:gtk4:dev`.

The build requires GTK 4, libadwaita 1.9 or newer, WebKitGTK 6 development
libraries, Rust, Node.js and npm. The GTK version uses the existing data folder
at `$XDG_DATA_HOME/io.github.paullinux_gn.gradnotes` (normally
`~/.local/share/io.github.paullinux_gn.gradnotes`). Set `GRAD_NOTES_DATA_DIR` to use a
separate data folder intentionally.

Some integrations still differ from the Tauri app: GTK system notifications,
global quick capture, and PDF printing are not implemented in this shell yet.
