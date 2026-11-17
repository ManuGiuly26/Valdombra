-- Classifica della modalità Sopravvivenza di Assedio a Valdombra.
-- Incolla tutto questo in Supabase: SQL Editor -> New query -> Run.

create table if not exists public.classifica (
  id bigint generated always as identity primary key,
  creato timestamptz not null default now(),
  modalita text not null check (modalita in ('solo', 'coop')),
  nomi text not null check (char_length(nomi) between 1 and 200),
  classi text not null check (char_length(classi) <= 200),
  giocatori int not null check (giocatori between 1 and 8),
  piani int not null check (piani between 0 and 100000),
  uccisioni int not null default 0 check (uccisioni >= 0),
  livello int not null default 0 check (livello between 0 and 10),
  punteggio int not null check (punteggio between 0 and 100000000),
  stanza text check (stanza is null or char_length(stanza) <= 8)
);

create index if not exists classifica_modalita_punteggio on public.classifica (modalita, punteggio desc);

-- Chiunque abbia il gioco può leggere la classifica e aggiungere un punteggio,
-- ma nessuno può modificare o cancellare quelli degli altri.
alter table public.classifica enable row level security;

drop policy if exists "leggi classifica" on public.classifica;
create policy "leggi classifica" on public.classifica for select to anon using (true);

drop policy if exists "aggiungi punteggio" on public.classifica;
create policy "aggiungi punteggio" on public.classifica for insert to anon with check (true);

grant select, insert on public.classifica to anon;
