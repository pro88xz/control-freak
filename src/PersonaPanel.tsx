import { useState, useEffect, useRef } from "react";
import type { Persona } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  activePersonaId: string;
  onSelectPersona: (id: string) => void;
  onCreatePersona: () => Persona;
  onUpdatePersona: (id: string, updates: Partial<Persona>) => void;
  onDeletePersona: (id: string) => void;
};

export default function PersonaPanel({
  open, onClose, personas, activePersonaId,
  onSelectPersona, onCreatePersona, onUpdatePersona, onDeletePersona,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; systemPrompt: string }>({ name: "", description: "", systemPrompt: "" });
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) {
      const p = personas.find(x => x.id === editingId);
      if (p) setDraft({ name: p.name, description: p.description, systemPrompt: p.systemPrompt });
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [editingId, personas]);

  if (!open) return null;

  const active = personas.find(p => p.id === activePersonaId);
  const editing = editingId ? personas.find(p => p.id === editingId) : null;

  const handleSave = () => {
    if (!editingId) return;
    onUpdatePersona(editingId, { name: draft.name.trim() || "Untitled", description: draft.description.trim(), systemPrompt: draft.systemPrompt });
    setEditingId(null);
  };

  const handleCreate = () => {
    const p = onCreatePersona();
    setEditingId(p.id);
  };

  return (
    <div className="persona-overlay" onClick={onClose}>
      <div className="persona-panel" onClick={(e) => e.stopPropagation()}>
        <div className="persona-head">
          <span className="persona-title">PERSONA LIBRARY</span>
          <button className="persona-close" onClick={onClose}>×</button>
        </div>

        <div className="persona-body">
          <div className="persona-list">
            <div className="persona-list-head">
              <span>{personas.length} PERSONAS</span>
              <button className="persona-new" onClick={handleCreate}>+ NEW</button>
            </div>
            {personas.map(p => (
              <div
                key={p.id}
                className={`persona-row ${p.id === activePersonaId ? "active" : ""} ${p.id === editingId ? "editing" : ""}`}
                onClick={() => setEditingId(p.id)}
              >
                <div className="persona-row-main">
                  <span className="persona-row-name">{p.name}</span>
                  {p.builtin && <span className="persona-builtin">built-in</span>}
                  {p.id === activePersonaId && <span className="persona-active-tag">active</span>}
                </div>
                <div className="persona-row-desc">{p.description}</div>
                <div className="persona-row-actions">
                  {p.id !== activePersonaId && (
                    <button onClick={(e) => { e.stopPropagation(); onSelectPersona(p.id); }}>USE</button>
                  )}
                  {!p.builtin && (
                    <button className="danger" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete persona "${p.name}"?`)) onDeletePersona(p.id); }}>
                      DELETE
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="persona-editor">
            {!editing ? (
              <div className="persona-editor-empty">
                <div className="ed-title">SELECT A PERSONA</div>
                <div className="ed-sub">
                  Active: <strong>{active?.name || "—"}</strong>
                  <br /><br />
                  Click a persona on the left to view or edit. New messages in the current session use the active persona.
                </div>
              </div>
            ) : (
              <>
                <div className="editor-row">
                  <label>NAME</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    disabled={editing.builtin}
                  />
                </div>
                <div className="editor-row">
                  <label>DESCRIPTION</label>
                  <input
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    disabled={editing.builtin}
                  />
                </div>
                <div className="editor-row grow">
                  <label>SYSTEM PROMPT {editing.builtin && <span className="readonly-tag">read-only · built-in</span>}</label>
                  <textarea
                    value={draft.systemPrompt}
                    onChange={(e) => setDraft({ ...draft, systemPrompt: e.target.value })}
                    disabled={editing.builtin}
                    spellCheck={false}
                  />
                </div>
                <div className="editor-actions">
                  <button className="cancel" onClick={() => setEditingId(null)}>CLOSE</button>
                  {!editing.builtin && (
                    <button className="save" onClick={handleSave}>SAVE</button>
                  )}
                  {editing.id !== activePersonaId && (
                    <button className="use" onClick={() => { onSelectPersona(editing.id); }}>SET ACTIVE</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
