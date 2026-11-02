import { useEffect, useState } from "react";
import { sb } from "./supabase.js";
import { LOGO } from "./logo.js";
import { Icon } from "./icons.jsx";

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(!!sb);

  useEffect(() => {
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session ? session.user.id : null;
  useEffect(() => {
    if (!sb || !uid) return;
    let alive = true;
    (async () => {
      let r = null;
      for (let i = 0; i < 5 && !r; i++) {
        const { data } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
        r = data;
        if (!r) await new Promise((x) => setTimeout(x, 500));
      }
      if (alive) {
        setProfile(r);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid]);

  return { session, profile, setProfile, loading };
}

export function AuthScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!email.trim() || !pass) {
      setErr("Escribe tu correo y tu clave.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: pass });
      if (error) setErr("Correo o clave incorrectos.");
    } catch (x) {
      setErr("No se pudo conectar. Revisa tu internet.");
    }
    setBusy(false);
  };

  return (
    <div className="auth">
      {[1, 2, 3, 4, 5, 6, 7].map((n) => <span className="bub" key={n} />)}
      <div className="auth-card">
        <div className="brand"><img src={LOGO} alt="Master Wash Autolavado" /></div>
        <h1>Bienvenido</h1>
        <p className="auth-sub">Ingresa con la cuenta que te dio el jefe.</p>
        <form onSubmit={submit}>
          <div className="inp">
            <Icon n="mail" size={18} />
            <input type="email" autoComplete="email" inputMode="email" placeholder="Correo" aria-label="Correo"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="inp">
            <Icon n="lock" size={18} />
            <input type={show ? "text" : "password"} autoComplete="current-password" placeholder="Clave" aria-label="Clave"
              value={pass} onChange={(e) => setPass(e.target.value)} />
            <button type="button" className="eye" aria-label={show ? "Ocultar clave" : "Mostrar clave"} onClick={() => setShow((v) => !v)}>
              <Icon n={show ? "eyeoff" : "eye"} size={18} />
            </button>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          <button className="full gap big" disabled={busy}>{busy ? "Un momento..." : "Ingresar"}</button>
        </form>
      </div>
    </div>
  );
}
