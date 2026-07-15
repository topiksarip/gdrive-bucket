import { useState, useEffect } from "react";
import { api } from "../api";
import { Shell } from "./Dashboard";
import { BookOpen, Copy, Check } from "lucide-react";
import { BlurFade, Badge } from "../components/magicui";

export default function Docs() {
  const [domain, setDomain] = useState("https://drive.losiento.dev");
  useEffect(() => {
    api.get("/settings/domain").then((r) => { if (r.data.domain) setDomain(r.data.domain); }).catch(() => {});
  }, []);

  const base = domain.replace(/\/$/, "") + "/api/v1";

  return (
    <Shell>
      <BlurFade>
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-brand-400" />
          <h1 className="text-2xl font-semibold text-slate-100">Dokumentasi API (untuk AI Agent)</h1>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Bucket ini bisa dikendalikan penuh oleh AI Agent via REST. Semua endpoint butuh <b>Access Key</b> (gaya AWS S3):
          kirim <code className="text-brand-400">Secret Access Key</code> sebagai header <code className="text-brand-400">X-API-Key</code>.
        </p>
        <div className="mt-4 rounded-xl border border-ink-700 bg-ink-800/60 p-4">
          <div className="mb-1 text-xs text-slate-400">Base URL (dari pengaturan Domain)</div>
          <code className="font-mono text-sm text-emerald-300 break-all">{base}</code>
        </div>
      </BlurFade>

      <div className="mt-6 space-y-6">
        <Section n="1" title="Autentikasi">
          <p className="mb-2 text-sm text-slate-300">Setiap request REST wajib header:</p>
          <Code>Authorization: APIKey &lt;SECRET&gt;</Code>
          <p className="mt-2 text-xs text-slate-400">atau</p>
          <Code>X-API-Key: &lt;SECRET&gt;</Code>
          <p className="mt-2 text-xs text-slate-400">Buat Access Key di menu <b>Access Keys</b>. Secret hanya tampil sekali.</p>
        </Section>

        <Section n="2" title="Akun & Kapasitas">
          <Endpoint method="GET" path="/accounts" desc="Daftar akun Cloud (A–G) + total kapasitas agregat." />
          <Code>{`curl ${base}/accounts -H "X-API-Key: ***"`}</Code>
        </Section>

        <Section n="3" title="File (Bucket Index lokal)">
          <Endpoint method="GET" path="/files?path=/" desc="List file di virtual path." />
          <Endpoint method="GET" path="/search?q=kata" desc="Cari file." />
          <Endpoint method="POST" path="/upload" desc="Upload file (form-data: file, path)." />
          <Endpoint method="GET" path="/files/{id}/download" desc="Download file (binary)." />
          <Endpoint method="DELETE" path="/files/{id}" desc="Hapus file lokal." />
        </Section>

        <Section n="4" title="Google Drive (live / singkronisasi)">
          <Endpoint method="GET" path="/drive/browse?folder_id=root" desc="List folder & file asli dari Drive." />
          <Endpoint method="POST" path="/drive/folders" desc="Buat folder. Body: {name, folder_id}" />
          <Endpoint method="POST" path="/drive/upload" desc="Upload ke folder. form-data: file, folder_id" />
          <Endpoint method="GET" path="/drive/files/{id}/link" desc="URL download langsung dari Google." />
          <Endpoint method="DELETE" path="/drive/files/{id}" desc="Hapus file/folder di Drive." />
          <Endpoint method="GET" path="/drive/files/{id}/metadata" desc="Metadata lengkap + tag/note." />
          <Endpoint method="PUT" path="/drive/files/{id}/meta" desc="Set object tag + catatan." />
          <Endpoint method="GET" path="/drive/files/{id}/path" desc="Path lengkap dari root." />
          <Endpoint method="GET" path="/drive/files/{id}/permissions" desc="Permission + status public." />
          <Endpoint method="POST" path="/drive/files/{id}/permission" desc="Set public/private." />
          <Endpoint method="GET" path="/drive/files/{id}/links" desc="Link download + preview." />
        </Section>

        <Section n="5" title="Contoh untuk AI Agent">
          <p className="mb-2 text-sm text-slate-300">Python — list Drive lalu upload:</p>
          <CodeBlock>{`import os, requests
BASE="${base}"
SEC=os.environ["BUCKET_SECRET"]          # Secret Access Key
H={"X-API-Key": SEC}

# 1) lihat isi Drive root
items = requests.get(f"{BASE}/drive/browse?folder_id=root", headers=H).json()["items"]
print([i["name"] for i in items])

# 2) upload file ke root
with open("laporan.pdf","rb") as f:
    r = requests.post(f"{BASE}/drive/upload", headers=H,
                      files={"file": f}, data={"folder_id":"root"})
print(r.json())

# 3) set public agar bisa di-share
fid = r.json()["drive_file_id"]
requests.post(f"{BASE}/drive/files/{fid}/permission", headers=H, json={"public": True})
links = requests.get(f"{BASE}/drive/files/{fid}/links", headers=H).json()
print("preview:", links["preview_link"])`}</CodeBlock>

          <p className="mb-2 mt-3 text-sm text-slate-300">JavaScript / n8n (fetch):</p>
          <CodeBlock>{`const BASE = "${base}";
const H = { "X-API-Key": SECRET };

const { items } = await fetch(\`\${BASE}/drive/browse?folder_id=root\`, { headers: H }).then(r => r.json());
console.log(items.map(i => i.name));

const fd = new FormData();
fd.append("file", fileBlob);
fd.append("folder_id", "root");
await fetch(\`\${BASE}/drive/upload\`, { method: "POST", headers: H, body: fd });`}</CodeBlock>

          <p className="mb-2 mt-3 text-sm text-slate-300">curl — buat folder lalu download link:</p>
          <CodeBlock>{`# buat folder
curl -X POST ${base}/drive/folders -H "X-API-Key: *** \\
     -H "Content-Type: application/json" -d '{"name":"AgentOut","folder_id":"root"}'

# link download langsung (traffic Google)
curl ${base}/drive/files/FILE_ID/link -H "X-API-Key: $SECRET"`}</CodeBlock>
        </Section>

        <Section n="6" title="Catatan Penting">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Penyimpanan Bucket = Google Drive asli (singkronisasi). Apa yang di-Drive adalah isi bucket.</li>
            <li>Download & export file mengalir <b>langsung dari server Google</b> (traffic tidak lewat VPS).</li>
            <li>Set Public membuat file dapat diakses siapa saja via link Drive (hati-hati data rahasia).</li>
            <li>Object Tag & catatan disimpan di DB lokal (tidak mengubah Drive).</li>
            <li>Access Key yang di-revoke akan langsung kehilangan akses.</li>
          </ul>
        </Section>
      </div>
    </Shell>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-100">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/15 text-xs text-brand-300">{n}</span>
        {title}
      </h2>
      <div className="space-y-2 border-l border-ink-700 pl-4">{children}</div>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const tone = method === "GET" ? "emerald" : method === "POST" ? "brand" : method === "PUT" ? "amber" : "danger";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge tone={tone as any}>{method}</Badge>
      <code className="font-mono text-xs text-slate-200">{path}</code>
      <span className="text-xs text-slate-500">— {desc}</span>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  const [c, setC] = useState(false);
  return (
    <div className="relative rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
      <code className="break-all font-mono text-xs text-emerald-300">{children}</code>
      <button onClick={() => { navigator.clipboard.writeText(String(children)); setC(true); setTimeout(() => setC(false), 1200); }}
        className="absolute right-2 top-2 text-slate-500 hover:text-slate-300">{c ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [c, setC] = useState(false);
  return (
    <div className="relative overflow-auto rounded-lg border border-ink-700 bg-ink-900 p-3">
      <pre className="whitespace-pre font-mono text-xs text-emerald-300">{children}</pre>
      <button onClick={() => { navigator.clipboard.writeText(String(children)); setC(true); setTimeout(() => setC(false), 1200); }}
        className="absolute right-2 top-2 text-slate-500 hover:text-slate-300">{c ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  );
}
