mod commands;
mod license;
mod state;
mod terminal;
use commands::toggle_drop_enforced;
use state::AirState;
use tauri::{Emitter, Manager};
pub fn run() {
    let shortcut = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcut("CommandOrControl+Shift+Space")
        .expect("valid shortcut")
        .with_handler(|app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                match toggle_drop_enforced(app) {
                    Ok(value) if !value.allowed => {
                        let _ = app.emit("air://drop-limit", value);
                    }
                    Err(error) => {
                        let _ = app.emit("air://runtime-error", error);
                    }
                    _ => {}
                }
            }
        })
        .build();
    tauri::Builder::default()
        .manage(AirState::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let _ = app.emit(
                "air://context-launch",
                serde_json::json!({"args":args,"cwd":cwd}),
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(shortcut)
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data)?;
            app.state::<AirState>()
                .set_usage_path(data.join("drop-usage.json"));
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&data.join("stronghold-salt"))
                    .build(),
            )?;
            app.state::<AirState>()
                .shortcut
                .store(true, std::sync::atomic::Ordering::Relaxed);
            if let Some(icon) = app.default_window_icon() {
                let menu = tauri::menu::MenuBuilder::new(app)
                    .text("show", "Show Sush Air")
                    .separator()
                    .text("quit", "Quit")
                    .build()?;
                let _ = tauri::tray::TrayIconBuilder::with_id("main-tray")
                    .icon(icon.clone())
                    .tooltip("Sush Air")
                    .menu(&menu)
                    .on_menu_event(|app, event| {
                        let id = event.id().as_ref();
                        if id == "show" {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        } else if id == "quit" {
                            app.exit(0);
                        } else if let Some(index) = id
                            .strip_prefix("workspace-")
                            .and_then(|v| v.parse::<usize>().ok())
                        {
                            if let Some(workspace) =
                                app.state::<AirState>().tray.lock().get(index).cloned()
                            {
                                let _ = app.emit("air://open-workspace", workspace);
                            }
                        }
                    })
                    .build(app);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
            if let tauri::WindowEvent::Focused(false) = event {
                let state = window.state::<AirState>();
                if state.active.load(std::sync::atomic::Ordering::Relaxed)
                    && !state.pinned.load(std::sync::atomic::Ordering::Relaxed)
                {
                    let _ = window.hide();
                    state
                        .active
                        .store(false, std::sync::atomic::Ordering::Relaxed);
                    let _ = window.emit("air://drop-mode", false);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            commands::runtime_info,
            commands::project_inspect,
            commands::git_pulse,
            commands::port_list,
            commands::task_run,
            commands::task_stop,
            commands::worktree_create,
            commands::worktree_remove,
            commands::worktree_list,
            commands::resource_snapshot,
            commands::power_status,
            commands::agent_detect,
            commands::context_pack,
            commands::drop_status,
            commands::drop_toggle,
            commands::drop_set_pinned,
            commands::tray_set_workspaces,
            license::license_verify
        ])
        .build(tauri::generate_context!())
        .expect("Sush Air failed to start")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }
            ) {
                app.state::<AirState>().shutdown()
            }
        })
}
