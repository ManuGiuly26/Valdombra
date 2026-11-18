-- Assedio a Valdombra v9.0: tempo di gioco delle partite, per le statistiche dell'amministratrice.
-- Aggiunge una colonna (vuota per le partite già salvate) e una funzione nuova; non tocca i dati esistenti.
-- Il gioco manda la durata in secondi (le pause lunghe non contano: al massimo 2 minuti per pausa).

alter table public.statistiche add column if not exists durata integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'statistiche_durata_ok') then
    alter table public.statistiche add constraint statistiche_durata_ok check (durata is null or (durata between 0 and 172800));
  end if;
end $$;

-- Medie sul tempo delle partite vinte (Normale e sfida del giorno), in minuti. Non si può chiamare dal gioco:
-- la usa solo admin_statistiche dopo il controllo dell'amministratrice.
create or replace function public.admin_tempi()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with w as (select dungeon, classe, durata from statistiche
             where vittoria and durata is not null and modalita in ('norm', 'daily'))
  select jsonb_build_object(
    'con',      (select count(*) from statistiche where durata is not null),
    'vinte',    (select count(*) from w),
    'media',    (select round(avg(durata) / 60.0, 1) from w),
    'migliore', (select round(min(durata) / 60.0, 1) from w),
    'fasce',    (select jsonb_build_array(count(*) filter (where durata < 300),
                                          count(*) filter (where durata >= 300 and durata < 600),
                                          count(*) filter (where durata >= 600 and durata < 1200),
                                          count(*) filter (where durata >= 1200)) from w),
    'dungeon',  (select coalesce(jsonb_agg(jsonb_build_array(t.dungeon, t.n, t.m, t.b) order by t.n desc), '[]'::jsonb)
                 from (select dungeon, count(*) as n, round(avg(durata) / 60.0, 1) as m, round(min(durata) / 60.0, 1) as b
                       from w group by 1) t),
    'eroi',     (select coalesce(jsonb_agg(jsonb_build_array(t.classe, t.n, t.m) order by t.m), '[]'::jsonb)
                 from (select classe, count(*) as n, round(avg(durata) / 60.0, 1) as m from w group by 1) t)
  )
$$;
revoke all on function public.admin_tempi() from public, anon, authenticated;

-- Il pannello riceve anche i tempi (stesso controllo di prima).
create or replace function public.admin_statistiche(p_nome text, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not admin_e(p_nome, p_token) then
    perform pg_sleep(0.5);
    raise exception 'non_autorizzato';
  end if;
  return admin_dati() || jsonb_build_object('tempi', admin_tempi());
end $function$;
