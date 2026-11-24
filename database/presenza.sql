-- v10.28: chi è in gioco anche dalle app native, e il cancello conta come vinto per la gilda solo alla fine.
-- 1) Tabella «presenze»: ultima volta che un profilo collegato si è fatto vivo (gioco web ogni 60 secondi con presenza_segna,
--    app native con qualsiasi chiamata dell'endpoint unico fatta col giocatore, o con l'azione «presenza» ogni 60 secondi).
--    È «in gioco» chi si è fatto vivo negli ultimi 2 minuti: amici_lista e gilda_mia lo dicono col campo «online».
-- 2) gilda_partita: una partita dell'Aprite il cancello («modalita» = 'porta', oppure con abitanti salvati) conta come vinta
--    solo se arriva all'8ª ondata (piano 8) ed è vinta: perdere a metà non vale come vittoria.

create table if not exists presenze (
  nome text primary key references profili(nome) on delete cascade,
  visto timestamptz not null default now(),
  piattaforma text
);
alter table presenze enable row level security;  -- nessuna policy: si usa solo dalle funzioni qui sotto

create or replace function presenza_segna(p_nome text, p_token uuid, p_piattaforma text default 'web')
returns boolean language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token);
begin
  insert into presenze (nome, visto, piattaforma) values (me, now(), left(coalesce(lower(p_piattaforma), 'web'), 16))
    on conflict (nome) do update set visto = now(), piattaforma = excluded.piattaforma;
  return true;
end $$;
revoke all on function presenza_segna(text, uuid, text) from public;
grant execute on function presenza_segna(text, uuid, text) to anon, authenticated;

create or replace function presenza_on(p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from presenze x where x.nome = p and x.visto > now() - interval '2 minutes')
$$;
revoke all on function presenza_on(text) from public, anon, authenticated;

-- amici_lista con il campo «online» (cambia il tipo restituito: va ricreata)
drop function if exists amici_lista(text, uuid);
create function amici_lista(p_nome text, p_token uuid)
returns table(nome text, stato text, dal timestamptz, online boolean)
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token);
begin
  return query
    select y.n, y.s, y.d, (y.s = 'amici' and presenza_on(y.n)) from (
      select case when x.da = me then x.a else x.da end as n, 'amici'::text as s, x.aggiornato as d
        from amici x where (x.da = me or x.a = me) and x.stato = 'amici'
      union all
      select x.da, 'ricevuta'::text, x.creato from amici x where x.a = me and x.stato = 'richiesta'
      union all
      select x.a, 'inviata'::text, x.creato from amici x where x.da = me and x.stato = 'richiesta'
      union all
      select x.a, 'bloccato'::text, x.creato from amici x where x.da = me and x.stato = 'bloccato') y
    order by 2, 1;
end $$;
revoke all on function amici_lista(text, uuid) from public;
grant execute on function amici_lista(text, uuid) to anon, authenticated;

do $do$
declare d text; n text;
begin
  -- gilda_mia: «online» per ogni membro
  d := pg_get_functiondef('public.gilda_mia(text, uuid)'::regprocedure);
  n := replace(d, $a$jsonb_build_object('nome', x.nome, 'ruolo', x.ruolo, 'pe', x.pe, 'entrato', x.entrato)$a$,
                  $a$jsonb_build_object('nome', x.nome, 'ruolo', x.ruolo, 'pe', x.pe, 'entrato', x.entrato, 'online', presenza_on(x.nome))$a$);
  if n = d then raise exception 'gilda_mia: pezzo non trovato'; end if;
  execute n;

  -- gilda_partita: il cancello vale come vittoria solo all'8ª ondata
  d := pg_get_functiondef('public.gilda_partita(text, uuid, uuid, jsonb)'::regprocedure);
  n := replace(d, $a$  perform gilda_prepara(m.gilda);
  v_pe := 10$a$, $a$  if (coalesce(d->>'modalita', '') = 'porta' or abi > 0) and piano < 8 then vinta := false; end if;
  perform gilda_prepara(m.gilda);
  v_pe := 10$a$);
  if n = d then raise exception 'gilda_partita: pezzo non trovato'; end if;
  execute n;

  -- api: azione «presenza»; ogni chiamata col giocatore collegato lo segna in gioco; «online» nella lista amici
  d := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  n := replace(d, $a$'admin', 'reimposta_password', 'amici', 'gilda', 'nomi')));$a$, $a$'admin', 'reimposta_password', 'amici', 'gilda', 'nomi', 'presenza')));$a$);
  n := replace(n, $a$if v_az not in ('visita', 'partita', 'accedi', 'mie_statistiche', 'admin', 'reimposta_password', 'amici', 'gilda', 'nomi') then$a$,
                  $a$if v_az not in ('visita', 'partita', 'accedi', 'mie_statistiche', 'admin', 'reimposta_password', 'amici', 'gilda', 'nomi', 'presenza') then$a$);
  n := replace(n, $a$  if v_gok then
    v_adm := exists (select 1 from amministratori a where a.nome = v_gnome);
  end if;$a$, $a$  if v_gok then
    v_adm := exists (select 1 from amministratori a where a.nome = v_gnome);
    insert into presenze (nome, visto, piattaforma) values (v_gnome, now(), v_piatt)
      on conflict (nome) do update set visto = now(), piattaforma = excluded.piattaforma;
  end if;$a$);
  n := replace(n, $a$jsonb_build_object('nome', l.nome, 'stato', l.stato, 'dal', l.dal)$a$, $a$jsonb_build_object('nome', l.nome, 'stato', l.stato, 'dal', l.dal, 'online', l.online)$a$);
  n := replace(n, $a$    elsif v_az = 'mie_statistiche' then$a$, $a$    elsif v_az = 'presenza' then
      -- v10.28: «sono in gioco»; da chiamare ogni 60 secondi mentre l'app è aperta (vale 2 minuti)
      if not v_gok then v_esito := 'serve_accesso'; else v_risp := jsonb_build_object('online', true, 'ogni_secondi', 60); end if;

    elsif v_az = 'mie_statistiche' then$a$);
  -- le chiamate «presenza» (una al minuto) non riempiono il registro
  n := replace(n, $a$  insert into api_chiamate (azione, piattaforma, versione, dispositivo, giocatore, esito, chiave)$a$,
                  $a$  if v_az <> 'presenza' or v_esito <> 'ok' then
  insert into api_chiamate (azione, piattaforma, versione, dispositivo, giocatore, esito, chiave)$a$);
  n := replace(n, $a$          v_esito, case when v_esito = 'ok' then v_chv end);$a$, $a$          v_esito, case when v_esito = 'ok' then v_chv end);
  end if;$a$);
  if position($a$'nomi', 'presenza')));$a$ in n) = 0 or position($a$'nomi', 'presenza') then$a$ in n) = 0 or position('insert into presenze' in n) = 0
     or position($a$'online', l.online$a$ in n) = 0 or position($a$elsif v_az = 'presenza'$a$ in n) = 0 or position($a$if v_az <> 'presenza' or$a$ in n) = 0
     or position($a$v_chv end);
  end if;$a$ in n) = 0 then raise exception 'api: qualche pezzo non trovato'; end if;
  execute n;
end $do$;
