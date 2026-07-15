import { useState, useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { api, fmtSize } from "../api";
import { LayoutDashboard, FolderOpen, KeyRound, LogOut, ShieldCheck, BookOpen, Cloud, Database, HardDrive, ArrowUpRight, Menu, X } from "lucide-react";
import { BlurFade, StatCard, Skeleton, EmptyState, SectionTitle, ProgressRing, Bar, Badge, NavItem } from "../components/magicui";

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  async function load() {
    try { setData((await api.get("/accounts")).data); }
    catch { setErr("Gagal memuat data akun."); }
  }
  useEffect(() => { load(); }, []);

  async function logout() {
    await api.post("/auth/logout");
    location.href = "/login";
  }

  if (err) return <Shell onLogout={logout}><div role="alert" className="p-8 text-red-400">{err}</div></Shell>;
  if (!data) return <Shell onLogout={logout}><Loading /></Shell>;

  const all = data.accounts as any[];
  const connectedCount = all.filter((x: any) => x.connected && !x.mock).length;
  const a = [...all].sort((x: any, y: any) => Number(!!y.connected) - Number(!!x.connected));
  const usedPct = data.total.limit ? (data.total.used / data.total.limit) * 100 : 0;

  return (
    <Shell onLogout={logout}>
      <BlurFade>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Kapasitas Bucket</h1>
            <p className="mt-1 text-sm text-slate-400">Total agregat dari {all.length} akun Cloud · sinkronisasi langsung Google Drive</p>
          </div>
          <Badge tone="emerald">{connectedCount} terhubung</Badge>
        </div>
      </BlurFade>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BlurFade delay={0}><StatCard label="Total Kapasitas" value={fmtSize(data.total.limit)} sub="seluruh akun" icon={<Database size={18} />} pct={100} /></BlurFade>
        <BlurFade delay={80}><StatCard label="Terpakai" value={fmtSize(data.total.used)} sub={`${usedPct.toFixed(1)}% terisi`} accent="brand" icon={<HardDrive size={18} />} pct={usedPct} /></BlurFade>
        <BlurFade delay={160}><StatCard label="Sisa" value={fmtSize(data.total.free)} sub="tersedia" accent="emerald" icon={<Cloud size={18} />} pct={data.total.limit ? (data.total.free / data.total.limit) * 100 : 0} /></BlurFade>
      </div>

      <BlurFade delay={220} className="mt-8">
        <SectionTitle sub={`${connectedCount} terhubung dari ${all.length} akun`}>Akun Cloud</SectionTitle>
        {a.length === 0
          ? <EmptyState title="Belum ada akun terhubung" hint="Tambah akun di menu Super Admin" action={<Link to="/admin"><span className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-400">Tambah Akun</span></Link>} />
          : <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/50">
              {a.map((x: any, i: number) => {
                const used = x.used || 0;
                const limit = x.limit || 0;
                const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
                const status = x.mock ? "mock" : x.connected ? "connected" : "real (off)";
                const tone = x.mock ? "slate" : x.connected ? "emerald" : "amber";
                return (
                  <div key={x.id} className={"flex items-center gap-4 px-4 py-3.5 " + (i > 0 ? "border-t border-ink-700/70" : "")}>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-900 text-brand-400">
                      <HardDrive size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-100">{x.label}</span>
                        <Badge tone={tone as any}>{status}</Badge>
                      </div>
                      <div className="truncate text-xs text-slate-500">{x.email}</div>
                    </div>
                    <div className="hidden w-44 shrink-0 sm:block">
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-slate-200">{fmtSize(used)}</span>
                        <span className="text-slate-500">/ {fmtSize(limit)}</span>
                      </div>
                      <div className="mt-1.5"><Bar pct={pct} tone={pct > 85 ? "danger" : pct > 60 ? "amber" : "brand"} /></div>
                    </div>
                    <div className="w-16 shrink-0 text-right text-xs font-medium text-slate-400">{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>}
      </BlurFade>

      <BlurFade delay={280} className="mt-8">
        <SectionTitle sub="akses cepat">Navigasi</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Quick to="/files" icon={<FolderOpen size={18} />} label="Files" />
          <Quick to="/keys" icon={<KeyRound size={18} />} label="Access Keys" />
          <Quick to="/docs" icon={<BookOpen size={18} />} label="Docs (Agent)" />
          <Quick to="/admin" icon={<ShieldCheck size={18} />} label="Super Admin" />
        </div>
      </BlurFade>
    </Shell>
  );
}

function Loading() {
  return (
    <div className="p-8">
      <Skeleton className="h-7 w-52" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
      </div>
      <Skeleton className="mt-8 h-40" />
    </div>
  );
}

function Quick({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link to={to} className="group flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-800/50 px-4 py-4 text-sm text-slate-200 transition hover:border-brand-500/40 hover:bg-ink-800">
      <span className="flex items-center gap-3"><span className="text-brand-400">{icon}</span>{label}</span>
      <ArrowUpRight size={16} className="text-slate-600 transition group-hover:text-brand-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

export function Shell({ children, onLogout }: { children?: any; onLogout?: () => void }) {
  const [menu, setMenu] = useState(false);
  async function doLogout() {
    try { await api.post("/auth/logout"); } catch {}
    location.href = "/login";
  }
  const logout = onLogout || doLogout;
  const navItems = [
    { to: "/", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/files", icon: FolderOpen, label: "Files" },
    { to: "/keys", icon: KeyRound, label: "Access Keys" },
    { to: "/docs", icon: BookOpen, label: "Docs (Agent)" },
    { to: "/admin", icon: ShieldCheck, label: "Super Admin" },
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-700 bg-ink-900/80 p-4 backdrop-blur md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-400 text-white shadow-glow">
            <HardDrive size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight text-slate-100">Bucket</div>
            <div className="text-[10px] leading-tight text-slate-500">Pribadi</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          {navItems.map((n) => <NavItem key={n.to} to={n.to} icon={n.icon} label={n.label} />)}
        </nav>
        <button onClick={logout} className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-ink-800 hover:text-red-400">
          <LogOut size={18} /> Logout
        </button>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-ink-700 bg-ink-900/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-400 text-white">
            <HardDrive size={16} />
          </div>
          <span className="text-sm font-semibold text-slate-100">Bucket Pribadi</span>
        </div>
        <button onClick={() => setMenu(!menu)} aria-label="Menu" className="rounded-lg p-2 text-slate-300 hover:bg-ink-800">
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menu && (
        <div className="fixed inset-x-0 top-14 z-30 border-b border-ink-700 bg-ink-900 p-2 md:hidden">
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setMenu(false)}
              className={({ isActive }) => "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm " + (isActive ? "bg-ink-800 text-slate-100" : "text-slate-300 hover:bg-ink-800/60")}>
              <n.icon size={18} className="text-brand-400" /> {n.label}
            </NavLink>
          ))}
          <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-ink-800">
            <LogOut size={18} /> Logout
          </button>
        </div>
      )}

      <main className="flex-1 overflow-x-hidden p-6 pt-20 md:p-8 md:pt-8">{children}</main>
    </div>
  );
}
