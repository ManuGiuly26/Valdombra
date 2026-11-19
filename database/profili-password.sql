-- Assedio a Valdombra v9.8: reimpostare la password del profilo.
-- Chi è collegato al profilo (ha il codice segreto del dispositivo, «token») può scegliere una password nuova
-- anche se ha dimenticato quella vecchia. Per sicurezza cambia anche il token: gli altri dispositivi
-- e le app collegate escono dal profilo e devono accedere di nuovo con la password nuova.
-- Aggiunge solo una funzione; non tocca i dati esistenti.

create or replace function public.profilo_password(p_nome text, p_token uuid, p_nuova text)
returns table (token uuid)
language plpgsql security definer set search_path = public, extensions as $$
declare n text := lower(trim(p_nome)); r profili;
begin
  if char_length(coalesce(p_nuova, '')) < 4 or char_length(p_nuova) > 72 then raise exception 'password_corta'; end if;
  select * into r from profili where profili.nome = n and profili.token = p_token for update;
  if r.nome is null then
    perform pg_sleep(0.5);
    raise exception 'credenziali';
  end if;
  return query update profili set hash = crypt(p_nuova, gen_salt('bf', 8)), token = gen_random_uuid(), aggiornato = now()
    where profili.nome = n returning profili.token;
end $$;
revoke all on function public.profilo_password(text, uuid, text) from public;
grant execute on function public.profilo_password(text, uuid, text) to anon, authenticated;
