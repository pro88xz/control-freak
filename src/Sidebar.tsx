import { useState, useEffect, useRef } from "react";
import type { Session } from "./types";

type Props = {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  onUndoDelete: () => void;
};

export default function Sidebar({
  sessions,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  pendingDelete,
  onUndoDelete,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const startEdit = (s: Session) => {
    setEditingId(s.id);
    setEditValue(s.name);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="sidebar-title">SESSIONS</span>
        <button className="new-btn" onClick={onCreate} title="New session">
          + NEW
        </button>
      </div>

      <div className="sessions-list">
        {sorted.length === 0 && (
          <div className="sidebar-empty">No sessions yet.</div>
        )}
        {sorted.map((s) => (
          <div
            key={s.id}
            className={`session-row ${s.id === activeId ? "active" : ""}`}
            onClick={() => editingId !== s.id && onSelect(s.id)}
          >
            {editingId === s.id ? (
              <input
                ref={editRef}
                className="session-edit"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            ) : (
              <>
                <span
                  className="session-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEdit(s);
                  }}
                  title="Double-click to rename"
                >
                  {s.name}
                </span>
                <span className="session-meta">
                  {s.messages.length > 0 ? `${s.messages.length}` : "·"}
                </span>
                <button
                  className="session-del"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(s.id);
                  }}
                  title="Delete session"
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {pendingDelete && (
        <div className="undo-banner">
          <span>Session deleted</span>
          <button onClick={onUndoDelete}>UNDO</button>
        </div>
      )}

      <div className="sidebar-foot">
        <span>// double-click name to rename</span>
      </div>
    </aside>
  );
}