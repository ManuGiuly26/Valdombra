-- Assedio a Valdombra v10.4: la lista amici anche dalle app native, con l'endpoint unico «api».
-- Richiede database/api-client.sql (funzione api), database/api-password.sql e database/amici.sql (funzioni amici_*).
-- Aggiunge l'azione «amici»: serve «giocatore» con nome e token; in «dati» c'è «op»:
--   lista (predefinita) → { amici: [{nome, stato, dal}], codice }   stato: amici | ricevuta | inviata | bloccato
--   richiedi {nome} · rispondi {nome, si} · togli {nome} · blocca {nome} → { esito, nome }
--   codice {nuovo?} → { codice } · usa_codice {codice} → { esito, nome }
-- Il token non finisce nel registro delle chiamate. Cambia solo le funzioni api e api_errore;
-- se api non ha la forma attesa si ferma senza cambiare niente. Non tocca i dati.

do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  pezzi text[][] := array[
    array['jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'')',
          'jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'')'],
    array['if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'') then',
          'if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'') then'],
    array['    elsif v_az = ''mie_statistiche'' then',
          '    elsif v_az = ''amici'' then
      -- amici (v10.4, database/amici.sql): serve il giocatore collegato; il token non va nel registro
      if not v_gok then
        v_esito := ''serve_accesso'';
      else
        v_chv := (v_gi->>''token'')::uuid;
        case lower(coalesce(v_d->>''op'', ''lista''))
          when ''lista'' then
            v_risp := jsonb_build_object(
              ''amici'', coalesce((select jsonb_agg(jsonb_build_object(''nome'', l.nome, ''stato'', l.stato, ''dal'', l.dal)) from amici_lista(v_gnome, v_chv) l), ''[]''::jsonb),
              ''codice'', amici_codice(v_gnome, v_chv, false));
          when ''richiedi'' then v_risp := jsonb_build_object(''esito'', amici_richiedi(v_gnome, v_chv, v_d->>''nome''), ''nome'', lower(trim(v_d->>''nome'')));
          when ''rispondi'' then v_risp := jsonb_build_object(''esito'', amici_rispondi(v_gnome, v_chv, v_d->>''nome'', coalesce((v_d->>''si'')::boolean, false)), ''nome'', lower(trim(v_d->>''nome'')));
          when ''togli'' then v_risp := jsonb_build_object(''esito'', amici_togli(v_gnome, v_chv, v_d->>''nome''), ''nome'', lower(trim(v_d->>''nome'')));
          when ''blocca'' then v_risp := jsonb_build_object(''esito'', amici_blocca(v_gnome, v_chv, v_d->>''nome''), ''nome'', lower(trim(v_d->>''nome'')));
          when ''codice'' then v_risp := jsonb_build_object(''codice'', amici_codice(v_gnome, v_chv, coalesce((v_d->>''nuovo'')::boolean, false)));
          when ''usa_codice'' then
            select jsonb_build_object(''esito'', u.esito, ''nome'', u.nome) into v_risp from amici_usa_codice(v_gnome, v_chv, v_d->>''codice'') u;
          else
            v_esito := ''dati_non_validi''; v_dett := ''op: lista, richiedi, rispondi, togli, blocca, codice, usa_codice'';
        end case;
        v_chv := null;
      end if;

    elsif v_az = ''mie_statistiche'' then']];
  i int;
begin
  if position('elsif v_az = ''amici''' in d) > 0 then
    raise notice 'api: amici c''è già, niente da fare';
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

create or replace function public.api_errore(p_codice text, p_dettaglio text default null)
returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('ok', false, 'errore', p_codice, 'messaggio', case p_codice
    when 'richiesta_non_valida' then 'La richiesta deve essere un oggetto JSON con il campo «azione».'
    when 'azione_sconosciuta' then 'Azione sconosciuta. Azioni possibili: ping, visita, partita, accedi, mie_statistiche, admin, reimposta_password, amici.'
    when 'client_non_valido' then 'Manca o non va bene «client»: servono piattaforma (es. android), versione (es. 1.0.0) e dispositivo (un UUID).'
    when 'troppe_richieste' then 'Troppe richieste da questo dispositivo: riprova tra un minuto.'
    when 'credenziali' then 'Nome, password o token del giocatore sbagliati.'
    when 'serve_accesso' then 'Per questa azione serve «giocatore» con nome e token.'
    when 'non_autorizzato' then 'Questo profilo non è amministratore.'
    when 'dati_non_validi' then 'Il campo «dati» non va bene per questa azione.'
    when 'password_corta' then 'La password nuova («dati.nuova») deve avere da 4 a 72 caratteri.'
    else 'Errore del server: riprova più tardi.' end,
    'dettaglio', p_dettaglio));
$$;
