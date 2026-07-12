use crate::state::{AirState, TerminalProcess};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use regex::Regex;
use serde::Deserialize;
use std::{fs, io::Read, path::PathBuf, thread};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnInput {
    id: String,
    cwd: String,
    shell: String,
    cols: u16,
    rows: u16,
    command: Option<String>,
    privacy: Option<bool>,
}
fn valid_id(value: &str) -> Result<(), String> {
    if Regex::new(r"^[A-Za-z0-9_-]{8,80}$")
        .unwrap()
        .is_match(value)
    {
        Ok(())
    } else {
        Err("Invalid session identifier".into())
    }
}
fn canonical_dir(value: &str) -> Result<PathBuf, String> {
    if value.len() > 4096 || value.contains('\0') {
        return Err("Invalid working directory".into());
    }
    let path = fs::canonicalize(value).map_err(|_| "Working directory does not exist")?;
    if path.is_dir() {
        Ok(path)
    } else {
        Err("Working directory is not a folder".into())
    }
}
fn executable(shell: &str) -> Result<String, String> {
    #[cfg(windows)]
    {
        match shell {
            "powershell" => Ok("powershell.exe".into()),
            "pwsh" => Ok("pwsh.exe".into()),
            "cmd" => Ok("cmd.exe".into()),
            _ => Err("Unsupported shell".into()),
        }
    }
    #[cfg(not(windows))]
    {
        match shell {
            "zsh" => Ok("/bin/zsh".into()),
            "bash" => Ok("/bin/bash".into()),
            "sh" => Ok("/bin/sh".into()),
            _ => Err("Unsupported shell".into()),
        }
    }
}
fn agent(value: Option<String>) -> Result<Option<String>, String> {
    match value.as_deref() {
        None => Ok(None),
        Some("codex") => Ok(Some("codex".into())),
        Some("claude") => Ok(Some("claude".into())),
        Some("aider") => Ok(Some("aider".into())),
        _ => Err("Unsupported agent command".into()),
    }
}

#[tauri::command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, AirState>,
    input: SpawnInput,
) -> Result<(), String> {
    valid_id(&input.id)?;
    let cwd = canonical_dir(&input.cwd)?;
    let boot = agent(input.command)?;
    if state.terminals.lock().contains_key(&input.id) {
        return Err("Session already exists".into());
    }
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: input.rows.clamp(2, 500),
            cols: input.cols.clamp(2, 500),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    let mut command = CommandBuilder::new(executable(&input.shell)?);
    command.cwd(cwd);
    if input.privacy.unwrap_or(false) {
        #[cfg(windows)]
        command.env("HISTFILE", "NUL");
        #[cfg(not(windows))]
        command.env("HISTFILE", "/dev/null");
        command.env("HISTCONTROL", "ignorespace:ignoredups");
    }
    #[cfg(not(windows))]
    command.arg("-l");
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    if let Some(boot) = boot {
        use std::io::Write;
        writer
            .write_all(format!("{boot}\r").as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    state.terminals.lock().insert(
        input.id.clone(),
        TerminalProcess {
            writer,
            child,
            master: pair.master,
        },
    );
    let event = format!("air://terminal/{}", input.id);
    let event_id = input.id;
    let handle = app;
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let _ = handle.emit(&event, String::from_utf8_lossy(&buffer[..n]).to_string());
                }
            }
        }
        let _ = handle.emit(&event, "\r\n\u{1b}[2mSession ended.\u{1b}[0m\r\n");
        handle
            .state::<AirState>()
            .terminals
            .lock()
            .remove(&event_id);
    });
    Ok(())
}
#[tauri::command]
pub fn terminal_write(state: State<'_, AirState>, id: String, data: String) -> Result<(), String> {
    valid_id(&id)?;
    if data.len() > 128 * 1024 {
        return Err("Input too large".into());
    }
    use std::io::Write;
    let mut all = state.terminals.lock();
    let process = all.get_mut(&id).ok_or("Session ended")?;
    process
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    process.writer.flush().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn terminal_resize(
    state: State<'_, AirState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    valid_id(&id)?;
    state
        .terminals
        .lock()
        .get_mut(&id)
        .ok_or("Session ended")?
        .master
        .resize(PtySize {
            rows: rows.clamp(2, 500),
            cols: cols.clamp(2, 500),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn terminal_kill(state: State<'_, AirState>, id: String) -> Result<(), String> {
    valid_id(&id)?;
    if let Some(mut process) = state.terminals.lock().remove(&id) {
        let _ = process.child.kill();
    }
    Ok(())
}
