-- Assedio a Valdombra v9.8: reimpostare la password anche dalle app native.
-- Richiede database/api-client.sql (funzione api) e database/profili-password.sql (funzione profilo_password).
-- Aggiunge all'endpoint l'azione «reimposta_password»: serve «giocatore» con nome e token, in «dati» la password «nuova».
-- Risponde con il token nuovo (gli altri dispositivi devono accedere di nuovo). Il token non finisce nel registro delle chiamate.
-- Cambia solo le funzioni api e api_errore; se api non ha la forma attesa si ferma senza cambiare niente. Non tocca i dati.

do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  pezzi text[][] := array[
    array['jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'')',
          'jsonb_build_array(''ping'', ''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'')'],
    array['if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'') then',
          'if v_az not in (''visita'', ''partita'', ''accedi'', ''mie_statistiche'', ''admin'', ''reimposta_password'') then'],
    array['    elsif v_az = ''mie_statistiche'' then',
          '    elsif v_az = ''reimposta_password'' then
      -- nuova password (v9.8): basta il giocatore collegato; risponde con il token nuovo, che non va nel registro
      if not v_gok then
        v_esito := ''serve_accesso'';
      elsif char_length(coalesce(v_d->>''nuova'', '''')) < 4 or char_length(v_d->>''nuova'') > 72 then
        v_esito := ''password_corta'';
      else
        select pp.token into v_chv from profilo_password(v_gnome, (v_gi->>''token'')::uuid, v_d->>''nuova'') pp;
        v_risp := jsonb_build_object(''nome'', v_gnome, ''token'', v_chv);
        v_chv := null;
      end if;

    elsif v_az = ''mie_statistiche'' then']];
  i int;
begin
  if position('reimposta_password' in d) > 0 then
    raise notice 'api: reimposta_password c''è già, niente da fare';
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
    when 'azione_sconosciuta' then 'Azione sconosciuta. Azioni possibili: ping, visita, partita, accedi, mie_statistiche, admin, reimposta_password.'
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
