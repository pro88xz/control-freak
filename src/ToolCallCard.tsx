import { useState, useEffect } from "react";
import type { ToolCall, RiskLevel } from "./types";

type Props = {
  toolCall: ToolCall;
  onApprove: (id: string, editedCommand?: string) => void;
  onDeny: (id: string) => void;
};

const riskMeta: Record<RiskLevel, { label: string; color: string }> = {
  low: { label: "LOW RISK", color: "#4ade80" },
  medium: { label: "MED RISK", color: "#facc15" },
  high: { label: "HIGH RISK", color: "#ff2d2d" },
};

export default function ToolCallCard({ toolCall, onApprove, onDeny }: Props) {
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState(toolCall.command);

  useEffect(() => { setEdited(toolCall.command); }, [toolCall.command]);

  const meta = riskMeta[toolCall.risk];
  const state = toolCall.approvalState;
  const isPending = state === "pending";
  const isExecuting = state === "executing";
  const isDone = state === "completed" || state === "failed";
  const isDenied = state === "denied";

  return (
    <div className={`tc-card tc-risk-${toolCall.risk} tc-state-${state}`}>
      <div className="tc-head">
        <span className="tc-tool">▶ run_shell</span>
        <span className="tc-shell">{toolCall.shell}</span>
        <span className="tc-risk" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</span>
        <span className="tc-timeout">{toolCall.timeoutSec}s</span>
        <span className={`tc-state tc-state-tag-${state}`}>
          {state === "pending" && "● awaiting approval"}
          {state === "executing" && "● executing..."}
          {state === "completed" && `✓ exit ${toolCall.exitCode ?? 0}`}
          {state === "failed" && `✗ exit ${toolCall.exitCode ?? "?"}`}
          {state === "denied" && "✗ denied"}
          {state === "edited" && "● edited, awaiting approval"}
          {state === "approved" && "● queued"}
        </span>
      </div>

      <div className="tc-reason">{toolCall.reason}</div>

      <div className="tc-cmd-block">
        {editing ? (
          <textarea
            className="tc-cmd-edit"
            value={edited}
            onChange={(e) => setEdited(e.target.value)}
            spellCheck={false}
            rows={Math.min(8, Math.max(2, edited.split("\n").length + 1))}
          />
        ) : (
          <pre className="tc-cmd">{toolCall.editedCommand || toolCall.command}</pre>
        )}
      </div>

      {isPending && !editing && (
        <div className="tc-actions">
          <button className="tc-btn tc-approve" onClick={() => onApprove(toolCall.id)}>APPROVE</button>
          <button className="tc-btn tc-edit" onClick={() => setEditing(true)}>EDIT</button>
          <button className="tc-btn tc-deny" onClick={() => onDeny(toolCall.id)}>DENY</button>
        </div>
      )}

      {isPending && editing && (
        <div className="tc-actions">
          <button className="tc-btn tc-approve" onClick={() => { onApprove(toolCall.id, edited); setEditing(false); }}>RUN EDITED</button>
          <button className="tc-btn tc-cancel" onClick={() => { setEdited(toolCall.command); setEditing(false); }}>CANCEL</button>
        </div>
      )}

      {isExecuting && (
        <div className="tc-executing">running... (timeout {toolCall.timeoutSec}s)</div>
      )}

      {isDone && toolCall.output !== undefined && (
        <div className="tc-output-wrap">
          <div className="tc-output-head">
            <span>OUTPUT</span>
            <span className="tc-duration">{toolCall.durationMs ? `${(toolCall.durationMs / 1000).toFixed(1)}s` : ""}</span>
          </div>
          <pre className="tc-output">{toolCall.output || "(no output)"}</pre>
        </div>
      )}

      {isDenied && (
        <div className="tc-denied-msg">Command denied by operator. Agent will not execute.</div>
      )}
    </div>
  );
}
