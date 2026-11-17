-- Aggiunge il dungeon alla classifica (Rocca di Valdombra, Cripte di Gelomorto...).
-- Incolla in Supabase: SQL Editor -> New query -> Run.
alter table public.classifica add column if not exists dungeon text not null default 'rocca'
  check (char_length(dungeon) <= 20);
create index if not exists classifica_dungeon_modalita_punteggio on public.classifica (dungeon, modalita, punteggio desc);
