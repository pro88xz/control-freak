import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Msg, Attachment, Persona, ToolCall, SessionMode } from "./types";
import { extractToolCall } from "./parseToolCall";
import { AGENT_TOOL_SPEC } from "./agentPrompt";
import { runShell, isTauri } from "./shellExec";
import ToolCallCard from "./ToolCallCard";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MAX_FULL = 50 * 1024;
const MAX_AGENT_ITERATIONS = 12;
const ACCEPT = ".txt,.xml,.json,.csv,.log,.py,.sh,.ps1,.md,.html,.conf,.yaml,.yml,.ini,.toml,.js,.ts,.tsx,.jsx,.css,.sql,.rb,.go,.rs,.c,.cpp,.h,.java,.php,.env,text/*";

function CodeBlock({ language, value }: { language: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language || "text"}</span>
        <button className="code-copy" onClick={copy}>{copied ? "✓ copied" : "copy"}</button>
      </div>
      <SyntaxHighlighter language={language || "text"} style={atomDark}
        customStyle={{ margin: 0, padding: "14px 16px", background: "#08080a", fontSize: "12.5px", fontFamily: "JetBrains Mono, Fira Code, monospace", borderRadius: 0 }} wrapLongLines>
        {value.replace(/\n$/, "")}
      </SyntaxHighlighter>
    </div>
  );
}

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const value = String(children).replace(/\n$/, "");
        if (!inline && (match || value.includes("\n"))) return <CodeBlock language={match ? match[1] : ""} value={value} />;
        return <code className="inline-code" {...props}>{children}</code>;
      },
      a({ children, ...props }: any) {
        return <a target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
      },
    }}>{content}</ReactMarkdown>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAttachmentBlock(atts: Attachment[]): string {
  return atts.map(a => {
    const header = a.truncated ? `[FILE: ${a.name} | ${formatBytes(a.size)} | TRUNCATED to first 50KB]` : `[FILE: ${a.name} | ${formatBytes(a.size)}]`;
    return `${header}\n\`\`\`\n${a.content}\n\`\`\``;
  }).join("\n\n");
}

function buildToolResultBlock(tc: ToolCall): string {
  const cmd = tc.editedCommand || tc.command;
  if (tc.approvalState === "denied") {
    return `[TOOL_RESULT: ${tc.id}]\ncommand: ${cmd}\nstatus: DENIED by operator. Do not retry the same command. Adjust your plan.\n[/TOOL_RESULT]`;
  }
  const truncated = (tc.output || "").length > 4000 ? `${(tc.output || "").slice(0, 4000)}\n...(truncated, total ${(tc.output || "").length} chars)` : (tc.output || "");
  return `[TOOL_RESULT: ${tc.id}]\ncommand: ${cmd}\nexit_code: ${tc.exitCode}\nduration_ms: ${tc.durationMs}\noutput:\n${truncated}\n[/TOOL_RESULT]`;
}

function trimHistoryForApi(history: import("./types").Msg[]): import("./types").Msg[] {
  // Keep last ~12 messages. Tool outputs balloon TPM fast on free tier.
  if (history.length <= 12) return history;
  const tail = history.slice(-10);
  const head = history.slice(0, history.length - 10);
  const summary: import("./types").Msg = {
    role: "user",
    content: `[CONTEXT SUMMARY] Earlier in this session: ${head.length} messages (${head.filter(m => m.role === "user").length} operator inputs, ${head.filter(m => m.role === "assistant").length} agent responses, ${head.filter(m => m.role === "tool").length} tool results). Continuing from there.`,
  };
  return [summary, ...tail];
}

type Props = {
  messages: Msg[];
  onMessagesChange: (msgs: Msg[]) => void;
  sessionName: string;
  sessionMode: SessionMode;
  persona: Persona;
  sshTarget: import("./types").SshTarget;
  onOpenPersonas: () => void;
  onOpenSettings: () => void;
  onToggleMode: () => void;
};

export default function Chat({ messages, onMessagesChange, sessionName, sessionMode, persona, sshTarget, onOpenPersonas, onOpenSettings, onToggleMode }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([]);
  const [tauriDetected, setTauriDetected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoScrollRef = useRef(true);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => { isTauri().then(setTauriDetected); }, []);

  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTo(0, scrollRef.current.scrollHeight);
    }
  }, [messages]);

  const onScroll = () => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScrollRef.current = atBottom;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = [];
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const truncated = text.length > MAX_FULL;
        next.push({ name: file.name, size: file.size, content: truncated ? text.slice(0, MAX_FULL) : text, truncated });
      } catch {
        next.push({ name: file.name, size: file.size, content: "[binary or unreadable file]", truncated: false });
      }
    }
    setPendingAtts(prev => [...prev, ...next]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => { setPendingAtts(prev => prev.filter((_, i) => i !== idx)); };

  function buildApiMessages(historyRaw: Msg[]): { role: string; content: string }[] {
    const history = trimHistoryForApi(historyRaw);
    const sysPrompt = sessionMode === "agent"
      ? `${persona.systemPrompt}\n\n--- AGENT MODE ACTIVE ---\n${AGENT_TOOL_SPEC}`
      : persona.systemPrompt;
    const apiMsgs: { role: string; content: string }[] = [{ role: "system", content: sysPrompt }];
    for (const m of history) {
      if (m.role === "user") {
        const att = m.attachments && m.attachments.length > 0 ? `\n\n${buildAttachmentBlock(m.attachments)}` : "";
        apiMsgs.push({ role: "user", content: `${m.content}${att}`.trim() });
      } else if (m.role === "assistant") {
        let content = m.content || "";
        if (m.toolCalls && m.toolCalls.length > 0) {
          content += "\n\n" + m.toolCalls.map(tc => `<tool_call>\n${JSON.stringify({ tool: tc.tool, command: tc.editedCommand || tc.command, reason: tc.reason, risk: tc.risk, shell: tc.shell, timeout_sec: tc.timeoutSec }, null, 2)}\n</tool_call>`).join("\n\n");
        }
        apiMsgs.push({ role: "assistant", content });
      } else if (m.role === "tool") {
        apiMsgs.push({ role: "user", content: m.content });
      }
    }
    return apiMsgs;
  }

  async function streamOnce(history: Msg[]): Promise<{ text: string; toolCall: ToolCall | null }> {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: buildApiMessages(history), stream: true, temperature: 0.4, max_tokens: 4096 }),
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        let waitMsg = "";
        try {
          const errJson = JSON.parse(errText);
          const msg = errJson?.error?.message || "";
          const m = msg.match(/try again in ([\d.]+)s/);
          if (m) waitMsg = ` Wait ${Math.ceil(parseFloat(m[1]))}s then retry.`;
        } catch {}
        throw new Error(`[rate limit] Groq free tier TPM exceeded.${waitMsg} Either wait, upgrade to Dev tier, or switch model.`);
      }
      throw new Error(`Groq ${res.status}: ${errText}`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let assistantText = "";
    let lastEmittedVisible = "";

    const placeholderIdx = history.length;
    onMessagesChange([...history, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            assistantText += delta;
            const visible = assistantText
              .replace(/<think>[\s\S]*?<\/think>/g, "")
              .replace(/<think>[\s\S]*$/g, "")
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
              .replace(/<tool_call>[\s\S]*$/g, "")
              .replace(/```(?:json|text|)\s*\{[\s\S]*?"tool"[\s\S]*?\}\s*```/g, "")
              .trim();
            if (visible !== lastEmittedVisible) {
              lastEmittedVisible = visible;
              const updated = [...history];
              updated[placeholderIdx] = { role: "assistant", content: visible };
              onMessagesChange(updated);
            }
          }
        } catch {}
      }
    }

    const cleanedThink = assistantText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const { before, toolCall } = extractToolCall(cleanedThink);
    const finalVisible = before.trim();

    let parsedTC: ToolCall | null = null;
    if (toolCall && toolCall.command) {
      parsedTC = {
        id: toolCall.id!,
        tool: "run_shell",
        command: toolCall.command!,
        reason: toolCall.reason || "",
        risk: toolCall.risk || "medium",
        shell: toolCall.shell || "powershell",
        timeoutSec: toolCall.timeoutSec || 60,
        approvalState: "pending",
      };
    }

    return { text: finalVisible, toolCall: parsedTC };
  }

  const send = async () => {
    const text = input.trim();
    if ((!text && pendingAtts.length === 0) || streaming) return;
    if (!API_KEY) {
      onMessagesChange([...messages, { role: "user", content: text }, { role: "assistant", content: "[error] VITE_GROQ_API_KEY missing in .env.local — set it and restart." }]);
      setInput(""); return;
    }

    const userMsg: Msg = { role: "user", content: text, attachments: pendingAtts.length > 0 ? pendingAtts : undefined };
    let history: Msg[] = [...messages, userMsg];
    onMessagesChange(history);
    setInput("");
    setPendingAtts([]);
    setStreaming(true);
    autoScrollRef.current = true;

    try {
      const { text: replyText, toolCall } = await streamOnce(history);
      const assistantMsg: Msg = { role: "assistant", content: replyText, toolCalls: toolCall ? [toolCall] : undefined };
      history = [...history, assistantMsg];
      onMessagesChange(history);
    } catch (e: any) {
      onMessagesChange([...messagesRef.current.slice(0, -1), { role: "assistant", content: `[error] ${e.message}` }]);
    } finally {
      setStreaming(false);
    }
  };

  async function executeToolCall(messageIdx: number, toolCallId: string, editedCommand?: string) {
    const current = messagesRef.current;
    const msg = current[messageIdx];
    if (!msg || !msg.toolCalls) return;
    const tcIdx = msg.toolCalls.findIndex(t => t.id === toolCallId);
    if (tcIdx === -1) return;

    const updateTC = (patch: Partial<ToolCall>) => {
      const fresh = [...messagesRef.current];
      const m = { ...fresh[messageIdx] };
      if (!m.toolCalls) return;
      const newTcs = [...m.toolCalls];
      newTcs[tcIdx] = { ...newTcs[tcIdx], ...patch };
      m.toolCalls = newTcs;
      fresh[messageIdx] = m;
      onMessagesChange(fresh);
    };

    updateTC({ approvalState: "executing", editedCommand: editedCommand || undefined, startedAt: Date.now() });

    const tc = msg.toolCalls[tcIdx];
    const cmd = editedCommand || tc.command;
    const result = await runShell(cmd, tc.shell, tc.timeoutSec, sshTarget);

    updateTC({
      approvalState: result.exitCode === 0 ? "completed" : "failed",
      output: result.output,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      completedAt: Date.now(),
    });

    // After execution, feed result back to model for next step
    const updatedAfter = messagesRef.current;
    const finalTC = updatedAfter[messageIdx].toolCalls![tcIdx];
    const toolResultMsg: Msg = { role: "tool", content: buildToolResultBlock(finalTC) };
    let history: Msg[] = [...updatedAfter, toolResultMsg];
    onMessagesChange(history);

    // Continue the agent loop (up to N iterations to prevent runaway)
    setStreaming(true);
    try {
      let iterations = 0;
      while (iterations < MAX_AGENT_ITERATIONS) {
        iterations++;
        const { text: replyText, toolCall: nextTC } = await streamOnce(history);
        const assistantMsg: Msg = { role: "assistant", content: replyText, toolCalls: nextTC ? [nextTC] : undefined };
        history = [...history, assistantMsg];
        onMessagesChange(history);
        if (!nextTC) break; // model is done or asking operator
        break; // wait for operator approval on next call (don't auto-run)
      }
    } catch (e: any) {
      onMessagesChange([...messagesRef.current, { role: "assistant", content: `[error] ${e.message}` }]);
    } finally {
      setStreaming(false);
    }
  }

  const approveCall = (messageIdx: number) => (toolCallId: string, editedCommand?: string) => {
    executeToolCall(messageIdx, toolCallId, editedCommand);
  };

  const denyCall = (messageIdx: number) => (toolCallId: string) => {
    const current = messagesRef.current;
    const msg = current[messageIdx];
    if (!msg || !msg.toolCalls) return;
    const tcIdx = msg.toolCalls.findIndex(t => t.id === toolCallId);
    if (tcIdx === -1) return;

    const fresh = [...current];
    const m = { ...fresh[messageIdx] };
    const newTcs = [...m.toolCalls!];
    newTcs[tcIdx] = { ...newTcs[tcIdx], approvalState: "denied" };
    m.toolCalls = newTcs;
    fresh[messageIdx] = m;

    // Tell the model it was denied so it adjusts
    const deniedTC = newTcs[tcIdx];
    const toolResultMsg: Msg = { role: "tool", content: buildToolResultBlock(deniedTC) };
    const history: Msg[] = [...fresh, toolResultMsg];
    onMessagesChange(history);

    setStreaming(true);
    streamOnce(history)
      .then(({ text: replyText, toolCall: nextTC }) => {
        const assistantMsg: Msg = { role: "assistant", content: replyText, toolCalls: nextTC ? [nextTC] : undefined };
        onMessagesChange([...history, assistantMsg]);
      })
      .catch((e: any) => onMessagesChange([...history, { role: "assistant", content: `[error] ${e.message}` }]))
      .finally(() => setStreaming(false));
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  const agentBanner = sessionMode === "agent" && !tauriDetected ? (
    <div className="agent-warn">
      ⚠ AGENT MODE requires the desktop build. In browser preview, the agent can propose commands but cannot execute them.
    </div>
  ) : null;

  return (
    <div className="chat" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="chat-head">
        <span className="chat-session-name">{sessionName}</span>
        <button
          className={`mode-pill mode-${sessionMode}`}
          onClick={onToggleMode}
          title={sessionMode === "agent" ? "Switch to chat mode" : "Switch to agent mode"}
        >
          {sessionMode === "agent" ? "● AGENT" : "● CHAT"}
        </button>
        <button className="persona-pill" onClick={onOpenPersonas} title="Change persona">
          <span className="pill-dot">●</span> {persona.name}
        </button>
        <button className="settings-cog" onClick={onOpenSettings} title="Settings (SSH target, etc)">
          ⚙
        </button>
        <span className="chat-status">{streaming ? "● transmitting" : "● standby"}</span>
      </div>

      {agentBanner}

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="empty">
            <div className="empty-title">CONTROL FREAK ONLINE</div>
            <div className="empty-sub">Brain: Llama 3.3 70B · Mode: {sessionMode.toUpperCase()} · Persona: {persona.name}{sessionMode === "agent" ? ` · Ops: ${sshTarget.label}` : ""}</div>
            <div className="empty-prompt">
              {sessionMode === "agent" ? "State the objective. Agent will plan and propose commands." : "State the objective. Drop files anywhere."}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.role === "tool") return null; // tool results are not shown directly (they're in the toolCall card)
          return (
            <div key={i} className={`msg msg-${m.role}`}>
              <div className="role">{m.role === "user" ? "OPERATOR" : "CONTROL FREAK"}</div>
              <div className="content">
                {m.role === "user" ? (
                  <>
                    {m.content && <pre className="user-text">{m.content}</pre>}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="att-list">
                        {m.attachments.map((a, j) => (
                          <div key={j} className="att-chip">
                            <span className="att-icon">▤</span>
                            <span className="att-name">{a.name}</span>
                            <span className="att-size">{formatBytes(a.size)}{a.truncated ? " · truncated" : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {m.content && <Markdown content={m.content} />}
                    {m.toolCalls && m.toolCalls.map((tc) => (
                      <ToolCallCard
                        key={tc.id}
                        toolCall={tc}
                        onApprove={approveCall(i)}
                        onDeny={denyCall(i)}
                      />
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pendingAtts.length > 0 && (
        <div className="pending-atts">
          {pendingAtts.map((a, i) => (
            <div key={i} className="att-chip pending">
              <span className="att-icon">▤</span>
              <span className="att-name">{a.name}</span>
              <span className="att-size">{formatBytes(a.size)}{a.truncated ? " · truncated" : ""}</span>
              <button className="att-remove" onClick={() => removeAttachment(i)}>×</button>
            </div>
          ))}
        </div>
      )}

      <div className="input-bar">
        <input ref={fileInputRef} type="file" multiple accept={ACCEPT} style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        <button className="attach-btn" onClick={() => fileInputRef.current?.click()} disabled={streaming} title="Attach files">+</button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={sessionMode === "agent" ? "State objective for agent... (drag files anywhere)" : "Command... (drag files anywhere)"}
          rows={2}
          disabled={streaming}
        />
        <button onClick={send} disabled={streaming || (!input.trim() && pendingAtts.length === 0)}>
          {streaming ? "..." : "EXEC"}
        </button>
      </div>
    </div>
  );
}
