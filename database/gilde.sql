-- Assedio a Valdombra v10.8: gilde (prima parte: gilda e membri).
-- Una gilda per giocatore (serve il profilo). Ruoli: capo, vice, membro. Gilda aperta (chiunque entra finché c'è posto,
-- il capo o il vice possono allontanare) o chiusa (si entra con una richiesta accettata da capo o vice, oppure con il codice
-- d'invito di 6 caratteri). 15 posti; il capo può aggiungerne fino a 30 (nel gioco si pagano in Gemme a prezzo crescente).
-- Livello e PE della gilda e PE personali dei membri sono già pronti per missioni, boss e premi (versioni successive).
-- Le tabelle non sono leggibili direttamente: si passa dalle funzioni, che controllano nome e token del profilo con amici_chi
-- (database/amici.sql). Ogni funzione risponde con un esito in parole; solo nome o token sbagliati danno 'credenziali'.
-- Aggiunge solo tabelle e funzioni nuove: non tocca i dati esistenti.

create table if not exists public.gilde (
  id bigint generated always as identity primary key,
  nome text not null check (char_length(nome) between 3 and 24),
  descrizione text not null default '' check (char_length(descrizione) <= 140),
  aperta boolean not null default true,
  posti int not null default 15 check (posti between 15 and 30),
  codice text not null unique check (codice ~ '^[A-Z2-9]{6}$'),
  livello int not null default 1 check (livello >= 1),
  pe bigint not null default 0 check (pe >= 0),
  creata timestamptz not null default now(),
  aggiornata timestamptz not null default now()
);
create unique index if not exists gilde_nome_idx on public.gilde (lower(nome));
alter table public.gilde enable row level security;
revoke all on public.gilde from anon, authenticated;

create table if not exists public.gilda_membri (
  nome text primary key references public.profili(nome) on update cascade on delete cascade,
  gilda bigint not null references public.gilde(id) on delete cascade,
  ruolo text not null check (ruolo in ('capo', 'vice', 'membro')),
  pe bigint not null default 0 check (pe >= 0),
  entrato timestamptz not null default now()
);
create index if not exists gilda_membri_gilda_idx on public.gilda_membri (gilda);
alter table public.gilda_membri enable row level security;
revoke all on public.gilda_membri from anon, authenticated;

create table if not exists public.gilda_richieste (
  gilda bigint not null references public.gilde(id) on delete cascade,
  nome text not null references public.profili(nome) on update cascade on delete cascade,
  creata timestamptz not null default now(),
  primary key (gilda, nome)
);
create index if not exists gilda_richieste_nome_idx on public.gilda_richieste (nome);
alter table public.gilda_richieste enable row level security;
revoke all on public.gilda_richieste from anon, authenticated;

-- un codice d'invito nuovo (6 caratteri senza 0, O, 1, I)
create or replace function public.gilda_codice_nuovo()
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text; alfa text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; i int; prove int := 0;
begin
  loop
    b := gen_random_bytes(6); c := '';
    for i in 0 .. 5 loop c := c || substr(alfa, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from gilde where codice = c);
    prove := prove + 1;
    if prove > 20 then raise exception 'codice_non_disponibile'; end if;
  end loop;
  return c;
end $$;

-- nome di gilda ripulito: spazi singoli, niente caratteri strani; null se non va bene
create or replace function public.gilda_nome_ok(p text)
returns text
language sql immutable set search_path = public as $$
  select case when x ~ '^[[:alnum:]À-ÿ][[:alnum:]À-ÿ ''_.-]{1,22}[[:alnum:]À-ÿ.]$' then x end
  from (select regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g') as x) t;
$$;

-- se una gilda resta senza capo passa al vice o al membro più vecchio; se resta vuota si scioglie
create or replace function public.gilda_sistema(p_gilda bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not exists (select 1 from gilda_membri where gilda = p_gilda) then
    delete from gilde where id = p_gilda; return;
  end if;
  if not exists (select 1 from gilda_membri where gilda = p_gilda and ruolo = 'capo') then
    select m.nome into n from gilda_membri m where m.gilda = p_gilda
      order by (m.ruolo = 'vice') desc, m.entrato limit 1;
    update gilda_membri set ruolo = 'capo' where gilda_membri.nome = n;
  end if;
end $$;

-- cerca gilde per nome (anche senza profilo): le più alte di livello e più piene per prime
create or replace function public.gilda_cerca(p_testo text default '')
returns table (id bigint, nome text, descrizione text, aperta boolean, membri int, posti int, livello int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare t text := trim(coalesce(p_testo, ''));
begin
  return query
    select g.id, g.nome, g.descrizione, g.aperta, (select count(*)::int from gilda_membri m where m.gilda = g.id), g.posti, g.livello
    from gilde g
    where t = '' or g.nome ilike '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by g.livello desc, 5 desc, g.id
    limit 30;
end $$;

-- la mia gilda: dati, mio ruolo, membri, richieste (per capo e vice) e codice (per capo e vice); se non ho gilda, le mie richieste
create or replace function public.gilda_mia(p_nome text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; g gilde; capo boolean;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null then
    return jsonb_build_object('gilda', null, 'richieste_mie', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome) order by r.creata)
      from gilda_richieste r join gilde x on x.id = r.gilda where r.nome = me), '[]'::jsonb));
  end if;
  perform gilda_sistema(m.gilda);
  select * into m from gilda_membri where gilda_membri.nome = me;
  select * into g from gilde where gilde.id = m.gilda;
  capo := m.ruolo in ('capo', 'vice');
  return jsonb_build_object(
    'gilda', jsonb_build_object('id', g.id, 'nome', g.nome, 'descrizione', g.descrizione, 'aperta', g.aperta, 'posti', g.posti,
      'livello', g.livello, 'pe', g.pe, 'creata', g.creata, 'codice', case when capo then g.codice end),
    'io', jsonb_build_object('ruolo', m.ruolo, 'pe', m.pe, 'entrato', m.entrato),
    'membri', (select jsonb_agg(jsonb_build_object('nome', x.nome, 'ruolo', x.ruolo, 'pe', x.pe, 'entrato', x.entrato)
      order by case x.ruolo when 'capo' then 0 when 'vice' then 1 else 2 end, x.pe desc, x.entrato) from gilda_membri x where x.gilda = g.id),
    'richieste', case when capo then coalesce((select jsonb_agg(jsonb_build_object('nome', r.nome, 'creata', r.creata) order by r.creata)
      from gilda_richieste r where r.gilda = g.id), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- crea una gilda: chi la crea è il capo (nel gioco costa 150 Corone)
create or replace function public.gilda_crea(p_nome text, p_token uuid, p_gilda text, p_aperta boolean default true, p_descrizione text default '')
returns table (id bigint, esito text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me text := amici_chi(p_nome, p_token); n text := gilda_nome_ok(p_gilda); nid bigint;
begin
  if exists (select 1 from gilda_membri where gilda_membri.nome = me) then return query select null::bigint, 'gia_in_gilda'::text; return; end if;
  if n is null then return query select null::bigint, 'nome_non_valido'::text; return; end if;
  if exists (select 1 from gilde where lower(gilde.nome) = lower(n)) then return query select null::bigint, 'nome_usato'::text; return; end if;
  insert into gilde (nome, descrizione, aperta, codice)
    values (n, left(regexp_replace(trim(coalesce(p_descrizione, '')), '\s+', ' ', 'g'), 140), coalesce(p_aperta, true), gilda_codice_nuovo())
    returning gilde.id into nid;
  insert into gilda_membri (nome, gilda, ruolo) values (me, nid, 'capo');
  delete from gilda_richieste where gilda_richieste.nome = me;
  return query select nid, 'creata'::text;
end $$;

-- entra in una gilda: se è aperta subito (se c'è posto), se è chiusa manda la richiesta
create or replace function public.gilda_entra(p_nome text, p_token uuid, p_gilda bigint)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); g gilde; n int;
begin
  if exists (select 1 from gilda_membri where gilda_membri.nome = me) then return 'gia_in_gilda'; end if;
  select * into g from gilde where gilde.id = p_gilda for update;
  if g.id is null then return 'non_trovata'; end if;
  if g.aperta then
    select count(*) into n from gilda_membri where gilda = g.id;
    if n >= g.posti then return 'piena'; end if;
    insert into gilda_membri (nome, gilda, ruolo) values (me, g.id, 'membro');
    delete from gilda_richieste where gilda_richieste.nome = me;
    return 'entrato';
  end if;
  if exists (select 1 from gilda_richieste where gilda = g.id and gilda_richieste.nome = me) then return 'gia_richiesta'; end if;
  if (select count(*) from gilda_richieste where gilda_richieste.nome = me) >= 10 then return 'troppe_richieste'; end if;
  if (select count(*) from gilda_richieste where gilda = g.id) >= 50 then return 'troppe_richieste'; end if;
  insert into gilda_richieste (gilda, nome) values (g.id, me);
  return 'richiesta_inviata';
end $$;

-- entra con il codice d'invito (anche se la gilda è chiusa), se c'è posto
create or replace function public.gilda_usa_codice(p_nome text, p_token uuid, p_codice text)
returns table (gilda bigint, nome text, esito text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me text := amici_chi(p_nome, p_token); c text := upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g')); g gilde; n int;
begin
  select * into g from gilde where gilde.codice = c for update;
  if g.id is null then perform pg_sleep(0.3); return query select null::bigint, null::text, 'codice_sbagliato'::text; return; end if;
  if exists (select 1 from gilda_membri where gilda_membri.nome = me) then return query select g.id, g.nome, 'gia_in_gilda'::text; return; end if;
  select count(*) into n from gilda_membri where gilda_membri.gilda = g.id;
  if n >= g.posti then return query select g.id, g.nome, 'piena'::text; return; end if;
  insert into gilda_membri (nome, gilda, ruolo) values (me, g.id, 'membro');
  delete from gilda_richieste where gilda_richieste.nome = me;
  return query select g.id, g.nome, 'entrato'::text;
end $$;

-- annulla una mia richiesta
create or replace function public.gilda_annulla(p_nome text, p_token uuid, p_gilda bigint)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token);
begin
  delete from gilda_richieste where gilda = p_gilda and gilda_richieste.nome = me;
  if found then return 'annullata'; end if;
  return 'non_trovata';
end $$;

-- capo o vice: accetta (p_si = true) o rifiuta una richiesta
create or replace function public.gilda_rispondi(p_nome text, p_token uuid, p_altro text, p_si boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, ''))); m gilda_membri; g gilde; n int;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null or m.ruolo not in ('capo', 'vice') then return 'non_permesso'; end if;
  select * into g from gilde where gilde.id = m.gilda for update;
  if not exists (select 1 from gilda_richieste where gilda = g.id and gilda_richieste.nome = o) then return 'nessuna_richiesta'; end if;
  if not coalesce(p_si, false) then
    delete from gilda_richieste where gilda = g.id and gilda_richieste.nome = o;
    return 'rifiutata';
  end if;
  if exists (select 1 from gilda_membri where gilda_membri.nome = o) then
    delete from gilda_richieste where gilda_richieste.nome = o;
    return 'gia_in_gilda';
  end if;
  select count(*) into n from gilda_membri where gilda = g.id;
  if n >= g.posti then return 'piena'; end if;
  insert into gilda_membri (nome, gilda, ruolo) values (o, g.id, 'membro');
  delete from gilda_richieste where gilda_richieste.nome = o;
  return 'entrato';
end $$;

-- allontana un membro: il capo chiunque (tranne sé), il vice solo i membri semplici
create or replace function public.gilda_caccia(p_nome text, p_token uuid, p_altro text)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, ''))); m gilda_membri; x gilda_membri;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  select * into x from gilda_membri where gilda_membri.nome = o;
  if m.nome is null or x.nome is null or x.gilda <> m.gilda then return 'non_trovato'; end if;
  if o = me then return 'se_stesso'; end if;
  if not (m.ruolo = 'capo' or (m.ruolo = 'vice' and x.ruolo = 'membro')) then return 'non_permesso'; end if;
  delete from gilda_membri where gilda_membri.nome = o;
  return 'cacciato';
end $$;

-- il capo cambia il ruolo di un membro: 'vice', 'membro' oppure 'capo' (passa il comando e diventa vice)
create or replace function public.gilda_ruolo(p_nome text, p_token uuid, p_altro text, p_ruolo text)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, ''))); m gilda_membri; x gilda_membri;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  select * into x from gilda_membri where gilda_membri.nome = o;
  if m.nome is null or x.nome is null or x.gilda <> m.gilda then return 'non_trovato'; end if;
  if m.ruolo <> 'capo' then return 'non_permesso'; end if;
  if o = me then return 'se_stesso'; end if;
  if p_ruolo not in ('capo', 'vice', 'membro') then return 'ruolo_non_valido'; end if;
  if p_ruolo = 'capo' then
    update gilda_membri set ruolo = 'vice' where gilda_membri.nome = me;
  end if;
  update gilda_membri set ruolo = p_ruolo where gilda_membri.nome = o;
  return 'fatto';
end $$;

-- esce dalla gilda: se esce il capo comanda il vice (o il membro) più vecchio; se non resta nessuno la gilda si scioglie
create or replace function public.gilda_esci(p_nome text, p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null then return 'non_in_gilda'; end if;
  delete from gilda_membri where gilda_membri.nome = me;
  perform gilda_sistema(m.gilda);
  if not exists (select 1 from gilde where id = m.gilda) then return 'sciolta'; end if;
  return 'uscito';
end $$;

-- il capo cambia nome, descrizione e apertura (i parametri lasciati vuoti non cambiano)
create or replace function public.gilda_modifica(p_nome text, p_token uuid, p_aperta boolean default null, p_descrizione text default null, p_gilda text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; n text;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null then return 'non_in_gilda'; end if;
  if m.ruolo <> 'capo' then return 'non_permesso'; end if;
  if p_gilda is not null then
    n := gilda_nome_ok(p_gilda);
    if n is null then return 'nome_non_valido'; end if;
    if exists (select 1 from gilde where lower(nome) = lower(n) and id <> m.gilda) then return 'nome_usato'; end if;
  end if;
  update gilde set aperta = coalesce(p_aperta, aperta),
    descrizione = coalesce(left(regexp_replace(trim(p_descrizione), '\s+', ' ', 'g'), 140), descrizione),
    nome = coalesce(n, nome), aggiornata = now()
    where id = m.gilda;
  return 'fatto';
end $$;

-- capo o vice: il codice d'invito (p_nuovo = true ne fa uno nuovo e il vecchio non vale più)
create or replace function public.gilda_codice(p_nome text, p_token uuid, p_nuovo boolean default false)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; c text;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null or m.ruolo not in ('capo', 'vice') then return null; end if;
  if coalesce(p_nuovo, false) then
    update gilde set codice = gilda_codice_nuovo(), aggiornata = now() where id = m.gilda;
  end if;
  select codice into c from gilde where id = m.gilda;
  return c;
end $$;

-- il capo aggiunge un posto (fino a 30; nel gioco si paga in Gemme)
create or replace function public.gilda_posto(p_nome text, p_token uuid)
returns table (posti int, esito text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me text := amici_chi(p_nome, p_token); m gilda_membri; g gilde;
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null or m.ruolo <> 'capo' then return query select null::int, 'non_permesso'::text; return; end if;
  select * into g from gilde where gilde.id = m.gilda for update;
  if g.posti >= 30 then return query select g.posti, 'massimo'::text; return; end if;
  update gilde set posti = gilde.posti + 1, aggiornata = now() where gilde.id = g.id;
  return query select g.posti + 1, 'fatto'::text;
end $$;

revoke all on function public.gilda_codice_nuovo() from public, anon, authenticated;
revoke all on function public.gilda_sistema(bigint) from public, anon, authenticated;
revoke all on function public.gilda_nome_ok(text) from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['gilda_cerca(text)', 'gilda_mia(text, uuid)', 'gilda_crea(text, uuid, text, boolean, text)', 'gilda_entra(text, uuid, bigint)',
    'gilda_usa_codice(text, uuid, text)', 'gilda_annulla(text, uuid, bigint)', 'gilda_rispondi(text, uuid, text, boolean)', 'gilda_caccia(text, uuid, text)',
    'gilda_ruolo(text, uuid, text, text)', 'gilda_esci(text, uuid)', 'gilda_modifica(text, uuid, boolean, text, text)', 'gilda_codice(text, uuid, boolean)',
    'gilda_posto(text, uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;
