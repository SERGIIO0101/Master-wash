import { useEffect, useRef, useState } from "react";
import { buildPdf, fmt, fmtHora, pagoLabel, extrasSum, PAGOS } from "./pdf.js";
import { LOGO } from "./logo.js";
import { sb } from "./supabase.js";
import { useAuth, AuthScreen } from "./Auth.jsx";
import { useStore, savePhoto, dropPhoto, uid, fechaOp } from "./store.js";
import { ModelPicker, Thumb } from "./parts.jsx";
import History from "./History.jsx";
import { Icon } from "./icons.jsx";

const AKEY = "motos-ajustes-v3";
const QUICK = [8000, 10000, 12000, 15000];
const MAX_FOTOS = 6;
const QUICK_PROP = [1000, 2000, 5000];
const EXTRAS_DEF = ["Papas", "Manimotos", "Cerveza", "Vive 100", "Hidralite", "Agua", "Coca-Cola"].map((n) => ({ n, v: 0 }));
const AJ_DEF = { emp: "Sergio Alejandro Severiche Guerrero", pct: "40", extrasCat: EXTRAS_DEF };

const mergeExtras = (saved) =>
  EXTRAS_DEF.map((x) => {
    const f = (saved || []).find((y) => y.n === x.n);
    return f ? { n: x.n, v: Number(f.v) || 0 } : x;
  });
const clampPct = (v) => Math.min(Math.max(parseFloat(v) || 0, 0), 100);
function cleanPct(v) {
  const d = String(v).replace(/\D/g, "").slice(0, 3);
  return d !== "" && Number(d) > 100 ? "100" : d;
}
function loadAj() {
  try {
    const d = JSON.parse(localStorage.getItem(AKEY) || "null");
    if (d) return { ...AJ_DEF, ...d, extrasCat: mergeExtras(d.extrasCat) };
    const o = JSON.parse(localStorage.getItem("motos-lista-v2") || "null");
    if (o) return { emp: o.emp || AJ_DEF.emp, pct: o.pct || "40", extrasCat: mergeExtras(o.extrasCat) };
  } catch (e) {}
  return AJ_DEF;
}

function Root() {
  const { session, profile, setProfile, loading } = useAuth();
  if (!sb) return <Main user={null} profile={null} />;
  if (loading) return <div className="splash"><img src={LOGO} alt="Master Wash" /></div>;
  if (!session) return <AuthScreen />;
  if (!profile) {
    return (
      <div className="splash">
        <p>No se pudo cargar tu perfil. Intenta de nuevo.</p>
        <button onClick={() => sb.auth.signOut()}>Salir</button>
      </div>
    );
  }
  return <Main user={session.user} profile={profile} setProfile={setProfile} />;
}

function Intro({ onDone }) {
  const [out, setOut] = useState(false);
  useEffect(() => {
    const a = setTimeout(() => setOut(true), 2000);
    const b = setTimeout(onDone, 2500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, []);
  return (
    <div className={"intro" + (out ? " out" : "")} onClick={() => { setOut(true); setTimeout(onDone, 400); }} aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => <span className="bub" key={n} />)}
      <div className="intro-logo"><img src={LOGO} alt="" /></div>
    </div>
  );
}

export default function App() {
  const [intro, setIntro] = useState(true);
  return (
    <>
      <Root />
      {intro && <Intro onDone={() => setIntro(false)} />}
    </>
  );
}

function Main({ user, profile, setProfile }) {
  const cloud = !!sb;
  const isJefe = cloud && profile.rol === "jefe";
  const [aj, setAj] = useState(loadAj);
  const st = useStore(user);
  const [view, setView] = useState("reg");
  const [t, setT] = useState(() => {
    const h = new Date().getHours();
    return h >= 19 || h < 7 ? "noche" : "dia";
  });
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [precio, setPrecio] = useState("");
  const [pago, setPago] = useState("efectivo");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("turno");
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [pool, setPool] = useState(null);
  const [team, setTeam] = useState([]);
  const fileRef = useRef(null);

  const nombre = cloud ? profile.nombre : aj.emp;
  const pct = cloud ? profile.pct : clampPct(aj.pct);
  const hoy = fechaOp();
  const mine = cloud ? st.rows.filter((r) => r.user_id === user.id) : st.rows;
  const dayRows = mine.filter((r) => r.fecha === hoy);
  const items = dayRows.filter((r) => r.turno === t);
  const closed = st.cierres.find((c) => c.fecha === hoy && c.turno === t && (!cloud || c.user_id === user.id));
  const locked = !!closed;
  const sum = items.reduce((a, r) => a + r.precio, 0);
  const mia = items.reduce((a, r) => a + (r.precio * r.pct) / 100, 0);
  const extrasTot = items.reduce((a, r) => a + extrasSum(r), 0);
  const cobrado = {};
  items.forEach((r) => {
    cobrado[r.pago] = (cobrado[r.pago] || 0) + r.precio + extrasSum(r);
  });
  const propTot = items.reduce((a, r) => a + (r.propina || 0), 0);
  const sel = detail ? items.find((r) => r.id === detail) : null;
  const note = st.err || msg;
  const canEditExtras = !cloud || isJefe;

  useEffect(() => {
    if (!cloud || sheet !== "resumen" || locked) return;
    let alive = true;
    setPool(null);
    sb.rpc("bolsa_propinas", { p_fecha: hoy, p_turno: t }).then(({ data, error }) => {
      if (alive) setPool(error ? { error: true } : { rows: data || [] });
    });
    return () => {
      alive = false;
    };
  }, [cloud, sheet, hoy, t, st.rows, locked]);

  useEffect(() => {
    if (!menu) return;
    const k = (e) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [menu]);

  useEffect(() => {
    try {
      localStorage.setItem(AKEY, JSON.stringify(aj));
    } catch (e) {}
  }, [aj]);

  useEffect(() => {
    if (!cloud) return;
    sb.from("config").select("valor").eq("clave", "extras").maybeSingle().then(({ data }) => {
      if (data && Array.isArray(data.valor)) setAj((a) => ({ ...a, extrasCat: mergeExtras(data.valor) }));
    });
  }, [cloud]);

  useEffect(() => {
    if (!isJefe) return;
    sb.from("profiles").select("*").order("created_at").then(({ data }) => data && setTeam(data));
  }, [isJefe]);

  const saveExtras = () => {
    if (isJefe) sb.from("config").upsert({ clave: "extras", valor: aj.extrasCat }).then(({ error }) => error && setMsg("No se pudieron guardar los precios."));
  };
  const setPrecioExtra = (i, val) =>
    setAj((a) => ({ ...a, extrasCat: a.extrasCat.map((x, j) => (j === i ? { ...x, v: parseInt(val.replace(/\D/g, ""), 10) || 0 } : x)) }));

  const saveTeam = async (id, ch) => {
    setTeam((p) => p.map((x) => (x.id === id ? { ...x, ...ch } : x)));
    const { error } = await sb.from("profiles").update(ch).eq("id", id);
    if (error) setMsg("No se pudo guardar el cambio del equipo.");
    else if (id === user.id) setProfile((p) => ({ ...p, ...ch }));
  };

  const changePct = (v) => {
    const c = cleanPct(v);
    setAj((a) => ({ ...a, pct: c }));
    st.setRows((rs) => rs.map((r) => (r.fecha === hoy ? { ...r, pct: clampPct(c) } : r)));
  };

  const add = () => {
    const v = parseInt(precio.replace(/\D/g, ""), 10);
    if (!v) return;
    st.addRow({
      fecha: hoy, turno: t, placa: placa.trim().toUpperCase(), modelo: modelo.trim(), precio: v, pago, pct,
      user_id: user ? user.id : null, nombre,
    });
    setPlaca("");
    setModelo("");
    setPrecio("");
    setSheet(null);
  };

  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!sel) return;
    const owner = sel.user_id || (user ? user.id : "local");
    let fotos = [...sel.fotos];
    for (const f of files) {
      if (fotos.length >= MAX_FOTOS) {
        setMsg(`Máximo ${MAX_FOTOS} fotos por moto.`);
        break;
      }
      try {
        fotos = [...fotos, await savePhoto(owner, sel.id, f)];
      } catch (err) {
        setMsg("No se pudo guardar una foto.");
      }
    }
    st.patchRow(sel.id, { fotos });
  };

  const addExtra = (x) => {
    if (sel && x.v) st.patchRow(sel.id, { extras: [...sel.extras, { n: x.n, v: x.v }] });
  };

  const makePdf = (list, mode, subtitle, empName, base) => {
    if (!list.length) {
      setMsg("No hay motos para incluir.");
      return;
    }
    buildPdf({ rows: list, mode, emp: empName, subtitle }).save(`${base}${mode === "con" ? "_con_porcentaje" : "_valor_motos"}.pdf`);
    setMsg("PDF generado.");
  };

  const generate = (mode) => {
    setOpen(false);
    st.setErr("");
    if (scope === "dia") makePdf(dayRows, mode, "Día completo", nombre, "Dia_completo");
    else makePdf(items, mode, t === "dia" ? "Turno del día" : "Turno de la noche", nombre, t === "dia" ? "Turno_Dia" : "Turno_Noche");
  };

  let bolsa = null;
  if (closed) bolsa = { total: closed.bolsa || 0, parte: closed.parte || 0, fixed: true };
  else if (!cloud) bolsa = { total: propTot, motos: items.length, mias: items.length, parte: propTot };
  else if (pool && pool.rows) {
    const total = pool.rows.reduce((a, r) => a + r.propinas, 0);
    const motos = pool.rows.reduce((a, r) => a + r.motos, 0);
    const me = pool.rows.find((r) => r.user_id === user.id);
    const mias = me ? me.motos : 0;
    bolsa = { total, motos, mias, parte: motos ? Math.round((total * mias) / motos) : 0 };
  }

  const today = new Date().toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
  const rolLabel = cloud ? (isJefe ? "Jefe" : "Empleado") : "Modo local";
  const goMenu = (fn) => () => {
    setMenu(false);
    fn();
  };
  const closeTurno = async () => {
    if (!items.length || locked) return;
    const nom = t === "dia" ? "del día" : "de la noche";
    if (!window.confirm(`¿Cerrar el turno ${nom}? Ya no podrás agregar ni editar motos.`)) return;
    st.setErr("");
    const ok = await st.closeShift({
      id: uid(), user_id: user ? user.id : null, fecha: hoy, turno: t,
      cerrado_en: new Date().toISOString(), bolsa: propTot, parte: propTot,
    });
    if (ok) {
      setSheet(null);
      setMsg("Turno cerrado.");
    }
  };
  const reabrir = () => {
    if (closed && window.confirm("¿Reabrir este turno para poder editarlo?")) {
      st.reopenShift(closed.id);
      setSheet(null);
    }
  };
  const vaciar = () => {
    if (items.length && !locked && window.confirm("¿Vaciar este turno?")) st.delRows(items);
  };

  return (
    <>
      <div className={"app " + (t === "noche" ? "night" : "day")}>
        <div className="hero">
          <div className="hero-top">
            <div className="menu-wrap">
              <button className="who" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                <span className="avatar">{(nombre || "?").trim().charAt(0).toUpperCase()}</span>
                <span className="who-t">
                  <b>{nombre || "Empleado"}</b>
                  <small>{rolLabel} - {today}</small>
                </span>
                <Icon n="chev" size={16} className={"who-chev" + (menu ? " up" : "")} />
              </button>
              {menu && (
                <>
                  <div className="scrim" onClick={() => setMenu(false)} />
                  <div className="menu" role="menu">
                    <div className="menu-head">
                      <b>{nombre || "Empleado"}</b>
                      <small>{rolLabel} - {pct}% para el empleado</small>
                    </div>
                    <button className="mi" role="menuitem" onClick={goMenu(() => setSheet("ajustes"))}>
                      <Icon n="gear" size={18} />Ajustes
                    </button>
                    <button className="mi" role="menuitem" disabled={!items.length || locked} onClick={goMenu(closeTurno)}>
                      <Icon n="lock" size={18} />Cerrar turno
                    </button>
                    <button className="mi" role="menuitem" disabled={!items.length || locked} onClick={goMenu(vaciar)}>
                      <Icon n="trash" size={18} />Vaciar este turno
                    </button>
                    {cloud && (
                      <button className="mi danger" role="menuitem" onClick={() => sb.auth.signOut()}>
                        <Icon n="out" size={18} />Cerrar sesión
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="brand mini"><img src={LOGO} alt="Master Wash Autolavado" /></div>
          </div>
          <div className="nav" data-v={view}>
            <span className="pill" />
            <button className={view === "reg" ? "on" : ""} onClick={() => setView("reg")}><Icon n="list" size={18} />Registro</button>
            <button className={view === "hist" ? "on" : ""} onClick={() => setView("hist")}><Icon n="clock" size={18} />Historial</button>
          </div>
        </div>

        {st.loading && <p className="loading">Cargando datos...</p>}

        {view === "hist" && (
          <History rows={st.rows} cierres={st.cierres} isJefe={isJefe} nombreUsuario={nombre} onPdf={makePdf} />
        )}

        {view === "reg" && (
          <>
            <div className="view">
              <div className="tabs" data-t={t}>
                <span className="pill" />
                <button className={t === "dia" ? "on" : ""} onClick={() => setT("dia")}><Icon n="sun" className="sun" />Día</button>
                <button className={t === "noche" ? "on" : ""} onClick={() => setT("noche")}><Icon n="moon" className="moon" />Noche</button>
              </div>

              <button className="stats tap" onClick={() => setSheet("resumen")} aria-label="Ver resumen del turno">
                <div className="stat s1"><small>Motos</small><b>{items.length}</b></div>
                <div className="stat s2"><small>Valor</small><b>{fmt(sum)}</b></div>
                <div className="stat s3"><small>Mía {pct}%</small><b className="g">{fmt(mia)}</b></div>
                <div className="stat s4"><small>Lavadero</small><b>{fmt(sum - mia)}</b></div>
              </button>

              <section className="card list">
                <h3>Motos del turno{locked && <span className="tag">Cerrado</span>}</h3>
                <div className="list-body">
                  {items.length === 0 && <div className="empty">Aún no hay motos en este turno.</div>}
                  {items.map((it, i) => (
                    <div className="item" key={it.id} role="button" tabIndex={0}
                      onClick={() => !locked && setDetail(it.id)}
                      onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && !locked && setDetail(it.id)}>
                      <div className="num">{i + 1}</div>
                      <div className="info">
                        <b>{it.placa || "Sin placa"}{it.modelo ? ` - ${it.modelo}` : ""}</b>
                        <span>
                          {fmtHora(it.hora)} - {pagoLabel(it.pago)}
                          {it.extras.length > 0 && ` - ${it.extras.length} extra${it.extras.length > 1 ? "s" : ""}`}
                          {it.propina > 0 && ` - propina ${fmt(it.propina)}`}
                          {it.fotos.length > 0 && ` - ${it.fotos.length} foto${it.fotos.length > 1 ? "s" : ""}`}
                        </span>
                      </div>
                      <div className="amt">
                        <b>{fmt(it.precio)}</b>
                        <span>Mía: {fmt((it.precio * it.pct) / 100)}</span>
                      </div>
                      {!locked && (
                        <button className="del" aria-label={`Quitar moto ${i + 1}`}
                          onClick={(e) => { e.stopPropagation(); st.delRows([it]); }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="bar">
              <div className="msg" role="status">{note}</div>
              <div className="bar-row">
                <button className="big grow" disabled={locked} onClick={() => { setMsg(""); st.setErr(""); setSheet("add"); }}>
                  <Icon n={locked ? "lock" : "plus"} size={20} />{locked ? "Turno cerrado" : "Agregar moto"}
                </button>
                <button className="big sec" disabled={!dayRows.length} aria-label="Generar PDF"
                  onClick={() => { setMsg(""); st.setErr(""); setOpen(true); }}>
                  <Icon n="file" size={20} />PDF
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {sheet === "add" && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet tall">
            <h2>Nueva moto</h2>
            <div className="row">
              <div>
                <label htmlFor="placa">Placa (opcional)</label>
                <input id="placa" maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder="ABC123"
                  value={placa} onChange={(e) => setPlaca(e.target.value)} />
              </div>
              <div>
                <label htmlFor="precio">Precio</label>
                <input id="precio" inputMode="numeric" autoComplete="off" placeholder="10000" autoFocus
                  value={precio} onChange={(e) => setPrecio(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && add()} />
              </div>
            </div>
            <div className="chips">
              {QUICK.map((v) => (
                <button key={v} className={"chip" + (String(v) === precio ? " on" : "")} onClick={() => setPrecio(String(v))}>
                  {fmt(v).replace("$ ", "")}
                </button>
              ))}
            </div>
            <label htmlFor="modelo">Modelo (opcional)</label>
            <ModelPicker id="modelo" value={modelo} onChange={setModelo} />
            <label className="gap">Método de pago</label>
            <div className="seg">
              {PAGOS.map(([k, l]) => (
                <button key={k} className={pago === k ? "on" : ""} onClick={() => setPago(k)}>{l}</button>
              ))}
            </div>
            <button className="full gap big" onClick={add}><Icon n="plus" size={18} />Agregar moto</button>
            <small className="hint">La hora se guarda sola. Fotos y extras se agregan tocando la moto en la lista.</small>
          </div>
        </div>
      )}

      {sheet === "resumen" && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet">
            <h2>Resumen del turno</h2>
            {items.length === 0 && <div className="empty">Aún no hay motos en este turno.</div>}
            {PAGOS.filter(([k]) => cobrado[k]).map(([k, l]) => (
              <div className="line" key={k}><span>{l}</span><b>{fmt(cobrado[k])}</b></div>
            ))}
            {extrasTot > 0 && <div className="line sub"><span>Incluye extras (sin porcentaje)</span><b>{fmt(extrasTot)}</b></div>}

            <h3 className="sec-t">Bolsa de propinas</h3>
            {cloud && !bolsa && <p className="hint">{pool && pool.error ? "No se pudo cargar la bolsa. Revisa tu conexión." : "Calculando..."}</p>}
            {bolsa && (
              <>
                <div className="line"><span>Propinas del turno</span><b>{fmt(bolsa.total)}</b></div>
                {!bolsa.fixed && <div className="line sub"><span>Motos del turno (todos)</span><b>{bolsa.motos}</b></div>}
                {!bolsa.fixed && <div className="line sub"><span>Mis motos</span><b>{bolsa.mias}</b></div>}
                <div className="line"><span>Mi parte</span><b className="g">{fmt(bolsa.parte)}</b></div>
                <small className="hint">Se reparte proporcional a las motos que lavó cada empleado. No entra en el porcentaje.</small>
              </>
            )}
            {locked ? (
              <>
                <p className="hint">Turno cerrado a las {fmtHora(closed.cerrado_en)}. Ya no se pueden agregar ni editar motos.</p>
                {(!cloud || isJefe) && <button className="opt c full" onClick={reabrir}>Reabrir turno</button>}
              </>
            ) : (
              <button className="full gap big" disabled={!items.length} onClick={closeTurno}>
                <Icon n="lock" size={18} />Cerrar turno
              </button>
            )}
            <button className="opt c full" onClick={() => setSheet(null)}>Volver</button>
          </div>
        </div>
      )}

      {sheet === "ajustes" && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="sheet tall">
            <h2>Ajustes</h2>
            <p className="hint">
              {cloud ? "Base de datos conectada: tus registros se guardan en la nube y quedan en el historial."
                : "Modo local: los datos se guardan solo en este celular. Para usuarios e historial compartido, conecta la base de datos (ver README)."}
            </p>
            {!cloud && (
              <>
                <div className="field"><label htmlFor="emp">Empleado</label>
                  <input id="emp" value={aj.emp} onChange={(e) => setAj({ ...aj, emp: e.target.value })} /></div>
                <div className="field"><label htmlFor="pct">Mi porcentaje (%)</label>
                  <input id="pct" inputMode="numeric" value={aj.pct} onChange={(e) => changePct(e.target.value)} /></div>
              </>
            )}
            <div className="field"><label htmlFor="lav">Porcentaje del lavadero (%)</label>
              <input id="lav" value={100 - pct} readOnly disabled />
              <small className="hint">Se calcula solo: siempre es 100 menos el porcentaje del empleado.
                {cloud ? " Lo define el jefe." : ""}</small></div>
            <div className="field"><label>Precios de los extras</label>
              {aj.extrasCat.map((x, i) => (
                <div className="line" key={x.n}>
                  <span>{x.n}</span>
                  {canEditExtras ? (
                    <input className="mini" inputMode="numeric" aria-label={`Precio de ${x.n}`}
                      value={x.v || ""} placeholder="0" onChange={(e) => setPrecioExtra(i, e.target.value)} onBlur={saveExtras} />
                  ) : (
                    <b>{x.v ? fmt(x.v) : "Sin precio"}</b>
                  )}
                </div>
              ))}
            </div>
            {isJefe && (
              <div className="field">
                <label>Equipo</label>
                {team.map((p) => (
                  <div className="team" key={p.id}>
                    <input className="team-in" defaultValue={p.nombre} placeholder="Nombre" aria-label="Nombre del empleado"
                      onBlur={(e) => e.target.value.trim() !== (p.nombre || "") && saveTeam(p.id, { nombre: e.target.value.trim() })} />
                    <select defaultValue={p.rol} disabled={p.id === user.id} aria-label={`Rol de ${p.nombre}`}
                      onChange={(e) => saveTeam(p.id, { rol: e.target.value })}>
                      <option value="empleado">Empleado</option>
                      <option value="jefe">Jefe</option>
                    </select>
                    <input className="mini sm" inputMode="numeric" defaultValue={p.pct} aria-label={`Porcentaje de ${p.nombre}`}
                      onBlur={(e) => saveTeam(p.id, { pct: Number(cleanPct(e.target.value)) || 0 })} />
                    <span className="pc">%</span>
                  </div>
                ))}
                <small className="hint">El porcentaje nuevo aplica a las motos que registre ese empleado de ahora en adelante.</small>
              </div>
            )}
            <button className="full gap" onClick={() => setSheet(null)}><Icon n="check" size={18} />Listo</button>
          </div>
        </div>
      )}

      {sel && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="sheet tall">
            <h2>{sel.placa || "Moto sin placa"} - {fmt(sel.precio)}</h2>
            <p className="hint">Entró a las {fmtHora(sel.hora)}</p>

            <label htmlFor="modelo2">Modelo</label>
            <ModelPicker id="modelo2" value={sel.modelo} onChange={(v) => st.patchRow(sel.id, { modelo: v })} />

            <label className="gap">Método de pago</label>
            <div className="seg">
              {PAGOS.map(([k, l]) => (
                <button key={k} className={sel.pago === k ? "on" : ""} onClick={() => st.patchRow(sel.id, { pago: k })}>{l}</button>
              ))}
            </div>

            <label className="gap">Extras (toca para agregar)</label>
            <div className="grid2">
              {aj.extrasCat.map((x) => (
                <button key={x.n} className="chip big2" disabled={!x.v} onClick={() => addExtra(x)}>
                  {x.n}<small>{x.v ? fmt(x.v) : "Sin precio"}</small>
                </button>
              ))}
            </div>
            {sel.extras.map((x, i) => (
              <div className="line" key={i}>
                <span>{x.n}</span>
                <span>
                  <b>{fmt(x.v)}</b>
                  <button className="del" aria-label={`Quitar ${x.n}`}
                    onClick={() => st.patchRow(sel.id, { extras: sel.extras.filter((_, j) => j !== i) })}>×</button>
                </span>
              </div>
            ))}

            <label className="gap" htmlFor="prop">Propina de esta moto (bolsa)</label>
            <div className="chips tight">
              {QUICK_PROP.map((v) => (
                <button key={v} className={"chip" + (sel.propina === v ? " on" : "")} onClick={() => st.patchRow(sel.id, { propina: v })}>
                  {fmt(v).replace("$ ", "")}
                </button>
              ))}
              <button className="chip" disabled={!sel.propina} onClick={() => st.patchRow(sel.id, { propina: 0 })}>Quitar</button>
            </div>
            <input id="prop" key={sel.id + "-" + sel.propina} inputMode="numeric" placeholder="Otro valor" defaultValue={sel.propina || ""}
              onBlur={(e) => {
                const v = parseInt(e.target.value.replace(/\D/g, ""), 10) || 0;
                if (v !== (sel.propina || 0)) st.patchRow(sel.id, { propina: v });
              }} />

            <label className="gap">Registro fotográfico (opcional) - {sel.fotos.length}/{MAX_FOTOS}</label>
            <div className="thumbs">
              {sel.fotos.map((f) => (
                <Thumb key={f} id={f} onRemove={() => { dropPhoto(f); st.patchRow(sel.id, { fotos: sel.fotos.filter((x) => x !== f) }); }} />
              ))}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={addFotos} />
            <button className="opt c" disabled={sel.fotos.length >= MAX_FOTOS} onClick={() => fileRef.current && fileRef.current.click()}>
              <Icon n="camera" size={18} />Tomar o elegir foto
            </button>

            <button className="full gap" onClick={() => setDetail(null)}><Icon n="check" size={18} />Listo</button>
          </div>
        </div>
      )}

      {open && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet">
            <h2>Generar PDF</h2>
            <label>¿Qué incluir?</label>
            <div className="seg">
              <button className={scope === "turno" ? "on" : ""} onClick={() => setScope("turno")}>Este turno</button>
              <button className={scope === "dia" ? "on" : ""} onClick={() => setScope("dia")}>Día completo</button>
            </div>
            <button className="opt" onClick={() => generate("con")}>
              Con porcentaje ya sacado<small>Precio, ganancia del empleado y lo del lavadero</small>
            </button>
            <button className="opt" onClick={() => generate("sin")}>
              Solo el valor de las motos<small>Sin descontar el porcentaje</small>
            </button>
            <button className="opt c" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </>
  );
}
