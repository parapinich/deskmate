// annotation_window.rs
// Creates a transparent fullscreen overlay window for screen annotations.
// The overlay highlights the region of the screen relevant to each question.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Create a transparent, fullscreen, always-on-top, click-through annotation overlay.
pub fn create_annotation_window(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    WebviewWindowBuilder::new(app, "annotation", WebviewUrl::App("annotation.html".into()))
        .title("DeskMate Annotation")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .fullscreen(true)
        .build()?;
    Ok(())
}

/// Tauri command: show annotation highlight at a specific 3x3 grid region.
#[tauri::command]
pub async fn show_annotation(app: tauri::AppHandle, region: String, label: String) {
    if let Some(window) = app.get_webview_window("annotation") {
        let _ = window.eval(&format!(
            "showAnnotation('{}', '{}')",
            region.replace('\'', "\\'"),
            label.replace('\'', "\\'")
        ));
    }
}

/// Tauri command: hide the annotation overlay.
#[tauri::command]
pub async fn hide_annotation(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("annotation") {
        let _ = window.eval("hideAnnotation()");
    }
}
