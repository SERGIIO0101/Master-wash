import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si no hay claves, la app funciona en modo local (sin base de datos).
export const sb = url && key ? createClient(url, key) : null;
