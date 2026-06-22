import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Msg, Attachment, Persona } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "qwen/qwen3.6-27b";
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MAX_FULL = 50 * 1024;
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

type Props = {
  messages: Msg[];
  onMessagesChange: (msgs: Msg[]) => void;
  sessionName: string;
  persona: Persona;
  onOpenPersonas: () => void;
};

export default function Chat({ messages, onMessagesChange, sessionName, persona, onOpenPersonas }: Props) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoScrollRef = useRef(true);

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

  const send = async () => {
    const text = input.trim();
    if ((!text && pendingAtts.length === 0) || streaming) return;
    if (!API_KEY) {
      onMessagesChange([...messages, { role: "user", content: text }, { role: "assistant", content: "[error] VITE_GROQ_API_KEY missing in .env.local — set it and restart the dev server." }]);
      setInput("");
      return;
    }

    const userMsg: Msg = { role: "user", content: text, attachments: pendingAtts.length > 0 ? pendingAtts : undefined };
    const newMessages: Msg[] = [...messages, userMsg];
    onMessagesChange([...newMessages, { role: "assistant", content: "" }]);
    setInput("");
    setPendingAtts([]);
    setStreaming(true);
    autoScrollRef.current = true;

    const apiMessages = [
      { role: "system", content: persona.systemPrompt },
      ...newMessages.map(m => {
        if (m.role === "user" && m.attachments && m.attachments.length > 0) {
          return { role: "user", content: `${m.content}\n\n${buildAttachmentBlock(m.attachments)}`.trim() };
        }
        return { role: m.role, content: m.content };
      })
    ];

    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: apiMessages, stream: true, temperature: 0.5, max_tokens: 4096 }),
      });
      if (!res.ok) { const errText = await res.text(); throw new Error(`Groq ${res.status}: ${errText}`); }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
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
                .trimStart();
              onMessagesChange([...newMessages, { role: "assistant", content: visible }]);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      onMessagesChange([...newMessages, { role: "assistant", content: `[error] ${e.message}` }]);
    } finally {
      setStreaming(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  return (
    <div className="chat" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="chat-head">
        <span className="chat-session-name">{sessionName}</span>
        <button className="persona-pill" onClick={onOpenPersonas} title="Change persona">
          <span className="pill-dot">●</span> {persona.name}
        </button>
        <span className="chat-status">{streaming ? "● transmitting" : "● standby"}</span>
      </div>

      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {messages.length === 0 && (
          <div className="empty">
            <div className="empty-title">CONTROL FREAK ONLINE</div>
            <div className="empty-sub">Brain: Llama 3.3 70B · Persona: {persona.name} · Auth: operator verified</div>
            <div className="empty-prompt">State the objective. Drop files anywhere.</div>
          </div>
        )}
        {messages.map((m, i) => (
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
                <Markdown content={m.content || "..."} />
              )}
            </div>
          </div>
        ))}
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
        <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} placeholder="Command... (drag files anywhere)" rows={2} disabled={streaming} />
        <button onClick={send} disabled={streaming || (!input.trim() && pendingAtts.length === 0)}>
          {streaming ? "..." : "EXEC"}
        </button>
      </div>
    </div>
  );
}
