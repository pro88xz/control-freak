import type { ToolCall, RiskLevel, ShellKind } from "./types";

const TAG_RE = /<tool_call>([\s\S]*?)<\/tool_call>/;
const FENCE_RE = /```(?:json|text|)\s*(\{[\s\S]*?"tool"[\s\S]*?\})\s*```/;
const BARE_RE = /(\{[\s\S]*?"tool"\s*:\s*"run_shell"[\s\S]*?\})/;

const KALI_TOOLS = [
  "nmap", "masscan", "hashcat", "john", "gobuster", "ffuf", "sqlmap", "hydra",
  "metasploit", "msfconsole", "msfvenom", "nikto", "dirb", "dirsearch", "wfuzz",
  "amass", "theharvester", "recon-ng", "responder", "mitm6", "ntlmrelayx",
  "secretsdump", "smbclient", "smbmap", "enum4linux", "rpcclient", "evil-winrm",
  "kerbrute", "certipy", "ldapsearch", "dig", "whois", "traceroute", "tcpdump",
  "tshark", "volatility", "binwalk", "radare2", "ghidra", "exploitdb", "searchsploit",
  "crackmapexec", "cme", "netexec", "bloodhound-python", "impacket-", "wpscan",
];

function shouldRouteToKali(command: string): boolean {
  const firstToken = command.trim().split(/\s+/)[0]?.toLowerCase() || "";
  const tool = firstToken.replace(/^.*[\\\/]/, "").replace(/\.(exe|sh|py)$/i, "");
  return KALI_TOOLS.some(t => tool === t || tool.startsWith(t));
}

function buildToolCall(json: any): { tc: Partial<ToolCall>; corrected: boolean } | null {
  if (!json || typeof json !== "object") return null;
  if (json.tool !== "run_shell") return null;
  const risk: RiskLevel = ["low", "medium", "high"].includes(json.risk) ? json.risk : "medium";
  let shell: ShellKind = ["powershell", "cmd", "bash", "ssh-kali"].includes(json.shell) ? json.shell : "ssh-kali";
  const command = String(json.command || "").trim();

  let corrected = false;
  if (shell === "powershell" && shouldRouteToKali(command)) {
    shell = "ssh-kali";
    corrected = true;
  }

  const tc: Partial<ToolCall> = {
    id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    tool: "run_shell",
    command,
    reason: String(json.reason || "").trim(),
    risk,
    shell,
    timeoutSec: Number.isFinite(json.timeout_sec) ? Math.min(600, Math.max(5, json.timeout_sec)) : 60,
    approvalState: "pending",
  };
  return { tc, corrected };
}

// Last-resort: extract a command from prose that contains a Kali tool inside backticks.
// Only triggers if no structured tool_call was found.
function extractInlineKaliCommand(text: string): { command: string; reason: string } | null {
  // Match `tool ...` inside backticks
  const inlineRe = /`([^`\n]{3,200})`/g;
  let m: RegExpExecArray | null;
  while ((m = inlineRe.exec(text)) !== null) {
    const candidate = m[1].trim();
    if (shouldRouteToKali(candidate)) {
      // Try to find a brief reason from the surrounding text
      const ctxStart = Math.max(0, m.index - 100);
      const ctxEnd = Math.min(text.length, m.index + m[0].length + 100);
      const context = text.slice(ctxStart, ctxEnd).replace(/`[^`]*`/g, "").trim();
      const reason = context.split(/[.!?\n]/)[0].slice(0, 120).trim() || "inferred from inline code";
      return { command: candidate, reason };
    }
  }
  return null;
}

export type ExtractResult = {
  before: string;
  toolCall: Partial<ToolCall> | null;
  after: string;
  corrected: boolean;
  inferred: boolean;
};

export function extractToolCall(text: string): ExtractResult {
  // Try structured forms first
  for (const re of [TAG_RE, FENCE_RE, BARE_RE]) {
    const m = text.match(re);
    if (!m) continue;
    try {
      const json = JSON.parse(m[1].trim());
      const built = buildToolCall(json);
      if (built && built.tc.command) {
        return {
          before: text.slice(0, m.index!),
          toolCall: built.tc,
          after: text.slice(m.index! + m[0].length),
          corrected: built.corrected,
          inferred: false,
        };
      }
    } catch {}
  }

  // Last resort: inline Kali tool in backticks
  const inline = extractInlineKaliCommand(text);
  if (inline) {
    const tc: Partial<ToolCall> = {
      id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: "run_shell",
      command: inline.command,
      reason: inline.reason,
      risk: "low",
      shell: "ssh-kali",
      timeoutSec: 120,
      approvalState: "pending",
    };
    return { before: text, toolCall: tc, after: "", corrected: false, inferred: true };
  }

  return { before: text, toolCall: null, after: "", corrected: false, inferred: false };
}

export function hasOpenToolCall(text: string): boolean {
  const openIdx = text.lastIndexOf("<tool_call>");
  if (openIdx === -1) return false;
  const closeIdx = text.lastIndexOf("</tool_call>");
  return closeIdx < openIdx;
}
