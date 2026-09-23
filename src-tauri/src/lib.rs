//! The native CalmList shell: a window around the web app, on Windows, macOS and iOS.
//! Everything else (storage, sync, AI) is the same code that runs in the browser.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Opens web links in the system browser instead of inside the app.
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running CalmList");
}
