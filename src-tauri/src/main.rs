// CloakGuard desktop shell. Loads the bundled static frontend. The only
// app-specific IPC command is export_clean_text below, and the build-time
// ACL (build.rs) rejects every other app command. Tauri's updater and process
// plugins expose only the permissions listed in capabilities/main.json.
// Release builds hide the console window and have devtools disabled.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;

use tauri_plugin_dialog::DialogExt;

/// Write the sanitized text to `path`, byte for byte (UTF-8, no BOM, no
/// added or normalized line endings). Split out of the command so the exact
/// write behavior is unit-testable.
fn write_export(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents.as_bytes()).map_err(|e| e.to_string())
}

/// Save the cleaned text through a native save dialog.
///
/// WebView2 inside Tauri ignores the browser blob-download used by the web
/// build, so the desktop app asks the user for a destination and writes the
/// sanitized text to exactly that path — the narrowest write access
/// possible. Returns false when the user cancels. Never reads any file and
/// never writes anywhere the user did not explicitly pick.
///
/// Deliberately a sync command: Tauri runs it on a worker thread, where the
/// blocking dialog call is safe (an async command would block the runtime).
#[tauri::command]
fn export_clean_text(app: tauri::AppHandle, contents: String) -> Result<bool, String> {
    let picked = app
        .dialog()
        .file()
        .set_file_name("cloakguard-clean.txt")
        .add_filter("Text", &["txt"])
        .blocking_save_file();
    match picked {
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            write_export(&path, &contents)?;
            Ok(true)
        }
        None => Ok(false),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_clean_text])
        .run(tauri::generate_context!())
        .expect("error while running CloakGuard");
}

#[cfg(test)]
mod tests {
    use super::write_export;

    fn temp_file(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("cloakguard-test-{}-{name}", std::process::id()))
    }

    #[test]
    fn writes_exact_bytes_including_crlf_and_unicode() {
        let path = temp_file("exact.txt");
        let contents = "line1\r\nline2\nnaïve — [EMAIL_1] ✓\r\n";
        write_export(&path, contents).expect("write should succeed");
        let read = std::fs::read(&path).expect("read back");
        assert_eq!(read, contents.as_bytes(), "bytes must round-trip unchanged");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn overwrites_an_existing_file_completely() {
        let path = temp_file("overwrite.txt");
        write_export(&path, "a much longer earlier body").unwrap();
        write_export(&path, "short").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"short");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn empty_contents_produce_an_empty_file() {
        let path = temp_file("empty.txt");
        write_export(&path, "").unwrap();
        assert_eq!(std::fs::read(&path).unwrap().len(), 0);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn missing_directory_returns_err_and_writes_nothing() {
        let path = temp_file("no-such-dir").join("nested").join("f.txt");
        let result = write_export(&path, "content");
        assert!(
            result.is_err(),
            "writing into a missing directory must fail"
        );
        assert!(!path.exists());
    }
}
