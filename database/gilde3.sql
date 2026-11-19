-- Assedio a Valdombra v10.11: dungeon di gilda (terza parte delle gilde). Richiede database/gilde.sql e database/gilde2.sql.
-- Il dungeon di gilda si gioca insieme (2-8 membri della stessa gilda): 8 piani più il boss della settimana, in 10 gradi
-- (il grado massimo è il livello della gilda). A fine partita il gioco chiama gilda_partita come sempre, con p_dati.dungeon = grado.
-- Se la partita è vinta in gruppo, la prima del giorno (ora di Roma) di ogni giocatore dà:
--   5 Corone × grado, 1 Gemma dal grado 4 (2 dal grado 8), i PE personali della partita contati due volte,
--   30 punti × grado in più al boss della settimana; alla gilda 100 + 50 × grado PE (un dungeon premiato al giorno per gilda).
-- Le altre partite valgono come partite normali. Il grado mandato non può superare il livello della gilda.
-- Aggiunge la tabella gilda_dungeon e rifà gilda_partita e gilda_mia (stessi dati di prima più il dungeon). Non tocca i dati esistenti.

create table if not exists public.gilda_dungeon (
  nome text not null references public.profili(nome) on update cascade on delete cascade,
  giorno date not null,
  gilda bigint references public.gilde(id) on delete set null,
  grado int not null check (grado between 1 and 10),
  creato timestamptz not null default now(),
  primary key (nome, giorno)
);
create index if not exists gilda_dungeon_gilda_idx on public.gilda_dungeon (gilda, giorno);
alter table public.gilda_dungeon enable row level security;
revoke all on public.gilda_dungeon from anon, authenticated;

-- fine di una partita di un membro: PE, missioni, boss, premi; dal v10.11 anche il dungeon di gilda (p_dati.dungeon = grado 1-10)
create or replace function public.gilda_partita(p_nome text, p_token uuid, p_id uuid, p_dati jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare me text := amici_chi(p_nome, p_token); m gilda_membri; w date := gilda_settimana(); d jsonb := coalesce(p_dati, '{}'::jsonb);
  vinta boolean; piano int; ass int; nem int; eli int; bos int; abi int; gru boolean; v_pe int; prima boolean; inc int; punti int;
  mi gilda_missioni; b gilda_boss; c record; tutte boolean; fatte text[] := '{}';
  gr int; oggi date := (now() at time zone 'Europe/Rome')::date; glv int; dun jsonb; d_cor int; d_gem int; d_peg int; d_boss int := 0;
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
    gr := least(10, greatest(0, coalesce((d->>'dungeon')::int, 0)));
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
  -- dungeon di gilda vinto in gruppo: premio pieno alla prima vittoria del giorno di ogni giocatore (ora di Roma)
  if gr > 0 and vinta and gru then
    select livello into glv from gilde where id = m.gilda;
    gr := least(gr, greatest(1, glv));
    delete from gilda_dungeon where giorno < oggi - 14;
    insert into gilda_dungeon (nome, giorno, gilda, grado) values (me, oggi, m.gilda, gr) on conflict do nothing;
    if found then
      d_cor := 5 * gr;
      d_gem := case when gr >= 8 then 2 when gr >= 4 then 1 else 0 end;
      perform gilda_premio(me, m.gilda, d_cor, d_gem, 'dungeon:' || gr);
      update gilda_membri set pe = gilda_membri.pe + v_pe where gilda_membri.nome = me;
      d_peg := 0;
      if not exists (select 1 from gilda_dungeon x where x.gilda = m.gilda and x.giorno = oggi and x.nome <> me) then
        d_peg := 100 + 50 * gr;
        update gilde set pe = gilde.pe + d_peg where id = m.gilda;
      end if;
      d_boss := 30 * gr;
      dun := jsonb_build_object('premio', true, 'grado', gr, 'corone', d_cor, 'gemme', d_gem, 'pe_gilda', d_peg, 'pe_tuoi', v_pe);
    else
      dun := jsonb_build_object('premio', false, 'grado', gr);
    end if;
  end if;
  select * into b from gilda_boss where gilda = m.gilda and settimana = w for update;
  punti := 0;
  if b.gilda is not null and b.sconfitto is null then
    punti := round((case when vinta then 100 else least(90, 10 * piano) end) * (1 + 0.2 * ass)) + d_boss;
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
  return jsonb_build_object('esito', 'contata', 'pe', v_pe, 'punti_boss', punti, 'missioni_completate', to_jsonb(fatte), 'dungeon', dun,
    'gilda', (select jsonb_build_object('livello', livello, 'pe', gilde.pe) from gilde where id = m.gilda));
end $$;

-- la mia gilda (come prima) più la settimana (missioni, boss, il mio contributo), i premi da ritirare e, dal v10.11, il dungeon di gilda di oggi
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
    'premi', premi,
    'dungeon', jsonb_build_object('oggi', (select x.grado from gilda_dungeon x where x.nome = me and x.giorno = (now() at time zone 'Europe/Rome')::date),
      'gilda_oggi', exists (select 1 from gilda_dungeon x where x.gilda = g.id and x.giorno = (now() at time zone 'Europe/Rome')::date)));
end $$;

do $g$
declare f text;
begin
  foreach f in array array['gilda_partita(text, uuid, uuid, jsonb)', 'gilda_mia(text, uuid)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $g$;
