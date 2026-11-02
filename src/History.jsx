import { useMemo, useState } from "react";
import { fmt, fmtHora, pagoLabel, PAGOS, extrasSum } from "./pdf.js";
import { dstr } from "./store.js";
import { Icon } from "./icons.jsx";

const RANGOS = [["7", "7 días"], ["30", "30 días"], ["all", "Todo"]];
const diaLabel = (f) =>
  new Date(f + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
const gan = (r) => (r.precio * r.pct) / 100;
const keyOf = (uid, fecha, turno) => `${uid || "local"}|${fecha}|${turno}`;

export default function History({ rows, cierres, isJefe, nombreUsuario, onPdf }) {
  const [rango, setRango] = useState("7");
  const [emp, setEmp] = useState("todos");
  const [openKey, setOpenKey] = useState(null);

  const empleados = useMemo(() => {
    const m = {};
    rows.forEach((r) => {
      if (r.user_id) m[r.user_id] = r.nombre || "Sin nombre";
    });
    return Object.entries(m);
  }, [rows]);

  const { groups, tot } = useMemo(() => {
    let list = rows;
    if (rango !== "all") {
      const lim = new Date();
      lim.setDate(lim.getDate() - Number(rango) + 1);
      const ls = dstr(lim);
      list = list.filter((r) => r.fecha >= ls);
    }
    if (isJefe && emp !== "todos") list = list.filter((r) => r.user_id === emp);
    const cmap = {};
    (cierres || []).forEach((c) => (cmap[keyOf(c.user_id, c.fecha, c.turno)] = c));
    const by = {};
    list.forEach((r) => {
      const k = keyOf(r.user_id, r.fecha, r.turno);
      (by[k] = by[k] || { key: k, fecha: r.fecha, turno: r.turno, nombre: r.nombre, rows: [] }).rows.push(r);
    });
    const g = Object.values(by)
      .map((x) => {
        const rs = [...x.rows].sort((a, b) => (a.hora < b.hora ? -1 : 1));
        const valor = rs.reduce((a, r) => a + r.precio, 0);
        const mia = rs.reduce((a, r) => a + gan(r), 0);
        const pagos = {};
        rs.forEach((r) => (pagos[r.pago] = (pagos[r.pago] || 0) + r.precio + extrasSum(r)));
        return {
          ...x, rows: rs, valor, mia, lav: valor - mia, pagos,
          extras: rs.reduce((a, r) => a + extrasSum(r), 0),
          propinas: rs.reduce((a, r) => a + (r.propina || 0), 0),
          cierre: cmap[x.key] || null,
        };
      })
      .sort((a, b) => {
        const ka = a.fecha + (a.turno === "noche" ? "1" : "0");
        const kb = b.fecha + (b.turno === "noche" ? "1" : "0");
        return ka < kb ? 1 : ka > kb ? -1 : 0;
      });
    return {
      groups: g,
      tot: {
        n: list.length,
        valor: g.reduce((a, x) => a + x.valor, 0),
        mia: g.reduce((a, x) => a + x.mia, 0),
        lav: g.reduce((a, x) => a + x.lav, 0),
      },
    };
  }, [rows, cierres, rango, emp, isJefe]);

  const turnoLabel = (t) => (t === "dia" ? "Turno del día" : "Turno de la noche");

  return (
    <div className="view">
      <div className="filters">
        <div className="seg">
          {RANGOS.map(([k, l]) => (
            <button key={k} className={rango === k ? "on" : ""} onClick={() => setRango(k)}>{l}</button>
          ))}
        </div>
        {isJefe && (
          <select value={emp} onChange={(e) => setEmp(e.target.value)} aria-label="Filtrar por empleado">
            <option value="todos">Todos los empleados</option>
            {empleados.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
      </div>

      <div className="stats">
        <div className="stat s1"><small>Motos</small><b>{tot.n}</b></div>
        <div className="stat s2"><small>Valor</small><b>{fmt(tot.valor)}</b></div>
        <div className="stat s3"><small>{isJefe ? "Empleados" : "Mía"}</small><b className="g">{fmt(tot.mia)}</b></div>
        <div className="stat s4"><small>Lavadero</small><b>{fmt(tot.lav)}</b></div>
      </div>

      <div className="scroll">
        {groups.length === 0 && <div className="card"><div className="empty">No hay turnos en este periodo.</div></div>}

        {groups.map((g) => {
          const open = openKey === g.key;
          const sub = `${turnoLabel(g.turno)} - ${g.rows.length} ${g.rows.length === 1 ? "moto" : "motos"} - ${fmt(g.valor)}`;
          const quien = g.nombre || nombreUsuario;
          const pdfTitle = `${diaLabel(g.fecha)} - ${turnoLabel(g.turno)}`;
          const base = `Turno_${g.turno === "dia" ? "Dia" : "Noche"}_${g.fecha}`;
          return (
            <article className={"card day" + (open ? " open" : "")} key={g.key}>
              <button className="day-head" onClick={() => setOpenKey(open ? null : g.key)} aria-expanded={open}>
                <span className="num"><Icon n={g.turno === "dia" ? "sun" : "moon"} size={16} /></span>
                <span className="day-t">
                  <b>{diaLabel(g.fecha)}{g.cierre ? <span className="tag ok">Cerrado</span> : <span className="tag">Abierto</span>}</b>
                  <small>{sub}</small>
                </span>
                <span className="day-g">{fmt(g.mia)}</span>
                <Icon n="chev" className="chev" />
              </button>
              <div className="collapse"><div>
                <div className="sumlist">
                  {isJefe && <div className="line sub"><span>Empleado</span><b>{quien}</b></div>}
                  <div className="line"><span>Valor de las motos</span><b>{fmt(g.valor)}</b></div>
                  <div className="line"><span>{isJefe ? "Empleado" : "Mi ganancia"}</span><b className="g">{fmt(g.mia)}</b></div>
                  <div className="line"><span>Lavadero</span><b>{fmt(g.lav)}</b></div>
                  {PAGOS.filter(([k]) => g.pagos[k]).map(([k, l]) => (
                    <div className="line sub" key={k}><span>Cobrado en {l.toLowerCase()}</span><b>{fmt(g.pagos[k])}</b></div>
                  ))}
                  {g.extras > 0 && <div className="line sub"><span>Extras (sin porcentaje)</span><b>{fmt(g.extras)}</b></div>}
                  {g.cierre ? (
                    <>
                      <div className="line sub"><span>Bolsa de propinas</span><b>{fmt(g.cierre.bolsa || 0)}</b></div>
                      <div className="line"><span>{isJefe ? "Parte del empleado" : "Mi parte de propinas"}</span><b className="g">{fmt(g.cierre.parte || 0)}</b></div>
                      <div className="line sub"><span>Cerrado a las</span><b>{fmtHora(g.cierre.cerrado_en)}</b></div>
                    </>
                  ) : (
                    g.propinas > 0 && <div className="line sub"><span>Propinas registradas</span><b>{fmt(g.propinas)}</b></div>
                  )}
                </div>
                <div className="row gap">
                  <button className="opt c" onClick={() => onPdf(g.rows, "con", pdfTitle, quien, base)}>
                    <Icon n="file" size={16} /> PDF con porcentaje
                  </button>
                  <button className="opt c" onClick={() => onPdf(g.rows, "sin", pdfTitle, quien, base)}>
                    <Icon n="file" size={16} /> PDF solo valor
                  </button>
                </div>
              </div></div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
