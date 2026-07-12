use crate::state::{AirState, DropDecision, TaskProcess, TrayWorkspace};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Arc,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
fn dir(value: &str) -> Result<PathBuf, String> {
    if value.len() > 4096 || value.contains('\0') {
        return Err("Invalid folder".into());
    }
    let p = fs::canonicalize(value).map_err(|_| "Folder does not exist")?;
    if p.is_dir() {
        Ok(p)
    } else {
        Err("Not a folder".into())
    }
}
fn bounded(mut cmd: Command, limit: usize) -> Result<String, String> {
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.stdout.len() + out.stderr.len() > limit {
        return Err("Command output exceeded Air limit".into());
    }
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr)
            .chars()
            .take(500)
            .collect());
    }
    Ok(String::from_utf8_lossy(&out.stdout).into())
}
fn git(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let mut c = Command::new("git");
    c.current_dir(cwd)
        .args([
            "-c",
            "core.hooksPath=",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "diff.external=",
        ])
        .args(args);
    bounded(c, 2 * 1024 * 1024)
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    tauri: bool,
    platform: String,
    version: String,
    home_dir: String,
    drop_shortcut_available: bool,
}
#[tauri::command]
pub fn runtime_info(app: AppHandle, state: State<'_, AirState>) -> RuntimeInfo {
    RuntimeInfo {
        tauri: true,
        platform: if cfg!(windows) {
            "windows"
        } else if cfg!(target_os = "macos") {
            "macos"
        } else {
            "linux"
        }
        .into(),
        version: app.package_info().version.to_string(),
        home_dir: std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .unwrap_or_else(|_| "/".into()),
        drop_shortcut_available: state.shortcut.load(std::sync::atomic::Ordering::Relaxed),
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fingerprint {
    cwd: String,
    kind: String,
    package_manager: Option<String>,
    commands: Vec<String>,
    markers: Vec<String>,
}
#[tauri::command]
pub fn project_inspect(cwd: String) -> Result<Fingerprint, String> {
    let p = dir(&cwd)?;
    let mut markers = vec![];
    let mut commands = vec![];
    let mut kind = "Folder".to_string();
    let mut package = None;
    for (name, label) in [
        ("package.json", "Node.js"),
        ("Cargo.toml", "Rust"),
        ("pyproject.toml", "Python"),
        ("go.mod", "Go"),
        ("CMakeLists.txt", "C/C++"),
    ] {
        if p.join(name).is_file() {
            markers.push(name.into());
            if kind == "Folder" {
                kind = label.into()
            }
        }
    }
    if p.join("package.json").is_file() {
        package = Some(
            (if p.join("pnpm-lock.yaml").exists() {
                "pnpm"
            } else if p.join("yarn.lock").exists() {
                "yarn"
            } else {
                "npm"
            })
            .into(),
        );
        commands = vec![
            format!("{} run dev", package.as_ref().unwrap()),
            format!("{} test", package.as_ref().unwrap()),
        ]
    } else if p.join("Cargo.toml").exists() {
        commands = vec!["cargo run".into(), "cargo test".into()]
    } else if p.join("pyproject.toml").exists() {
        commands = vec!["python -m pytest".into()]
    }
    Ok(Fingerprint {
        cwd: p.to_string_lossy().into(),
        kind,
        package_manager: package,
        commands,
        markers,
    })
}
#[derive(Serialize)]
pub struct GitPulse {
    branch: String,
    dirty: u32,
    staged: u32,
    ahead: u32,
    behind: u32,
    conflicted: u32,
}
#[tauri::command]
pub fn git_pulse(cwd: String) -> Result<GitPulse, String> {
    let p = dir(&cwd)?;
    let branch = git(&p, ["branch", "--show-current"].as_ref())?
        .trim()
        .chars()
        .take(160)
        .collect();
    let status = git(&p, ["status", "--porcelain=v1", "--branch"].as_ref())?;
    let mut dirty = 0;
    let mut staged = 0;
    let mut conflicts = 0;
    let mut ahead = 0;
    let mut behind = 0;
    for line in status.lines() {
        if line.starts_with("##") {
            if let Some(x) = Regex::new(r"ahead (\d+)").unwrap().captures(line) {
                ahead = x[1].parse().unwrap_or(0)
            }
            if let Some(x) = Regex::new(r"behind (\d+)").unwrap().captures(line) {
                behind = x[1].parse().unwrap_or(0)
            }
            continue;
        }
        let b = line.as_bytes();
        if b.len() >= 2 {
            if b[0] != b' ' {
                staged += 1
            }
            if b[1] != b' ' {
                dirty += 1
            }
            if matches!(&line[..2], "UU" | "AA" | "DD" | "AU" | "UA" | "DU" | "UD") {
                conflicts += 1
            }
        }
    }
    Ok(GitPulse {
        branch,
        dirty,
        staged,
        ahead,
        behind,
        conflicted: conflicts,
    })
}
#[derive(Serialize)]
pub struct PortOwner {
    port: u16,
    pid: u32,
    process: String,
    address: String,
}
#[tauri::command]
pub fn port_list() -> Result<Vec<PortOwner>, String> {
    #[cfg(windows)]
    let (mut c, needle) = (Command::new("netstat"), "LISTENING");
    #[cfg(not(windows))]
    let (mut c, needle) = (Command::new("lsof"), "LISTEN");
    #[cfg(windows)]
    {
        c.args(["-ano", "-p", "TCP"]);
    }
    #[cfg(not(windows))]
    {
        c.args(["-nP", "-iTCP", "-sTCP:LISTEN"]);
    }
    let raw = bounded(c, 1024 * 1024)?;
    let mut out = vec![];
    for line in raw.lines().filter(|x| x.contains(needle)).take(100) {
        let parts: Vec<_> = line.split_whitespace().collect();
        #[cfg(windows)]
        let (address, pid, process) = (
            parts.get(1).copied().unwrap_or(""),
            parts.get(4).and_then(|x| x.parse().ok()).unwrap_or(0),
            "process",
        );
        #[cfg(not(windows))]
        let (address, pid, process) = (
            parts.get(8).copied().unwrap_or(""),
            parts.get(1).and_then(|x| x.parse().ok()).unwrap_or(0),
            parts.first().copied().unwrap_or("process"),
        );
        if let Some(port) = address
            .rsplit(':')
            .next()
            .and_then(|x| x.trim_matches(|c| c == '(' || c == ')').parse().ok())
        {
            out.push(PortOwner {
                port,
                pid,
                process: process.chars().take(100).collect(),
                address: address.chars().take(200).collect(),
            })
        }
    }
    Ok(out)
}
#[derive(Deserialize)]
pub struct TaskInput {
    id: String,
    label: String,
    command: String,
    cwd: String,
}
#[derive(Serialize, Clone)]
pub struct TaskEvent {
    kind: String,
    data: Option<String>,
    code: Option<i32>,
}
fn safe_task(v: &str) -> bool {
    v.len()<=16_000&&!Regex::new(r"(?i)(?:curl|wget|invoke-webrequest)[^\n]*(?:\||;|&&)\s*(?:sh|bash|zsh|pwsh|powershell)|(?:^|[;&|]\s*)(?:mkfs|diskpart|shutdown|reboot)").unwrap().is_match(v)
}
fn stream_task<R: Read + Send + 'static>(stream: Option<R>, app: &AppHandle, event: String) {
    if let Some(stream) = stream {
        let handle = app.clone();
        thread::spawn(move || {
            let mut total = 0;
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                total += line.len();
                if total > 2 * 1024 * 1024 {
                    break;
                }
                let _ = handle.emit(
                    &event,
                    TaskEvent {
                        kind: "output".into(),
                        data: Some(format!("{line}\n")),
                        code: None,
                    },
                );
            }
        });
    }
}
#[tauri::command]
pub fn task_run(
    app: AppHandle,
    state: State<'_, AirState>,
    input: TaskInput,
) -> Result<(), String> {
    if !Regex::new(r"^[A-Za-z0-9_-]{8,80}$")
        .unwrap()
        .is_match(&input.id)
        || !safe_task(&input.command)
    {
        return Err("Task refused by native guard".into());
    }
    let cwd = dir(&input.cwd)?;
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("cmd");
        c.args(["/d", "/s", "/c", &input.command]);
        c
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut c = Command::new("/bin/sh");
        c.args(["-lc", &input.command]);
        c
    };
    command
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    unsafe {
        use std::os::unix::process::CommandExt;
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();
    let shared = Arc::new(parking_lot::Mutex::new(child));
    state.tasks.lock().insert(
        input.id.clone(),
        TaskProcess {
            child: shared.clone(),
            pid,
        },
    );
    stream_task(stdout, &app, format!("air://task/{}", input.id));
    stream_task(stderr, &app, format!("air://task/{}", input.id));
    let handle = app.clone();
    let event = format!("air://task/{}", input.id);
    let id = input.id;
    thread::spawn(move || {
        let code = loop {
            if let Ok(Some(status)) = shared.lock().try_wait() {
                break status.code().unwrap_or(-1);
            }
            thread::sleep(Duration::from_millis(100))
        };
        handle.state::<AirState>().tasks.lock().remove(&id);
        let _ = handle.emit(
            &event,
            TaskEvent {
                kind: "done".into(),
                data: None,
                code: Some(code),
            },
        );
    });
    Ok(())
}
#[tauri::command]
pub fn task_stop(state: State<'_, AirState>, id: String) -> Result<(), String> {
    if let Some(task) = state.tasks.lock().remove(&id) {
        task.kill_tree()
    }
    Ok(())
}
#[derive(Deserialize)]
pub struct WorktreeInput {
    repository: String,
    name: String,
    branch: String,
}
fn worktree_root(repo: &Path) -> Result<PathBuf, String> {
    let root = repo.join(".sush-worktrees");
    if let Ok(meta) = fs::symlink_metadata(&root) {
        if meta.file_type().is_symlink() {
            return Err("Worktree root cannot be a symlink".into());
        }
    } else {
        fs::create_dir_all(&root).map_err(|e| e.to_string())?
    }
    fs::canonicalize(root).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn worktree_create(input: WorktreeInput) -> Result<String, String> {
    let repo = dir(&input.repository)?;
    if !Regex::new(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,47}$")
        .unwrap()
        .is_match(&input.name)
        || !Regex::new(r"^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$")
            .unwrap()
            .is_match(&input.branch)
        || input.branch.contains("..")
        || input.branch.ends_with('/')
    {
        return Err("Invalid worktree name or branch".into());
    }
    let root = worktree_root(&repo)?;
    let target = root.join(&input.name);
    if target.exists() {
        return Err("Worktree already exists".into());
    }
    git(
        &repo,
        [
            "worktree",
            "add",
            "-b",
            &input.branch,
            target.to_str().ok_or("Invalid path")?,
        ]
        .as_ref(),
    )?;
    let canonical = fs::canonicalize(&target).map_err(|e| e.to_string())?;
    if !canonical.starts_with(&root) {
        return Err("Worktree escaped its root".into());
    }
    Ok(canonical.to_string_lossy().into())
}
#[tauri::command]
pub fn worktree_remove(repository: String, path: String) -> Result<(), String> {
    let repo = dir(&repository)?;
    let root = worktree_root(&repo)?;
    let target = fs::canonicalize(path).map_err(|_| "Worktree does not exist")?;
    if target == root || !target.starts_with(&root) {
        return Err("Refusing to remove outside Air worktree root".into());
    }
    git(
        &repo,
        ["worktree", "remove", target.to_str().ok_or("Invalid path")?].as_ref(),
    )?;
    Ok(())
}
#[derive(Serialize)]
pub struct Worktree {
    path: String,
    name: String,
}
#[tauri::command]
pub fn worktree_list(repository: String) -> Result<Vec<Worktree>, String> {
    let repo = dir(&repository)?;
    let root = worktree_root(&repo)?;
    let raw = git(&repo, ["worktree", "list", "--porcelain"].as_ref())?;
    Ok(raw
        .lines()
        .filter_map(|x| x.strip_prefix("worktree "))
        .filter_map(|x| fs::canonicalize(x).ok())
        .filter(|x| x.starts_with(&root))
        .take(50)
        .map(|x| Worktree {
            path: x.to_string_lossy().into(),
            name: x.file_name().unwrap_or_default().to_string_lossy().into(),
        })
        .collect())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    app_memory_mb: u64,
    app_cpu_percent: f32,
    child_processes: usize,
    active_sessions: usize,
    captured_at: i64,
}
#[tauri::command]
pub fn resource_snapshot(state: State<'_, AirState>) -> ResourceSnapshot {
    let mut system = state.system.lock();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let pid = sysinfo::Pid::from_u32(std::process::id());
    let p = system.process(pid);
    ResourceSnapshot {
        app_memory_mb: p.map(|x| x.memory() / 1024 / 1024).unwrap_or(0),
        app_cpu_percent: p.map(|x| x.cpu_usage()).unwrap_or(0.0),
        child_processes: state.tasks.lock().len(),
        active_sessions: state.terminals.lock().len(),
        captured_at: chrono::Utc::now().timestamp_millis(),
    }
}
#[derive(Serialize)]
pub struct PowerStatus {
    supported: bool,
    charging: bool,
    level: f32,
}
#[tauri::command]
pub fn power_status() -> PowerStatus {
    PowerStatus {
        supported: false,
        charging: true,
        level: 1.0,
    }
}
#[derive(Serialize)]
pub struct Agent {
    id: String,
    label: String,
    command: String,
    available: bool,
}
#[tauri::command]
pub fn agent_detect() -> Vec<Agent> {
    [
        ("codex", "Codex"),
        ("claude", "Claude Code"),
        ("aider", "Aider"),
    ]
    .into_iter()
    .map(|(id, label)| Agent {
        id: id.into(),
        label: label.into(),
        command: id.into(),
        available: which::which(id).is_ok(),
    })
    .collect()
}
#[derive(Serialize)]
pub struct ContextPack {
    files: Vec<String>,
    diff: String,
    truncated: bool,
}
#[tauri::command]
pub fn context_pack(cwd: String) -> Result<ContextPack, String> {
    let repo = dir(&cwd)?;
    let files = git(&repo, ["diff", "--name-only", "--no-ext-diff"].as_ref())
        .unwrap_or_default()
        .lines()
        .take(50)
        .map(|x| x.chars().take(300).collect())
        .collect();
    let mut diff = git(&repo, ["diff", "--no-ext-diff", "--no-color"].as_ref()).unwrap_or_default();
    let truncated = diff.len() > 30_000;
    if truncated {
        diff.truncate(30_000)
    }
    Ok(ContextPack {
        files,
        diff,
        truncated,
    })
}
#[tauri::command]
pub fn drop_status(state: State<'_, AirState>) -> Result<DropDecision, String> {
    state.decision(false)
}
#[tauri::command]
pub fn drop_toggle(app: AppHandle) -> Result<DropDecision, String> {
    toggle_drop_enforced(&app)
}
pub fn toggle_drop_enforced(app: &AppHandle) -> Result<DropDecision, String> {
    let state = app.state::<AirState>();
    let window = app.get_webview_window("main").ok_or("Window unavailable")?;
    if window.is_visible().map_err(|e| e.to_string())? {
        window.hide().map_err(|e| e.to_string())?;
        state
            .active
            .store(false, std::sync::atomic::Ordering::Relaxed);
        let _ = app.emit("air://drop-mode", false);
        return state.decision(false);
    }
    let decision = state.decision(true)?;
    if !decision.allowed {
        return Ok(decision);
    }
    window.set_always_on_top(true).map_err(|e| e.to_string())?;
    window
        .set_size(tauri::LogicalSize::new(760.0, 460.0))
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    state
        .active
        .store(true, std::sync::atomic::Ordering::Relaxed);
    let _ = app.emit("air://drop-mode", true);
    Ok(decision)
}
#[tauri::command]
pub fn drop_set_pinned(state: State<'_, AirState>, pinned: bool) {
    state.set_pinned(pinned)
}
#[tauri::command]
pub fn tray_set_workspaces(
    app: AppHandle,
    state: State<'_, AirState>,
    workspaces: Vec<TrayWorkspace>,
) -> Result<(), String> {
    let accepted: Vec<_> = workspaces
        .into_iter()
        .take(8)
        .filter_map(|mut x| {
            dir(&x.cwd).ok().map(|p| {
                x.cwd = p.to_string_lossy().into();
                x.label = x.label.chars().take(60).collect();
                x
            })
        })
        .collect();
    let mut menu = tauri::menu::MenuBuilder::new(&app)
        .text("show", "Show Sush Air")
        .separator();
    for (index, workspace) in accepted.iter().enumerate() {
        menu = menu.text(format!("workspace-{index}"), workspace.label.clone());
    }
    let built = menu
        .separator()
        .text("quit", "Quit")
        .build()
        .map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(built)).map_err(|e| e.to_string())?;
    }
    *state.tray.lock() = accepted;
    Ok(())
}
