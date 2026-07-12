import { useState } from "react";
import type {
  AgentBudget,
  AirSession,
  ApprovalRequest,
  GitPulse,
  PortOwner,
  ProjectFingerprint,
  ResourceSnapshot,
  TaskLane,
  WorkspaceCapsule,
} from "../lib/types";
import { AIR_FEATURES, CAPABILITY_SUMMARY } from "../lib/features";
import { vaultGet, vaultKeys, vaultRemove, vaultSet } from "../lib/vault";
import {
  checkForUpdate,
  installPendingUpdate,
  type UpdateChannel,
} from "../lib/updates";
type Tab = "project" | "agents" | "safety" | "resources" | "features";
interface Props {
  open: boolean;
  session: AirSession;
  fingerprint: ProjectFingerprint | null;
  git: GitPulse | null;
  ports: PortOwner[];
  resources: ResourceSnapshot | null;
  tasks: TaskLane[];
  agents: Array<{
    id: string;
    label: string;
    command: string;
    available: boolean;
  }>;
  budget: AgentBudget;
  capsules: WorkspaceCapsule[];
  worktrees: Array<{ path: string; name: string }>;
  approvals: ApprovalRequest[];
  agentContext: string;
  updateChannel: UpdateChannel;
  onClose(): void;
  onInspect(): void;
  onPorts(): void;
  onTask(v: string): void;
  onStop(v: string): void;
  onAgent(v: string, context?: string): void;
  onBudget(v: AgentBudget): void;
  onCapsule(): void;
  onHandoff(): void;
  onCreateWorktree(name: string, branch: string): void;
  onOpenWorktree(path: string): void;
  onRemoveWorktree(path: string): void;
  onPrepareContext(): void;
  onAgentContext(v: string): void;
  onApproval(id: string, v: boolean): void;
  onUpdateChannel(v: UpdateChannel): void;
}
export default function Inspector(p: Props) {
  const [tab, setTab] = useState<Tab>("project");
  if (!p.open) return null;
  return (
    <aside className="inspector">
      <header>
        <b>Air tools</b>
        <button onClick={p.onClose}>×</button>
      </header>
      <nav>
        {(
          ["project", "agents", "safety", "resources", "features"] as Tab[]
        ).map((x) => (
          <button data-active={tab === x} onClick={() => setTab(x)} key={x}>
            {x}
          </button>
        ))}
      </nav>
      <div className="inspect-body">
        {tab === "project" && <Project {...p} />}{" "}
        {tab === "agents" && <Agents {...p} />}{" "}
        {tab === "safety" && <Safety privacy={p.session.privacy} />}{" "}
        {tab === "resources" && <Resources {...p} />}{" "}
        {tab === "features" && <Features />}
      </div>
    </aside>
  );
}
function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function Project(p: Props) {
  const [command, setCommand] = useState(""),
    [name, setName] = useState(""),
    [branch, setBranch] = useState("");
  return (
    <>
      <Panel title="Workspace">
        <code>{p.session.cwd}</code>
        <div className="row">
          <button onClick={p.onInspect}>Fingerprint</button>
          <button onClick={p.onCapsule}>Save capsule</button>
          <button onClick={p.onHandoff}>Handoff</button>
        </div>
        {p.fingerprint && (
          <p>
            {p.fingerprint.kind} · {p.fingerprint.markers.join(", ")}
          </p>
        )}
      </Panel>
      <Panel title="Git Pulse">
        {p.git ? (
          <p>
            {p.git.branch} · {p.git.dirty} dirty · {p.git.conflicted} conflicts
          </p>
        ) : (
          <p>Not a Git workspace.</p>
        )}
      </Panel>
      <Panel title="Dev stack & task lanes">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (command) {
              p.onTask(command);
              setCommand("");
            }
          }}
        >
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="npm run dev"
          />
          <button>Run</button>
        </form>
        {p.fingerprint?.commands.map((c) => (
          <button className="suggest" onClick={() => p.onTask(c)} key={c}>
            {c}
          </button>
        ))}
        {p.tasks.map((t) => (
          <div className="task" key={t.id}>
            <i />
            <b>{t.label}</b>
            <small>{t.status}</small>
            {t.status === "running" && (
              <button onClick={() => p.onStop(t.id)}>Stop</button>
            )}
          </div>
        ))}
      </Panel>
      <Panel title="Port Guardian">
        <button onClick={p.onPorts}>Scan local ports</button>
        {p.ports.map((x) => (
          <p key={`${x.port}-${x.pid}`}>
            :{x.port} · {x.process} · PID {x.pid}
          </p>
        ))}
      </Panel>
      <Panel title="Micro worktrees">
        <div className="row">
          <input
            disabled={p.session.privacy}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setBranch(e.target.value ? `air/${e.target.value}` : "");
            }}
            placeholder="short-name"
          />
          <input
            disabled={p.session.privacy}
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            placeholder="air/branch"
          />
          <button
            disabled={!name || !branch || p.session.privacy}
            onClick={() => {
              p.onCreateWorktree(name, branch);
              setName("");
              setBranch("");
            }}
          >
            Create
          </button>
        </div>
        {p.worktrees.map((x) => (
          <div className="row" key={x.path}>
            <b>{x.name}</b>
            <button onClick={() => p.onOpenWorktree(x.path)}>Open</button>
            <button onClick={() => p.onRemoveWorktree(x.path)}>Remove</button>
          </div>
        ))}
      </Panel>
    </>
  );
}
function Agents(p: Props) {
  return (
    <>
      <Panel title="Agent Bridge">
        {p.agents.map((a) => (
          <button
            className="agent"
            disabled={p.session.privacy || !a.available}
            onClick={() => p.onAgent(a.command)}
            key={a.id}
          >
            {a.available ? "●" : "○"} {a.label}
            <small>{a.command}</small>
          </button>
        ))}
      </Panel>
      <Panel title="Context Pack & Error-to-Agent">
        <button disabled={p.session.privacy} onClick={p.onPrepareContext}>
          Prepare Git diff + terminal context
        </button>
        <textarea
          disabled={p.session.privacy}
          value={p.agentContext}
          onChange={(e) => p.onAgentContext(e.target.value)}
          placeholder="Review before sending…"
        />
        {p.agents
          .filter((a) => a.available)
          .map((a) => (
            <button
              className="agent"
              disabled={!p.agentContext || p.session.privacy}
              onClick={() => p.onAgent(a.command, p.agentContext)}
              key={a.id}
            >
              Open in {a.label}
            </button>
          ))}
      </Panel>
      <Panel title="Budget Guard">
        {(["maxMinutes", "maxCommands", "maxEstimatedTokens"] as const).map(
          (k) => (
            <label key={k}>
              {k}
              <input
                type="number"
                value={p.budget[k]}
                onChange={(e) =>
                  p.onBudget({ ...p.budget, [k]: Number(e.target.value) })
                }
              />
            </label>
          ),
        )}
      </Panel>
      <Panel title={`Approval Inbox · ${p.approvals.length}`}>
        {p.approvals.map((a) => (
          <div className="row" key={a.id}>
            <span>
              <b>{a.title}</b>
              <small>{a.detail}</small>
            </span>
            <button onClick={() => p.onApproval(a.id, false)}>Deny</button>
            <button onClick={() => p.onApproval(a.id, true)}>Allow</button>
          </div>
        ))}
      </Panel>
    </>
  );
}
function Safety({ privacy }: { privacy: boolean }) {
  const [key, setKey] = useState(""),
    [value, setValue] = useState(""),
    [pass, setPass] = useState(""),
    [status, setStatus] = useState("");
  return (
    <>
      <Panel title="Air Vault">
        <input
          disabled={privacy}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Key"
        />
        <input
          disabled={privacy}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Secret"
        />
        <input
          disabled={privacy}
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Passphrase (12+)"
        />
        <button
          disabled={privacy || pass.length < 12 || !key || !value}
          onClick={() =>
            void vaultSet(key, value, pass)
              .then(() => {
                setValue("");
                setStatus("Stored securely.");
              })
              .catch((e) => setStatus(String(e)))
          }
        >
          Store
        </button>
        {vaultKeys().map((k) => (
          <div className="row" key={k}>
            <span>{k}</span>
            <button
              onClick={() =>
                void vaultGet(k, pass).then((v) =>
                  setStatus(v ? "Decrypts successfully." : "Empty."),
                )
              }
            >
              Check
            </button>
            <button
              onClick={() =>
                void vaultRemove(k, pass).then(() => setStatus("Removed."))
              }
            >
              Remove
            </button>
          </div>
        ))}
        <small>{status}</small>
      </Panel>
      <Panel title="Paste and command guards">
        <p>
          Likely credentials are intercepted before paste. Destructive and
          remote-execution commands require one-time approval.
        </p>
      </Panel>
      <Panel title="Capability Inspector">
        {CAPABILITY_SUMMARY.map((x) => (
          <p key={x.capability}>
            <b>{x.capability}</b> · {x.scope}
          </p>
        ))}
      </Panel>
    </>
  );
}
function Resources(p: Props) {
  const [status, setStatus] = useState(""),
    [available, setAvailable] = useState(false);
  return (
    <>
      <Panel title="Resource budget">
        <div className="metrics">
          <b>
            {p.resources?.appMemoryMb ?? 0} MB<small>memory</small>
          </b>
          <b>
            {p.resources?.appCpuPercent ?? 0}%<small>CPU</small>
          </b>
          <b>
            {p.resources?.childProcesses ?? 0}
            <small>children</small>
          </b>
        </div>
      </Panel>
      <Panel title="Signed update channel">
        <select
          value={p.updateChannel}
          onChange={(e) => p.onUpdateChannel(e.target.value as UpdateChannel)}
        >
          <option>stable</option>
          <option>beta</option>
          <option>nightly</option>
        </select>
        <div className="row">
          <button
            onClick={() =>
              void checkForUpdate(p.updateChannel)
                .then((x) => {
                  setAvailable(x.available);
                  setStatus(
                    x.available
                      ? `Update ${x.version} available.`
                      : "Up to date.",
                  );
                })
                .catch((e) => setStatus(String(e)))
            }
          >
            Check
          </button>
          {available && (
            <button
              className="primary"
              onClick={() =>
                void installPendingUpdate().catch((e) => setStatus(String(e)))
              }
            >
              Install
            </button>
          )}
        </div>
        <small>{status}</small>
      </Panel>
      <Panel title="Performance targets">
        <p>Installer &lt;35 MB</p>
        <p>Idle RAM &lt;120 MB</p>
        <p>Cold launch &lt;1 second</p>
      </Panel>
    </>
  );
}
function Features() {
  return (
    <div>
      {AIR_FEATURES.map((x) => (
        <div className="feature" key={x.id}>
          <b>{x.id}</b>
          <span>
            <strong>{x.label}</strong>
            <small>{x.description}</small>
          </span>
          <i>ready</i>
        </div>
      ))}
    </div>
  );
}
