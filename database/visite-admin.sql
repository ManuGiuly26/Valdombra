-- Visite e pannello di amministrazione di Assedio a Valdombra (v8.0).
-- Incolla tutto in Supabase: SQL Editor -> New query -> Run.
-- Crea solo cose nuove: non tocca profili, classifica e statistiche.

-- 1. VISITE
-- Una riga ogni volta che qualcuno apre il gioco (al massimo una ogni 30 minuti per dispositivo).
-- Niente nomi e niente indirizzi IP: solo un codice casuale creato dal browser, la versione del gioco,
-- se è un telefono e se il gioco è installato come app. Il gioco può solo aggiungere visite, non leggerle.
create table if not exists public.visite (
  id bigint generated always as identity primary key,
  creato timestamptz not null default now(),
  visitatore uuid not null,
  nuovo boolean not null default false,
  versione text not null default '' check (char_length(versione) <= 12),
  mobile boolean not null default false,
  app boolean not null default false
);
create index if not exists visite_creato on public.visite (creato);
create index if not exists visite_visitatore on public.visite (visitatore, creato);
alter table public.visite enable row level security;
revoke all on public.visite from anon, authenticated;

create or replace function public.visita_registra(p_visitatore uuid, p_versione text, p_mobile boolean, p_app boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_visitatore is null then return; end if;
  if exists (select 1 from visite where visitatore = p_visitatore and creato > now() - interval '30 minutes') then return; end if;
  insert into visite (visitatore, nuovo, versione, mobile, app)
  values (p_visitatore, not exists (select 1 from visite where visitatore = p_visitatore),
          left(coalesce(p_versione, ''), 12), coalesce(p_mobile, false), coalesce(p_app, false));
end $$;

-- 2. AMMINISTRATORI
-- I profili del gioco che possono aprire il pannello. Il controllo si fa qui sul server:
-- serve il nome del profilo e il codice segreto del dispositivo collegato (lo stesso dei salvataggi online).
create table if not exists public.amministratori (
  nome text primary key references public.profili (nome) on delete cascade
);
alter table public.amministratori enable row level security;
revoke all on public.amministratori from anon, authenticated;

create or replace function public.admin_e(p_nome text, p_token uuid)
returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from profili p join amministratori a on a.nome = p.nome
                 where p.nome = lower(trim(p_nome)) and p.token = p_token);
$$;

-- Tutti i numeri del pannello in una volta, già riassunti (nessun dato dei singoli giocatori).
-- admin_dati non si può chiamare dal gioco: la usa solo admin_statistiche dopo il controllo.
create or replace function public.admin_dati()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  oggi date := (now() at time zone 'Europe/Rome')::date;
  res jsonb;
begin
  with v as (
    select (creato at time zone 'Europe/Rome') as ora, visitatore, nuovo, versione, mobile, app from visite
  )
  select jsonb_build_object(
    'oggi', to_char(oggi, 'DD/MM/YYYY'),
    'visite', jsonb_build_object(
      'oggi', (select count(*) from v where ora::date = oggi),
      'g7', (select count(*) from v where ora::date > oggi - 7),
      'g30', (select count(*) from v where ora::date > oggi - 30),
      'tot', (select count(*) from v)),
    'uniche', jsonb_build_object(
      'oggi', (select count(distinct visitatore) from v where ora::date = oggi),
      'g7', (select count(distinct visitatore) from v where ora::date > oggi - 7),
      'g30', (select count(distinct visitatore) from v where ora::date > oggi - 30),
      'tot', (select count(distinct visitatore) from v)),
    'nuovi7', (select count(*) from v where nuovo and ora::date > oggi - 7),
    'mobile30', (select coalesce(round(100.0 * count(*) filter (where mobile) / nullif(count(*), 0)), 0) from v where ora::date > oggi - 30),
    'app30', (select coalesce(round(100.0 * count(*) filter (where app) / nullif(count(*), 0)), 0) from v where ora::date > oggi - 30),
    'giorni', (select coalesce(jsonb_agg(jsonb_build_array(to_char(d, 'DD/MM'), coalesce(x.n, 0), coalesce(x.u, 0)) order by d), '[]'::jsonb)
               from generate_series(oggi - 29, oggi, interval '1 day') as d
               left join (select ora::date as g, count(*) as n, count(distinct visitatore) as u
                          from v where ora::date > oggi - 30 group by 1) x on x.g = d::date),
    'ore', (select coalesce(jsonb_agg(coalesce(x.n, 0) order by h), '[]'::jsonb)
            from generate_series(0, 23) as h
            left join (select extract(hour from ora)::int as hh, count(*) as n
                       from v where ora::date > oggi - 30 group by 1) x on x.hh = h),
    'versioni', (select coalesce(jsonb_agg(jsonb_build_array(t.versione, t.n) order by t.n desc), '[]'::jsonb)
                 from (select versione, count(*) as n from v where ora::date > oggi - 7
                       group by 1 order by 2 desc limit 6) t),
    'profili', jsonb_build_object(
      'tot', (select count(*) from profili),
      'nuovi7', (select count(*) from profili where creato > now() - interval '7 days'),
      'attivi7', (select count(*) from profili where aggiornato > now() - interval '7 days')),
    'partite', jsonb_build_object(
      'tot', (select count(*) from statistiche),
      'g7', (select count(*) from statistiche where creato > now() - interval '7 days'),
      'vitt', (select coalesce(round(100.0 * count(*) filter (where vittoria) / nullif(count(*), 0)), 0) from statistiche where modalita = 'norm'),
      'gruppo', (select coalesce(round(100.0 * count(*) filter (where giocatori > 1) / nullif(count(*), 0)), 0) from statistiche)),
    'eroi', (select coalesce(jsonb_agg(jsonb_build_array(t.classe, t.n, t.w) order by t.n desc), '[]'::jsonb)
             from (select classe, count(*) as n, round(100.0 * count(*) filter (where vittoria) / count(*)) as w
                   from statistiche where modalita = 'norm' group by 1) t),
    'dungeon', (select coalesce(jsonb_agg(jsonb_build_array(t.dungeon, t.n, t.w, t.p) order by t.n desc), '[]'::jsonb)
                from (select dungeon, count(*) as n, round(100.0 * count(*) filter (where vittoria) / count(*)) as w, round(avg(piano), 1) as p
                      from statistiche where modalita = 'norm' group by 1) t),
    'morti', (select coalesce(jsonb_agg(jsonb_build_array(t.morte, t.n) order by t.n desc), '[]'::jsonb)
              from (select morte, count(*) as n from statistiche where not vittoria and morte is not null
                    group by 1 order by 2 desc limit 6) t),
    'carte', (select coalesce(jsonb_agg(jsonb_build_array(t.c, t.n) order by t.n desc), '[]'::jsonb)
              from (select c, count(*) as n from statistiche, unnest(carte) as c
                    where creato > now() - interval '30 days' group by 1 order by 2 desc limit 10) t),
    'classifica', jsonb_build_object(
      'tot', (select count(*) from classifica),
      'solo', (select max(punteggio) from classifica where modalita = 'solo'),
      'coop', (select max(punteggio) from classifica where modalita = 'coop'))
  ) into res;
  return res;
end $$;

create or replace function public.admin_statistiche(p_nome text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not admin_e(p_nome, p_token) then
    perform pg_sleep(0.5);
    raise exception 'non_autorizzato';
  end if;
  return admin_dati();
end $$;

revoke all on function public.visita_registra(uuid, text, boolean, boolean) from public;
revoke all on function public.admin_e(text, uuid) from public;
revoke all on function public.admin_statistiche(text, uuid) from public;
revoke all on function public.admin_dati() from public;
revoke all on function public.admin_dati() from anon, authenticated;
grant execute on function public.visita_registra(uuid, text, boolean, boolean) to anon, authenticated;
grant execute on function public.admin_e(text, uuid) to anon, authenticated;
grant execute on function public.admin_statistiche(text, uuid) to anon, authenticated;

-- 3. CHI È AMMINISTRATORE
-- Togli i due trattini all'inizio della riga qui sotto e metti il nome del tuo profilo del gioco (in minuscolo):
-- insert into public.amministratori (nome) values ('nome-del-tuo-profilo') on conflict do nothing;
