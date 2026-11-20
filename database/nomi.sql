-- Assedio a Valdombra v10.19: i nomi dei profili si vedono con le maiuscole e le minuscole scritte dal giocatore.
-- Il nome del profilo resta lo stesso per entrare e per tutto il resto (in minuscolo: «Manu», «manu» e «MANU» sono lo stesso
-- profilo, e non possono esistere due profili che cambiano solo per le maiuscole). In più c'è «mostra»: come si vede il nome.
-- 1. Colonna profili.mostra: uguale al nome a parte le maiuscole (vuota = si vede il nome in minuscolo).
-- 2. profilo_crea salva il nome come è stato scritto; profilo_accedi, se «mostra» è ancora vuota (profili di prima),
--    la riempie con il nome scritto per entrare.
-- 3. profilo_mostra: legge o cambia (solo le maiuscole) come si vede il mio nome.
-- 4. nomi_mostra: per una lista di nomi (amici, gilda) risponde { nome: come si vede }. Serve essere collegati.
-- 5. Endpoint unico «api»: nuova azione «nomi» (op «mio» e «lista»), e «accedi» risponde anche con «mostra».
-- Aggiunge una colonna e due funzioni e cambia profilo_crea, profilo_accedi, api_errore e api. Non cambia i dati che ci sono.

alter table public.profili add column if not exists mostra text;
do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'profili_mostra_ok') then
    alter table public.profili add constraint profili_mostra_ok
      check (mostra is null or (lower(mostra) = nome and mostra ~ '^[A-Za-z0-9_.-]{3,20}$'));
  end if;
end $c$;

create or replace function public.profilo_crea(p_nome text, p_pass text, p_dati jsonb)
returns table (token uuid, rev integer)
language plpgsql security definer set search_path = public, extensions as $$
declare n text := lower(trim(p_nome)); m text := trim(p_nome);
begin
  if n !~ '^[a-z0-9_.-]{3,20}$' or m !~ '^[A-Za-z0-9_.-]{3,20}$' then raise exception 'nome_non_valido'; end if;
  if char_length(coalesce(p_pass,'')) < 4 or char_length(p_pass) > 72 then raise exception 'password_corta'; end if;
  if pg_column_size(p_dati) > 400000 then raise exception 'troppo_grande'; end if;
  if exists (select 1 from profili where profili.nome = n) then raise exception 'nome_usato'; end if;
  return query with ins as (
      insert into profili (nome, mostra, hash, dati)
      values (n, m, crypt(p_pass, gen_salt('bf', 8)), coalesce(p_dati, '{}'::jsonb))
      returning profili.token as t, profili.rev as r)
    select ins.t, ins.r from ins;
end $$;

create or replace function public.profilo_accedi(p_nome text, p_pass text)
returns table (token uuid, dati jsonb, rev integer)
language plpgsql security definer set search_path = public, extensions as $$
declare r profili; m text := trim(coalesce(p_nome, ''));
begin
  select * into r from profili where profili.nome = lower(m);
  if r.nome is null or r.hash <> crypt(p_pass, r.hash) then
    perform pg_sleep(0.5);
    raise exception 'credenziali';
  end if;
  if r.mostra is null and m ~ '^[A-Za-z0-9_.-]{3,20}$' then
    update profili set mostra = m where profili.nome = r.nome;
  end if;
  return query select r.token, r.dati, r.rev;
end $$;

-- come si vede il mio nome; con p_nuovo lo cambia (solo maiuscole e minuscole)
create or replace function public.profilo_mostra(p_nome text, p_token uuid, p_nuovo text default null)
returns text
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m text := trim(coalesce(p_nuovo, ''));
begin
  if p_nuovo is not null then
    if m !~ '^[A-Za-z0-9_.-]{3,20}$' or lower(m) <> me then raise exception 'nome_diverso'; end if;
    update profili set mostra = m where profili.nome = me;
  end if;
  return coalesce((select profili.mostra from profili where profili.nome = me), me);
end $$;

-- come si vedono i nomi di una lista (al massimo 200): { nome: come si vede }; i nomi che non esistono non ci sono
create or replace function public.nomi_mostra(p_nome text, p_token uuid, p_nomi text[])
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform amici_chi(p_nome, p_token);
  if coalesce(array_length(p_nomi, 1), 0) > 200 then raise exception 'troppi_nomi'; end if;
  return coalesce((select jsonb_object_agg(p.nome, coalesce(p.mostra, p.nome)) from profili p
    where p.nome in (select lower(trim(x)) from unnest(coalesce(p_nomi, '{}'::text[])) x)), '{}'::jsonb);
end $$;

do $g$
declare f text;
begin
  foreach f in array array['profilo_mostra(text, uuid, text)', 'nomi_mostra(text, uuid, text[])'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;

-- messaggi dell'endpoint unico: «nomi» tra le azioni e il messaggio per «nome_diverso»
create or replace function public.api_errore(p_codice text, p_dettaglio text default null)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('ok', false, 'errore', p_codice, 'messaggio', case p_codice
    when 'richiesta_non_valida' then 'La richiesta deve essere un oggetto JSON con il campo «azione».'
    when 'azione_sconosciuta' then 'Azione sconosciuta. Azioni possibili: ping, visita, partita, accedi, mie_statistiche, admin, reimposta_password, amici, gilda, nomi.'
    when 'client_non_valido' then 'Manca o non va bene «client»: servono piattaforma (es. android), versione (es. 1.0.0) e dispositivo (un UUID).'
    when 'troppe_richieste' then 'Troppe richieste da questo dispositivo: riprova tra un minuto.'
    when 'credenziali' then 'Nome, password o token del giocatore sbagliati.'
    when 'serve_accesso' then 'Per questa azione serve «giocatore» con nome e token.'
    when 'non_autorizzato' then 'Questo profilo non è amministratore.'
    when 'dati_non_validi' then 'Il campo «dati» non va bene per questa azione.'
    when 'password_corta' then 'La password nuova («dati.nuova») deve avere da 4 a 72 caratteri.'
    when 'nome_diverso' then 'Il nome nuovo («dati.nuovo») può cambiare solo nelle maiuscole e minuscole.'
    else 'Errore del server: riprova più tardi.' end,
    'dettaglio', p_dettaglio));
$$;

-- endpoint unico: azione «nomi» e «mostra» nella risposta di «accedi»
do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  pezzi text[][] := array[
    array['''reimposta_password'', ''amici'', ''gilda'')));',
          '''reimposta_password'', ''amici'', ''gilda'', ''nomi'')));'],
    array['if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'', ''gilda'') then',
          'if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'', ''gilda'', ''nomi'') then'],
    array['      v_risp := jsonb_build_object(''nome'', v_pr.nome, ''token'', v_pr.token);',
          '      if v_pr.mostra is null and trim(v_d->>''nome'') ~ ''^[A-Za-z0-9_.-]{3,20}$'' then
        update profili set mostra = trim(v_d->>''nome'') where nome = v_pr.nome;
        v_pr.mostra := trim(v_d->>''nome'');
      end if;
      v_risp := jsonb_build_object(''nome'', v_pr.nome, ''token'', v_pr.token, ''mostra'', coalesce(v_pr.mostra, v_pr.nome));'],
    array['    elsif v_az = ''mie_statistiche'' then',
          '    elsif v_az = ''nomi'' then
      -- maiuscole dei nomi (v10.19, database/nomi.sql): serve il giocatore collegato; il token non va nel registro
      if not v_gok then
        v_esito := ''serve_accesso'';
      else
        v_chv := (v_gi->>''token'')::uuid;
        case lower(coalesce(v_d->>''op'', ''mio''))
          when ''mio'' then
            if v_d->>''nuovo'' is not null and (trim(v_d->>''nuovo'') !~ ''^[A-Za-z0-9_.-]{3,20}$'' or lower(trim(v_d->>''nuovo'')) <> v_gnome) then
              v_esito := ''nome_diverso'';
            else
              v_risp := jsonb_build_object(''nome'', v_gnome, ''mostra'', profilo_mostra(v_gnome, v_chv, v_d->>''nuovo''));
            end if;
          when ''lista'' then
            if coalesce(jsonb_typeof(v_d->''nomi''), '''') <> ''array'' or jsonb_array_length(v_d->''nomi'') > 200 then
              v_esito := ''dati_non_validi''; v_dett := ''nomi: una lista da 0 a 200 nomi'';
            else
              v_risp := jsonb_build_object(''nomi'', nomi_mostra(v_gnome, v_chv, array(select jsonb_array_elements_text(v_d->''nomi''))));
            end if;
          else
            v_esito := ''dati_non_validi''; v_dett := ''op: mio, lista'';
        end case;
        v_chv := null;
      end if;

    elsif v_az = ''mie_statistiche'' then']];
  i int;
begin
  if position('v_az = ''nomi''' in d) > 0 then
    raise notice 'api: l''azione nomi c''è già, niente da fare';
  else
    for i in 1 .. array_length(pezzi, 1) loop
      if (length(d) - length(replace(d, pezzi[i][1], ''))) / length(pezzi[i][1]) <> 1 then
        raise exception 'api: forma inattesa (pezzo %), nessuna modifica', i;
      end if;
      d := replace(d, pezzi[i][1], pezzi[i][2]);
    end loop;
    execute d;
  end if;
end $do$;
