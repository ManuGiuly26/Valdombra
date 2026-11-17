-- Statistiche anonime per il bilanciamento di Assedio a Valdombra.
-- Incolla tutto questo in Supabase: SQL Editor -> New query -> Run.
-- Ogni giocatore, a fine partita, invia UNA riga senza nomi: eroe, dungeon, esito, mazzo, reliquie.
-- Il gioco può solo AGGIUNGERE righe: nessuno può leggerle dal gioco, le vedi solo tu dal pannello di Supabase.

create table if not exists public.statistiche (
  id bigint generated always as identity primary key,
  creato timestamptz not null default now(),
  versione text not null check (char_length(versione) <= 12),
  dungeon text not null check (char_length(dungeon) <= 12),
  modalita text not null check (modalita in ('norm', 'surv', 'daily')),
  livello int not null default 0 check (livello between 0 and 10),
  giocatori int not null check (giocatori between 1 and 8),
  classe text not null check (char_length(classe) <= 16),
  vittoria boolean not null,
  piano int not null check (piano between 0 and 100000),
  boss text check (boss is null or char_length(boss) <= 16),
  morte text check (morte is null or char_length(morte) <= 80),
  carte text[] not null default '{}' check (cardinality(carte) <= 80),
  reliquie text[] not null default '{}' check (cardinality(reliquie) <= 40),
  danni int not null default 0 check (danni between 0 and 10000000),
  uccisioni int not null default 0 check (uccisioni between 0 and 100000)
);

alter table public.statistiche enable row level security;

drop policy if exists "aggiungi statistica" on public.statistiche;
create policy "aggiungi statistica" on public.statistiche for insert to anon with check (true);

revoke all on public.statistiche from anon, authenticated;
grant insert on public.statistiche to anon;

-- Viste pronte da guardare nel pannello (Table editor o SQL Editor). Non sono leggibili dal gioco.
create or replace view public.stat_eroi with (security_invoker = on) as
  select classe, dungeon, count(*) as partite,
         count(*) filter (where vittoria) as vittorie,
         round(100.0 * count(*) filter (where vittoria) / count(*), 1) as perc_vittorie,
         round(avg(piano), 1) as piano_medio
  from public.statistiche where modalita = 'norm'
  group by classe, dungeon order by dungeon, perc_vittorie desc;

create or replace view public.stat_carte with (security_invoker = on) as
  select c.carta, s.classe, count(*) as partite_con_la_carta,
         round(100.0 * count(*) filter (where s.vittoria) / count(*), 1) as perc_vittorie
  from public.statistiche s, unnest(s.carte) as c(carta)
  where s.modalita = 'norm'
  group by c.carta, s.classe having count(*) >= 5 order by perc_vittorie desc;

create or replace view public.stat_morti with (security_invoker = on) as
  select dungeon, morte, count(*) as sconfitte, round(avg(piano), 1) as piano_medio
  from public.statistiche where not vittoria and morte is not null
  group by dungeon, morte order by sconfitte desc;

create or replace view public.stat_boss with (security_invoker = on) as
  select dungeon, boss, count(*) as arrivati,
         round(100.0 * count(*) filter (where vittoria) / count(*), 1) as perc_vittorie
  from public.statistiche where boss is not null and modalita = 'norm'
  group by dungeon, boss order by dungeon, boss;

revoke all on public.stat_eroi, public.stat_carte, public.stat_morti, public.stat_boss from anon, authenticated;
