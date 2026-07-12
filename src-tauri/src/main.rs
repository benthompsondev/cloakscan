// CloakScan desktop shell. Loads the bundled static frontend. The only
// app-specific IPC command is export_clean_text below, and the build-time
// ACL (build.rs) rejects every other app command. Tauri's updater, process,
// and project-scoped opener plugins expose only the permissions listed in
// capabilities/main.json.
// Windows release builds hide the console window; devtools stay disabled
// in every release build on every platform.
#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

use std::path::Path;

use tauri_plugin_dialog::DialogExt;

/// Write the sanitized text to `path`, byte for byte (UTF-8, no BOM, no
/// added or normalized line endings). Split out of the command so the exact
/// write behavior is unit-testable.
fn write_export(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents.as_bytes()).map_err(|e| e.to_string())
}

fn can_self_update_for(is_linux: bool, appimage_path_is_set: bool) -> bool {
    !is_linux || appimage_path_is_set
}

/// Whether this package can safely replace itself through Tauri's updater.
///
/// Windows installers and Linux AppImages can. A Debian package must be
/// replaced through the package manager, so Linux only returns true when the
/// AppImage runtime marker is present. The marker's value is never exposed.
#[tauri::command]
fn can_self_update() -> bool {
    can_self_update_for(
        cfg!(target_os = "linux"),
        std::env::var_os("APPIMAGE").is_some(),
    )
}

/// Every filename the export command will suggest, exactly as the frontend
/// sends it. Anything not in this list — arbitrary names, path separators,
/// traversal, absolute paths, other extensions — is rejected before the
/// dialog opens. The user still picks the real destination themselves.
const EXPORT_FILENAMES: [(&str, &str, &str); 4] = [
    ("cloakscan-clean.txt", "Text", "txt"),
    ("cloakscan-portfolio.ps1", "PowerShell script", "ps1"),
    ("cloakscan-findings-summary.txt", "Text", "txt"),
    ("cloakscan-review-checklist.md", "Markdown", "md"),
];

/// Exact-match allowlist lookup: returns the (name, filter label, extension)
/// row, or an error for anything outside the list.
fn validate_export_filename(
    name: &str,
) -> Result<(&'static str, &'static str, &'static str), String> {
    EXPORT_FILENAMES
        .iter()
        .find(|(allowed, _, _)| *allowed == name)
        .copied()
        .ok_or_else(|| "unsupported export filename".to_string())
}

/// Save the cleaned text through a native save dialog.
///
/// Embedded webviews (WebView2 on Windows, WebKitGTK on Linux) do not
/// reliably honor the browser blob-download used by the web build, so the
/// desktop app asks the user for a destination and writes the sanitized
/// text to exactly that path — the narrowest write access possible.
/// Returns false when the user cancels. Never reads any file and never
/// writes anywhere the user did not explicitly pick.
///
/// The optional `filename` only selects the SUGGESTED name and extension
/// filter, and only from the fixed allowlist above; it grants no path
/// control whatsoever.
///
/// Deliberately a sync command: Tauri runs it on a worker thread, where the
/// blocking dialog call is safe (an async command would block the runtime).
#[tauri::command]
fn export_clean_text(
    app: tauri::AppHandle,
    contents: String,
    filename: Option<String>,
) -> Result<bool, String> {
    let (name, label, ext) =
        validate_export_filename(filename.as_deref().unwrap_or("cloakscan-clean.txt"))?;
    let picked = app
        .dialog()
        .file()
        .set_file_name(name)
        .add_filter(label, &[ext])
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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_clean_text, can_self_update])
        .run(tauri::generate_context!())
        .expect("error while running CloakScan");
}

#[cfg(test)]
mod tests {
    use super::{can_self_update_for, validate_export_filename, write_export};

    #[test]
    fn allowlisted_export_filenames_are_accepted() {
        for name in [
            "cloakscan-clean.txt",
            "cloakscan-portfolio.ps1",
            "cloakscan-findings-summary.txt",
            "cloakscan-review-checklist.md",
        ] {
            let (accepted, _, ext) = validate_export_filename(name).expect(name);
            assert_eq!(accepted, name);
            assert!(name.ends_with(ext));
        }
    }

    #[test]
    fn arbitrary_and_hostile_export_filenames_are_rejected() {
        for name in [
            "",
            "notes.txt",
            "cloakscan-portfolio.exe",
            "cloakscan-portfolio.ps1 ",
            "CLOAKSCAN-PORTFOLIO.PS1",
            "../cloakscan-clean.txt",
            "..\\cloakscan-clean.txt",
            "sub/cloakscan-clean.txt",
            "sub\\cloakscan-clean.txt",
            "/etc/cloakscan-clean.txt",
            "C:\\Windows\\cloakscan-clean.txt",
            "cloakscan-clean.txt/..",
            "cloakscan-clean.txt\u{0000}",
        ] {
            assert!(
                validate_export_filename(name).is_err(),
                "must reject {name:?}"
            );
        }
    }

    fn temp_file(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("cloakscan-test-{}-{name}", std::process::id()))
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

    #[test]
    fn windows_packages_can_self_update() {
        assert!(can_self_update_for(false, false));
    }

    #[test]
    fn linux_appimages_can_self_update() {
        assert!(can_self_update_for(true, true));
    }

    #[test]
    fn linux_debian_packages_use_manual_updates() {
        assert!(!can_self_update_for(true, false));
    }
}
