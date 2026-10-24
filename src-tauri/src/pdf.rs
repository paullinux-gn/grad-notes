//! Saves the open page as a PDF with WebView2's own PDF writer: no print
//! dialog, and no date, title or URL stamped in the margins. The frontend
//! switches the page to its print styles before asking.

use crate::db::{Error, Result};
use std::path::Path;
use tauri::{Runtime, WebviewWindow};

#[cfg(windows)]
pub fn print_to_pdf<R: Runtime>(webview: &WebviewWindow<R>, path: &Path) -> Result<()> {
    use std::sync::mpsc;
    use std::time::Duration;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2Controller2, ICoreWebView2Environment6, ICoreWebView2_7, COREWEBVIEW2_COLOR,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{Interface, HSTRING};

    const FAILED: &str = "The PDF couldn't be saved";
    let (tx, rx) = mpsc::channel::<bool>();
    let target = HSTRING::from(path.as_os_str());
    webview
        .with_webview(move |wv| unsafe {
            let done = tx.clone();
            let start = || -> windows_core::Result<()> {
                let controller = wv.controller();
                let core = controller.CoreWebView2()?.cast::<ICoreWebView2_7>()?;
                // The margins are painted in the window's background colour,
                // which follows the theme (black in dark mode): paper is white.
                let backdrop = controller.cast::<ICoreWebView2Controller2>().ok();
                let previous = backdrop.as_ref().and_then(|b| {
                    let mut color = COREWEBVIEW2_COLOR { A: 0, R: 0, G: 0, B: 0 };
                    b.DefaultBackgroundColor(&mut color).ok().map(|_| color)
                });
                if let Some(b) = &backdrop {
                    b.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR { A: 255, R: 255, G: 255, B: 255 })?;
                }
                let settings = wv.environment().cast::<ICoreWebView2Environment6>()?.CreatePrintSettings()?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                settings.SetShouldPrintBackgrounds(true)?;
                // Inches: comfortable margins for reading and printing.
                settings.SetMarginTop(0.7)?;
                settings.SetMarginBottom(0.7)?;
                settings.SetMarginLeft(0.75)?;
                settings.SetMarginRight(0.75)?;
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |result, ok| {
                    if let (Some(b), Some(color)) = (&backdrop, previous) {
                        let _ = b.SetDefaultBackgroundColor(color);
                    }
                    let _ = done.send(result.is_ok() && ok);
                    Ok(())
                }));
                core.PrintToPdf(&target, &settings, &handler)
            };
            if start().is_err() {
                let _ = tx.send(false);
            }
        })
        .map_err(|e| Error(e.to_string()))?;
    match rx.recv_timeout(Duration::from_secs(120)) {
        Ok(true) => Ok(()),
        _ => Err(Error(FAILED.into())),
    }
}

#[cfg(not(windows))]
pub fn print_to_pdf<R: Runtime>(_webview: &WebviewWindow<R>, _path: &Path) -> Result<()> {
    Err(Error("Saving a PDF directly needs Windows; use Print instead".into()))
}
