-- Profili di Assedio a Valdombra: stessi progressi su telefono e PC.
-- Incolla tutto in Supabase: SQL Editor -> New query -> Run.
-- Le password sono salvate cifrate (bcrypt). La tabella non è leggibile
-- direttamente da nessuno: si passa solo dalle funzioni qui sotto,
-- che controllano nome e password.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profili (
  nome text primary key check (char_length(nome) between 3 and 20),
  hash text not null,
  token uuid not null default gen_random_uuid(),
  dati jsonb not null default '{}'::jsonb,
  rev int not null default 1,
  creato timestamptz not null default now(),
  aggiornato timestamptz not null default now()
);

alter table public.profili enable row level security;
revoke all on public.profili from anon, authenticated;

-- crea un profilo nuovo
create or replace function public.profilo_crea(p_nome text, p_pass text, p_dati jsonb)
returns table (token uuid, rev int)
language plpgsql security definer set search_path = public, extensions as $$
declare n text := lower(trim(p_nome));
begin
  if n !~ '^[a-z0-9_.-]{3,20}$' then raise exception 'nome_non_valido'; end if;
  if char_length(coalesce(p_pass,'')) < 4 or char_length(p_pass) > 72 then raise exception 'password_corta'; end if;
  if pg_column_size(p_dati) > 400000 then raise exception 'troppo_grande'; end if;
  if exists (select 1 from profili where profili.nome = n) then raise exception 'nome_usato'; end if;
  return query with ins as (
      insert into profili (nome, hash, dati)
      values (n, crypt(p_pass, gen_salt('bf', 8)), coalesce(p_dati, '{}'::jsonb))
      returning profili.token as t, profili.rev as r)
    select ins.t, ins.r from ins;
end $$;

-- accedi con nome e password: restituisce il codice segreto del dispositivo e i dati
create or replace function public.profilo_accedi(p_nome text, p_pass text)
returns table (token uuid, dati jsonb, rev int)
language plpgsql security definer set search_path = public, extensions as $$
declare r profili;
begin
  select * into r from profili where profili.nome = lower(trim(p_nome));
  if r.nome is null or r.hash <> crypt(p_pass, r.hash) then
    perform pg_sleep(0.5);
    raise exception 'credenziali';
  end if;
  return query select r.token, r.dati, r.rev;
end $$;

-- legge i dati (usato da un dispositivo già collegato)
create or replace function public.profilo_leggi(p_nome text, p_token uuid)
returns table (dati jsonb, rev int)
language plpgsql security definer set search_path = public as $$
begin
  return query select profili.dati, profili.rev from profili
    where profili.nome = lower(trim(p_nome)) and profili.token = p_token;
  if not found then raise exception 'credenziali'; end if;
end $$;

-- salva i dati: se nel frattempo un altro dispositivo ha salvato, restituisce
-- la revisione attuale in negativo e il gioco unisce i progressi prima di riprovare
create or replace function public.profilo_salva(p_nome text, p_token uuid, p_dati jsonb, p_rev int)
returns int
language plpgsql security definer set search_path = public as $$
declare cur int;
begin
  if pg_column_size(p_dati) > 400000 then raise exception 'troppo_grande'; end if;
  select profili.rev into cur from profili where profili.nome = lower(trim(p_nome)) and profili.token = p_token for update;
  if cur is null then raise exception 'credenziali'; end if;
  if cur <> p_rev then return -cur; end if;
  update profili set dati = p_dati, rev = cur + 1, aggiornato = now()
    where profili.nome = lower(trim(p_nome));
  return cur + 1;
end $$;

revoke all on function public.profilo_crea(text, text, jsonb) from public;
revoke all on function public.profilo_accedi(text, text) from public;
revoke all on function public.profilo_leggi(text, uuid) from public;
revoke all on function public.profilo_salva(text, uuid, jsonb, int) from public;
grant execute on function public.profilo_crea(text, text, jsonb) to anon, authenticated;
grant execute on function public.profilo_accedi(text, text) to anon, authenticated;
grant execute on function public.profilo_leggi(text, uuid) to anon, authenticated;
grant execute on function public.profilo_salva(text, uuid, jsonb, int) to anon, authenticated;
