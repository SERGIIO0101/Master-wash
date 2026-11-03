import { useEffect, useState } from "react";
import { MODELOS } from "./modelos.js";
import { photoUrl } from "./store.js";

export function ModelPicker({ id, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = MODELOS.filter((m) => m.toLowerCase().includes(term));
  const groups = {};
  list.forEach((m) => {
    const b = m.split(" ")[0];
    (groups[b] = groups[b] || []).push(m);
  });
  const custom = q.trim() && !MODELOS.some((m) => m.toLowerCase() === term);
  const pick = (v) => {
    onChange(v);
    setOpen(false);
    setQ("");
  };
  return (
    <>
      <button type="button" id={id} className={"picker" + (value ? "" : " unset")} onClick={() => setOpen(true)}>
        {value || "Seleccionar modelo"}
      </button>
      {open && (
        <div className="modal top" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet tall">
            <h2>Modelo de la moto</h2>
            <input autoFocus placeholder="Buscar o escribir otro modelo" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Buscar modelo" />
            <div className="mlist">
              {custom && (
                <button className="mopt use" onClick={() => pick(q.trim())}>
                  Usar “{q.trim()}”
                </button>
              )}
              {Object.entries(groups).map(([brand, ms]) => (
                <div key={brand}>
                  <div className="grp">{brand}</div>
                  {ms.map((m) => (
                    <button key={m} className={"mopt" + (m === value ? " sel" : "")} onClick={() => pick(m)}>{m}</button>
                  ))}
                </div>
              ))}
            </div>
            <div className="row gap">
              <button className="opt c" onClick={() => pick("")}>Sin modelo</button>
              <button className="opt c" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Thumb({ id, onRemove }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let res = null;
    photoUrl(id)
      .then((x) => {
        if (!alive) {
          if (x.revoke && x.url) URL.revokeObjectURL(x.url);
          return;
        }
        res = x;
        setUrl(x.url);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (res && res.revoke && res.url) URL.revokeObjectURL(res.url);
    };
  }, [id]);
  return (
    <div className="thumb">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Foto de la moto" /></a>
      ) : (
        <div className="ph" />
      )}
      <button className="rm" aria-label="Quitar foto" onClick={onRemove}>×</button>
    </div>
  );
}
