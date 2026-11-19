-- Assedio a Valdombra v10.15: recuperare una password dimenticata.
-- 1. Codice di recupero: chi è collegato crea nel Profilo un codice di 12 caratteri (si vede una volta sola, nel database
--    c'è solo la sua impronta cifrata). Con «Ho dimenticato la password» scrive nome + codice e sceglie una password nuova:
--    il codice si consuma (se ne crea uno nuovo dal Profilo) e tutti gli altri dispositivi escono dal profilo.
--    Dopo 5 codici sbagliati in un'ora per lo stesso profilo bisogna aspettare.
-- 2. Amministrazione: chi è in «amministratori» reimposta la password di un profilo; il server crea una password provvisoria
--    di 10 caratteri e la restituisce una volta sola. Anche qui gli altri dispositivi escono e il codice di recupero si cancella.
-- Aggiunge una tabella e cinque funzioni; non tocca i dati esistenti.

create table if not exists public.profili_recupero (
  nome text primary key references public.profili(nome) on update cascade on delete cascade,
  hash text,
  creato timestamptz,
  errori int not null default 0,
  ultimo_errore timestamptz
);
alter table public.profili_recupero enable row level security;
revoke all on public.profili_recupero from anon, authenticated;

-- caratteri facili da leggere e dettare (niente 0/O, 1/I/L)
create or replace function public.recupero_casuale(p_n int)
returns text
language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 31), 1), '' order by i)
  from (select gen_random_bytes(p_n) b) x, generate_series(0, p_n - 1) i;
$$;

-- il mio codice di recupero: c'è o no, e da quando
create or replace function public.profilo_recupero_stato(p_nome text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); r profili_recupero;
begin
  select * into r from profili_recupero where profili_recupero.nome = me;
  return jsonb_build_object('ha', r.hash is not null, 'creato', r.creato);
end $$;

-- un codice nuovo (quello vecchio non vale più): risponde con il codice in chiaro, da mostrare una volta sola
create or replace function public.profilo_recupero_nuovo(p_nome text, p_token uuid)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare me text := amici_chi(p_nome, p_token); c text := recupero_casuale(12);
begin
  insert into profili_recupero (nome, hash, creato, errori) values (me, crypt(c, gen_salt('bf', 8)), now(), 0)
  on conflict (nome) do update set hash = excluded.hash, creato = excluded.creato, errori = 0, ultimo_errore = null;
  return substr(c, 1, 4) || '-' || substr(c, 5, 4) || '-' || substr(c, 9, 4);
end $$;

-- password dimenticata: nome + codice di recupero + password nuova → nuovo codice del dispositivo (token) ed esito
-- (con il codice sbagliato risponde invece di dare errore, così il conteggio degli errori resta salvato)
create or replace function public.profilo_recupera(p_nome text, p_codice text, p_nuova text)
returns table (token uuid, esito text)
language plpgsql security definer set search_path = public, extensions as $$
declare n text := lower(trim(coalesce(p_nome, ''))); c text := upper(regexp_replace(coalesce(p_codice, ''), '[^A-Za-z0-9]', '', 'g')); r profili_recupero;
begin
  if char_length(coalesce(p_nuova, '')) < 4 or char_length(p_nuova) > 72 then raise exception 'password_corta'; end if;
  select * into r from profili_recupero where profili_recupero.nome = n for update;
  if r.nome is not null and r.errori >= 5 and r.ultimo_errore > now() - interval '1 hour' then
    raise exception 'troppi_tentativi';
  end if;
  if r.hash is null or char_length(c) <> 12 or r.hash <> crypt(c, r.hash) then
    if r.nome is not null then
      update profili_recupero set errori = case when ultimo_errore > now() - interval '1 hour' then errori + 1 else 1 end, ultimo_errore = now()
        where profili_recupero.nome = n;
    end if;
    perform pg_sleep(0.5);
    return query select null::uuid, 'codice_sbagliato'::text;
    return;
  end if;
  update profili_recupero set hash = null, creato = null, errori = 0, ultimo_errore = null where profili_recupero.nome = n;
  return query update profili set hash = crypt(p_nuova, gen_salt('bf', 8)), token = gen_random_uuid(), aggiornato = now()
    where profili.nome = n returning profili.token, 'fatto'::text;
end $$;

-- amministrazione: password provvisoria per un profilo (la si dà al giocatore, che poi la cambia dal Profilo)
create or replace function public.admin_reimposta_password(p_nome text, p_token uuid, p_altro text)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare n text := lower(trim(coalesce(p_altro, ''))); pw text;
begin
  if not admin_e(p_nome, p_token) then
    perform pg_sleep(0.5);
    raise exception 'credenziali';
  end if;
  if not exists (select 1 from profili where profili.nome = n) then
    return jsonb_build_object('esito', 'non_trovato');
  end if;
  pw := recupero_casuale(10);
  update profili set hash = crypt(pw, gen_salt('bf', 8)), token = gen_random_uuid(), aggiornato = now() where profili.nome = n;
  update profili_recupero set hash = null, creato = null, errori = 0, ultimo_errore = null where profili_recupero.nome = n;
  return jsonb_build_object('esito', 'fatto', 'nome', n, 'password', pw);
end $$;

revoke all on function public.recupero_casuale(int) from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['profilo_recupero_stato(text, uuid)', 'profilo_recupero_nuovo(text, uuid)', 'profilo_recupera(text, text, text)', 'admin_reimposta_password(text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;
