// DeskMate — Tauri Main Entry Point
// Registers commands: take_screenshot, show_annotation, hide_annotation
// Creates annotation overlay window on startup

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod annotation_window;

use annotation_window::{create_annotation_window, hide_annotation, show_annotation};
use std::process::Command;
use tauri::Manager;

/// Tauri command: call the Python sidecar to capture a screenshot.
/// Returns the JSON string with base64 screenshot data.
#[tauri::command]
async fn take_screenshot() -> Result<String, String> {
    let output = Command::new("python")
        .arg("../../screencapture/capture.py")
        .output()
        .map_err(|e| format!("Failed to spawn capture sidecar: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Capture failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout.trim().to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            take_screenshot,
            show_annotation,
            hide_annotation
        ])
        .setup(|app| {
            // Create the transparent annotation overlay window
            let handle = app.handle().clone();
            create_annotation_window(&handle)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeskMate");
}
