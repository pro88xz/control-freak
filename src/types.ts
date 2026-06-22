export type Role = "user" | "assistant" | "tool";

export type Attachment = {
  name: string;
  size: number;
  content: string;
  truncated: boolean;
};

export type RiskLevel = "low" | "medium" | "high";
export type ApprovalState = "pending" | "approved" | "denied" | "edited" | "executing" | "completed" | "failed";

export type ToolCall = {
  id: string;
  tool: "run_shell";
  command: string;
  reason: string;
  risk: RiskLevel;
  shell: "powershell" | "cmd" | "bash";
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

export type Session = {
  id: string;
  name: string;
  mode: SessionMode;
  messages: Msg[];
  personaId: string;
  createdAt: number;
  updatedAt: number;
};
