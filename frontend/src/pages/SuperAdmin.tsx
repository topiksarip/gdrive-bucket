import { useState, useEffect } from "react";
import { api, fmtSize } from "../api";
import { Shell } from "./Dashboard";
import { Plus, Trash2, ShieldCheck, Settings as Cog, Power, Link2, KeyRound, Gauge } from "lucide-react";
import { Badge } from "../components/magicui";

export default function SuperAdmin() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});
  const [tab, setTab] = useState<"accounts" | "settings">("accounts");
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<any>(null);

  async function load() {
    const [a, s] = await Promise.all([api.get("/admin/accounts"), api.get("/admin/settings")]);
    setAccounts(a.data.accounts);
    setSettings(s.data);
  }
  useEffect(() => { load(); }, []);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/admin/settings", settings);
    setMsg("Pengaturan disimpan.");
    setTimeout(() => setMsg(""), 3000);
  }

  async function toggle(id: number, enabled: boolean) {
    await api.patch("/admin/accounts/" + id, { enabled: !enabled });
    load();
  }
  async function del(id: number) {
    if (!confirm("Hapus akun ini dari pool?")) return;
    await api.delete("/admin/accounts/" + id);
    load();
  }
  async function connect(id: number) {
    try {
      const r = await api.get("/admin/accounts/" + id + "/connect");
      window.open(r.data.auth_url, "_blank");
    } catch (e: any) {
      setMsg(e.response?.data?.detail || "Gagal membuat link OAuth");
      setTimeout(() => setMsg(""), 4000);
    }
  }
  async function detect(id: number) {
    try {
      const r = await api.post("/admin/accounts/" + id + "/refresh-capacity");
      setMsg("Kapasitas terdeteksi: " + fmtSize(r.data.quota_limit));
      load();
    } catch (e: any) {
      setMsg(e.response?.data?.detail || "Gagal auto-detect kapasitas");
    }
    setTimeout(() => setMsg(""), 4000);
  }

  return (
    <Shell>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="text-brand-400" size={20} /> <h1 className="text-2xl font-semibold text-slate-100">Super Admin</h1>
      </div>
      <p className="mb-5 text-sm text-slate-400">Kelola akun Google Drive & koneksi OAuth. Setiap akun punya Client ID & Secret sendiri.</p>

      {msg && <div className="mb-4 text-sm text-emerald-400">{msg}</div>}

      <div className="mb-5 flex gap-1 rounded-lg border border-ink-700 bg-ink-800 p-1 w-fit text-sm">
        <button onClick={() => setTab("accounts")} className={"rounded-md px-3 py-1.5 " + (tab === "accounts" ? "bg-brand-500 text-white" : "text-slate-300")}><Link2 size={14} className="mr-1 inline" /> Akun Drive</button>
        <button onClick={() => setTab("settings")} className={"rounded-md px-3 py-1.5 " + (tab === "settings" ? "bg-brand-500 text-white" : "text-slate-300")}><Cog size={14} className="mr-1 inline" /> Pengaturan</button>
      </div>

      {tab === "accounts" ? (
        <AccountsTab accounts={accounts} onToggle={toggle} onDelete={del} onConnect={connect} onDetect={detect} onLoad={load} onEdit={setEditing} />
      ) : (
        <SettingsTab settings={settings} setSettings={setSettings} onSave={saveSettings} />
      )}

      {editing && <EditModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </Shell>
  );
}

function AccountsTab({ accounts, onToggle, onDelete, onConnect, onDetect, onLoad, onEdit }: any) {
  const [email, setEmail] = useState("");
  const [label, setLabel] = useState("");
  const [limit, setLimit] = useState(15);
  const [cid, setCid] = useState("");
  const [csec, setCSec] = useState("");
  const [real, setReal] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api.post("/admin/accounts", {
      email, label, mock: !real, quota_limit: limit * 1024 ** 3,
      client_id: cid, client_secret: csec,
    });
    setEmail(""); setLabel(""); setCid(""); setCSec(""); setReal(false); onLoad();
  }

  return (
    <div>
      <form onSubmit={add} className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-ink-700 bg-ink-800/50 p-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 lg:col-span-1"><label className="text-xs text-slate-400">Email Drive</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="cloudx@gmail.com" className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
        <div><label className="text-xs text-slate-400">Label</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Cloud X" className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
        <div><label className="text-xs text-slate-400">Kapasitas (GB)</label>
          <input type="number" value={limit} onChange={(e) => setLimit(+e.target.value)} className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
        <div><label className="text-xs text-slate-400">Client ID</label>
          <input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="xxxx.apps…" className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-brand-500" /></div>
        <div><label className="text-xs text-slate-400">Client Secret</label>
          <input type="password" value={csec} onChange={(e) => setCSec(e.target.value)} placeholder="GOCSPX-…" className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-brand-500" /></div>
        <div className="flex flex-col justify-between gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> Real</label>
          <button className="flex items-center justify-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-400"><Plus size={14} /> Tambah</button>
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-ink-700">
        <table className="w-full text-sm">
          <thead className="bg-ink-900 text-xs text-slate-400">
            <tr><th className="p-3 text-left">Label</th><th className="p-3 text-left">Email</th><th className="p-3 text-left">Client ID</th><th className="p-3 text-right">Kapasitas</th><th className="p-3 text-left">Status</th><th className="p-3 text-right">Aksi</th></tr>
          </thead>
          <tbody>
            {accounts.map((a: any) => {
              const tone = a.mock ? "slate" : a.connected ? "emerald" : "amber";
              const label = a.mock ? "mock" : a.connected ? "connected" : "real (off)";
              return (
                <tr key={a.id} className="border-t border-ink-700/70 bg-ink-800/30 transition hover:bg-ink-800">
                  <td className="p-3 text-slate-100">{a.label}</td>
                  <td className="p-3 text-slate-400">{a.email}</td>
                  <td className="max-w-[160px] truncate p-3 font-mono text-xs text-slate-500">{a.client_id || "—"}</td>
                  <td className="p-3 text-right text-slate-400">{fmtSize(a.quota_limit)}</td>
                  <td className="p-3"><Badge tone={tone}>{label}</Badge></td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => onEdit(a)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200" title="Edit"><KeyRound size={15} /></button>
                      {!a.mock && <button onClick={() => onConnect(a.id)} className="rounded-lg p-1.5 text-brand-400 transition hover:bg-ink-700" title="Connect OAuth"><Link2 size={15} /></button>}
                      <button onClick={() => onDetect(a.id)} className="rounded-lg p-1.5 text-sky-400 transition hover:bg-ink-700" title="Auto-detect"><Gauge size={15} /></button>
                      <button onClick={() => onToggle(a.id, a.enabled)} className={"rounded-lg p-1.5 transition hover:bg-ink-700 " + (a.enabled ? "text-amber-400" : "text-emerald-400")} title="Enable/Disable"><Power size={15} /></button>
                      <button onClick={() => onDelete(a.id)} className="rounded-lg p-1.5 text-red-400 transition hover:bg-ink-700" title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EditModal({ account, onClose, onSaved }: any) {
  const [email, setEmail] = useState(account.email);
  const [label, setLabel] = useState(account.label);
  const [limit, setLimit] = useState(Math.round(account.quota_limit / 1024 ** 3));
  const [cid, setCid] = useState(account.client_id || "");
  const [csec, setCSec] = useState("");
  const [enabled, setEnabled] = useState(account.enabled);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: any = { email, label, quota_limit: limit * 1024 ** 3, client_id: cid, enabled };
      if (csec) payload.client_secret = csec;
      await api.patch("/admin/accounts/" + account.id, payload);
      onSaved();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="w-[460px] rounded-2xl border border-ink-700 bg-ink-800 p-5">
        <h3 className="mb-4 font-semibold text-slate-100">Edit Akun — {account.label}</h3>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
          <div><label className="text-xs text-slate-400">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
          <div><label className="text-xs text-slate-400">Kapasitas (GB)</label>
            <input type="number" value={limit} onChange={(e) => setLimit(+e.target.value)} className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" /></div>
          <div><label className="text-xs text-slate-400">Google Client ID</label>
            <input value={cid} onChange={(e) => setCid(e.target.value)} className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-brand-500" /></div>
          <div><label className="text-xs text-slate-400">Client Secret (kosongkan = tetap)</label>
            <input type="password" value={csec} onChange={(e) => setCSec(e.target.value)} placeholder="isi hanya jika ganti" className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-brand-500" /></div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled</label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl bg-ink-700 px-3 py-2 text-slate-300 hover:bg-ink-600">Batal</button>
          <button disabled={busy} className="rounded-xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-400 disabled:opacity-50">Simpan</button>
        </div>
      </form>
    </div>
  );
}

function SettingsTab({ settings, setSettings, onSave }: any) {
  return (
    <form onSubmit={onSave} className="max-w-2xl space-y-3 rounded-2xl border border-ink-700 bg-ink-800/50 p-5">
      <div><label className="text-xs text-slate-400">OAuth Redirect URI</label>
        <input value={settings.oauth_redirect_uri || ""} onChange={(e) => setSettings({ ...settings, oauth_redirect_uri: e.target.value })}
          placeholder="https://drive.losiento.dev/api/v1/admin/accounts/oauth/callback"
          className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-brand-500" /></div>
      <div><label className="text-xs text-slate-400">Mode (true = simpan lokal / mock, false = Google Drive asli)</label>
        <select value={settings.drive_mock || "true"} onChange={(e) => setSettings({ ...settings, drive_mock: e.target.value })}
          className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500">
          <option value="true">Mock (simpan lokal)</option>
          <option value="false">Real Google Drive</option>
        </select></div>
      <button className="rounded-xl bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-400">Simpan</button>
      <p className="text-xs text-slate-500">Client ID/Secret diisi per-akun di tabel Akun Drive. Redirect URI wajib terdaftar di Google Cloud Console untuk setiap OAuth client.</p>
    </form>
  );
}
