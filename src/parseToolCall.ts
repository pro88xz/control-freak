import type { ToolCall, RiskLevel } from "./types";

const TOOL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/;

export function extractToolCall(text: string): { before: string; toolCall: Partial<ToolCall> | null; after: string } {
  const m = text.match(TOOL_RE);
  if (!m) return { before: text, toolCall: null, after: "" };
  const before = text.slice(0, m.index!);
  const after = text.slice(m.index! + m[0].length);
  try {
    const json = JSON.parse(m[1].trim());
    const risk: RiskLevel = ["low", "medium", "high"].includes(json.risk) ? json.risk : "medium";
    const tc: Partial<ToolCall> = {
      id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: "run_shell",
      command: String(json.command || "").trim(),
      reason: String(json.reason || "").trim(),
      risk,
      shell: ["powershell", "cmd", "bash"].includes(json.shell) ? json.shell : "powershell",
      timeoutSec: Number.isFinite(json.timeout_sec) ? Math.min(600, Math.max(5, json.timeout_sec)) : 60,
      approvalState: "pending",
    };
    return { before, toolCall: tc, after };
  } catch {
    return { before: text, toolCall: null, after: "" };
  }
}

export function hasOpenToolCall(text: string): boolean {
  const openIdx = text.lastIndexOf("<tool_call>");
  if (openIdx === -1) return false;
  const closeIdx = text.lastIndexOf("</tool_call>");
  return closeIdx < openIdx;
}
