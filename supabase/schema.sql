-- Master Wash: pegar completo en Supabase > SQL Editor > Run

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nombre text not null default '',
  rol text not null default 'empleado' check (rol in ('jefe','empleado')),
  pct int not null default 40 check (pct between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.lavadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  turno text not null check (turno in ('dia','noche')),
  placa text not null default '',
  modelo text not null default '',
  precio int not null check (precio > 0),
  hora timestamptz not null default now(),
  pago text not null default 'efectivo',
  extras jsonb not null default '[]',
  fotos jsonb not null default '[]',
  propina int not null default 0 check (propina >= 0),
  pct int not null default 40,
  created_at timestamptz not null default now()
);
create index if not exists lavadas_fecha_idx on public.lavadas (fecha desc);
create index if not exists lavadas_user_idx on public.lavadas (user_id);

create table if not exists public.config (
  clave text primary key,
  valor jsonb not null
);

alter table public.profiles enable row level security;
alter table public.lavadas enable row level security;
alter table public.config enable row level security;

create or replace function public.es_jefe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and rol = 'jefe');
$$;

-- El primer usuario que se registra queda como jefe; los demas como empleados.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    case when exists (select 1 from public.profiles) then 'empleado' else 'jefe' end
  );
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- El porcentaje de cada lavada lo fija el servidor segun el perfil (el empleado no lo puede cambiar).
create or replace function public.lavadas_pct() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.pct := (select pct from public.profiles where id = new.user_id);
  elsif not public.es_jefe() then
    new.pct := old.pct;
    new.user_id := old.user_id;
    new.precio := old.precio;
    new.fecha := old.fecha;
  end if;
  return new;
end $$;
drop trigger if exists lavadas_pct_trg on public.lavadas;
create trigger lavadas_pct_trg before insert or update on public.lavadas
  for each row execute function public.lavadas_pct();

-- Politicas
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.es_jefe());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.es_jefe()) with check (public.es_jefe());

drop policy if exists lavadas_select on public.lavadas;
create policy lavadas_select on public.lavadas for select to authenticated
  using (user_id = auth.uid() or public.es_jefe());
drop policy if exists lavadas_insert on public.lavadas;
create policy lavadas_insert on public.lavadas for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists lavadas_update on public.lavadas;
create policy lavadas_update on public.lavadas for update to authenticated
  using (user_id = auth.uid() or public.es_jefe()) with check (user_id = auth.uid() or public.es_jefe());
drop policy if exists lavadas_delete on public.lavadas;
create policy lavadas_delete on public.lavadas for delete to authenticated
  using (user_id = auth.uid() or public.es_jefe());

drop policy if exists config_select on public.config;
create policy config_select on public.config for select to authenticated using (true);
drop policy if exists config_write on public.config;
create policy config_write on public.config for all to authenticated
  using (public.es_jefe()) with check (public.es_jefe());

-- Fotos (bucket privado, una carpeta por usuario)
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
  on conflict (id) do nothing;

drop policy if exists fotos_insert on storage.objects;
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists fotos_select on storage.objects;
create policy fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_jefe()));
drop policy if exists fotos_delete on storage.objects;
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_jefe()));

-- Bolsa de propinas (si ya habias ejecutado este archivo antes, ejecuta solo desde aqui hasta el final)
alter table public.lavadas add column if not exists propina int not null default 0 check (propina >= 0);

-- Devuelve, por empleado, cuantas motos y cuanta propina registro en un turno.
-- Sirve para repartir la bolsa proporcional a las motos lavadas (los empleados no ven las lavadas de otros).
create or replace function public.bolsa_propinas(p_fecha date, p_turno text)
returns table (user_id uuid, nombre text, motos int, propinas int)
language sql stable security definer set search_path = public as $$
  select l.user_id, p.nombre, count(*)::int, coalesce(sum(l.propina), 0)::int
  from public.lavadas l
  join public.profiles p on p.id = l.user_id
  where l.fecha = p_fecha and l.turno = p_turno and auth.uid() is not null
  group by l.user_id, p.nombre;
$$;
revoke all on function public.bolsa_propinas(date, text) from public, anon;
grant execute on function public.bolsa_propinas(date, text) to authenticated;

-- Cierre de turnos (si ya habias ejecutado este archivo antes, ejecuta solo desde aqui hasta el final)
create table if not exists public.cierres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  fecha date not null,
  turno text not null check (turno in ('dia','noche')),
  cerrado_en timestamptz not null default now(),
  bolsa int not null default 0,
  parte int not null default 0,
  unique (user_id, fecha, turno)
);
alter table public.cierres enable row level security;

drop policy if exists cierres_select on public.cierres;
create policy cierres_select on public.cierres for select to authenticated
  using (user_id = auth.uid() or public.es_jefe());
drop policy if exists cierres_insert on public.cierres;
create policy cierres_insert on public.cierres for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists cierres_delete on public.cierres;
create policy cierres_delete on public.cierres for delete to authenticated
  using (public.es_jefe());

-- Al cerrar, el servidor calcula la bolsa de propinas y la parte del empleado (proporcional a sus motos).
create or replace function public.cierres_calc() returns trigger
language plpgsql security definer set search_path = public as $$
declare total int; motos int; mias int;
begin
  select coalesce(sum(propina), 0), count(*), count(*) filter (where user_id = new.user_id)
    into total, motos, mias
  from public.lavadas where fecha = new.fecha and turno = new.turno;
  new.cerrado_en := now();
  new.bolsa := total;
  new.parte := case when motos > 0 then round(total::numeric * mias / motos) else 0 end;
  return new;
end $$;
drop trigger if exists cierres_calc_trg on public.cierres;
create trigger cierres_calc_trg before insert on public.cierres
  for each row execute function public.cierres_calc();

-- Turno cerrado: el empleado ya no puede agregar, editar ni borrar motos de ese turno (el jefe si, tras reabrirlo o directamente).
create or replace function public.turno_cerrado(p_user uuid, p_fecha date, p_turno text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cierres where user_id = p_user and fecha = p_fecha and turno = p_turno);
$$;
create or replace function public.lavadas_lock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.es_jefe() then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and public.turno_cerrado(old.user_id, old.fecha, old.turno) then
    raise exception 'Turno cerrado';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and public.turno_cerrado(new.user_id, new.fecha, new.turno) then
    raise exception 'Turno cerrado';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists lavadas_lock_trg on public.lavadas;
create trigger lavadas_lock_trg before insert or update or delete on public.lavadas
  for each row execute function public.lavadas_lock();

-- Gestion de cuentas desde la app (si ya habias ejecutado este archivo antes, ejecuta solo desde aqui hasta el final)
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists activo boolean not null default true;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nombre, email, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    new.email,
    case when exists (select 1 from public.profiles) then 'empleado' else 'jefe' end
  );
  return new;
end $$;
