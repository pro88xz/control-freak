// Shell execution adapter. In Tauri it calls the Rust backend.
// In a plain browser (Codespaces preview), it returns a clear error.

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
  shell: "powershell" | "cmd" | "bash",
  timeoutSec: number
): Promise<ShellResult> {
  const start = Date.now();
  if (!(await isTauri())) {
    return {
      output: "[error] Shell execution requires the desktop build. In browser preview, agent mode is read-only.\nRun this app via 'npm run tauri dev' on your operator machine.",
      exitCode: -1,
      durationMs: Date.now() - start,
    };
  }

  try {
    // Lazy import so the browser preview doesn't choke
    const { invoke } = await import("@tauri-apps/api/core");
    const result: any = await invoke("run_shell_command", {
      command,
      shell,
      timeoutSec,
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
