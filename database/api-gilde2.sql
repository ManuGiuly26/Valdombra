-- Assedio a Valdombra v10.9: nell'azione «gilda» dell'endpoint unico «api» le operazioni per la settimana della gilda.
-- Richiede database/api-gilde.sql e database/gilde2.sql (gilda_partita, gilda_ritira).
--   partita {id (UUID della partita, uno nuovo per ogni partita), partita: {vinta, piano, assedio, nemici, elite, boss, abitanti, gruppo}}
--     → come gilda_partita: { esito, pe, punti_boss, missioni_completate, gilda: {livello, pe} }
--   ritira {premio?} → { corone, gemme, premi } da aggiungere nel gioco (senza «premio» li ritira tutti)
-- «mia» risponde già anche con settimana (missioni, boss, il mio contributo, i migliori) e premi da ritirare.
-- Cambia solo la funzione api; se non ha la forma attesa si ferma senza cambiare niente. Non tocca i dati.

do $do$
declare
  d text := pg_get_functiondef('public.api(jsonb)'::regprocedure);
  pezzi text[][] := array[
    array['          when ''posto'' then select jsonb_build_object(''esito'', c.esito, ''posti'', c.posti) into v_risp from gilda_posto(v_gnome, v_chv) c;',
          '          when ''posto'' then select jsonb_build_object(''esito'', c.esito, ''posti'', c.posti) into v_risp from gilda_posto(v_gnome, v_chv) c;
          when ''partita'' then v_risp := gilda_partita(v_gnome, v_chv, (v_d->>''id'')::uuid, v_d->''partita'');
          when ''ritira'' then
            select jsonb_build_object(''corone'', c.corone, ''gemme'', c.gemme, ''premi'', c.premi) into v_risp
              from gilda_ritira(v_gnome, v_chv, nullif(v_d->>''premio'', '''')::bigint) c;'],
    array['op: cerca, mia, crea, entra, usa_codice, annulla, rispondi, caccia, ruolo, esci, modifica, codice, posto''',
          'op: cerca, mia, crea, entra, usa_codice, annulla, rispondi, caccia, ruolo, esci, modifica, codice, posto, partita, ritira''']];
  i int;
begin
  if position('when ''ritira'' then' in d) > 0 then
    raise notice 'api: partita e ritira della gilda ci sono già, niente da fare';
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
