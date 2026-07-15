import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Files from "./pages/Files";
import ApiKeys from "./pages/ApiKeys";
import Docs from "./pages/Docs";
import SuperAdmin from "./pages/SuperAdmin";

export default function App() {
  const [me, setMe] = useState<null | any>(null);
  const [loading, setLoading] = useState(true);
  const loc = useLocation();

  useEffect(() => {
    api.get("/auth/me").then((r) => setMe(r.data)).catch(() => setMe(null)).finally(() => setLoading(false));
  }, []);

  const onAuth = () => setMe({ ok: true });

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-ink-900 text-slate-500">Memuat…</div>;
  }

  if (!me) {
    return <Login onAuth={onAuth} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/files" element={<Files />} />
      <Route path="/keys" element={<ApiKeys />} />
      <Route path="/docs" element={<Docs />} />
      <Route path="/admin" element={<SuperAdmin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
