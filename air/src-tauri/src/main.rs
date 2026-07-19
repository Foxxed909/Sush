// Sush Air — PTY host. One command surface: spawn / write / resize / kill,
// with output streamed to the frontend as `pty-output:<id>` events and exits
// as `pty-exit:<id>`. Everything else (tabs, palette, themes, the command
// layer) lives in the webview.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
struct Ptys(Mutex<HashMap<String, PtySession>>);

const MAX_SESSIONS: usize = 24;

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<'_, Ptys>,
    id: String,
    shell: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') || id.is_empty() || id.len() > 64 {
        return Err("bad session id".into());
    }
    {
        let map = state.0.lock().unwrap();
        if map.contains_key(&id) {
            return Err("session id already in use".into());
        }
        if map.len() >= MAX_SESSIONS {
            return Err("too many sessions".into());
        }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let shell = shell.unwrap_or_else(default_shell);
    let mut cmd = CommandBuilder::new(&shell);
    if let Some(extra) = args {
        for a in extra {
            cmd.arg(a);
        }
    }
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }
    cmd.env("TERM", "xterm-256color");

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let killer = child.clone_killer();
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.0.lock().unwrap().insert(
        id.clone(),
        PtySession { master: pair.master, writer, killer },
    );

    // Reader thread: PTY bytes → frontend events. Lossy UTF-8 is fine for a
    // terminal stream; xterm.js handles split escape sequences.
    let out_app = app.clone();
    let out_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = out_app.emit(&format!("pty-output:{out_id}"), chunk);
                }
            }
        }
    });

    // Wait thread: reap the child, drop the session, tell the frontend.
    std::thread::spawn(move || {
        let status = child.wait().map(|s| s.exit_code()).unwrap_or(1);
        if let Some(state) = app.try_state::<Ptys>() {
            state.0.lock().unwrap().remove(&id);
        }
        let _ = app.emit(&format!("pty-exit:{id}"), status);
    });

    Ok(())
}

#[tauri::command]
fn pty_write(state: State<'_, Ptys>, id: String, data: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    let sess = map.get_mut(&id).ok_or("no such session")?;
    sess.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_resize(state: State<'_, Ptys>, id: String, cols: u16, rows: u16) -> Result<(), String> {
    let map = state.0.lock().unwrap();
    let sess = map.get(&id).ok_or("no such session")?;
    sess.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_kill(state: State<'_, Ptys>, id: String) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some(mut sess) = map.remove(&id) {
        let _ = sess.killer.kill();
    }
    Ok(())
}

#[tauri::command]
fn home_dir() -> String {
    std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default()
}

fn default_shell() -> String {
    if cfg!(windows) {
        "powershell.exe".into()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Ptys::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn, pty_write, pty_resize, pty_kill, home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sush Air");
}
