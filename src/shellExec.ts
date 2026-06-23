import type { ShellKind, SshTarget } from "./types";

type ShellResult = {
  output: string;
  exitCode: number;
  durationMs: number;
};

declare global {
  interface Window {
    __TAURI_INTERNALS__?: any;
    __TAURI__?: any;
  }
}

export async function isTauri(): Promise<boolean> {
  return typeof window !== "undefined" && (!!window.__TAURI_INTERNALS__ || !!window.__TAURI__);
}

export async function runShell(
  command: string,
  shell: ShellKind,
  timeoutSec: number,
  sshTarget: SshTarget | null
): Promise<ShellResult> {
  const start = Date.now();
  if (!(await isTauri())) {
    return {
      output: "[error] Shell execution requires the desktop build.",
      exitCode: -1,
      durationMs: Date.now() - start,
    };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result: any = await invoke("run_shell_command", {
      command,
      shell,
      timeoutSec,
      sshHost: sshTarget?.host || "",
      sshPort: sshTarget?.port || 22,
      sshUser: sshTarget?.user || "",
      sshIdentity: sshTarget?.identityFile || "",
    });
    return {
      output: String(result.output ?? ""),
      exitCode: Number(result.exit_code ?? result.exitCode ?? 0),
      durationMs: Date.now() - start,
    };
  } catch (e: any) {
    return {
      output: `[exec error] ${e?.message || String(e)}`,
      exitCode: -1,
      durationMs: Date.now() - start,
    };
  }
}

export async function testSsh(target: SshTarget): Promise<{ ok: boolean; message: string }> {
  if (!(await isTauri())) {
    return { ok: false, message: "Desktop build required to test SSH" };
  }
  try {
    const result = await runShell('echo "ssh_ok"; whoami; uname -a', "ssh-kali", 15, target);
    if (result.exitCode === 0 && result.output.includes("ssh_ok")) {
      return { ok: true, message: result.output.split("\n").slice(0, 3).join(" · ") };
    }
    return { ok: false, message: result.output.slice(0, 300) || `exit ${result.exitCode}` };
  } catch (e: any) {
    return { ok: false, message: e?.message || String(e) };
  }
}
