import { useEffect, useState } from "react";
import { sb } from "./supabase.js";
import { Icon } from "./icons.jsx";

const cleanPct = (v) => {
  const d = String(v).replace(/\D/g, "").slice(0, 3);
  return d !== "" && Number(d) > 100 ? "100" : d;
};

async function call(body) {
  const { data, error } = await sb.functions.invoke("admin-usuarios", { body });
  if (error) {
    let m = "No se pudo completar la acción.";
    try {
      if (error.context && error.context.status === 404) m = "La función admin-usuarios no está desplegada en Supabase (ver README).";
      else {
        const j = await error.context.json();
        if (j && j.error) m = j.error;
      }
    } catch (e) {}
    throw new Error(m);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

const VACIO = { nombre: "", email: "", password: "", pct: "40", rol: "empleado" };

export default function Equipo({ user, setProfile, onClose }) {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [open, setOpen] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState(VACIO);
  const [newPass, setNewPass] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await sb.from("profiles").select("*").order("created_at");
    if (error) setErr("No se pudo cargar el equipo.");
    else setTeam(data);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const run = async (fn, msg) => {
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await fn();
      if (msg) setOk(msg);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  const saveProfile = async (id, ch) => {
    setErr("");
    setOk("");
    setTeam((p) => p.map((x) => (x.id === id ? { ...x, ...ch } : x)));
    const { error } = await sb.from("profiles").update(ch).eq("id", id);
    if (error) {
      setErr("No se pudo guardar el cambio.");
      load();
    } else if (id === user.id) setProfile((p) => ({ ...p, ...ch }));
  };

  const create = () =>
    run(async () => {
      await call({ action: "create", ...f, pct: Number(f.pct) || 0 });
      setF(VACIO);
      setCreating(false);
      await load();
    }, "Cuenta creada. Entrégale el correo y la clave al empleado.");

  const changePass = (id) =>
    run(async () => {
      await call({ action: "password", id, password: newPass });
      setNewPass("");
    }, "Clave actualizada.");

  const toggleActivo = (p) => {
    const activar = p.activo === false;
    if (!activar && !window.confirm(`¿Desactivar la cuenta de ${p.nombre || p.email}? No podrá ingresar, pero su historial se conserva.`)) return;
    run(async () => {
      await call({ action: "activo", id: p.id, activo: activar });
      setTeam((t) => t.map((x) => (x.id === p.id ? { ...x, activo: activar } : x)));
    }, activar ? "Cuenta activada." : "Cuenta desactivada.");
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet tall">
        <h2>Equipo</h2>
        {loading && <p className="hint">Cargando...</p>}
        {err && <p className="err" role="alert">{err}</p>}
        {ok && <p className="ok-msg" role="status">{ok}</p>}

        {team.map((p) => {
          const isOpen = open === p.id;
          const self = p.id === user.id;
          return (
            <div className={"member" + (p.activo === false ? " off" : "")} key={p.id}>
              <button className="member-head" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : p.id); setNewPass(""); setOk(""); }}>
                <span className="avatar">{(p.nombre || p.email || "?").trim().charAt(0).toUpperCase()}</span>
                <span className="info">
                  <b>{p.nombre || "Sin nombre"}{self ? " (tú)" : ""}</b>
                  <small>{p.email || "Sin correo"} - {p.rol === "jefe" ? "Jefe" : "Empleado"} - {p.pct}%</small>
                </span>
                {p.activo === false && <span className="tag">Inactivo</span>}
                <Icon n="chev" className={"chev" + (isOpen ? " up" : "")} />
              </button>
              {isOpen && (
                <div className="member-body">
                  <div className="field"><label htmlFor={"n" + p.id}>Nombre</label>
                    <input id={"n" + p.id} defaultValue={p.nombre} onBlur={(e) => e.target.value.trim() !== (p.nombre || "") && saveProfile(p.id, { nombre: e.target.value.trim() })} /></div>
                  <div className="row gap">
                    <div><label htmlFor={"r" + p.id}>Rol</label>
                      <select id={"r" + p.id} defaultValue={p.rol} disabled={self} onChange={(e) => saveProfile(p.id, { rol: e.target.value })}>
                        <option value="empleado">Empleado</option>
                        <option value="jefe">Jefe</option>
                      </select></div>
                    <div><label htmlFor={"p" + p.id}>Porcentaje (%)</label>
                      <input id={"p" + p.id} inputMode="numeric" defaultValue={p.pct} onBlur={(e) => saveProfile(p.id, { pct: Number(cleanPct(e.target.value)) || 0 })} /></div>
                  </div>
                  <small className="hint">El porcentaje nuevo aplica a las motos que registre de ahora en adelante.</small>
                  <div className="field"><label htmlFor={"c" + p.id}>Nueva clave</label>
                    <div className="row">
                      <input id={"c" + p.id} type="text" autoComplete="off" placeholder="Mínimo 6 caracteres" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
                      <button className="opt c" disabled={busy || newPass.length < 6} onClick={() => changePass(p.id)}>Cambiar</button>
                    </div></div>
                  {!self && (
                    <button className={"opt c full" + (p.activo === false ? "" : " danger")} disabled={busy} onClick={() => toggleActivo(p)}>
                      {p.activo === false ? "Activar cuenta" : "Desactivar cuenta"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {creating ? (
          <div className="member-body new">
            <h3>Nuevo empleado</h3>
            <div className="field"><label htmlFor="nn">Nombre completo</label>
              <input id="nn" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} /></div>
            <div className="field"><label htmlFor="ne">Correo</label>
              <input id="ne" type="email" inputMode="email" autoComplete="off" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="np">Clave inicial</label>
              <input id="np" type="text" autoComplete="off" placeholder="Mínimo 6 caracteres" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <div className="row gap">
              <div><label htmlFor="nx">Porcentaje (%)</label>
                <input id="nx" inputMode="numeric" value={f.pct} onChange={(e) => setF({ ...f, pct: cleanPct(e.target.value) })} /></div>
              <div><label htmlFor="nr">Rol</label>
                <select id="nr" value={f.rol} onChange={(e) => setF({ ...f, rol: e.target.value })}>
                  <option value="empleado">Empleado</option>
                  <option value="jefe">Jefe</option>
                </select></div>
            </div>
            <div className="row gap">
              <button className="opt c" onClick={() => { setCreating(false); setF(VACIO); setErr(""); }}>Cancelar</button>
              <button disabled={busy} onClick={create}>{busy ? "Creando..." : "Crear cuenta"}</button>
            </div>
          </div>
        ) : (
          <button className="full gap" onClick={() => { setCreating(true); setOk(""); setErr(""); }}><Icon n="plus" size={18} />Nuevo empleado</button>
        )}
        <button className="opt c full" onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
}
