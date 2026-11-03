// Edge Function: administracion de cuentas desde la app (solo el jefe).
// Usa la clave de servicio del lado del servidor; esa clave nunca llega al navegador.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Sesion no valida. Vuelve a ingresar." }, 401);

    const admin = createClient(url, svc);
    const { data: me } = await admin.from("profiles").select("rol").eq("id", user.id).maybeSingle();
    if (!me || me.rol !== "jefe") return json({ error: "Solo el jefe puede hacer esto." }, 403);

    const b = await req.json();
    const pct = (v: unknown) => Math.min(Math.max(Math.round(Number(v)) || 0, 0), 100);

    if (b.action === "create") {
      const email = String(b.email || "").trim().toLowerCase();
      const nombre = String(b.nombre || "").trim();
      const password = String(b.password || "");
      const rol = b.rol === "jefe" ? "jefe" : "empleado";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "El correo no es valido." }, 400);
      if (!nombre) return json({ error: "Escribe el nombre." }, 400);
      if (password.length < 6) return json({ error: "La clave debe tener al menos 6 caracteres." }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre },
      });
      if (error || !data.user) {
        const dup = /already|registered|exists/i.test(error?.message || "");
        return json({ error: dup ? "Ese correo ya tiene una cuenta." : "No se pudo crear la cuenta." }, 400);
      }
      await admin.from("profiles").update({ nombre, rol, pct: pct(b.pct ?? 40) }).eq("id", data.user.id);
      return json({ ok: true, id: data.user.id });
    }

    if (b.action === "password") {
      const password = String(b.password || "");
      if (!b.id) return json({ error: "Falta el empleado." }, 400);
      if (password.length < 6) return json({ error: "La clave debe tener al menos 6 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.id, { password });
      if (error) return json({ error: "No se pudo cambiar la clave." }, 400);
      return json({ ok: true });
    }

    if (b.action === "activo") {
      if (!b.id) return json({ error: "Falta el empleado." }, 400);
      if (b.id === user.id) return json({ error: "No puedes desactivar tu propia cuenta." }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: b.activo ? "none" : "876000h" });
      if (error) return json({ error: "No se pudo cambiar el estado de la cuenta." }, 400);
      await admin.from("profiles").update({ activo: !!b.activo }).eq("id", b.id);
      return json({ ok: true });
    }

    return json({ error: "Accion desconocida." }, 400);
  } catch (e) {
    return json({ error: "Error inesperado en el servidor." }, 500);
  }
});
