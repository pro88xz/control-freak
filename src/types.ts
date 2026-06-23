export type Role = "user" | "assistant" | "tool";

export type Attachment = {
  name: string;
  size: number;
  content: string;
  truncated: boolean;
};

export type RiskLevel = "low" | "medium" | "high";
export type ApprovalState = "pending" | "approved" | "denied" | "edited" | "executing" | "completed" | "failed";

export type ShellKind = "powershell" | "cmd" | "bash" | "ssh-kali";

export type ToolCall = {
  id: string;
  tool: "run_shell";
  command: string;
  reason: string;
  risk: RiskLevel;
  shell: ShellKind;
  workingDir?: string;
  timeoutSec: number;
  approvalState: ApprovalState;
  editedCommand?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
};

export type Msg = {
  role: Role;
  content: string;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
};

export type SessionMode = "chat" | "agent";

export type Persona = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  builtin: boolean;
};

export type SshTarget = {
  host: string;
  port: number;
  user: string;
  // Path to private key file. If empty, defaults to system default (~/.ssh/id_ed25519 etc).
  identityFile: string;
  // Friendly label shown in UI
  label: string;
};

export type Session = {
  id: string;
  name: string;
  mode: SessionMode;
  messages: Msg[];
  personaId: string;
  createdAt: number;
  updatedAt: number;
};

export type AppSettings = {
  sshTarget: SshTarget;
};
