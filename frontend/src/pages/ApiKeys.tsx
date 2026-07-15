import { useState, useEffect } from "react";
import { api } from "../api";
import { Shell } from "./Dashboard";
import { KeyRound, Plus, Copy, Trash2, Check, RefreshCw } from "lucide-react";
import { PrimaryButton, BlurFade, EmptyState, SectionTitle, Badge } from "../components/magicui";

const BUCKET_DOMAIN = "https://drive.losiento.dev";

export default function ApiKeys() {
  const [pair, setPair] = useState<{ access_key_id: string; secret_access_key: string } | null>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ t: string; k: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await api.get("/access-keys");
      const all = Array.isArray(r.data?.keys) ? r.data.keys : [];
      setKeys(all.filter((k: any) => k.enabled)); // hanya aktif (revoked disembunyikan)
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "unknown";
      setMsg({ t: "Gagal memuat daftar key: " + detail, k: "err" });
    }
  }
  useEffect(() => { load(); }, []);

  async function gen() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post("/access-keys");
      setPair(r.data);
      setMsg({ t: "Simpan Secret sekarang — tidak akan tampil lagi.", k: "ok" });
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || "unknown";
      setMsg({ t: "Gagal membuat access key: " + detail, k: "err" });
    } finally { setBusy(false); }
  }
  async function revoke(id: number) {
    if (!confirm("Revoke access key ini? Agent yang menggunakannya akan kehilangan akses.")) return;
    try { await api.delete("/access-keys/" + id); load(); }
    catch (e: any) { setMsg({ t: "Gagal revoke: " + (e?.response?.data?.detail || "unknown"), k: "err" }); }
  }
  async function rotate(id: number) {
    if (!confirm("Rotate access key? Secret lama tidak bisa dipakai lagi.")) return;
    try {
      const r = await api.post("/access-keys/" + id + "/rotate");
      setPair(r.data);
      setMsg({ t: "Secret baru — simpan sekarang (lama tidak berlaku).", k: "ok" });
      load();
    } catch (e: any) { setMsg({ t: "Gagal rotate: " + (e?.response?.data?.detail || "unknown"), k: "err" }); }
  }

  return (
    <Shell>
      <BlurFade>
        <div className="flex items-center gap-2">
          <KeyRound className="text-brand-400" size={20} />
          <h1 className="text-2xl font-semibold text-slate-100">Access Keys</h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Buat <b>Access Key</b> (gaya AWS S3) untuk diberikan ke AI Agent. Agent mengirim
          <code className="ml-1 text-brand-400"> Secret Access Key</code> sebagai header <code className="text-brand-400">X-API-Key</code>.
        </p>
      </BlurFade>

      <BlurFade delay={60} className="mt-6 rounded-2xl border border-ink-700 bg-ink-800/50 p-5">
        <SectionTitle sub="endpoint publik untuk agent (statis)">Domain Bucket</SectionTitle>
        <code className="block break-all rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 font-mono text-sm text-emerald-300">{BUCKET_DOMAIN}</code>
      </BlurFade>

      <div className="mt-6 flex items-center gap-3">
        <PrimaryButton onClick={gen} disabled={busy}><Plus size={15} /> Buat Access Key</PrimaryButton>
        {msg && <span className={`text-sm ${msg.k === "ok" ? "text-emerald-400" : "text-red-400"}`}>{msg.t}</span>}
      </div>

      {pair && (
        <BlurFade delay={60} className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-400"><KeyRound size={14} /> Tampil sekali — simpan sekarang!</div>
          <KV label="Access Key ID" value={pair.access_key_id} />
          <KV label="Secret Access Key" value={pair.secret_access_key} />
        </BlurFade>
      )}

      <BlurFade delay={120} className="mt-8">
        <SectionTitle sub="daftar key aktif (revoked disembunyikan)">Access Keys</SectionTitle>
        {keys.length === 0
          ? <EmptyState title="Belum ada access key" hint="Buat key pertama untuk agent" action={<PrimaryButton onClick={gen}><Plus size={15} /> Buat</PrimaryButton>} />
          : (
            <div className="overflow-hidden rounded-2xl border border-ink-700">
              <table className="w-full text-sm">
                <thead className="bg-ink-900 text-xs text-slate-400">
                  <tr><th className="p-3 text-left font-medium">Access Key ID</th><th className="p-3 text-left font-medium">Label</th><th className="p-3 text-left font-medium">Status</th><th className="p-3 text-left font-medium">Dibuat</th><th className="p-3 text-right font-medium">Aksi</th></tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-t border-ink-700/70 bg-ink-800/30 transition hover:bg-ink-800">
                      <td className="p-3 font-mono text-xs text-slate-100">{k.access_key_id}</td>
                      <td className="p-3 text-slate-400">{k.label}</td>
                      <td className="p-3"><Badge tone="emerald">active</Badge></td>
                      <td className="p-3 text-xs text-slate-500">{k.created_at}</td>
                      <td className="p-3 text-right">{k.enabled && <div className="flex justify-end gap-1">
                        <button onClick={() => rotate(k.id)} className="rounded-lg p-2 text-brand-400 transition hover:bg-ink-700 hover:text-brand-300" title="Rotate secret" aria-label={`Rotate ${k.access_key_id}`}><RefreshCw size={15} /></button>
                        <button onClick={() => revoke(k.id)} className="rounded-lg p-2 text-red-400 transition hover:bg-ink-700 hover:text-red-300" title="Revoke" aria-label={`Revoke ${k.access_key_id}`}><Trash2 size={15} /></button>
                      </div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </BlurFade>
    </Shell>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-slate-400">{label}</div>
      <div className="flex gap-2">
        <code className="flex-1 break-all rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm text-emerald-300">{value}</code>
        <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="rounded-xl bg-ink-700 px-3 py-2 text-slate-200 transition hover:bg-ink-900" aria-label={`Copy ${label}`}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
