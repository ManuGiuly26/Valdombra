-- API per i client nativi di Assedio a Valdombra (v8.1).
-- Un solo indirizzo per inviare e ricevere le statistiche, da qualsiasi piattaforma:
--   POST https://ucwuhzupgsvtphsdmlqf.supabase.co/rest/v1/rpc/api
-- La guida per chi scrive un client è in database/API-client.md.
-- Incolla tutto in Supabase: SQL Editor -> New query -> Run.
-- Crea cose nuove e aggiunge colonne vuote: non cambia nessuna riga già salvata.

-- 1. CHI HA INVIATO COSA
-- Colonne nuove, vuote per tutto quello che c'è già (vuoto = gioco web).
alter table public.statistiche add column if not exists piattaforma text
  check (piattaforma is null or piattaforma ~ '^[a-z0-9_-]{2,16}$');
alter table public.statistiche add column if not exists giocatore text
  check (giocatore is null or char_length(giocatore) <= 20);
create index if not exists statistiche_giocatore on public.statistiche (giocatore, creato) where giocatore is not null;
alter table public.visite add column if not exists piattaforma text
  check (piattaforma is null or piattaforma ~ '^[a-z0-9_-]{2,16}$');

-- Il gioco web continua ad aggiungere statistiche come prima, ma senza poter scrivere
-- piattaforma e giocatore: quelle le mette solo l'API, dopo aver controllato chi chiama.
drop policy if exists "aggiungi statistica" on public.statistiche;
create policy "aggiungi statistica" on public.statistiche for insert to anon
  with check (piattaforma is null and giocatore is null);

-- Registro delle chiamate: quale app, quale versione, quale dispositivo, quale giocatore, com'è andata.
-- Non lo legge nessuno dal gioco: serve al pannello di amministrazione e a fermare chi esagera.
create table if not exists public.api_chiamate (
  id bigint generated always as identity primary key,
  creato timestamptz not null default now(),
  azione text not null check (char_length(azione) <= 20),
  piattaforma text not null check (piattaforma ~ '^[a-z0-9_-]{2,16}$'),
  versione text not null check (char_length(versione) <= 12),
  dispositivo uuid not null,
  giocatore text check (giocatore is null or char_length(giocatore) <= 20),
  esito text not null check (char_length(esito) <= 24),
  chiave uuid
);
create index if not exists api_chiamate_creato on public.api_chiamate (creato);
create index if not exists api_chiamate_dispositivo on public.api_chiamate (dispositivo, creato);
create unique index if not exists api_chiamate_chiave on public.api_chiamate (chiave) where chiave is not null;
alter table public.api_chiamate enable row level security;
revoke all on public.api_chiamate from anon, authenticated;

-- 2. RISPOSTE DI ERRORE (sempre lo stesso formato, con un testo in italiano)
create or replace function public.api_errore(p_codice text, p_dettaglio text default null)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('ok', false, 'errore', p_codice, 'messaggio', case p_codice
    when 'richiesta_non_valida' then 'La richiesta deve essere un oggetto JSON con il campo «azione».'
    when 'azione_sconosciuta' then 'Azione sconosciuta. Azioni possibili: ping, visita, partita, accedi, mie_statistiche, admin.'
    when 'client_non_valido' then 'Manca o non va bene «client»: servono piattaforma (es. android), versione (es. 1.0.0) e dispositivo (un UUID).'
    when 'troppe_richieste' then 'Troppe richieste da questo dispositivo: riprova tra un minuto.'
    when 'credenziali' then 'Nome, password o token del giocatore sbagliati.'
    when 'serve_accesso' then 'Per questa azione serve «giocatore» con nome e token.'
    when 'non_autorizzato' then 'Questo profilo non è amministratore.'
    when 'dati_non_validi' then 'Il campo «dati» non va bene per questa azione.'
    else 'Errore del server: riprova più tardi.' end,
    'dettaglio', p_dettaglio));
$$;

-- 3. L'ENDPOINT
-- Riceve tutta la richiesta JSON e risponde sempre in JSON: {"ok": true, ...} oppure {"ok": false, "errore": ...}.
create or replace function public.api(jsonb)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_r jsonb := $1;
  v_az text; v_cl jsonb; v_gi jsonb; v_d jsonb;
  v_piatt text; v_ver text; v_disp uuid;
  v_gnome text; v_gok boolean := false; v_adm boolean := false;
  v_esito text := 'ok'; v_dett text; v_risp jsonb := '{}'::jsonb; v_chv uuid;
  v_pr profili; v_sinc jsonb; v_tot jsonb;
begin
  if v_r is null or jsonb_typeof(v_r) <> 'object' or pg_column_size(v_r) > 200000 then
    return api_errore('richiesta_non_valida');
  end if;
  v_az := lower(coalesce(v_r->>'azione', ''));

  -- ping: prova di collegamento, non scrive niente
  if v_az = 'ping' then
    return jsonb_build_object('ok', true, 'azione', 'ping', 'dati', jsonb_build_object(
      'api', 1,
      'ora', to_char(now() at time zone 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI:SS'),
      'azioni', jsonb_build_array('ping', 'visita', 'partita', 'accedi', 'mie_statistiche', 'admin')));
  end if;
  if v_az not in ('visita', 'partita', 'accedi', 'mie_statistiche', 'admin') then
    return api_errore('azione_sconosciuta');
  end if;

  -- chi chiama: l'app (obbligatorio)
  v_cl := case when jsonb_typeof(v_r->'client') = 'object' then v_r->'client' end;
  v_piatt := lower(v_cl->>'piattaforma');
  v_ver := v_cl->>'versione';
  begin v_disp := (v_cl->>'dispositivo')::uuid; exception when others then v_disp := null; end;
  if v_piatt is null or v_piatt !~ '^[a-z0-9_-]{2,16}$' or v_ver is null or v_ver !~ '^[0-9A-Za-z._+-]{1,12}$' or v_disp is null then
    return api_errore('client_non_valido');
  end if;
  if (select count(*) from (select 1 from api_chiamate
        where dispositivo = v_disp and creato > now() - interval '1 minute' limit 30) x) >= 30 then
    return api_errore('troppe_richieste');
  end if;
  v_d := case when jsonb_typeof(v_r->'dati') = 'object' then v_r->'dati' else '{}'::jsonb end;

  -- chi chiama: il giocatore (facoltativo; per «accedi» nome e password stanno in «dati»)
  if v_az = 'accedi' then
    v_gnome := lower(trim(v_d->>'nome'));
    select * into v_pr from profili where nome = v_gnome;
    if v_pr.nome is null or v_d->>'password' is null or v_pr.hash <> crypt(v_d->>'password', v_pr.hash) then
      v_esito := 'credenziali';
    else
      v_gok := true;
      v_risp := jsonb_build_object('nome', v_pr.nome, 'token', v_pr.token);
    end if;
  elsif jsonb_typeof(v_r->'giocatore') = 'object' then
    v_gi := v_r->'giocatore';
    v_gnome := lower(trim(v_gi->>'nome'));
    begin
      select * into v_pr from profili where nome = v_gnome and token = (v_gi->>'token')::uuid;
    exception when others then v_pr := null;
    end;
    if v_pr.nome is null then v_esito := 'credenziali'; else v_gok := true; end if;
  end if;
  if v_gok then
    v_adm := exists (select 1 from amministratori a where a.nome = v_gnome);
  end if;

  if v_esito = 'ok' then
  begin
    if v_az = 'visita' then
      -- apertura dell'app: al massimo una ogni 30 minuti per dispositivo; quelle degli amministratori non contano
      if v_adm then
        v_risp := jsonb_build_object('contata', false, 'motivo', 'amministratore');
      elsif exists (select 1 from visite where visitatore = v_disp and creato > now() - interval '30 minutes') then
        v_risp := jsonb_build_object('contata', false, 'motivo', 'gia_contata');
      else
        insert into visite (visitatore, nuovo, versione, mobile, app, piattaforma)
        values (v_disp, not exists (select 1 from visite where visitatore = v_disp), v_ver,
                coalesce((v_d->>'mobile')::boolean, v_piatt in ('android', 'ios')),
                coalesce((v_d->>'app')::boolean, v_piatt <> 'web'), v_piatt);
        v_risp := jsonb_build_object('contata', true);
      end if;

    elsif v_az = 'partita' then
      -- fine partita: stessi campi delle statistiche del gioco web, più chi l'ha giocata
      v_chv := nullif(v_d->>'id_partita', '')::uuid;
      if v_chv is not null and exists (select 1 from api_chiamate where chiave = v_chv) then
        v_risp := jsonb_build_object('registrata', false, 'motivo', 'gia_ricevuta');
        v_chv := null;
      else
        insert into statistiche (versione, dungeon, modalita, livello, giocatori, classe, vittoria, piano,
                                 boss, morte, carte, reliquie, danni, uccisioni, piattaforma, giocatore)
        values (v_ver, v_d->>'dungeon', v_d->>'modalita', coalesce((v_d->>'livello')::int, 0),
                (v_d->>'giocatori')::int, v_d->>'classe', (v_d->>'vittoria')::boolean, (v_d->>'piano')::int,
                nullif(v_d->>'boss', ''), nullif(v_d->>'morte', ''),
                case when coalesce(v_d->'carte', 'null'::jsonb) = 'null'::jsonb then '{}'::text[]
                     else array(select left(x, 24) from jsonb_array_elements_text(v_d->'carte') x) end,
                case when coalesce(v_d->'reliquie', 'null'::jsonb) = 'null'::jsonb then '{}'::text[]
                     else array(select left(x, 24) from jsonb_array_elements_text(v_d->'reliquie') x) end,
                coalesce((v_d->>'danni')::int, 0), coalesce((v_d->>'uccisioni')::int, 0),
                v_piatt, case when v_gok then v_gnome end);
        v_risp := jsonb_build_object('registrata', true, 'collegata_al_profilo', v_gok);
      end if;

    elsif v_az = 'mie_statistiche' then
      -- le statistiche di chi chiama: quelle salvate nel profilo (tutti i dispositivi, web compreso)
      -- e il riassunto delle partite inviate con il suo profilo
      if not v_gok then
        v_esito := 'serve_accesso';
      else
        begin
          v_sinc := (select p.dati->>'valdombra-statistiche' from profili p where p.nome = v_gnome)::jsonb;
        exception when others then v_sinc := null;
        end;
        select jsonb_build_object(
                 'partite', count(*), 'vittorie', count(*) filter (where vittoria),
                 'miglior_piano', coalesce(max(piano), 0), 'uccisioni', coalesce(sum(uccisioni), 0),
                 'prima', min(creato), 'ultima', max(creato))
          into v_tot from statistiche where giocatore = v_gnome;
        v_risp := jsonb_build_object(
          'giocatore', v_gnome,
          'sincronizzate', case when jsonb_typeof(v_sinc) = 'object' then v_sinc else '{}'::jsonb end,
          'inviate', v_tot || jsonb_build_object(
            'piattaforme', (select coalesce(jsonb_object_agg(t.p, t.n), '{}'::jsonb)
                            from (select coalesce(piattaforma, 'web') as p, count(*) as n
                                  from statistiche where giocatore = v_gnome group by 1) t),
            'eroi', (select coalesce(jsonb_agg(jsonb_build_object('eroe', t.classe, 'partite', t.n, 'vittorie', t.w, 'miglior_piano', t.b) order by t.n desc), '[]'::jsonb)
                     from (select classe, count(*) as n, count(*) filter (where vittoria) as w, max(piano) as b
                           from statistiche where giocatore = v_gnome group by 1) t),
            'dungeon', (select coalesce(jsonb_agg(jsonb_build_object('dungeon', t.dungeon, 'partite', t.n, 'vittorie', t.w, 'livello_max', t.l) order by t.n desc), '[]'::jsonb)
                        from (select dungeon, count(*) as n, count(*) filter (where vittoria) as w,
                                     coalesce(max(livello) filter (where vittoria), 0) as l
                              from statistiche where giocatore = v_gnome group by 1) t),
            'ultime', (select coalesce(jsonb_agg(jsonb_build_object('quando', t.creato, 'piattaforma', coalesce(t.piattaforma, 'web'),
                                 'dungeon', t.dungeon, 'modalita', t.modalita, 'livello', t.livello, 'eroe', t.classe,
                                 'vittoria', t.vittoria, 'piano', t.piano) order by t.creato desc), '[]'::jsonb)
                       from (select * from statistiche where giocatore = v_gnome order by creato desc limit 10) t)));
      end if;

    elsif v_az = 'admin' then
      -- gli stessi numeri del pannello di amministrazione del gioco
      if not v_gok then v_esito := 'serve_accesso';
      elsif not v_adm then v_esito := 'non_autorizzato';
      else v_risp := admin_dati();
      end if;
    end if;
  exception
    when data_exception or integrity_constraint_violation then
      v_esito := 'dati_non_validi'; v_dett := left(sqlerrm, 200); v_risp := '{}'::jsonb; v_chv := null;
    when others then
      v_esito := 'errore_interno'; v_dett := sqlstate; v_risp := '{}'::jsonb; v_chv := null;
  end;
  end if;

  insert into api_chiamate (azione, piattaforma, versione, dispositivo, giocatore, esito, chiave)
  values (v_az, v_piatt, v_ver, v_disp,
          case when v_gnome ~ '^[a-z0-9_.-]{3,20}$' then v_gnome end,
          v_esito, case when v_esito = 'ok' then v_chv end);

  if v_esito <> 'ok' then
    if v_esito in ('credenziali', 'non_autorizzato') then perform pg_sleep(0.5); end if;
    return api_errore(v_esito, v_dett);
  end if;
  return jsonb_build_object('ok', true, 'azione', v_az,
    'chi', jsonb_build_object('piattaforma', v_piatt, 'versione', v_ver,
                              'giocatore', case when v_gok then v_gnome end, 'admin', v_adm),
    'dati', v_risp);
end $$;

-- 4. PANNELLO DI AMMINISTRAZIONE: aggiunge piattaforme e chiamate dei client
create or replace function public.admin_dati()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  oggi date := (now() at time zone 'Europe/Rome')::date;
  res jsonb;
begin
  with v as (
    select (creato at time zone 'Europe/Rome') as ora, visitatore, nuovo, versione, mobile, app,
           coalesce(piattaforma, 'web') as piattaforma from visite
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
    'versioni', (select coalesce(jsonb_agg(jsonb_build_array(t.versione, t.n, t.piattaforma) order by t.n desc), '[]'::jsonb)
                 from (select versione, piattaforma, count(*) as n from v where ora::date > oggi - 7
                       group by 1, 2 order by 3 desc limit 8) t),
    'piattaforme', (select coalesce(jsonb_agg(jsonb_build_array(t.p, t.v, t.u, t.g) order by t.v desc, t.g desc, t.p), '[]'::jsonb)
                    from (select p, sum(z.v)::int as v, sum(z.u)::int as u, sum(z.g)::int as g from (
                            select piattaforma as p, count(*) as v, count(distinct visitatore) as u, 0 as g
                              from v where ora::date > oggi - 30 group by 1
                            union all
                            select coalesce(piattaforma, 'web'), 0, 0, count(*)
                              from statistiche where creato > now() - interval '30 days' group by 1) z
                          group by p) t),
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
      'coop', (select max(punteggio) from classifica where modalita = 'coop')),
    'api', jsonb_build_object(
      'g7', (select count(*) from api_chiamate where creato > now() - interval '7 days'),
      'errori7', (select count(*) from api_chiamate where esito <> 'ok' and creato > now() - interval '7 days'),
      'dispositivi7', (select count(distinct dispositivo) from api_chiamate where creato > now() - interval '7 days'),
      'giocatori7', (select count(distinct giocatore) from api_chiamate where esito = 'ok' and creato > now() - interval '7 days'),
      'ultima', (select to_char(max(creato) at time zone 'Europe/Rome', 'DD/MM HH24:MI') from api_chiamate),
      'azioni', (select coalesce(jsonb_agg(jsonb_build_array(t.piattaforma, t.azione, t.n, t.e, t.g) order by t.n desc), '[]'::jsonb)
                 from (select piattaforma, azione, count(*) as n, count(*) filter (where esito <> 'ok') as e,
                              count(distinct giocatore) filter (where esito = 'ok') as g
                       from api_chiamate where creato > now() - interval '7 days'
                       group by 1, 2 order by 3 desc limit 15) t),
      'errori', (select coalesce(jsonb_agg(jsonb_build_array(t.esito, t.n) order by t.n desc), '[]'::jsonb)
                 from (select esito, count(*) as n from api_chiamate
                       where esito <> 'ok' and creato > now() - interval '7 days'
                       group by 1 order by 2 desc limit 6) t))
  ) into res;
  return res;
end $$;

-- 5. PERMESSI: dal gioco e dai client si chiama solo «api»; il resto resta chiuso
revoke all on function public.api_errore(text, text) from public;
revoke all on function public.api_errore(text, text) from anon, authenticated;
revoke all on function public.admin_dati() from public;
revoke all on function public.admin_dati() from anon, authenticated;
revoke all on function public.api(jsonb) from public;
grant execute on function public.api(jsonb) to anon, authenticated;
