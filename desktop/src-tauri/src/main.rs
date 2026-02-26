// DeskMate — Tauri Main Entry Point
// Registers commands: take_screenshot

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::path::PathBuf;
use std::env;

/// Tauri command: call the Python sidecar to capture a screenshot.
/// Returns the JSON string with base64 screenshot data.
#[tauri::command]
async fn take_screenshot() -> Result<String, String> {
    // Resolve capture.py path relative to the executable location
    let capture_path = find_capture_script()
        .map_err(|e| format!("Cannot find capture.py: {}", e))?;

    let output = Command::new("python")
        .arg(&capture_path)
        .output()
        .map_err(|e| format!("Failed to spawn capture sidecar: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Capture failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let trimmed = stdout.trim().to_string();

    if trimmed.is_empty() {
        return Err("Capture returned empty output".to_string());
    }

    Ok(trimmed)
}

/// Find capture.py by searching common locations
fn find_capture_script() -> Result<String, String> {
    let candidates = vec![
        // When running from src-tauri via cargo
        PathBuf::from("../../screencapture/capture.py"),
        // When running from desktop directory
        PathBuf::from("../screencapture/capture.py"),
        // Absolute fallback using known project structure
        PathBuf::from("D:/deskmate/screencapture/capture.py"),
    ];

    // Also try relative to current exe
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let from_exe = exe_dir.join("../../../screencapture/capture.py");
            if from_exe.exists() {
                return Ok(from_exe.to_string_lossy().to_string());
            }
        }
    }

    for path in &candidates {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // Last resort: just return the absolute path
    Ok("D:/deskmate/screencapture/capture.py".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            take_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeskMate");
}
