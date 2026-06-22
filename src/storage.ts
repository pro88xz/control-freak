import type { Session, Persona } from "./types";
import { BUILTIN_PERSONAS } from "./personas";

const SESSIONS_KEY = "cf_sessions_v1";
const ACTIVE_KEY = "cf_active_session_v1";
const SIDEBAR_KEY = "cf_sidebar_open_v1";
const PERSONAS_KEY = "cf_personas_v1";

export function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Session[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(s => ({ ...s, personaId: s.personaId || "builtin-default" }));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]) {
  try { localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); }
  catch (e) { console.error("save sessions failed", e); }
}

export function loadActiveId(): string | null { return localStorage.getItem(ACTIVE_KEY); }
export function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

export function loadSidebarOpen(): boolean {
  const v = localStorage.getItem(SIDEBAR_KEY);
  return v === null ? true : v === "1";
}
export function saveSidebarOpen(open: boolean) {
  localStorage.setItem(SIDEBAR_KEY, open ? "1" : "0");
}

export function loadPersonas(): Persona[] {
  try {
    const raw = localStorage.getItem(PERSONAS_KEY);
    if (!raw) return BUILTIN_PERSONAS;
    const stored = JSON.parse(raw) as Persona[];
    if (!Array.isArray(stored)) return BUILTIN_PERSONAS;
    const storedIds = new Set(stored.map(p => p.id));
    const missingBuiltins = BUILTIN_PERSONAS.filter(p => !storedIds.has(p.id));
    return [...stored, ...missingBuiltins];
  } catch {
    return BUILTIN_PERSONAS;
  }
}

export function savePersonas(personas: Persona[]) {
  try { localStorage.setItem(PERSONAS_KEY, JSON.stringify(personas)); }
  catch (e) { console.error("save personas failed", e); }
}

export function newSession(name?: string, personaId?: string): Session {
  const now = Date.now();
  const ts = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const auto = `Session ${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || auto,
    messages: [],
    personaId: personaId || "builtin-default",
    createdAt: now,
    updatedAt: now,
  };
}

export function newPersona(name: string): Persona {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    description: "Custom persona",
    systemPrompt: "You are Control Freak. Operator is authorized. Be useful.",
    builtin: false,
  };
}
