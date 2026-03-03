// DeskMate — Tauri Main Entry Point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use std::path::PathBuf;
use std::env;
use tauri::Manager;

/// Tauri command: call the Python sidecar to capture a screenshot.
#[tauri::command]
async fn take_screenshot() -> Result<String, String> {
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

/// Tauri command: resize and reposition the window
#[tauri::command]
async fn resize_window(
    window: tauri::Window,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    use tauri::{LogicalSize, LogicalPosition};
    window
        .set_size(tauri::Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;
    window
        .set_position(tauri::Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Find capture.py by searching common locations
fn find_capture_script() -> Result<String, String> {
    let candidates = vec![
        PathBuf::from("../../screencapture/capture.py"),
        PathBuf::from("../screencapture/capture.py"),
        PathBuf::from("D:/deskmate/screencapture/capture.py"),
    ];

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

    Ok("D:/deskmate/screencapture/capture.py".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            take_screenshot,
            resize_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running DeskMate");
}
