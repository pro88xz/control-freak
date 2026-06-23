import { useState, useEffect } from "react";
import type { AppSettings, SshTarget } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onTestSsh: (t: SshTarget) => Promise<{ ok: boolean; message: string }>;
};

export default function SettingsPanel({ open, onClose, settings, onSave, onTestSsh }: Props) {
  const [draft, setDraft] = useState<SshTarget>(settings.sshTarget);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => { setDraft(settings.sshTarget); setTestResult(null); }, [settings, open]);

  if (!open) return null;

  const handleSave = () => {
    onSave({ ...settings, sshTarget: draft });
    onClose();
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await onTestSsh(draft);
      setTestResult(r);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span className="settings-title">SETTINGS</span>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-body">
          <div className="settings-section">
            <div className="section-title">SSH TARGET (Kali ops workbench)</div>
            <div className="section-sub">Used when the agent picks <code>ssh-kali</code> as the shell.</div>

            <div className="settings-grid">
              <label>Label</label>
              <input type="text" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />

              <label>Host</label>
              <input type="text" value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="127.0.0.1" />

              <label>Port</label>
              <input type="number" value={draft.port} onChange={(e) => setDraft({ ...draft, port: parseInt(e.target.value) || 22 })} />

              <label>User</label>
              <input type="text" value={draft.user} onChange={(e) => setDraft({ ...draft, user: e.target.value })} placeholder="kali" />

              <label>Identity File</label>
              <input
                type="text"
                value={draft.identityFile}
                onChange={(e) => setDraft({ ...draft, identityFile: e.target.value })}
                placeholder="(empty = use default ~/.ssh/id_ed25519)"
              />
            </div>

            <div className="settings-actions">
              <button className="settings-btn test" onClick={handleTest} disabled={testing}>
                {testing ? "TESTING..." : "TEST CONNECTION"}
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.ok ? "ok" : "fail"}`}>
                {testResult.ok ? "✓ " : "✗ "}{testResult.message}
              </div>
            )}
          </div>
        </div>

        <div className="settings-foot">
          <button className="settings-btn cancel" onClick={onClose}>CANCEL</button>
          <button className="settings-btn save" onClick={handleSave}>SAVE</button>
        </div>
      </div>
    </div>
  );
}
