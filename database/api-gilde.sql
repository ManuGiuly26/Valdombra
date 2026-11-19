-- Assedio a Valdombra v10.8: la gilda anche dalle app native, con l'endpoint unico «api».
-- Richiede database/api-amici.sql (funzione api con l'azione amici) e database/gilde.sql (funzioni gilda_*).
-- Aggiunge l'azione «gilda»; in «dati» c'è «op»:
--   cerca {testo?} (va anche senza giocatore) → { gilde: [{id, nome, descrizione, aperta, membri, posti, livello}] }
--   mia (predefinita) → { gilda, io, membri, richieste } come gilda_mia
--   crea {nome, aperta?, descrizione?} → { esito, id } · entra {id} · annulla {id} → { esito }
--   usa_codice {codice} → { esito, id, nome } · rispondi {nome, si} · caccia {nome} · ruolo {nome, ruolo} · esci · modifica {aperta?, descrizione?, nome?} → { esito }
--   codice {nuovo?} → { codice } · posto → { esito, posti }
-- Il token non finisce nel registro delle chiamate. Cambia solo le funzioni api e api_errore;
-- se api non ha la forma attesa si ferma senza cambiare niente. Non tocca i dati.

do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  pezzi text[][] := array[
    array['jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'')',
          'jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'', ''gilda'')'],
    array['if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'') then',
          'if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'', ''amici'', ''gilda'') then'],
    array['    elsif v_az = ''mie_statistiche'' then',
          '    elsif v_az = ''gilda'' then
      -- gilda (v10.8, database/gilde.sql): «cerca» va anche senza giocatore, il resto serve il giocatore collegato; il token non va nel registro
      if lower(coalesce(v_d->>''op'', ''mia'')) = ''cerca'' then
        v_risp := jsonb_build_object(''gilde'', coalesce((select jsonb_agg(to_jsonb(c)) from gilda_cerca(coalesce(v_d->>''testo'', '''')) c), ''[]''::jsonb));
      elsif not v_gok then
        v_esito := ''serve_accesso'';
      else
        v_chv := (v_gi->>''token'')::uuid;
        case lower(coalesce(v_d->>''op'', ''mia''))
          when ''mia'' then v_risp := gilda_mia(v_gnome, v_chv);
          when ''crea'' then
            select jsonb_build_object(''esito'', c.esito, ''id'', c.id) into v_risp
              from gilda_crea(v_gnome, v_chv, v_d->>''nome'', coalesce((v_d->>''aperta'')::boolean, true), coalesce(v_d->>''descrizione'', '''')) c;
          when ''entra'' then v_risp := jsonb_build_object(''esito'', gilda_entra(v_gnome, v_chv, (v_d->>''id'')::bigint));
          when ''usa_codice'' then
            select jsonb_build_object(''esito'', c.esito, ''id'', c.gilda, ''nome'', c.nome) into v_risp from gilda_usa_codice(v_gnome, v_chv, v_d->>''codice'') c;
          when ''annulla'' then v_risp := jsonb_build_object(''esito'', gilda_annulla(v_gnome, v_chv, (v_d->>''id'')::bigint));
          when ''rispondi'' then v_risp := jsonb_build_object(''esito'', gilda_rispondi(v_gnome, v_chv, v_d->>''nome'', coalesce((v_d->>''si'')::boolean, false)));
          when ''caccia'' then v_risp := jsonb_build_object(''esito'', gilda_caccia(v_gnome, v_chv, v_d->>''nome''));
          when ''ruolo'' then v_risp := jsonb_build_object(''esito'', gilda_ruolo(v_gnome, v_chv, v_d->>''nome'', v_d->>''ruolo''));
          when ''esci'' then v_risp := jsonb_build_object(''esito'', gilda_esci(v_gnome, v_chv));
          when ''modifica'' then v_risp := jsonb_build_object(''esito'', gilda_modifica(v_gnome, v_chv, (v_d->>''aperta'')::boolean, v_d->>''descrizione'', v_d->>''nome''));
          when ''codice'' then v_risp := jsonb_build_object(''codice'', gilda_codice(v_gnome, v_chv, coalesce((v_d->>''nuovo'')::boolean, false)));
          when ''posto'' then select jsonb_build_object(''esito'', c.esito, ''posti'', c.posti) into v_risp from gilda_posto(v_gnome, v_chv) c;
          else
            v_esito := ''dati_non_validi''; v_dett := ''op: cerca, mia, crea, entra, usa_codice, annulla, rispondi, caccia, ruolo, esci, modifica, codice, posto'';
        end case;
        v_chv := null;
      end if;

    elsif v_az = ''mie_statistiche'' then']];
  i int;
begin
  if position('elsif v_az = ''gilda''' in d) > 0 then
    raise notice 'api: gilda c''è già, niente da fare';
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
    when 'azione_sconosciuta' then 'Azione sconosciuta. Azioni possibili: ping, visita, partita, accedi, mie_statistiche, admin, reimposta_password, amici, gilda.'
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
