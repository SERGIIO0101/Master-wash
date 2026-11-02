import { useEffect, useState } from "react";
import { sb } from "./supabase.js";
import { putPhoto, getPhoto, delPhoto, compress } from "./photos.js";

const LKEY = "motos-lavadas-v3";
const CKEY = "motos-cierres-v1";

export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export const dstr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => dstr(new Date());
// Fecha del turno: los turnos van de 7 a. m. a 7 p. m. y de 7 p. m. a 7 a. m.,
// asi que la madrugada pertenece al turno de la noche que empezo el dia anterior.
export const fechaOp = () => dstr(new Date(Date.now() - 7 * 3600 * 1000));

function readCierres() {
  try {
    const d = JSON.parse(localStorage.getItem(CKEY) || "[]");
    return Array.isArray(d) ? d : [];
  } catch (e) {
    return [];
  }
}

function readLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LKEY) || "null");
    if (d && Array.isArray(d.rows)) return d.rows;
  } catch (e) {}
  // Migración de la versión anterior (lista del día en el teléfono)
  try {
    const o = JSON.parse(localStorage.getItem("motos-lista-v2") || "null");
    if (o && o.data) {
      const fecha = todayStr();
      const pct = parseFloat(o.pct) || 40;
      const conv = (turno) =>
        (o.data[turno] || []).map((it) => ({
          id: uid(), fecha, turno, placa: it.placa || "", modelo: it.modelo || "", precio: it.precio,
          hora: it.hora || new Date().toISOString(), pago: it.pago || "efectivo",
          extras: it.extras || [], fotos: it.fotos || [], pct,
        }));
      return [...conv("dia"), ...conv("noche")];
    }
  } catch (e) {}
  return [];
}

const fromDb = (r) => {
  const { profiles, ...rest } = r;
  return { ...rest, nombre: (profiles && profiles.nombre) || "", extras: r.extras || [], fotos: r.fotos || [], propina: r.propina || 0 };
};

export function useStore(user) {
  const [rows, setRows] = useState(() => (sb ? [] : readLocal()));
  const [loading, setLoading] = useState(!!sb);
  const [err, setErr] = useState("");
  const [cierres, setCierres] = useState(() => (sb ? [] : readCierres()));

  useEffect(() => {
    if (sb) return;
    try {
      localStorage.setItem(LKEY, JSON.stringify({ rows }));
    } catch (e) {}
  }, [rows]);

  useEffect(() => {
    if (sb) return;
    try {
      localStorage.setItem(CKEY, JSON.stringify(cierres));
    } catch (e) {}
  }, [cierres]);

  const userId = user ? user.id : null;
  useEffect(() => {
    if (!sb || !userId) return;
    let alive = true;
    const d = new Date();
    d.setDate(d.getDate() - 120);
    sb.from("cierres").select("*").gte("fecha", dstr(d)).then(({ data, error }) => {
      if (!alive) return;
      if (error) setErr("No se pudieron cargar los cierres de turno.");
      else setCierres(data);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!sb || !userId) return;
    let alive = true;
    const d = new Date();
    d.setDate(d.getDate() - 120);
    sb.from("lavadas")
      .select("*, profiles(nombre)")
      .gte("fecha", dstr(d))
      .order("hora", { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setErr("No se pudo cargar el historial.");
        else setRows(data.map(fromDb));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [userId]);

  const addRow = async (base) => {
    const row = { id: uid(), hora: new Date().toISOString(), extras: [], fotos: [], propina: 0, ...base };
    setRows((p) => [...p, row]);
    if (sb) {
      const { nombre, ...rec } = row;
      const { error } = await sb.from("lavadas").insert(rec);
      if (error) {
        setRows((p) => p.filter((r) => r.id !== row.id));
        setErr("No se pudo guardar la moto. Revisa tu conexión.");
      }
    }
  };

  const patchRow = async (id, ch) => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...ch } : r)));
    if (sb) {
      const { error } = await sb.from("lavadas").update(ch).eq("id", id);
      if (error) setErr("No se pudo guardar el cambio.");
    }
  };

  const delRows = async (list) => {
    const ids = list.map((r) => r.id);
    setRows((p) => p.filter((r) => !ids.includes(r.id)));
    list.forEach((r) => r.fotos.forEach(dropPhoto));
    if (sb && ids.length) {
      const { error } = await sb.from("lavadas").delete().in("id", ids);
      if (error) setErr("No se pudo eliminar.");
    }
  };

  const closeShift = async (rec) => {
    if (!sb) {
      setCierres((p) => [...p, rec]);
      return true;
    }
    const { data, error } = await sb
      .from("cierres")
      .insert({ id: rec.id, user_id: rec.user_id, fecha: rec.fecha, turno: rec.turno })
      .select()
      .single();
    if (error) {
      setErr("No se pudo cerrar el turno. Revisa tu conexión.");
      return false;
    }
    setCierres((p) => [...p, data]);
    return true;
  };

  const reopenShift = async (id) => {
    if (sb) {
      const { error } = await sb.from("cierres").delete().eq("id", id);
      if (error) {
        setErr("No se pudo reabrir el turno.");
        return;
      }
    }
    setCierres((p) => p.filter((c) => c.id !== id));
  };

  return { rows, setRows, loading, err, setErr, addRow, patchRow, delRows, cierres, closeShift, reopenShift };
}

// ---- Fotos: en el teléfono (modo local) o en Supabase Storage (modo nube) ----
export async function savePhoto(ownerId, rowId, file) {
  const blob = await compress(file);
  const id = uid();
  if (sb) {
    const path = `${ownerId}/${rowId}/${id}.jpg`;
    const { error } = await sb.storage.from("fotos").upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw error;
    return path;
  }
  await putPhoto(id, blob);
  return id;
}

export async function dropPhoto(id) {
  if (sb) {
    try {
      await sb.storage.from("fotos").remove([id]);
    } catch (e) {}
  } else {
    await delPhoto(id);
  }
}

export async function photoUrl(id) {
  if (sb) {
    const { data } = await sb.storage.from("fotos").createSignedUrl(id, 3600);
    return { url: (data && data.signedUrl) || null, revoke: false };
  }
  const b = await getPhoto(id);
  return b ? { url: URL.createObjectURL(b), revoke: true } : { url: null, revoke: false };
}
