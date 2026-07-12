import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { AirSession } from "../lib/types";
import { assessCommandRisk, containsLikelySecret } from "../lib/security";
import {
  killTerminal,
  onTerminalData,
  resizeTerminal,
  spawnTerminal,
  writeTerminal,
} from "../lib/bridge";
import {
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  sanitizeTerminalPaste,
} from "../lib/terminalInput";
interface Props {
  session: AirSession;
  active: boolean;
  saver: boolean;
  initialInput?: string;
  onCommand(v: string): void;
  authorizeCommand(
    v: string,
    r: ReturnType<typeof assessCommandRisk>,
  ): Promise<boolean>;
  approvePaste(v: string): Promise<boolean>;
}
export default function TerminalPane({
  session,
  active,
  saver,
  initialInput,
  onCommand,
  authorizeCommand,
  approvePaste,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    line = useRef(""),
    callbacks = useRef({ onCommand, authorizeCommand, approvePaste });
  callbacks.current = { onCommand, authorizeCommand, approvePaste };
  useEffect(() => {
    if (!host.current) return;
    const terminal = new Terminal({
        cursorBlink: !saver,
        fontFamily: "Cascadia Code, SFMono-Regular, monospace",
        fontSize: 13,
        scrollback: session.privacy ? 1000 : 5000,
        theme: {
          background: "#09090b",
          foreground: "#eeeeF2",
          cursor: "#ff6b9d",
          magenta: "#ff6b9d",
          green: "#52d6a3",
        },
      }),
      fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    fit.fit();
    let disposed = false,
      stop = () => {};
    void onTerminalData(session.id, (data) => {
      if (!disposed) terminal.write(data);
    }).then((v) => (stop = v));
    void spawnTerminal({
      id: session.id,
      cwd: session.cwd,
      shell: session.shell,
      cols: terminal.cols,
      rows: terminal.rows,
      command: session.agent,
      privacy: session.privacy || session.scratch,
    })
      .then(async () => {
        if (initialInput) {
          const reviewed = sanitizeTerminalPaste(initialInput);
          await writeTerminal(
            session.id,
            `${BRACKETED_PASTE_START}${reviewed}${BRACKETED_PASTE_END}`,
          );
        }
      })
      .catch((e) => terminal.writeln(String(e)));
    let queue = Promise.resolve();
    const input = terminal.onData((data) => {
      queue = queue.then(async () => {
        if (data === "\r") {
          const command = line.current.trim(),
            risk = assessCommandRisk(command);
          if (
            command &&
            (await callbacks.current.authorizeCommand(command, risk))
          ) {
            callbacks.current.onCommand(command);
            await writeTerminal(session.id, "\r");
          } else if (!command) await writeTerminal(session.id, "\r");
          else terminal.write("\r\n\u001b[33mCommand cancelled.\u001b[0m\r\n");
          line.current = "";
          return;
        }
        if (data === "\u007f") line.current = line.current.slice(0, -1);
        else if (data >= " ")
          line.current = (line.current + data).slice(-16000);
        if (
          containsLikelySecret(data) &&
          !(await callbacks.current.approvePaste(data))
        )
          return;
        await writeTerminal(session.id, data);
      });
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      void resizeTerminal(session.id, terminal.cols, terminal.rows);
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      input.dispose();
      stop();
      terminal.dispose();
      void killTerminal(session.id);
    };
  }, [
    session.id,
    session.cwd,
    session.shell,
    session.agent,
    session.privacy,
    session.scratch,
  ]);
  useEffect(() => {
    if (active) setTimeout(() => host.current?.focus(), 20);
  }, [active]);
  return (
    <div className="terminal-pane" data-active={active}>
      <div ref={host} className="terminal-host" />
    </div>
  );
}
