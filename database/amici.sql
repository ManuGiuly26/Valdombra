-- Assedio a Valdombra v10.4: lista amici.
-- Due modi per diventare amici: per nome del profilo con una richiesta da accettare, oppure con il codice amico
-- (6 caratteri: chi lo inserisce diventa amico subito). Si può togliere un amico, annullare una richiesta e bloccare.
-- Le tabelle non sono leggibili direttamente da nessuno: si passa solo dalle funzioni, che controllano nome e token
-- del profilo (lo stesso codice segreto del dispositivo usato da profilo_leggi). Richiede database/profili.sql.
-- Ogni funzione risponde con un esito in parole (es. 'inviata', 'amici', 'non_trovato'); solo nome o token sbagliati
-- danno l'errore 'credenziali'. Aggiunge solo tabelle e funzioni nuove: non tocca i dati esistenti.

create table if not exists public.amici (
  da text not null references public.profili(nome) on update cascade on delete cascade,
  a text not null references public.profili(nome) on update cascade on delete cascade,
  stato text not null check (stato in ('richiesta', 'amici', 'bloccato')),
  creato timestamptz not null default now(),
  aggiornato timestamptz not null default now(),
  primary key (da, a),
  check (da <> a)
);
create index if not exists amici_a_idx on public.amici (a);
alter table public.amici enable row level security;
revoke all on public.amici from anon, authenticated;

create table if not exists public.codici_amico (
  nome text primary key references public.profili(nome) on update cascade on delete cascade,
  codice text not null unique check (codice ~ '^[A-Z2-9]{6}$'),
  creato timestamptz not null default now()
);
alter table public.codici_amico enable row level security;
revoke all on public.codici_amico from anon, authenticated;

-- controlla nome e token e restituisce il nome normalizzato
create or replace function public.amici_chi(p_nome text, p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare n text := lower(trim(coalesce(p_nome, '')));
begin
  if not exists (select 1 from profili where profili.nome = n and profili.token = p_token) then
    perform pg_sleep(0.3);
    raise exception 'credenziali';
  end if;
  return n;
end $$;

-- la mia lista: amici, richieste ricevute, richieste inviate, profili bloccati
create or replace function public.amici_lista(p_nome text, p_token uuid)
returns table (nome text, stato text, dal timestamptz)
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token);
begin
  return query
    select case when x.da = me then x.a else x.da end, 'amici'::text, x.aggiornato
      from amici x where (x.da = me or x.a = me) and x.stato = 'amici'
    union all
    select x.da, 'ricevuta'::text, x.creato from amici x where x.a = me and x.stato = 'richiesta'
    union all
    select x.a, 'inviata'::text, x.creato from amici x where x.da = me and x.stato = 'richiesta'
    union all
    select x.a, 'bloccato'::text, x.creato from amici x where x.da = me and x.stato = 'bloccato'
    order by 2, 1;
end $$;

-- chiede l'amicizia per nome; se l'altro me l'aveva già chiesta diventiamo amici subito
create or replace function public.amici_richiedi(p_nome text, p_token uuid, p_altro text)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, '')));
begin
  if o = me then return 'se_stesso'; end if;
  if not exists (select 1 from profili where profili.nome = o) then return 'non_trovato'; end if;
  if exists (select 1 from amici where da = me and a = o and stato = 'bloccato') then return 'bloccato_da_te'; end if;
  if exists (select 1 from amici where da = o and a = me and stato = 'bloccato') then return 'non_trovato'; end if;
  if exists (select 1 from amici where ((da = me and a = o) or (da = o and a = me)) and stato = 'amici') then return 'gia_amici'; end if;
  if exists (select 1 from amici where da = o and a = me and stato = 'richiesta') then
    update amici set stato = 'amici', aggiornato = now() where da = o and a = me;
    return 'amici';
  end if;
  if exists (select 1 from amici where da = me and a = o and stato = 'richiesta') then return 'gia_inviata'; end if;
  if (select count(*) from amici where da = me and stato = 'richiesta') >= 50 then return 'troppe_richieste'; end if;
  if (select count(*) from amici where (da = me or a = me) and stato = 'amici') >= 200 then return 'troppi_amici'; end if;
  insert into amici (da, a, stato) values (me, o, 'richiesta');
  return 'inviata';
end $$;

-- accetta (p_si = true) o rifiuta una richiesta ricevuta
create or replace function public.amici_rispondi(p_nome text, p_token uuid, p_altro text, p_si boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, '')));
begin
  if not exists (select 1 from amici where da = o and a = me and stato = 'richiesta') then return 'nessuna_richiesta'; end if;
  if coalesce(p_si, false) then
    if (select count(*) from amici where (da = me or a = me) and stato = 'amici') >= 200 then return 'troppi_amici'; end if;
    update amici set stato = 'amici', aggiornato = now() where da = o and a = me;
    return 'amici';
  end if;
  delete from amici where da = o and a = me;
  return 'rifiutata';
end $$;

-- toglie un amico, annulla una richiesta inviata o sblocca un profilo
create or replace function public.amici_togli(p_nome text, p_token uuid, p_altro text)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, '')));
begin
  delete from amici where (da = me and a = o) or (da = o and a = me and stato <> 'bloccato');
  if found then return 'tolto'; end if;
  return 'non_trovato';
end $$;

-- blocca un profilo: niente più richieste né codice da parte sua; toglie l'amicizia se c'era
create or replace function public.amici_blocca(p_nome text, p_token uuid, p_altro text)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); o text := lower(trim(coalesce(p_altro, '')));
begin
  if o = me then return 'se_stesso'; end if;
  if not exists (select 1 from profili where profili.nome = o) then return 'non_trovato'; end if;
  delete from amici where (da = me and a = o) or (da = o and a = me and stato <> 'bloccato');
  insert into amici (da, a, stato) values (me, o, 'bloccato');
  return 'bloccato';
end $$;

-- il mio codice amico (lo crea la prima volta; p_nuovo = true ne fa uno nuovo e il vecchio non vale più)
create or replace function public.amici_codice(p_nome text, p_token uuid, p_nuovo boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare me text := amici_chi(p_nome, p_token); c text; alfa text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea; i int; prove int := 0;
begin
  select codice into c from codici_amico where codici_amico.nome = me;
  if c is not null and not coalesce(p_nuovo, false) then return c; end if;
  loop
    b := gen_random_bytes(6); c := '';
    for i in 0 .. 5 loop c := c || substr(alfa, 1 + (get_byte(b, i) % 32), 1); end loop;
    exit when not exists (select 1 from codici_amico where codice = c);
    prove := prove + 1;
    if prove > 20 then raise exception 'codice_non_disponibile'; end if;
  end loop;
  insert into codici_amico (nome, codice) values (me, c)
    on conflict (nome) do update set codice = excluded.codice, creato = now();
  return c;
end $$;

-- usa il codice amico di un altro: si diventa amici subito
create or replace function public.amici_usa_codice(p_nome text, p_token uuid, p_codice text)
returns table (nome text, esito text)
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); c text := upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g')); o text;
begin
  select k.nome into o from codici_amico k where k.codice = c;
  if o is null then perform pg_sleep(0.3); return query select null::text, 'codice_sbagliato'::text; return; end if;
  if o = me then return query select o, 'se_stesso'::text; return; end if;
  if exists (select 1 from amici where da = me and a = o and stato = 'bloccato') then return query select o, 'bloccato_da_te'::text; return; end if;
  if exists (select 1 from amici where da = o and a = me and stato = 'bloccato') then return query select null::text, 'codice_sbagliato'::text; return; end if;
  if exists (select 1 from amici where ((da = me and a = o) or (da = o and a = me)) and stato = 'amici') then return query select o, 'gia_amici'::text; return; end if;
  if (select count(*) from amici where (da = me or a = me) and stato = 'amici') >= 200 then return query select o, 'troppi_amici'::text; return; end if;
  delete from amici where (da = me and a = o) or (da = o and a = me);
  insert into amici (da, a, stato) values (me, o, 'amici');
  return query select o, 'amici'::text;
end $$;

revoke all on function public.amici_chi(text, uuid) from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['amici_lista(text, uuid)', 'amici_richiedi(text, uuid, text)', 'amici_rispondi(text, uuid, text, boolean)',
    'amici_togli(text, uuid, text)', 'amici_blocca(text, uuid, text)', 'amici_codice(text, uuid, boolean)', 'amici_usa_codice(text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;
