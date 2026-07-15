import { useState, useEffect, useRef } from "react";
import { api, fmtSize, fmtTime } from "../api";
import { Shell } from "./Dashboard";
import {
  Upload, Search, Download, Trash2, Folder, File as FileIcon, ChevronRight,
  Home, ArrowLeft, RefreshCw, Tag, Info, Copy, Link2, Eye, Lock, Globe, FolderPlus,
} from "lucide-react";
import { Badge } from "../components/magicui";

type Item = {
  id: string; name: string; mime_type: string; is_folder: boolean;
  size: number; parents: string[]; modified: string;
  is_public?: boolean; tag?: string;
};

type CtxMenu = { x: number; y: number; item: Item | null } | null;

export default function Files() {
  const [tab, setTab] = useState<"index" | "drive">("drive");

  const [files, setFiles] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [path, setPath] = useState("/");
  const [msg, setMsg] = useState("");

  const [browse, setBrowse] = useState<Item[]>([]);
  const [folderId, setFolderId] = useState("root");
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([{ id: "root", name: "My Drive" }]);
  const [dq, setDq] = useState("");
  const [driveAcc, setDriveAcc] = useState<any>(null);
  const [driveMsg, setDriveMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selAcc, setSelAcc] = useState<number | "">("");

  const [ctx, setCtx] = useState<CtxMenu>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [permPublic, setPermPublic] = useState(false);

  const [folderPrompt, setFolderPrompt] = useState(false);
  const [folderName, setFolderName] = useState("");

  async function loadIndex() {
    const r = q ? await api.get("/search?q=" + encodeURIComponent(q))
                : await api.get("/files?path=" + encodeURIComponent(path));
    setFiles(r.data.files);
  }
  useEffect(() => { if (tab === "index") loadIndex(); }, [q, path, tab]);

  async function loadAccounts() {
    try {
      const r = await api.get("/accounts");
      const list = r.data.accounts || [];
      setAccounts(list);
      if (selAcc === "" && list.length) {
        const firstReal = list.find((x: any) => !x.mock && x.connected) || list[0];
        setSelAcc(firstReal.id);
      }
    } catch { /* abaikan */ }
  }
  async function loadDrive() {
    setLoading(true); setDriveMsg("");
    try {
      const params = new URLSearchParams({ folder_id: folderId });
      if (selAcc !== "") params.set("account_id", String(selAcc));
      const r = await api.get("/drive/browse?" + params.toString());
      setBrowse(r.data.items);
      setDriveAcc(r.data.account);
    } catch (e: any) {
      setDriveMsg("Gagal memuat Drive: " + (e?.response?.data?.detail || "error"));
    } finally { setLoading(false); }
  }
  useEffect(() => { if (tab === "drive") loadAccounts(); }, [tab]);
  useEffect(() => { if (tab === "drive") loadDrive(); }, [folderId, selAcc, tab]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtx(null);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function onUploadIdx(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData(); fd.append("file", f); fd.append("path", path);
    try { await api.post("/upload", fd); setMsg("Upload berhasil → " + f.name); loadIndex(); }
    catch { setMsg("Upload gagal"); } finally { e.target.value = ""; }
  }
  async function dlIdx(id: number) {
    const r = await api.get("/files/" + id + "/download", { responseType: "blob" });
    const url = URL.createObjectURL(r.data); const a = document.createElement("a");
    a.href = url; a.click(); URL.revokeObjectURL(url);
  }
  async function delIdx(id: number) {
    if (!confirm("Hapus file ini?")) return;
    await api.delete("/files/" + id); loadIndex();
  }

  async function onUploadDrive(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setDriveMsg("Mengupload ke Google Drive…");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder_id", folderId);
      if (selAcc !== "") fd.append("account_id", String(selAcc));
      await api.post("/drive/upload", fd);
      setDriveMsg("Upload ke Drive berhasil → " + f.name);
      loadDrive();
    } catch (err: any) {
      setDriveMsg("Upload gagal: " + (err?.response?.data?.detail || err?.message || "error"));
    } finally { e.target.value = ""; }
  }
  async function dlDrive(it: Item) {
    const r = await api.get("/drive/files/" + it.id + "/link");
    const { url, method, token } = r.data;
    try {
      if (method === "bearer") {
        const resp = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (!resp.ok) { setDriveMsg("Download gagal: HTTP " + resp.status); return; }
        const blob = await resp.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = it.name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = it.name; a.target = "_blank"; a.rel = "noopener";
        document.body.appendChild(a); a.click(); a.remove();
      }
    } catch (e: any) { setDriveMsg("Download gagal: " + (e?.message || "error")); }
  }
  async function delDrive(it: Item) {
    if (!confirm("Hapus '" + it.name + "' dari Google Drive?")) return;
    try {
      await api.delete("/drive/files/" + it.id);
      setDriveMsg("Terhapus: " + it.name); loadDrive();
    } catch (err: any) { setDriveMsg("Gagal hapus: " + (err?.response?.data?.detail || "error")); }
  }
  function openFolder(it: Item) {
    setFolderId(it.id);
    setFolderStack([...folderStack, { id: it.id, name: it.name }]);
  }
  function goStack(idx: number) {
    const slice = folderStack.slice(0, idx + 1);
    setFolderStack(slice);
    setFolderId(slice[slice.length - 1].id);
  }

  function onRowContext(e: React.MouseEvent, it: Item | null) {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, item: it });
  }
  async function createFolderHere() { setCtx(null); setFolderPrompt(true); }
  async function doCreateFolder() {
    const name = folderName.trim();
    if (!name) { setFolderPrompt(false); return; }
    try {
      await api.post("/drive/folders", { name, folder_id: folderId, account_id: selAcc === "" ? undefined : selAcc });
      setDriveMsg("Folder dibuat: " + name);
      setFolderPrompt(false); setFolderName("");
      loadDrive();
    } catch (err: any) { setDriveMsg("Gagal buat folder: " + (err?.response?.data?.detail || "error")); setFolderPrompt(false); }
  }
  async function refreshDrive() { setCtx(null); await loadDrive(); setDriveMsg("Di-refresh"); }
  async function uploadHere() { setCtx(null); document.getElementById("drive-upload-input")?.click(); }
  async function copyPath(it: Item) {
    setCtx(null);
    try { const r = await api.get("/drive/files/" + it.id + "/path"); await navigator.clipboard.writeText(r.data.path); setDriveMsg("Path disalin: " + r.data.path); }
    catch { setDriveMsg("Gagal copy path"); }
  }
  async function copyDownloadLink(it: Item) {
    setCtx(null);
    try { const r = await api.get("/drive/files/" + it.id + "/links"); await navigator.clipboard.writeText(r.data.download_link || r.data.preview_link); setDriveMsg("Link download disalin"); }
    catch { setDriveMsg("Gagal copy link"); }
  }
  async function copyPreviewLink(it: Item) {
    setCtx(null);
    try { const r = await api.get("/drive/files/" + it.id + "/links"); await navigator.clipboard.writeText(r.data.preview_link); setDriveMsg("Link preview disalin"); }
    catch { setDriveMsg("Gagal copy link"); }
  }
  async function togglePerm(it: Item) {
    setCtx(null);
    try { await api.post("/drive/files/" + it.id + "/permission", { public: !it.is_public }); setDriveMsg(it.is_public ? "Di-set private" : "Di-set public"); loadDrive(); }
    catch { setDriveMsg("Gagal ubah permission"); }
  }
  async function openDetail(it: Item) {
    setCtx(null);
    setDetailLoading(true); setDetail(null);
    try {
      const [m, p] = await Promise.all([
        api.get("/drive/files/" + it.id + "/metadata"),
        api.get("/drive/files/" + it.id + "/permissions"),
      ]);
      setDetail(m.data);
      setPermPublic(p.data.is_public);
      setTagDraft(m.data.tag || "");
      setNoteDraft(m.data.note || "");
    } catch (e: any) { setDriveMsg("Gagal muat detail: " + (e?.response?.data?.detail || "error")); }
    finally { setDetailLoading(false); }
  }
  async function openObjectTag(it: Item) { setCtx(null); await openDetail(it); }
  async function saveMeta() {
    if (!detail) return;
    try {
      await api.put("/drive/files/" + detail.id + "/meta", { tag: tagDraft, note: noteDraft });
      setDriveMsg("Tag/note tersimpan");
      setDetail({ ...detail, tag: tagDraft, note: noteDraft });
    } catch { setDriveMsg("Gagal simpan meta"); }
  }

  const shownDrive = dq
    ? browse.filter((b) => b.name.toLowerCase().includes(dq.toLowerCase()))
    : browse;

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-100">Files</h1>
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-800 p-1">
          <button onClick={() => setTab("drive")}
            className={"rounded-md px-3 py-1.5 text-sm " + (tab === "drive" ? "bg-brand-500 text-white" : "text-slate-300")}>Google Drive (asli)</button>
          <button onClick={() => setTab("index")}
            className={"rounded-md px-3 py-1.5 text-sm " + (tab === "index" ? "bg-brand-500 text-white" : "text-slate-300")}>Bucket Index</button>
        </div>
      </div>

      {tab === "index" && (
        <>
          <div className="mb-4 flex gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-400">
              Upload <Upload size={14} className="inline" />
              <input type="file" className="hidden" onChange={onUploadIdx} />
            </label>
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2">
              <Search size={16} className="text-slate-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari file…" className="w-full bg-transparent text-sm text-slate-100 outline-none" />
            </div>
            <input value={path} onChange={(e) => setPath(e.target.value)} className="w-40 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-slate-100" placeholder="/path" />
          </div>
          {msg && <div className="mb-3 text-sm text-emerald-400">{msg}</div>}
          <div className="overflow-hidden rounded-2xl border border-ink-700">
            <table className="w-full text-sm">
              <thead className="bg-ink-900 text-xs text-slate-400">
                <tr><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Path</th><th className="p-3 text-right">Ukuran</th><th className="p-3 text-left">Diupload</th><th className="p-3 text-right">Aksi</th></tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id} className="border-t border-ink-700/70 bg-ink-800/30 hover:bg-ink-800" onContextMenu={(e) => onRowContext(e, null)}>
                    <td className="p-3 text-slate-100">{f.name}</td>
                    <td className="p-3 text-slate-400">{f.path}</td>
                    <td className="p-3 text-right text-slate-400">{fmtSize(f.size)}</td>
                    <td className="p-3 text-xs text-slate-500">{fmtTime(f.created_at)}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => dlIdx(f.id)} className="rounded-lg p-1.5 text-brand-400 transition hover:bg-ink-700" title="Download"><Download size={15} /></button>
                      <button onClick={() => delIdx(f.id)} className="rounded-lg p-1.5 text-red-400 transition hover:bg-ink-700" title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {files.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Kosong</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "drive" && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-300">
              {folderStack.map((c, i) => (
                <span key={c.id} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={14} className="text-slate-600" />}
                  <button onClick={() => goStack(i)} className="flex items-center gap-1 hover:text-brand-400">
                    {i === 0 ? <Home size={14} /> : null}{c.name}
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={refreshDrive} className="flex items-center gap-1 rounded-xl bg-ink-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-ink-600" title="Refresh"><RefreshCw size={14} /> Refresh</button>
              <button onClick={createFolderHere} className="flex items-center gap-1 rounded-xl bg-ink-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-ink-600" title="Buat folder"><FolderPlus size={14} /> Folder</button>
              <label className="flex cursor-pointer items-center gap-1 rounded-xl bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-400">
                Upload <Upload size={14} className="inline" />
                <input id="drive-upload-input" type="file" className="hidden" onChange={onUploadDrive} />
              </label>
            </div>
          </div>

          <div className="mb-3 flex gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-800 px-3 py-2">
              <Search size={16} className="text-slate-500" />
              <input value={dq} onChange={(e) => setDq(e.target.value)} placeholder="Cari di folder ini…" className="w-full bg-transparent text-sm text-slate-100 outline-none" />
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-slate-400">Drive aktif:</label>
              <select value={selAcc} onChange={(e) => setSelAcc(e.target.value === "" ? "" : Number(e.target.value))}
                className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-brand-500">
                {accounts.map((ac: any) => (
                  <option key={ac.id} value={ac.id}>{ac.label} ({ac.email}){ac.connected ? "" : " · off"}</option>
                ))}
              </select>
              {driveAcc && <span className="text-xs text-slate-500">· live dari {driveAcc.email}</span>}
            </div>
          )}
          {driveMsg && <div className="mb-3 text-sm text-emerald-400">{driveMsg}</div>}
          {loading && <div className="mb-3 text-sm text-slate-400">Memuat…</div>}

          <div className="overflow-hidden rounded-2xl border border-ink-700" onContextMenu={(e) => onRowContext(e, null)}>
            <table className="w-full text-sm">
              <thead className="bg-ink-900 text-xs text-slate-400">
                <tr><th className="p-3 text-left">Nama</th><th className="p-3 text-left">Tipe</th><th className="p-3 text-right">Ukuran</th><th className="p-3 text-left">Diubah</th><th className="p-3 text-right">Aksi</th></tr>
              </thead>
              <tbody>
                {shownDrive.map((it) => (
                  <tr key={it.id} className="border-t border-ink-700/70 bg-ink-800/30 transition hover:bg-ink-800"
                      onContextMenu={(e) => onRowContext(e, { ...it, is_public: it.is_public })}>
                    <td className="p-3 text-slate-100">
                      {it.is_folder
                        ? <button onClick={() => openFolder(it)} className="flex items-center gap-2 hover:text-brand-400"><Folder size={16} className="text-amber-400" />{it.name}</button>
                        : <span className="flex items-center gap-2"><FileIcon size={16} className="text-slate-400" />{it.name}</span>}
                      {it.tag && <Badge tone="brand" children={it.tag} />}
                    </td>
                    <td className="p-3 text-slate-400">{it.is_folder ? "Folder" : (it.mime_type || "file")}</td>
                    <td className="p-3 text-right text-slate-400">{it.is_folder ? "—" : fmtSize(it.size)}</td>
                    <td className="p-3 text-xs text-slate-500">{it.modified ? fmtTime(it.modified) : ""}</td>
                    <td className="p-3 text-right">
                      {!it.is_folder && <button onClick={() => dlDrive(it)} className="rounded-lg p-1.5 text-brand-400 transition hover:bg-ink-700" title="Download"><Download size={15} /></button>}
                      <button onClick={() => openDetail({ ...it, is_public: it.is_public })} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200" title="Detail"><Info size={15} /></button>
                      <button onClick={() => delDrive(it)} className="rounded-lg p-1.5 text-red-400 transition hover:bg-ink-700 hover:text-red-300" title="Delete"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
                {!loading && shownDrive.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-slate-500">Folder kosong (klik kanan untuk buat folder / upload)</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {ctx && (
        <div ref={ctxRef}
             className="fixed z-50 min-w-[200px] rounded-xl border border-ink-700 bg-ink-900 py-1 text-sm shadow-2xl"
             style={{ left: Math.min(ctx.x, window.innerWidth - 220), top: Math.min(ctx.y, window.innerHeight - 360) }}>
          {!ctx.item && (
            <>
              <MenuItem icon={<FolderPlus size={15} />} label="Buat Folder" onClick={createFolderHere} />
              <MenuItem icon={<RefreshCw size={15} />} label="Refresh" onClick={refreshDrive} />
              <MenuItem icon={<Upload size={15} />} label="Upload ke sini" onClick={uploadHere} />
            </>
          )}
          {ctx.item && (
            <>
              <MenuItem icon={<Info size={15} />} label="Detail" onClick={() => openDetail(ctx.item!)} />
              <MenuItem icon={<Tag size={15} />} label="Object Tag" onClick={() => openObjectTag(ctx.item!)} />
              <MenuItem icon={<Copy size={15} />} label="Copy Path" onClick={() => copyPath(ctx.item!)} />
              {!ctx.item.is_folder && <MenuItem icon={<Link2 size={15} />} label="Copy Link Download" onClick={() => copyDownloadLink(ctx.item!)} />}
              {!ctx.item.is_folder && <MenuItem icon={<Eye size={15} />} label="Copy Link Preview" onClick={() => copyPreviewLink(ctx.item!)} />}
              <MenuItem icon={ctx.item.is_public ? <Lock size={15} /> : <Globe size={15} />}
                        label={ctx.item.is_public ? "Set Private" : "Set Public"}
                        onClick={() => togglePerm(ctx.item!)} />
              <div className="my-1 border-t border-ink-700" />
              {!ctx.item.is_folder && <MenuItem icon={<Download size={15} />} label="Download" onClick={() => dlDrive(ctx.item!)} />}
              <MenuItem icon={<Trash2 size={15} />} label="Delete" danger onClick={() => delDrive(ctx.item!)} />
            </>
          )}
        </div>
      )}

      {folderPrompt && (
        <Modal onClose={() => setFolderPrompt(false)}>
          <h3 className="mb-3 text-lg font-semibold text-slate-100">Buat Folder Baru</h3>
          <input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && doCreateFolder()}
                 placeholder="Nama folder…"
                 className="mb-4 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand-500" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setFolderPrompt(false)} className="rounded-xl bg-ink-700 px-3 py-2 text-slate-200 hover:bg-ink-600">Batal</button>
            <button onClick={doCreateFolder} className="rounded-xl bg-brand-500 px-3 py-2 text-white hover:bg-brand-400">Buat</button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal onClose={() => setDetail(null)}>
          {detailLoading ? <div className="text-slate-400">Memuat…</div> : (
            <div className="max-w-lg">
              <div className="mb-3 flex items-center gap-2">
                {detail.is_folder ? <Folder size={18} className="text-amber-400" /> : <FileIcon size={18} className="text-slate-400" />}
                <h3 className="truncate text-lg font-semibold text-slate-100">{detail.name}</h3>
              </div>
              <dl className="space-y-1.5 text-sm text-slate-300">
                <Row k="ID" v={detail.id} />
                <Row k="Tipe" v={detail.mime_type} />
                <Row k="Ukuran" v={detail.is_folder ? "—" : fmtSize(detail.size)} />
                <Row k="Dibuat" v={fmtTime(detail.created)} />
                <Row k="Diubah" v={fmtTime(detail.modified)} />
                <Row k="Owner Saya" v={detail.owner_me ? "Ya" : "Tidak"} />
              </dl>

              <div className="mt-4">
                <label className="text-xs text-slate-400">Object Tag</label>
                <input value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="mis. project-abc, rahasia…"
                       className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-brand-500" />
              </div>
              <div className="mt-2">
                <label className="text-xs text-slate-400">Catatan</label>
                <textarea value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} rows={2}
                          className="mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-brand-500" />
              </div>
              <button onClick={saveMeta} className="mt-2 rounded-xl bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-400">Simpan Tag & Catatan</button>

              <div className="mt-4 border-t border-ink-700 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-300">Akses Publik</span>
                  <button onClick={async () => {
                      await api.post("/drive/files/" + detail.id + "/permission", { public: !permPublic });
                      setPermPublic(!permPublic); setDriveMsg(!permPublic ? "Di-set public" : "Di-set private");
                    }}
                    className={"rounded-xl px-3 py-1.5 text-sm " + (permPublic ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "bg-ink-700 text-slate-300")}>
                    {permPublic ? "Public (Anyone)" : "Private"}
                  </button>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Permissions:
                  {(detail.permissions || []).map((p: any, i: number) => (
                    <div key={i} className="flex gap-2"><span className="capitalize">{p.type}</span> · <span>{p.role}</span>{p.email && <span>· {p.email}</span>}</div>
                  ))}
                  {(detail.permissions || []).length === 0 && <span>—</span>}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {detail.web_view_link && <a href={detail.web_view_link} target="_blank" rel="noopener" className="flex items-center gap-1 rounded-xl bg-ink-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-ink-600"><Eye size={14} /> Preview</a>}
                {!detail.is_folder && <button onClick={() => dlDrive(detail as any)} className="flex items-center gap-1 rounded-xl bg-brand-500 px-3 py-1.5 text-sm text-white hover:bg-brand-400"><Download size={14} /> Download</button>}
              </div>
            </div>
          )}
        </Modal>
      )}
    </Shell>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={"flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-700 " + (danger ? "text-red-400" : "text-slate-200")}>
      {icon}{label}
    </button>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-800 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (<div className="flex justify-between gap-4"><dt className="text-slate-500">{k}</dt><dd className="break-all text-right text-slate-200">{v || "—"}</dd></div>);
}
