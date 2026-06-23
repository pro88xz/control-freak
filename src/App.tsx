import { useState, useEffect, useRef } from "react";
import Sidebar from "./Sidebar";
import Chat from "./Chat";
import PersonaPanel from "./PersonaPanel";
import SettingsPanel from "./SettingsPanel";
import type { Session, Msg, Persona, AppSettings } from "./types";
import { testSsh } from "./shellExec";
import {
  loadSessions, saveSessions, loadActiveId, saveActiveId,
  loadSidebarOpen, saveSidebarOpen, loadPersonas, savePersonas,
  loadSettings, saveSettings,
  newSession, newPersona,
} from "./storage";
import "./App.css";

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [pendingDelete, setPendingDelete] = useState<Session | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaPanelOpen, setPersonaPanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ sshTarget: { label: "Kali (local VM)", host: "127.0.0.1", port: 2222, user: "kali", identityFile: "" } });
  const undoTimerRef = useRef<number | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const loaded = loadSessions();
    const active = loadActiveId();
    const open = loadSidebarOpen();
    const ps = loadPersonas();
    setPersonas(ps);
    setSettings(loadSettings());

    if (loaded.length === 0) {
      const fresh = newSession("Default", "builtin-default");
      setSessions([fresh]);
      setActiveId(fresh.id);
    } else {
      setSessions(loaded);
      setActiveId(active && loaded.find(s => s.id === active) ? active : loaded[0].id);
    }
    setSidebarOpen(open);
    hydratedRef.current = true;
  }, []);

  useEffect(() => { if (hydratedRef.current) saveSessions(sessions); }, [sessions]);
  useEffect(() => { if (hydratedRef.current) saveActiveId(activeId); }, [activeId]);
  useEffect(() => { if (hydratedRef.current) saveSidebarOpen(sidebarOpen); }, [sidebarOpen]);
  useEffect(() => { if (hydratedRef.current) savePersonas(personas); }, [personas]);
  useEffect(() => { if (hydratedRef.current) saveSettings(settings); }, [settings]);

  const active = sessions.find(s => s.id === activeId) || null;
  const activePersona = personas.find(p => p.id === (active?.personaId || "builtin-default")) || personas[0];

  const createSession = () => {
    const s = newSession(undefined, activePersona?.id || "builtin-default");
    setSessions(prev => [s, ...prev]);
    setActiveId(s.id);
  };

  const selectSession = (id: string) => setActiveId(id);

  const renameSession = (id: string, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name, updatedAt: Date.now() } : s));
  };

  const deleteSession = (id: string) => {
    const target = sessions.find(s => s.id === id);
    if (!target) return;
    setSessions(prev => prev.filter(s => s.id !== id));
    setPendingDelete(target);
    if (activeId === id) {
      const remaining = sessions.filter(s => s.id !== id);
      if (remaining.length > 0) setActiveId(remaining[0].id);
      else {
        const fresh = newSession("Default", "builtin-default");
        setSessions([fresh]);
        setActiveId(fresh.id);
      }
    }
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => { setPendingDelete(null); undoTimerRef.current = null; }, 5000);
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    const restored = pendingDelete;
    setSessions(prev => [restored, ...prev]);
    setActiveId(restored.id);
    setPendingDelete(null);
    if (undoTimerRef.current) { window.clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
  };

  const updateActiveMessages = (msgs: Msg[]) => {
    if (!active) return;
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, messages: msgs, updatedAt: Date.now() } : s));
  };

  const setSessionPersona = (personaId: string) => {
    if (!active) return;
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, personaId, updatedAt: Date.now() } : s));
  };

  const createPersona = (): Persona => {
    const name = `Custom ${personas.filter(p => !p.builtin).length + 1}`;
    const p = newPersona(name);
    setPersonas(prev => [...prev, p]);
    return p;
  };

  const updatePersona = (id: string, updates: Partial<Persona>) => {
    setPersonas(prev => prev.map(p => p.id === id && !p.builtin ? { ...p, ...updates } : p));
  };

  const deletePersona = (id: string) => {
    const target = personas.find(p => p.id === id);
    if (!target || target.builtin) return;
    setPersonas(prev => prev.filter(p => p.id !== id));
    setSessions(prev => prev.map(s => s.personaId === id ? { ...s, personaId: "builtin-default" } : s));
  };

  const toggleSessionMode = () => {
    if (!active) return;
    const newMode = active.mode === "agent" ? "chat" : "agent";
    setSessions(prev => prev.map(s => s.id === active.id ? { ...s, mode: newMode, updatedAt: Date.now() } : s));
  };

  const toggleSidebar = () => setSidebarOpen(v => !v);

  if (!active || !activePersona) return null;

  return (
    <div className="app">
      <header className="header">
        <button className="sidebar-toggle" onClick={toggleSidebar} title="Toggle sidebar">{sidebarOpen ? "◀" : "▶"}</button>
        <span className="logo">▲</span>
        <span className="title">CONTROL FREAK</span>
        <span className="subtitle">// PROPRIETARY · CLOSED · OPERATOR ACCESS ONLY</span>
        <button className="header-personas-btn" onClick={() => setPersonaPanelOpen(true)} title="Persona library">
          PERSONAS
        </button>
        <span className="status-stamp">Llama 3.3 70B · {sessions.length} session{sessions.length === 1 ? "" : "s"}</span>
      </header>

      <div className="body">
        {sidebarOpen && (
          <Sidebar
            sessions={sessions} activeId={activeId}
            onSelect={selectSession} onCreate={createSession}
            onRename={renameSession} onDelete={deleteSession}
            pendingDelete={pendingDelete ? pendingDelete.id : null}
            onUndoDelete={undoDelete}
          />
        )}
        <Chat
          key={active.id}
          messages={active.messages}
          onMessagesChange={updateActiveMessages}
          sessionName={active.name}
          sessionMode={active.mode}
          persona={activePersona}
          sshTarget={settings.sshTarget}
          onOpenPersonas={() => setPersonaPanelOpen(true)}
          onOpenSettings={() => setSettingsPanelOpen(true)}
          onToggleMode={toggleSessionMode}
        />
      </div>

      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        settings={settings}
        onSave={setSettings}
        onTestSsh={testSsh}
      />

      <PersonaPanel
        open={personaPanelOpen}
        onClose={() => setPersonaPanelOpen(false)}
        personas={personas}
        activePersonaId={activePersona.id}
        onSelectPersona={(id) => { setSessionPersona(id); }}
        onCreatePersona={createPersona}
        onUpdatePersona={updatePersona}
        onDeletePersona={deletePersona}
      />
    </div>
  );
}

export default App;
