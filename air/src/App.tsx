import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import TerminalPane from "./components/TerminalPane";
import Inspector from "./components/Inspector";
import ApprovalDialog from "./components/ApprovalDialog";
import PlanDialog from "./components/PlanDialog";
import SyncDialog from "./components/SyncDialog";
import type {
  AgentBudget,
  AirSession,
  ApprovalRequest,
  Entitlements,
  GitPulse,
  PortOwner,
  ProjectFingerprint,
  ResourceSnapshot,
  RuntimeInfo,
  ShellProfile,
  SyncPayload,
  TaskLane,
  WorkspaceCapsule,
} from "./lib/types";
import { assessCommandRisk, redactSecrets } from "./lib/security";
import {
  appendHistory,
  incrementDropUsage,
  loadCapsules,
  loadCheckpoint,
  loadProfiles,
  readDropUsage,
  saveCapsules,
  saveCheckpoint,
} from "./lib/persistence";
import { capsuleFromSession } from "./lib/capsules";
import { createHandoff } from "./lib/handoff";
import { dropAllowance, entitlementsFor, normalizePlan } from "./lib/plans";
import {
  createWorktree,
  detectAgents,
  dropStatus,
  gitPulse,
  inspectProject,
  listPorts,
  listWorktrees,
  onContextLaunch,
  onDropLimit,
  onDropMode,
  onRuntimeError,
  onTaskEvent,
  prepareContextPack,
  removeWorktree,
  resourceSnapshot,
  runTask,
  runtimeInfo,
  setDropPinned,
  stopTask,
  toggleDrop,
  updateTrayWorkspaces,
  verifyLicenseToken,
} from "./lib/bridge";
import { watchBattery, type PowerState } from "./lib/power";
import { buildContextPack, normalizeAgentBudget } from "./lib/agents";
import { notifyCompletion } from "./lib/notifications";
import {
  closeWindow,
  minimizeWindow,
  toggleMaximizeWindow,
} from "./lib/windowControls";
import { normalizeUpdateChannel, type UpdateChannel } from "./lib/updates";
const LICENSE = "sush-air:v1:license-token",
  BUDGET = "sush-air:v1:agent-budget";
const label = (p: string) =>
  p
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() || "Terminal";
function make(
  profile: ShellProfile,
  cwd: string,
  o: Partial<AirSession> = {},
): AirSession {
  const now = Date.now();
  return {
    id: o.id || `air-${crypto.randomUUID()}`,
    label: o.label || label(cwd),
    cwd,
    shell: o.shell || profile.shell,
    profileId: o.profileId || profile.id,
    scratch: o.scratch === true,
    privacy: o.privacy === true,
    ...(o.agent ? { agent: o.agent } : {}),
    createdAt: o.createdAt || now,
    lastActiveAt: o.lastActiveAt || now,
  };
}
export default function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo>({
      tauri: false,
      platform: "unknown",
      version: "loading",
      homeDir: "",
    }),
    [profiles, setProfiles] = useState<ShellProfile[]>([]),
    [sessions, setSessions] = useState<AirSession[]>([]),
    [activeId, setActive] = useState(""),
    [tiny, setTiny] = useState(false),
    [dropMode, setDropMode] = useState(false),
    [tools, setTools] = useState(true),
    [pinned, setPinned] = useState(false),
    [remaining, setRemaining] = useState<number | null>(10),
    [entitlement, setEntitlement] = useState<Entitlements>(() =>
      entitlementsFor("free"),
    ),
    [plan, setPlan] = useState(false),
    [sync, setSync] = useState(false),
    [capsules, setCapsules] = useState<WorkspaceCapsule[]>(loadCapsules),
    [fingerprint, setFingerprint] = useState<ProjectFingerprint | null>(null),
    [git, setGit] = useState<GitPulse | null>(null),
    [ports, setPorts] = useState<PortOwner[]>([]),
    [resources, setResources] = useState<ResourceSnapshot | null>(null),
    [agents, setAgents] = useState<
      Array<{ id: string; label: string; command: string; available: boolean }>
    >([]),
    [tasks, setTasks] = useState<TaskLane[]>([]),
    [approvals, setApprovals] = useState<ApprovalRequest[]>([]),
    [power, setPower] = useState<PowerState>({
      supported: false,
      charging: true,
      level: 1,
      saver: false,
    }),
    [notice, setNotice] = useState(""),
    [worktrees, setWorktrees] = useState<Array<{ path: string; name: string }>>(
      [],
    ),
    [agentContext, setAgentContext] = useState(""),
    [pending, setPending] = useState<Record<string, string>>({}),
    [updateChannel, setUpdateChannel] = useState<UpdateChannel>(() =>
      normalizeUpdateChannel(
        localStorage.getItem("sush-air:v1:update-channel"),
      ),
    ),
    [budget, setBudget] = useState<AgentBudget>(() => {
      try {
        return normalizeAgentBudget(
          JSON.parse(localStorage.getItem(BUDGET) || "null"),
        );
      } catch {
        return normalizeAgentBudget(null);
      }
    });
  const resolvers = useRef(new Map<string, (v: boolean) => void>()),
    booted = useRef(false),
    active = useMemo(
      () => sessions.find((x) => x.id === activeId) || sessions[0],
      [sessions, activeId],
    );
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void runtimeInfo()
      .then((info) => {
        setRuntime(info);
        const p = loadProfiles(info.platform),
          restored = loadCheckpoint().filter((s) =>
            p.some((x) => x.shell === s.shell),
          ),
          next = restored.length ? restored : [make(p[0], info.homeDir)];
        setProfiles(p);
        setSessions(next);
        setActive(next[0].id);
        if (info.tauri)
          void dropStatus().then((x) => setRemaining(x.remaining));
        const token = localStorage.getItem(LICENSE);
        if (token)
          void verifyLicenseToken(token)
            .then((x) =>
              setEntitlement(
                entitlementsFor(normalizePlan(x.plan), "license", x.expiresAt),
              ),
            )
            .catch(() => localStorage.removeItem(LICENSE));
      })
      .catch((e) => setNotice(String(e)));
    void detectAgents().then(setAgents);
  }, []);
  useEffect(() => {
    let stop = () => {};
    void watchBattery(setPower).then((x) => (stop = x));
    return () => stop();
  }, []);
  useEffect(() => {
    if (!sessions.length) return;
    saveCheckpoint(sessions);
    void updateTrayWorkspaces(
      sessions
        .filter((x) => !x.scratch && !x.privacy)
        .map((x) => ({ label: x.label, cwd: x.cwd })),
    );
  }, [sessions]);
  useEffect(() => saveCapsules(capsules), [capsules]);
  useEffect(
    () => localStorage.setItem(BUDGET, JSON.stringify(budget)),
    [budget],
  );
  useEffect(() => {
    if (!active) return;
    setFingerprint(null);
    setGit(null);
    setAgentContext("");
    void inspectProject(active.cwd).then(setFingerprint);
    void gitPulse(active.cwd)
      .then(setGit)
      .catch(() => {});
    void listWorktrees(active.cwd)
      .then(setWorktrees)
      .catch(() => setWorktrees([]));
  }, [active?.cwd]);
  useEffect(() => {
    if (power.saver) return;
    const refresh = () => void resourceSnapshot().then(setResources);
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [power.saver]);
  const decide = useCallback((id: string, v: boolean) => {
      resolvers.current.get(id)?.(v);
      resolvers.current.delete(id);
      setApprovals((x) => x.filter((a) => a.id !== id));
    }, []),
    approve = useCallback(
      (
        title: string,
        action: string,
        risk: ReturnType<typeof assessCommandRisk>,
      ) => {
        const id = crypto.randomUUID(),
          request: ApprovalRequest = {
            id,
            title,
            action: redactSecrets(action),
            risk: risk.level,
            detail: risk.reasons.join(" ") || "Sensitive content detected.",
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          };
        setApprovals((x) => [...x, request]);
        return new Promise<boolean>((resolve) => {
          resolvers.current.set(id, resolve);
          setTimeout(() => decide(id, false), 60_000);
        });
      },
      [decide],
    );
  const add = useCallback(
    (o: Partial<AirSession> = {}) => {
      if (!profiles.length) return;
      const s = make(profiles[0], o.cwd || active?.cwd || runtime.homeDir, o);
      setSessions((x) => [...x, s].slice(-12));
      setActive(s.id);
      return s;
    },
    [profiles, active?.cwd, runtime.homeDir],
  );
  useEffect(() => {
    let a = () => {},
      b = () => {},
      c = () => {},
      d = () => {};
    void onContextLaunch(
      (cwd, source) =>
        void approve("Open external workspace?", cwd, {
          level: "medium",
          reasons: [`${source} requested this folder.`],
        }).then((ok) => ok && add({ cwd })),
    ).then((x) => (a = x));
    void onDropLimit(() => setPlan(true)).then((x) => (b = x));
    void onDropMode(setDropMode).then((x) => (c = x));
    void onRuntimeError(setNotice).then((x) => (d = x));
    return () => {
      a();
      b();
      c();
      d();
    };
  }, [add, approve]);
  const authorize = async (
      command: string,
      risk: ReturnType<typeof assessCommandRisk>,
    ) => risk.level === "low" || approve("Run this command?", command, risk),
    summon = async () => {
      if (runtime.tauri) {
        const x = await toggleDrop();
        setRemaining(x.remaining);
        if (!x.allowed) setPlan(true);
        return;
      }
      const x = dropAllowance(entitlement, readDropUsage());
      if (!x.allowed) setPlan(true);
      else if (!entitlement.paid) incrementDropUsage();
    },
    task = async (command: string) => {
      if (!active) return;
      const risk = assessCommandRisk(command);
      if (
        risk.level !== "low" &&
        !(await approve("Run project task?", command, risk))
      )
        return;
      const id = crypto.randomUUID(),
        lane: TaskLane = {
          id,
          label: command.split(/\s+/).slice(0, 3).join(" "),
          command,
          cwd: active.cwd,
          status: "running",
          startedAt: Date.now(),
          output: "",
        };
      setTasks((x) => [lane, ...x].slice(0, 20));
      const stop = await onTaskEvent(id, (e) => {
        setTasks((x) =>
          x.map((t) =>
            t.id === id
              ? {
                  ...t,
                  output: (t.output + (e.data || "")).slice(-20_000),
                  ...(e.kind === "done"
                    ? {
                        status: e.code === 0 ? "success" : "failed",
                        finishedAt: Date.now(),
                      }
                    : {}),
                }
              : t,
          ),
        );
        if (e.kind === "done") {
          stop();
          void notifyCompletion(lane.label, e.code === 0);
        }
      });
      await runTask(id, lane.label, command, active.cwd).catch((e) =>
        setNotice(String(e)),
      );
    };
  if (!active || !profiles.length)
    return <div className="boot">Preparing Sush Air…</div>;
  const drop = runtime.tauri
    ? { remaining }
    : dropAllowance(entitlement, readDropUsage());
  return (
    <div className="shell" data-tiny={tiny || dropMode}>
      <header className="titlebar" data-tauri-drag-region>
        <div>
          <strong>{active.label}</strong>
          <small>{active.cwd}</small>
        </div>
        {git && (
          <span className="git">
            {git.branch} {git.dirty ? `· ${git.dirty}` : ""}
          </span>
        )}
        <nav>
          <button onClick={() => void summon()}>
            Drop {drop.remaining !== null && drop.remaining}
          </button>
          <button
            data-active={pinned}
            onClick={() => {
              setPinned(!pinned);
              void setDropPinned(!pinned);
            }}
          >
            Pin
          </button>
          <button onClick={() => setTools(!tools)}>Tools</button>
          <button onClick={() => setPlan(true)}>
            {entitlement.paid ? "Air" : "Free"}
          </button>
          {runtime.tauri && (
            <>
              <button onClick={() => void minimizeWindow()}>−</button>
              <button onClick={() => void toggleMaximizeWindow()}>□</button>
              <button onClick={() => void closeWindow()}>×</button>
            </>
          )}
        </nav>
      </header>
      <main>
        <Sidebar
          sessions={sessions}
          capsules={capsules}
          activeId={active.id}
          onSelect={setActive}
          onNew={(o) => add(o)}
          onClose={(id) => setSessions((x) => x.filter((s) => s.id !== id))}
          onCapsule={(c) => add({ cwd: c.cwd, label: c.label })}
          onTiny={() => setTiny(true)}
        />
        <section className="stage">
          {sessions.map((s) => (
            <TerminalPane
              key={s.id}
              session={s}
              active={s.id === active.id}
              saver={power.saver}
              initialInput={pending[s.id]}
              onCommand={(c) => {
                if (!s.privacy && !s.scratch && !s.agent) appendHistory(c);
              }}
              authorizeCommand={authorize}
              approvePaste={(text) =>
                approve(
                  "Paste a likely secret?",
                  text.replace(/./g, "•").slice(0, 120),
                  {
                    level: "critical",
                    reasons: ["The paste resembles a credential."],
                  },
                )
              }
            />
          ))}
        </section>
        <Inspector
          open={tools && !tiny && !dropMode}
          session={active}
          fingerprint={fingerprint}
          git={git}
          ports={ports}
          resources={resources}
          tasks={tasks}
          agents={agents}
          budget={budget}
          capsules={capsules}
          worktrees={worktrees}
          approvals={approvals}
          agentContext={agentContext}
          updateChannel={updateChannel}
          onClose={() => setTools(false)}
          onInspect={() => void inspectProject(active.cwd).then(setFingerprint)}
          onPorts={() => void listPorts().then(setPorts)}
          onTask={(c) => void task(c)}
          onStop={(id) =>
            void stopTask(id).then(() =>
              setTasks((x) =>
                x.map((t) => (t.id === id ? { ...t, status: "stopped" } : t)),
              ),
            )
          }
          onAgent={(command, context) => {
            const s = add({
              agent: command,
              label:
                agents.find((x) => x.command === command)?.label || command,
            });
            if (s && context) setPending((x) => ({ ...x, [s.id]: context }));
          }}
          onBudget={(v) => setBudget(normalizeAgentBudget(v))}
          onCapsule={() =>
            setCapsules((x) => [capsuleFromSession(active), ...x].slice(0, 100))
          }
          onHandoff={() =>
            download(
              JSON.stringify(
                createHandoff(
                  active,
                  capsules.find((x) => x.cwd === active.cwd),
                ),
                null,
                2,
              ),
              "sush-air-handoff.json",
            )
          }
          onCreateWorktree={(name, branch) =>
            void approve("Create micro-worktree?", `${name} · ${branch}`, {
              level: "medium",
              reasons: ["Git will check out repository content."],
            }).then((ok) => {
              if (ok) {
                return createWorktree({ repository: active.cwd, name, branch }).then(
                  (path) => setWorktrees((x) => [...x, { path, name }]),
                )
              }
            })
          }
          onOpenWorktree={(path) => add({ cwd: path })}
          onRemoveWorktree={(path) =>
            void approve("Remove micro-worktree?", path, {
              level: "medium",
              reasons: ["Git will remove the disposable worktree."],
            }).then((ok) => {
              if (ok) {
                return removeWorktree(active.cwd, path).then(() =>
                  setWorktrees((x) => x.filter((w) => w.path !== path)),
                )
              }
            })
          }
          onPrepareContext={() =>
            void prepareContextPack(active.cwd).then((x) =>
              setAgentContext(
                buildContextPack({
                  files: x.files,
                  diff: x.diff,
                  notes: x.truncated
                    ? "Diff truncated; review before sending."
                    : "Review before sending.",
                }),
              ),
            )
          }
          onAgentContext={setAgentContext}
          onApproval={decide}
          onUpdateChannel={(channel) => {
            setUpdateChannel(channel);
            localStorage.setItem("sush-air:v1:update-channel", channel);
          }}
        />
      </main>
      {notice && (
        <button className="toast" onClick={() => setNotice("")}>
          {notice}
        </button>
      )}
      {approvals[0] && (
        <ApprovalDialog
          request={approvals[0]}
          onDecision={(v) => decide(approvals[0].id, v)}
        />
      )}{" "}
      {plan && (
        <PlanDialog
          entitlements={entitlement}
          onClose={() => setPlan(false)}
          onRedeem={async (token) => {
            const x = await verifyLicenseToken(token);
            setEntitlement(
              entitlementsFor(normalizePlan(x.plan), "license", x.expiresAt),
            );
            localStorage.setItem(LICENSE, token);
          }}
          onSync={() => {
            setPlan(false);
            setSync(true);
          }}
        />
      )}
      {sync && (
        <SyncDialog
          source={{
            preferences: { tiny },
            capsules,
            agentPreferences: {
              maxMinutes: String(budget.maxMinutes),
              maxCommands: String(budget.maxCommands),
              maxEstimatedTokens: String(budget.maxEstimatedTokens),
            },
          }}
          onApply={(p: SyncPayload) => {
            if (p.capsules) setCapsules(p.capsules);
            if (typeof p.preferences?.tiny === "boolean")
              setTiny(p.preferences.tiny);
          }}
          onClose={() => setSync(false)}
        />
      )}
    </div>
  );
}
function download(data: string, name: string) {
  const url = URL.createObjectURL(new Blob([data])),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
