import type { ToolCall, RiskLevel } from "./types";

// Matches the literal <tool_call>...</tool_call> XML form (the canonical format)
const TAG_RE = /<tool_call>([\s\S]*?)<\/tool_call>/;
// Defensive: also accept ```json or ```text fenced blocks containing a JSON
// object with a "tool" field (common Llama wrap pattern)
const FENCE_RE = /```(?:json|text|)\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/;
// Last resort: bare JSON object containing "tool":"run_shell" anywhere in text
const BARE_RE = /(\{[\s\S]*?"tool"\s*:\s*"run_shell"[\s\S]*?\})/;

function buildToolCall(json: any): Partial<ToolCall> | null {
  if (!json || typeof json !== "object") return null;
  if (json.tool !== "run_shell") return null;
  const risk: RiskLevel = ["low", "medium", "high"].includes(json.risk) ? json.risk : "medium";
  return {
    id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tool: "run_shell",
    command: String(json.command || "").trim(),
    reason: String(json.reason || "").trim(),
    risk,
    shell: ["powershell", "cmd", "bash"].includes(json.shell) ? json.shell : "powershell",
    timeoutSec: Number.isFinite(json.timeout_sec) ? Math.min(600, Math.max(5, json.timeout_sec)) : 60,
    approvalState: "pending",
  };
}

export function extractToolCall(text: string): { before: string; toolCall: Partial<ToolCall> | null; after: string } {
  // Try the canonical XML tag form first
  const tagMatch = text.match(TAG_RE);
  if (tagMatch) {
    try {
      const json = JSON.parse(tagMatch[1].trim());
      const tc = buildToolCall(json);
      if (tc && tc.command) {
        return {
          before: text.slice(0, tagMatch.index!),
          toolCall: tc,
          after: text.slice(tagMatch.index! + tagMatch[0].length),
        };
      }
    } catch {}
  }

  // Fallback 1: fenced code block containing a tool JSON
  const fenceMatch = text.match(FENCE_RE);
  if (fenceMatch) {
    try {
      const json = JSON.parse(fenceMatch[1].trim());
      const tc = buildToolCall(json);
      if (tc && tc.command) {
        return {
          before: text.slice(0, fenceMatch.index!),
          toolCall: tc,
          after: text.slice(fenceMatch.index! + fenceMatch[0].length),
        };
      }
    } catch {}
  }

  // Fallback 2: bare JSON in text
  const bareMatch = text.match(BARE_RE);
  if (bareMatch) {
    try {
      const json = JSON.parse(bareMatch[1].trim());
      const tc = buildToolCall(json);
      if (tc && tc.command) {
        return {
          before: text.slice(0, bareMatch.index!),
          toolCall: tc,
          after: text.slice(bareMatch.index! + bareMatch[0].length),
        };
      }
    } catch {}
  }

  return { before: text, toolCall: null, after: "" };
}

export function hasOpenToolCall(text: string): boolean {
  const openIdx = text.lastIndexOf("<tool_call>");
  if (openIdx === -1) return false;
  const closeIdx = text.lastIndexOf("</tool_call>");
  return closeIdx < openIdx;
}
