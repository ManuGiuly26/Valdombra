-- Assedio a Valdombra v10.9: gilde (seconda parte: livello, missioni settimanali, boss settimanale, premi).
-- Richiede database/gilde.sql. Alla fine di ogni partita il gioco chiama gilda_partita con i numeri della partita:
--   PE alla gilda e al giocatore: 10, +20 se vinta, +5 per Livello di Assedio. Livelli della gilda 1-10 (2: 500 … 10: 30.000).
--   3 missioni a settimana (da lunedì, ora di Roma), scelte a caso per ogni gilda; obiettivo × (1 + 0,15 × (livello − 1)) × membri/5 (almeno ×1).
--     Ognuna completata: 200 PE alla gilda e 15 Corone a chi ha contribuito; tutte e 3: +1 Gemma a chi ha contribuito.
--   Boss della settimana (uno dei 6 a turno): vita 1.500 × membri/5 (almeno ×1) × (1 + 0,3 × (livello − 1));
--     ogni partita toglie 100 punti se vinta, altrimenti 10 per piano (al massimo 90), × (1 + 0,2 × Assedio).
--     Se cade: 500 PE alla gilda, 40 Corone e 2 Gemme a chi l'ha colpito.
-- Corone e Gemme vivono nel gioco: il server scrive i premi in gilda_premi e il gioco li incassa con gilda_ritira (una volta sola).
-- Limiti: ogni partita conta una volta (id della partita), al massimo 40 partite al giorno per giocatore, numeri della partita limitati.
-- Aggiunge tabelle e funzioni nuove e rifà gilda_mia (stessi dati di prima più settimana e premi). Non tocca i dati esistenti.

create table if not exists public.gilda_missioni (
  gilda bigint not null references public.gilde(id) on delete cascade,
  settimana date not null,
  tipo text not null,
  obiettivo int not null check (obiettivo > 0),
  progresso int not null default 0,
  fatta timestamptz,
  primary key (gilda, settimana, tipo)
);
alter table public.gilda_missioni enable row level security;
revoke all on public.gilda_missioni from anon, authenticated;

create table if not exists public.gilda_boss (
  gilda bigint not null references public.gilde(id) on delete cascade,
  settimana date not null,
  boss text not null,
  vita int not null check (vita > 0),
  danni int not null default 0,
  sconfitto timestamptz,
  primary key (gilda, settimana)
);
alter table public.gilda_boss enable row level security;
revoke all on public.gilda_boss from anon, authenticated;

create table if not exists public.gilda_contributi (
  gilda bigint not null references public.gilde(id) on delete cascade,
  settimana date not null,
  nome text not null references public.profili(nome) on update cascade on delete cascade,
  partite int not null default 0,
  boss int not null default 0,
  missioni jsonb not null default '{}'::jsonb,
  primary key (gilda, settimana, nome)
);
alter table public.gilda_contributi enable row level security;
revoke all on public.gilda_contributi from anon, authenticated;

create table if not exists public.gilda_premi (
  id bigint generated always as identity primary key,
  nome text not null references public.profili(nome) on update cascade on delete cascade,
  gilda bigint references public.gilde(id) on delete set null,
  corone int not null default 0 check (corone >= 0),
  gemme int not null default 0 check (gemme >= 0),
  motivo text not null,
  creato timestamptz not null default now(),
  ritirato timestamptz
);
create index if not exists gilda_premi_da_ritirare_idx on public.gilda_premi (nome) where ritirato is null;
alter table public.gilda_premi enable row level security;
revoke all on public.gilda_premi from anon, authenticated;

create table if not exists public.gilda_partite (
  id uuid primary key,
  nome text not null,
  creato timestamptz not null default now()
);
create index if not exists gilda_partite_nome_idx on public.gilda_partite (nome, creato);
alter table public.gilda_partite enable row level security;
revoke all on public.gilda_partite from anon, authenticated;

-- il lunedì della settimana in corso (ora di Roma)
create or replace function public.gilda_settimana()
returns date
language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'Europe/Rome')::date;
$$;

-- livello della gilda dai suoi PE
create or replace function public.gilda_livello_da_pe(p_pe bigint)
returns int
language sql immutable set search_path = public as $$
  select 1 + (select count(*)::int from unnest(array[500, 1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000]) s where p_pe >= s);
$$;

-- prepara missioni e boss della settimana se mancano
create or replace function public.gilda_prepara(p_gilda bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare w date := gilda_settimana(); g gilde; n int; f numeric; i bigint; t text;
  tipi text[] := array['vittorie', 'elite', 'boss', 'nemici', 'assedio3', 'abitanti', 'piani', 'giocatori', 'gruppo'];
  basi int[] := array[6, 20, 8, 300, 2, 120, 150, 3, 4];
  elenco_boss text[] := array['drago', 'signoreguerra', 'lich', 'verme', 'tiranno', 'colosso'];
  scelti text[] := '{}';
begin
  if exists (select 1 from gilda_boss where gilda = p_gilda and settimana = w) then return; end if;
  select * into g from gilde where id = p_gilda;
  if g.id is null then return; end if;
  select count(*) into n from gilda_membri where gilda = p_gilda;
  f := greatest(1, n / 5.0);
  i := abs(hashtext(p_gilda::text || '#' || w::text)::bigint);
  while coalesce(array_length(scelti, 1), 0) < 3 loop
    t := tipi[1 + (i % array_length(tipi, 1))::int];
    if not t = any(scelti) then scelti := scelti || t; end if;
    i := i / 7 + 13;
  end loop;
  foreach t in array scelti loop
    insert into gilda_missioni (gilda, settimana, tipo, obiettivo)
    values (p_gilda, w, t, case when t = 'giocatori' then greatest(2, ceil(n * 0.6)::int)
      else greatest(1, round(basi[array_position(tipi, t)] * (1 + 0.15 * (g.livello - 1)) * f)::int) end)
    on conflict do nothing;
  end loop;
  insert into gilda_boss (gilda, settimana, boss, vita)
  values (p_gilda, w, elenco_boss[1 + ((extract(week from w)::bigint + p_gilda) % 6)::int], round(1500 * f * (1 + 0.3 * (g.livello - 1)))::int)
  on conflict do nothing;
end $$;

-- premio a un giocatore
create or replace function public.gilda_premio(p_nome text, p_gilda bigint, p_corone int, p_gemme int, p_motivo text)
returns void
language sql security definer set search_path = public as $$
  insert into gilda_premi (nome, gilda, corone, gemme, motivo) values (p_nome, p_gilda, greatest(0, p_corone), greatest(0, p_gemme), p_motivo);
$$;

-- fine di una partita di un membro: PE, missioni, boss, premi
create or replace function public.gilda_partita(p_nome text, p_token uuid, p_id uuid, p_dati jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; w date := gilda_settimana(); d jsonb := coalesce(p_dati, '{}'::jsonb);
  vinta boolean; piano int; ass int; nem int; eli int; bos int; abi int; gru boolean; v_pe int; prima boolean; inc int; punti int;
  mi gilda_missioni; b gilda_boss; c record; tutte boolean; fatte text[] := '{}';
begin
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null then return jsonb_build_object('esito', 'non_in_gilda'); end if;
  if p_id is null then return jsonb_build_object('esito', 'dati_non_validi'); end if;
  if (select count(*) from gilda_partite where gilda_partite.nome = me and creato > now() - interval '1 day') >= 40 then
    return jsonb_build_object('esito', 'limite');
  end if;
  insert into gilda_partite (id, nome) values (p_id, me) on conflict do nothing;
  if not found then return jsonb_build_object('esito', 'gia_contata'); end if;
  delete from gilda_partite where creato < now() - interval '14 days';
  begin
    vinta := coalesce((d->>'vinta')::boolean, false);
    piano := least(16, greatest(0, coalesce((d->>'piano')::int, 0)));
    ass := least(5, greatest(0, coalesce((d->>'assedio')::int, 0)));
    nem := least(300, greatest(0, coalesce((d->>'nemici')::int, 0)));
    eli := least(15, greatest(0, coalesce((d->>'elite')::int, 0)));
    bos := least(6, greatest(0, coalesce((d->>'boss')::int, 0)));
    abi := least(40, greatest(0, coalesce((d->>'abitanti')::int, 0)));
    gru := coalesce((d->>'gruppo')::boolean, false);
  exception when others then
    return jsonb_build_object('esito', 'dati_non_validi');
  end;
  perform gilda_prepara(m.gilda);
  v_pe := 10 + case when vinta then 20 else 0 end + 5 * ass;
  update gilda_membri set pe = gilda_membri.pe + v_pe where gilda_membri.nome = me;
  update gilde set pe = gilde.pe + v_pe where id = m.gilda;
  insert into gilda_contributi (gilda, settimana, nome) values (m.gilda, w, me) on conflict do nothing;
  select (partite = 0) into prima from gilda_contributi where gilda = m.gilda and settimana = w and gilda_contributi.nome = me;
  for mi in select * from gilda_missioni where gilda = m.gilda and settimana = w and fatta is null for update loop
    inc := case mi.tipo when 'vittorie' then (vinta)::int when 'elite' then eli when 'boss' then bos when 'nemici' then nem
      when 'assedio3' then (vinta and ass >= 3)::int when 'abitanti' then abi when 'piani' then piano
      when 'giocatori' then (prima)::int when 'gruppo' then (gru)::int else 0 end;
    if inc > 0 then
      update gilda_contributi set missioni = jsonb_set(missioni, array[mi.tipo], to_jsonb(coalesce((missioni->>mi.tipo)::int, 0) + inc))
        where gilda = m.gilda and settimana = w and gilda_contributi.nome = me;
      update gilda_missioni set progresso = least(obiettivo, progresso + inc),
        fatta = case when progresso + inc >= obiettivo then now() end
        where gilda = m.gilda and settimana = w and tipo = mi.tipo;
      if mi.progresso + inc >= mi.obiettivo then
        fatte := fatte || mi.tipo;
        update gilde set pe = gilde.pe + 200 where id = m.gilda;
        for c in select x.nome from gilda_contributi x where x.gilda = m.gilda and x.settimana = w and coalesce((x.missioni->>mi.tipo)::int, 0) > 0 loop
          perform gilda_premio(c.nome, m.gilda, 15, 0, 'missione:' || mi.tipo);
        end loop;
      end if;
    end if;
  end loop;
  if array_length(fatte, 1) > 0 and not exists (select 1 from gilda_missioni where gilda = m.gilda and settimana = w and fatta is null) then
    for c in select x.nome from gilda_contributi x where x.gilda = m.gilda and x.settimana = w and x.missioni <> '{}'::jsonb loop
      perform gilda_premio(c.nome, m.gilda, 0, 1, 'tre_missioni');
    end loop;
  end if;
  select * into b from gilda_boss where gilda = m.gilda and settimana = w for update;
  punti := 0;
  if b.gilda is not null and b.sconfitto is null then
    punti := round((case when vinta then 100 else least(90, 10 * piano) end) * (1 + 0.2 * ass));
    if punti > 0 then
      update gilda_contributi set boss = boss + punti where gilda = m.gilda and settimana = w and gilda_contributi.nome = me;
      update gilda_boss set danni = least(vita, danni + punti), sconfitto = case when danni + punti >= vita then now() end
        where gilda = m.gilda and settimana = w;
      if b.danni + punti >= b.vita then
        update gilde set pe = gilde.pe + 500 where id = m.gilda;
        for c in select x.nome from gilda_contributi x where x.gilda = m.gilda and x.settimana = w and x.boss > 0 loop
          perform gilda_premio(c.nome, m.gilda, 40, 2, 'boss:' || b.boss);
        end loop;
      end if;
    end if;
  end if;
  update gilda_contributi set partite = partite + 1 where gilda = m.gilda and settimana = w and gilda_contributi.nome = me;
  update gilde set livello = gilda_livello_da_pe(gilde.pe), aggiornata = now() where id = m.gilda;
  return jsonb_build_object('esito', 'contata', 'pe', v_pe, 'punti_boss', punti, 'missioni_completate', to_jsonb(fatte),
    'gilda', (select jsonb_build_object('livello', livello, 'pe', gilde.pe) from gilde where id = m.gilda));
end $$;

-- incassa i premi da ritirare (p_id null = tutti): risponde con le Corone e le Gemme da aggiungere nel gioco
create or replace function public.gilda_ritira(p_nome text, p_token uuid, p_id bigint default null)
returns table (corone int, gemme int, premi int)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me text := amici_chi(p_nome, p_token);
begin
  return query
    with r as (
      update gilda_premi set ritirato = now()
      where gilda_premi.nome = me and ritirato is null and (p_id is null or gilda_premi.id = p_id)
      returning gilda_premi.corone, gilda_premi.gemme)
    select coalesce(sum(r.corone), 0)::int, coalesce(sum(r.gemme), 0)::int, count(*)::int from r;
end $$;

-- la mia gilda (come prima) più la settimana (missioni, boss, il mio contributo) e i premi da ritirare
create or replace function public.gilda_mia(p_nome text, p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; g gilde; capo boolean; w date := gilda_settimana(); premi jsonb;
begin
  premi := coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'corone', p.corone, 'gemme', p.gemme, 'motivo', p.motivo, 'creato', p.creato) order by p.id)
    from gilda_premi p where p.nome = me and p.ritirato is null), '[]'::jsonb);
  select * into m from gilda_membri where gilda_membri.nome = me;
  if m.nome is null then
    return jsonb_build_object('gilda', null, 'premi', premi, 'richieste_mie', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome) order by r.creata)
      from gilda_richieste r join gilde x on x.id = r.gilda where r.nome = me), '[]'::jsonb));
  end if;
  perform gilda_sistema(m.gilda);
  perform gilda_prepara(m.gilda);
  select * into m from gilda_membri where gilda_membri.nome = me;
  select * into g from gilde where gilde.id = m.gilda;
  capo := m.ruolo in ('capo', 'vice');
  return jsonb_build_object(
    'gilda', jsonb_build_object('id', g.id, 'nome', g.nome, 'descrizione', g.descrizione, 'aperta', g.aperta, 'posti', g.posti,
      'livello', g.livello, 'pe', g.pe, 'creata', g.creata, 'codice', case when capo then g.codice end),
    'io', jsonb_build_object('ruolo', m.ruolo, 'pe', m.pe, 'entrato', m.entrato),
    'membri', (select jsonb_agg(jsonb_build_object('nome', x.nome, 'ruolo', x.ruolo, 'pe', x.pe, 'entrato', x.entrato)
      order by case x.ruolo when 'capo' then 0 when 'vice' then 1 else 2 end, x.pe desc, x.entrato) from gilda_membri x where x.gilda = g.id),
    'richieste', case when capo then coalesce((select jsonb_agg(jsonb_build_object('nome', r.nome, 'creata', r.creata) order by r.creata)
      from gilda_richieste r where r.gilda = g.id), '[]'::jsonb) else '[]'::jsonb end,
    'settimana', jsonb_build_object('inizio', w, 'fine', w + 6,
      'missioni', coalesce((select jsonb_agg(jsonb_build_object('tipo', x.tipo, 'obiettivo', x.obiettivo, 'progresso', x.progresso, 'fatta', x.fatta) order by x.tipo)
        from gilda_missioni x where x.gilda = g.id and x.settimana = w), '[]'::jsonb),
      'boss', (select jsonb_build_object('boss', x.boss, 'vita', x.vita, 'danni', x.danni, 'sconfitto', x.sconfitto) from gilda_boss x where x.gilda = g.id and x.settimana = w),
      'io', coalesce((select jsonb_build_object('partite', x.partite, 'boss', x.boss, 'missioni', x.missioni) from gilda_contributi x
        where x.gilda = g.id and x.settimana = w and x.nome = me), jsonb_build_object('partite', 0, 'boss', 0, 'missioni', '{}'::jsonb)),
      'migliori', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'boss', x.boss, 'partite', x.partite) order by x.boss desc, x.partite desc)
        from (select * from gilda_contributi y where y.gilda = g.id and y.settimana = w order by y.boss desc, y.partite desc limit 5) x), '[]'::jsonb)),
    'premi', premi);
end $$;

revoke all on function public.gilda_settimana() from public, anon, authenticated;
revoke all on function public.gilda_livello_da_pe(bigint) from public, anon, authenticated;
revoke all on function public.gilda_prepara(bigint) from public, anon, authenticated;
revoke all on function public.gilda_premio(text, bigint, int, int, text) from public, anon, authenticated;
do $g$
declare f text;
begin
  foreach f in array array['gilda_partita(text, uuid, uuid, jsonb)', 'gilda_ritira(text, uuid, bigint)', 'gilda_mia(text, uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;
