-- Assedio a Valdombra v9.1: anche le app native mandano il tempo di gioco delle partite.
-- Richiede database/api-client.sql (funzione api) e database/durata.sql (colonna statistiche.durata).
-- Cambia solo la funzione api: prende la sua versione attuale e aggiunge
--   * il campo facoltativo «durata» (secondi, numero intero da 0 a 172800) nell'azione «partita»;
--   * «durata_salvata» nella risposta di «partita»;
--   * «miglior_tempo» (secondi, partite vinte) nel riassunto di «mie_statistiche».
-- Se la funzione non ha la forma attesa si ferma senza cambiare niente. Non tocca i dati.

do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  dur constant text := 'case when (v_d->>''durata'') ~ ''^[0-9]{1,6}$'' and (v_d->>''durata'')::int <= 172800 then (v_d->>''durata'')::int end';
  pezzi text[][] := array[
    array['boss, morte, carte, reliquie, danni, uccisioni, piattaforma, giocatore)',
          'boss, morte, carte, reliquie, danni, uccisioni, piattaforma, giocatore, durata)'],
    array['v_piatt, case when v_gok then v_gnome end);',
          'v_piatt, case when v_gok then v_gnome end, ' || dur || ');'],
    array['jsonb_build_object(''registrata'', true, ''collegata_al_profilo'', v_gok)',
          'jsonb_build_object(''registrata'', true, ''collegata_al_profilo'', v_gok, ''durata_salvata'', (' || dur || ') is not null)'],
    array['''miglior_piano'', coalesce(max(piano), 0),',
          '''miglior_piano'', coalesce(max(piano), 0), ''miglior_tempo'', min(durata) filter (where vittoria),']];
  i int;
begin
  if position('durata_salvata' in d) > 0 then
    raise notice 'api: la durata c''è già, niente da fare';
    return;
  end if;
  for i in 1 .. array_length(pezzi, 1) loop
    if (length(d) - length(replace(d, pezzi[i][1], ''))) / length(pezzi[i][1]) <> 1 then
      raise exception 'api: forma inattesa (pezzo %), nessuna modifica', i;
    end if;
    d := replace(d, pezzi[i][1], pezzi[i][2]);
  end loop;
  execute d;
end $do$;
