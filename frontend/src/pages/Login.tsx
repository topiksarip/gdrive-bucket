import { useState, useEffect } from "react";
import { api, fmtSize } from "../api";
import { HardDrive, Lock, UserPlus, ArrowRight, Database, Cloud, ShieldCheck } from "lucide-react";
import { RetroGrid, PrimaryButton, BlurFade } from "../components/magicui";

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("admin@local");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [cap, setCap] = useState<any>(null);

  useEffect(() => {
    api.get("/accounts").then((r) => setCap(r.data)).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(""); setOk("");
    try {
      if (mode === "login") {
        await api.post("/auth/login", { email, password: pw });
        onAuth();
        location.href = "/";
      } else {
        await api.post("/auth/register", { email, password: pw });
        setOk("Registrasi berhasil! Silakan login.");
        setMode("login");
      }
    } catch (e: any) {
      setErr(e.response?.data?.detail || (mode === "login" ? "Login gagal." : "Registrasi gagal."));
    } finally { setBusy(false); }
  }

  return (
    <div className="relative flex min-h-screen bg-ink-900">
      <RetroGrid />

      {/* Brand panel (kiri) — hidden on small */}
      <div className="relative z-10 hidden w-1/2 flex-col justify-between border-r border-ink-700 bg-ink-900 p-12 lg:flex">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-white shadow-glow">
            <HardDrive size={22} />
          </div>
          <div>
            <div className="text-lg font-semibold text-slate-100">Bucket Pribadi</div>
            <div className="text-xs text-slate-400">Agregator Google Drive</div>
          </div>
        </div>

        <div>
          <h2 className="max-w-sm text-3xl font-semibold leading-tight text-slate-100">
            Satu bucket dari <span className="text-brand-400">banyak akun</span> Google Drive.
          </h2>
          <p className="mt-3 max-w-sm text-sm text-slate-400">
            Kelola kapasitas, berikan Access Key ke AI Agent, dan akses file secara langsung dari Google — lewat satu dashboard.
          </p>
          {cap && (
            <div className="mt-8 grid grid-cols-2 gap-3">
              <Mini label="Total Kapasitas" value={fmtSize(cap.total?.limit || 0)} icon={<Database size={16} />} />
              <Mini label="Tersisa" value={fmtSize(cap.total?.free || 0)} icon={<Cloud size={16} />} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-emerald-400" /> Akses REST siap untuk AI Agent · lihat menu Docs
        </div>
      </div>

      {/* Form (kanan) */}
      <div className="relative z-10 flex flex-1 items-center justify-center p-6">
        <BlurFade className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-white">
              <HardDrive size={20} />
            </div>
            <div className="text-base font-semibold text-slate-100">Bucket Pribadi</div>
          </div>

          <form onSubmit={submit} className="rounded-2xl border border-ink-700 bg-ink-800/70 p-7 shadow-2xl backdrop-blur">
            <h1 className="text-xl font-semibold text-slate-100">{mode === "login" ? "Masuk" : "Daftar akun"}</h1>
            <p className="mt-1 text-sm text-slate-400">{mode === "login" ? "Lanjutkan ke dashboard Anda." : "Buat akses ke Bucket Pribadi."}</p>

            <div className="mb-5 mt-5 flex rounded-lg bg-ink-900 p-1 text-sm">
              {(["login", "register"] as const).map((m) => (
                <button type="button" key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                  className={`flex-1 rounded-md py-1.5 transition ${mode === m ? "bg-ink-700 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
                  {m === "login" ? "Masuk" : "Daftar"}
                </button>
              ))}
            </div>

            <label htmlFor="email" className="mb-1 block text-xs text-slate-400">Email</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-brand-500" />

            <label htmlFor="pw" className="mb-1 block text-xs text-slate-400">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
              className="mb-4 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-brand-500" />

            {err && <div role="alert" className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{err}</div>}
            {ok && <div role="status" className="mb-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">{ok}</div>}

            <PrimaryButton type="submit" disabled={busy} className="w-full">
              {busy ? "…" : mode === "login" ? <><Lock size={15} /> Masuk</> : <><UserPlus size={15} /> Daftar</>}
            </PrimaryButton>

            <p className="mt-4 text-center text-xs text-slate-500">
              {mode === "login"
                ? <>Belum punya akun? <button type="button" onClick={() => { setMode("register"); setErr(""); setOk(""); }} className="text-brand-400 hover:underline">Daftar di sini</button></>
                : <>Sudah punya akun? <button type="button" onClick={() => { setMode("login"); setErr(""); setOk(""); }} className="text-brand-400 hover:underline">Masuk di sini</button></>}
            </p>
          </form>
        </BlurFade>
      </div>
    </div>
  );
}

function Mini({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-800/60 p-3">
      <div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-[11px] uppercase tracking-wide">{label}</span></div>
      <div className="mt-1 text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}
