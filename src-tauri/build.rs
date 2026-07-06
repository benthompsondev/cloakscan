fn main() {
    // Restrict the IPC command ACL to the two narrow app commands. This
    // generates the allow/deny permissions that capabilities/main.json
    // references; any command outside this list is rejected at the ACL layer.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["export_clean_text", "can_self_update"]),
    ))
    .expect("failed to run tauri-build");
}
