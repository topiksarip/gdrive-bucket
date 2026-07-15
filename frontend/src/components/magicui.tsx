import { ReactNode, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LucideIcon } from "lucide-react";

/* ============================================================
   Bucket Pribadi — UI kit (ported Magic UI + custom)
   Palet: ink (surface) + brand (indigo accent ONLY) + emerald/danger.
   Restraint: accent used for emphasis only, radii rounded-xl,
   motion on entrance/hover only. No constant gradients.
   ============================================================ */

/* ---------- Primary button ---------- */
export function PrimaryButton({
  children, className = "", onClick, type = "button", disabled,
}: {
  children: ReactNode; className?: string; onClick?: () => void;
  type?: "button" | "submit"; disabled?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`group relative inline-flex items-center justify-center overflow-hidden rounded-xl bg-brand-500 px-5 py-2.5
        text-sm font-medium text-white shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_8px_24px_-12px_rgba(99,102,241,0.7)]
        transition hover:bg-brand-400 disabled:opacity-50 ${className}`}>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent
        transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
}

/* ---------- Secondary / ghost button ---------- */
export function SecondaryButton({
  children, className = "", onClick,
}: { children: ReactNode; className?: string; onClick?: () => void; }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center justify-center rounded-xl border border-ink-700 bg-ink-800 px-4 py-2 text-sm
        text-slate-200 transition hover:border-brand-500/40 hover:bg-ink-700 ${className}`}>
      <span className="flex items-center gap-2">{children}</span>
    </button>
  );
}

/* ---------- Blur Fade (entrance, once) ---------- */
export function BlurFade({
  children, className = "", delay = 0, y = 10,
}: { children: ReactNode; className?: string; delay?: number; y?: number; }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={`transition-all duration-700 ease-out ${show ? "opacity-100" : "opacity-0"} ${className}`}
      style={{ transform: show ? "translateY(0)" : `translateY(${y}px)` }}>
      {children}
    </div>
  );
}

/* ---------- Retro Grid (ambient bg, masked) ---------- */
export function RetroGrid({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(to right, rgba(99,102,241,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.07) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse at 30% 20%, black 30%, transparent 80%)",
      }} />
  );
}

/* ---------- Marquee (account rail) ---------- */
export function Marquee({ children, className = "", reverse = false }: {
  children: ReactNode; className?: string; reverse?: boolean;
}) {
  return (
    <div className={`flex overflow-hidden ${className}`} aria-hidden="true">
      <div className="flex shrink-0 items-center gap-3 pr-3" style={{ animation: `marquee ${reverse ? "30s" : "24s"} linear infinite reverse` }}>
        {children}
      </div>
      <div className={`flex shrink-0 items-center gap-3 pr-3 ${reverse ? "hidden" : ""}`} style={{ animation: `marquee ${reverse ? "30s" : "24s"} linear infinite reverse` }}>
        {children}
      </div>
    </div>
  );
}

/* ---------- StatCard (KPI) with optional progress ring ---------- */
export function StatCard({
  label, value, sub, accent = "slate", icon, pct,
}: { label: string; value: string; sub?: string; accent?: "slate" | "brand" | "emerald"; icon?: ReactNode; pct?: number; }) {
  const accentText = accent === "brand" ? "text-brand-400" : accent === "emerald" ? "text-emerald-400" : "text-slate-100";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/60 p-5 transition hover:border-brand-500/30">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/5 blur-2xl" />
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
        {icon && <span className="text-slate-500 transition group-hover:text-brand-400">{icon}</span>}
      </div>
      <div className={`mt-3 text-[28px] font-semibold leading-none ${accentText}`}>{value}</div>
      <div className="mt-1.5 flex items-center justify-between">
        {sub && <span className="text-xs text-slate-500">{sub}</span>}
        {pct != null && <ProgressRing pct={pct} size={34} />}
      </div>
    </div>
  );
}

/* ---------- Mini circular progress ---------- */
export function ProgressRing({ pct, size = 40, stroke = 4 }: { pct: number; size?: number; stroke?: number; }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const col = pct > 85 ? "#f87171" : pct > 60 ? "#fbbf24" : "#34d399";
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset .6s ease" }} />
    </svg>
  );
}

/* ---------- Linear progress bar ---------- */
export function Bar({ pct, tone = "brand" }: { pct: number; tone?: "brand" | "emerald" | "amber" | "danger" }) {
  const w = Math.min(100, Math.max(0, pct));
  const bg = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : tone === "danger" ? "bg-red-500" : "bg-brand-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
      <div className={`h-full rounded-full ${bg} transition-all duration-500`} style={{ width: `${w}%` }} />
    </div>
  );
}

/* ---------- Sidebar nav item (active indicator) ---------- */
export function NavItem({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <NavLink to={to} end={to === "/"}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition
         ${isActive ? "bg-ink-800 text-slate-100" : "text-slate-400 hover:bg-ink-800/60 hover:text-slate-200"}`}>
      {({ isActive }) => (<>
        <span className={`absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-500 transition ${isActive ? "opacity-100" : "opacity-0"}`} />
        <Icon size={18} className={isActive ? "text-brand-400" : "text-slate-500 group-hover:text-slate-300"} />
        <span className="font-medium">{label}</span>
      </>)}
    </NavLink>
  );
}

/* ---------- Reusable states ---------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-ink-700/60 ${className}`} />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode; }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-800/30 py-14 text-center">
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string; }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-100">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({ tone = "slate", children }: { tone?: "slate" | "brand" | "emerald" | "amber" | "danger"; children: ReactNode }) {
  const map: Record<string, string> = {
    slate: "bg-ink-700 text-slate-300",
    brand: "bg-brand-500/15 text-brand-300 border border-brand-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
    amber: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
    danger: "bg-red-500/15 text-red-300 border border-red-500/30",
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${map[tone]}`}>{children}</span>;
}
