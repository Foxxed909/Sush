use parking_lot::Mutex;
use portable_pty::{Child as PtyChild, MasterPty};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::PathBuf,
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use sysinfo::System;

pub const FREE_DROP_DAILY_LIMIT: u32 = 10;
pub struct TerminalProcess {
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn PtyChild + Send + Sync>,
    pub master: Box<dyn MasterPty + Send>,
}
pub struct TaskProcess {
    pub child: Arc<Mutex<Child>>,
    pub pid: u32,
}
impl TaskProcess {
    pub fn kill_tree(&self) {
        let mut child = self.child.lock();
        #[cfg(unix)]
        unsafe {
            let _ = libc::kill(-(self.pid as i32), libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &self.pid.to_string(), "/T", "/F"])
                .output();
        }
        let _ = child.kill();
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanState {
    pub plan: String,
    pub expires_at: Option<String>,
}
impl Default for PlanState {
    fn default() -> Self {
        Self {
            plan: "free".into(),
            expires_at: None,
        }
    }
}
impl PlanState {
    pub fn paid(&self) -> bool {
        if !matches!(
            self.plan.as_str(),
            "air-monthly" | "air-lifetime" | "pro" | "max"
        ) {
            return false;
        }
        match self.expires_at.as_deref() {
            Some(v) => chrono::DateTime::parse_from_rfc3339(v)
                .map(|x| x > chrono::Utc::now())
                .unwrap_or(false),
            None => self.plan == "air-lifetime",
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
struct Usage {
    day: String,
    count: u32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DropDecision {
    pub allowed: bool,
    pub remaining: Option<u32>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayWorkspace {
    pub label: String,
    pub cwd: String,
}
pub struct AirState {
    pub terminals: Mutex<HashMap<String, TerminalProcess>>,
    pub tasks: Mutex<HashMap<String, TaskProcess>>,
    pub plan: Mutex<PlanState>,
    pub pinned: AtomicBool,
    pub active: AtomicBool,
    pub shortcut: AtomicBool,
    pub tray: Mutex<Vec<TrayWorkspace>>,
    pub system: Mutex<System>,
    usage_path: Mutex<Option<PathBuf>>,
    usage_lock: Mutex<()>,
}
impl Default for AirState {
    fn default() -> Self {
        Self {
            terminals: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            plan: Mutex::new(PlanState::default()),
            pinned: AtomicBool::new(false),
            active: AtomicBool::new(false),
            shortcut: AtomicBool::new(false),
            tray: Mutex::new(Vec::new()),
            system: Mutex::new(System::new()),
            usage_path: Mutex::new(None),
            usage_lock: Mutex::new(()),
        }
    }
}
impl AirState {
    pub fn set_usage_path(&self, path: PathBuf) {
        *self.usage_path.lock() = Some(path);
    }
    pub fn shutdown(&self) {
        for (_, mut terminal) in self.terminals.lock().drain() {
            let _ = terminal.child.kill();
        }
        for (_, task) in self.tasks.lock().drain() {
            task.kill_tree();
        }
    }
    pub fn decision(&self, consume: bool) -> Result<DropDecision, String> {
        if self.plan.lock().paid() {
            return Ok(DropDecision {
                allowed: true,
                remaining: None,
            });
        }
        let _guard = self.usage_lock.lock();
        let path = self
            .usage_path
            .lock()
            .clone()
            .ok_or("Drop storage unavailable")?;
        let day = chrono::Utc::now().date_naive().to_string();
        let mut usage = fs::read_to_string(&path)
            .ok()
            .and_then(|x| serde_json::from_str::<Usage>(&x).ok())
            .filter(|x| x.day == day)
            .unwrap_or(Usage { day, count: 0 });
        if usage.count >= FREE_DROP_DAILY_LIMIT {
            return Ok(DropDecision {
                allowed: false,
                remaining: Some(0),
            });
        }
        if consume {
            usage.count += 1;
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let temp = path.with_extension(format!("tmp-{}", uuid::Uuid::new_v4()));
            fs::write(
                &temp,
                serde_json::to_vec(&usage).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            #[cfg(windows)]
            if path.exists() {
                fs::remove_file(&path).map_err(|e| e.to_string())?;
            }
            fs::rename(temp, path).map_err(|e| e.to_string())?;
        }
        Ok(DropDecision {
            allowed: true,
            remaining: Some(FREE_DROP_DAILY_LIMIT - usage.count),
        })
    }
    pub fn set_plan(&self, plan: PlanState) {
        *self.plan.lock() = plan;
    }
    pub fn set_pinned(&self, value: bool) {
        self.pinned.store(value, Ordering::Relaxed);
    }
}
