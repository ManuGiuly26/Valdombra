// Prove automatiche di Assedio a Valdombra.
// Apre il gioco in un browser senza finestra e fa giocare dei bot: se compare un errore JavaScript la prova fallisce.
// Uso: node tests/prove.js   (serve il pacchetto "playwright" con Chromium installato)
const {chromium}=require('playwright');
const path=require('path');
const PAGE='file://'+path.resolve(__dirname,'..','index.html');
let fallite=0;
const ok=(cond,msg)=>{console.log((cond?'  ok   ':'  ERRORE ')+msg);if(!cond)fallite++};

(async()=>{
  const browser=await chromium.launch();
  const ctx=await browser.newContext({viewport:{width:1280,height:800}});
  // niente rete: il gioco deve funzionare anche senza Supabase
  await ctx.route(/^https?:\/\//,r=>r.abort());
  const page=await ctx.newPage();const errori=[];
  page.on('pageerror',e=>errori.push(e.message));
  page.on('dialog',d=>d.dismiss());
  await page.goto(PAGE);await page.waitForTimeout(500);

  console.log('1. Avvio');
  ok(await page.evaluate(()=>typeof render==='function'&&!!document.querySelector('.classes')),'la schermata iniziale mostra gli eroi');
  ok(await page.evaluate(()=>Object.keys(CLASSES).length>=10&&Object.keys(DUNGEONS).length>=3),'ci sono almeno 10 eroi e 3 dungeon');

  console.log('2. Partite complete con i bot (tutti gli eroi, tutti i dungeon)');
  const esiti=await page.evaluate(async()=>{
    SET.tut=false;SPEED=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    localStorage.setItem('valdombra-eroi',JSON.stringify(Object.keys(CLASSES)));markBeaten('rocca');markBeaten('cripte');
    const out=[];const dgs=Object.keys(DUNGEONS);
    for(const [i,cls] of Object.keys(CLASSES).entries()){
      const dg=dgs[i%dgs.length];R=null;solo=true;pickCls=cls;pickDg=dg;pickMode='norm';pickLvl=0;startSolo();ctx(ME);
      let passi=0;const skip=new Set();
      while(R.phase!=='end'&&passi<8000){passi++;ctx(ME);
        // il bot gioca male: lo teniamo in vita per arrivare in fondo, ma non nei combattimenti che durano troppo
        if(!(R.combat&&R.combat.turn>40))run.hp=Math.max(run.hp,Math.floor(run.max*.7));
        if(run.pendPot){send({t:'potLeave'});continue}
        if(R.phase==='map'){const a=availNodes();vote(a[0].y,a[0].x);await sleep(0);continue}
        if(R.phase==='combat'){if(R.combat.busy||R.combat.won){await sleep(15);continue}const h=g.hero;render();
          const k=h.hand.findIndex(c=>costOf(c)<=h.energy&&!CARDS[c.id].unplay&&!skip.has(c.uid));
          if(k>=0){const al=alive(),u=h.hand[k].uid,n=h.hand.length,en=h.energy;modal=null;send({t:'play',uid:u,j:al[0]?g.enemies.indexOf(al[0]):null,a:ME,pk:Math.floor(Math.random()*4)});
            // carte che chiedono una scelta (per esempio dagli scarti): se non è successo niente il bot le salta
            ctx(ME);if(g&&g.hero&&g.hero.hand.some(c=>c.uid===u)&&g.hero.energy===en&&g.hero.hand.length===n)skip.add(u);modal=null}
          else{skip.clear();send({t:'end'});await sleep(10)}continue}
        if(R.phase==='room'){const P=run;render();if(P.screen==='event'&&!P.event.result){const ev=EVENTS.find(e=>e.id===P.event.id);const o=ev.opts.findIndex(o=>!o.pick&&(!o.req||o.req()));send(o>=0?{t:'ev',k:o}:{t:'done'})}
          else if(P.screen==='reward'&&P.reward&&P.reward.cards)send({t:'takeCard',k:0});else if(P.screen==='rest')send(has('coronanera')?{t:'done'}:{t:'restHeal'});else if(P.screen==='secret'&&P.secret)send({t:'secret',i:0});else send({t:'done'});await sleep(0);continue}
        await sleep(5)}
      render();out.push([cls,dg,R.phase,R.floor,!!R.win,R.phase==='end'?'':' (bloccato: '+JSON.stringify({schermata:run.screen,pozione:run.pendPot||null,mano:g&&g.hero?g.hero.hand.map(c=>c.id):null,energia:g&&g.hero?g.hero.energy:null,evento:run.event&&run.event.id})+')'])}
    return out});
  for(const [cls,dg,fase,piano,win,dbg] of esiti)ok(fase==='end'&&piano>0,`${cls} nel dungeon ${dg}: arrivato al piano ${piano}${win?' e vinto':''}${dbg}`);

  console.log('3. Ogni carta, ogni nemico, ogni boss (in gruppo di due)');
  const cop=await page.evaluate(async()=>{
    SPEED=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const errs=[];let carte=0,nemici=0;
    const nuovaStanza=cls=>{solo=false;isHost=true;ME='pA';myName='Prova';chan=null;R=newLobby('COPE');R.players.pA.cls=cls;
      R.players.pB={pid:'pB',name:'Alleato',cls:'chierico',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'COPERTURA')};
    const turnoNemici=async()=>{for(const p of ['pA','pB']){ctx(p);if(g&&g.hero&&!g.hero.down&&!g.hero.ended)dispatch(p,{t:'end'})}let w=0;while(R.combat&&R.combat.busy&&w<400){await sleep(5);w++}};
    // ogni carta di ogni eroe
    for(const cls of Object.keys(CLASSES)){nuovaStanza(cls);
      for(const id of Object.keys(CARDS).filter(k=>CARDS[k].cl===cls)){
        for(const up of [false,true]){try{
          startCombat(['orco','goblin'],'combat');R.combat.enemies.forEach(e=>{e.hp=e.max=999});
          ctx('pA');const h=g.hero;h.energy=9;const c={id,up,uid:uid++};h.hand.push(c);
          for(let k=0;k<3;k++)h.disc.push({id:'colpo',up:false,uid:uid++});
          playCard(c.uid,0,'pA',0,up?1:0);ctx('pA');if(g&&g.hero&&g.hero.hand.some(x=>x.uid===c.uid))playCard(c.uid,0,'pB',1);
          await turnoNemici();carte++}catch(e){errs.push('carta '+id+(up?'+':'')+': '+e.message)}}}}
    // ogni nemico, élite e boss (le élite con ogni tratto)
    nuovaStanza('guardiano');
    for(const id of Object.keys(ENEMIES)){const E=ENEMIES[id];const tratti=E.elite?Object.keys(ETRAITS):[null];
      for(const tr of tratti){try{
        startCombat([id],E.boss?'boss':E.elite?'elite':'combat');if(tr)R.combat.enemies[0].trait=tr;
        for(let t=0;t<6&&R.phase==='combat';t++){Object.keys(R.combat.heroes).forEach(p=>{R.players[p].hp=R.players[p].max});
          ctx('pA');const h=g.hero;const a=h.hand.find(c=>CARDS[c.id].t==='A'&&costOf(c)<=h.energy);if(a)playCard(a.uid,0,'pA');
          await turnoNemici()}
        if(R.combat){R.combat.enemies.forEach(e=>{if(e.hp>0)hurtEnemy(e,99999)});checkEnd();let w=0;while(R.phase==='combat'&&w<200){await sleep(5);w++}}
        if(R.phase==='room')R.order.forEach(p=>{R.players[p].screen=null;R.players[p].done=true});R.phase='map';nemici++}catch(e){errs.push('nemico '+id+(tr?' ('+tr+')':'')+': '+e.message)}}}
    render();return {errs,carte,nemici}});
  ok(cop.carte>100,`giocate ${cop.carte} carte (normali e potenziate)`);
  ok(cop.nemici>=Object.keys({}).length+20,`affrontati ${cop.nemici} nemici, élite e boss`);
  cop.errs.slice(0,20).forEach(e=>ok(false,e));

  console.log('4. Sopravvivenza e sfida del giorno');
  ok(await page.evaluate(()=>{R=null;pickCls='guerriero';pickDg='rocca';pickMode='surv';startSolo();render();return R.mode==='surv'&&R.phase==='map'}),'la Sopravvivenza parte');
  ok(await page.evaluate(()=>{R=null;pickMode='norm';try{startDaily()}catch(e){return false}render();return !!(R&&R.daily)}),'la sfida del giorno parte');

  ok(await page.evaluate(async()=>{R=null;solo=true;ME='solo';isHost=true;pickCls='mago';pickDg='rocca';pickMode='norm';startSolo();ctx(ME);startCombat(['drago'],'boss');ctx(ME);run.hp=2;g.hero.blk=0;g.hero.hand.push({id:'ustione',up:false,uid:uid++});send({t:'end'});await new Promise(r=>setTimeout(r,200));return R.phase==='end'&&!R.win}),'se l\'eroe cade per una carta Ustione a fine turno la partita finisce (non resta bloccata)');

  console.log('5. Multigiocatore simulato (host con due giocatori)');
  const mp=await page.evaluate(async()=>{
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    solo=false;isHost=true;ME='pA';myName='Luca';chan=null;R=newLobby('TEST');R.players.pA.cls='guerriero';
    R.players.pB={pid:'pB',name:'Sara',cls:'chierico',ready:true};R.order.push('pB');online=new Set(R.order);
    startRunRoom(0,'PROVA');startCombat(['goblin','lupo'],'combat');commit();
    dispatch('pA',{t:'ping',k:'e',j:0});const ping=!!R.combat.pings.pA;
    dispatch('pA',{t:'end'});dispatch('pB',{t:'end'});await sleep(3000);render();
    return {ping,turno:R.combat?R.combat.turn:-1}});
  ok(mp.ping,'i segnali arrivano all\'host');
  ok(mp.turno>=2||mp.turno===-1,'dopo la fine turno di tutti tocca ai nemici e poi di nuovo agli eroi');

  console.log('6. Schermate');
  ok(await page.evaluate(()=>{R=null;solo=true;ME='solo';screen='title';const t=['openBottega','openSettings','openDiario'];for(const f of t){window[f]();render();closeModal()}return true}),'Bottega, Impostazioni e Diario si aprono');

  console.log('7. Luce e Ombra, Villaggio e Gemme');
  const lo=await page.evaluate(async()=>{const r={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    localStorage.clear();SET.tut=false;SET.lo=true;SET.vil=true;SET.gem=true;SPEED=0;
    const nuova=(cls='guerriero')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls=cls;pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    const carta=id=>{const c={id,up:false,uid:uid++};g.hero.hand.push(c);g.hero.energy=9;return c};
    nuova();r.attiva=R.lo===true;
    startCombat(['goblin'],'combat');ctx(ME);g.hero.st.str=0;let e=g.enemies[0];e.hp=e.max=999;// v9.1: l'Elmo del Guerriero dà 1 Forza: qui si azzera per confrontare i danni
    let c=carta('colpo');r.lato=canShadow(c)&&!canShadow({id:'furia',up:false});
    playCard(c.uid,0,ME,null,1);ctx(ME);r.ombraDanno=999-e.hp;r.ombra1=run.om;
    e.hp=999;c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);r.luceDanno=999-e.hp;
    const b0=g.hero.blk;c=carta('parata');playCard(c.uid,null,ME,null,1);ctx(ME);r.armOmbra=g.hero.blk-b0;
    // creatura d'ombra
    startCombat(['scheletro'],'combat');ctx(ME);g.hero.st.str=0;e=g.enemies[0];e.hp=e.max=999;r.buio=isDark(e);
    c=carta('colpo');playCard(c.uid,0,ME,null,1);ctx(ME);r.buioOmbra=999-e.hp;e.hp=999;
    c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);r.buioLuce=999-e.hp;
    // con 5 Ombra i nemici colpiscono più forte
    startCombat(['goblin'],'combat');ctx(ME);g.hero.st.str=0;e=g.enemies[0];e.intent={d:6,tg:ME};run.om=0;const d0=calcDmg(enemyBase(e,e.intent),e,g.hero);run.om=5;r.piuDanni=calcDmg(enemyBase(e,e.intent),e,g.hero)-d0;
    // caduta nell'ombra
    run.om=9;const mx=run.max;e.hp=e.max=999;c=carta('colpo');playCard(c.uid,0,ME,null,1);ctx(ME);r.caduta=run.om===10&&!!run.caduto&&run.max===mx-4&&!!g.hero.st.oscuro;
    e.hp=999;c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);r.doppio=999-e.hp;
    // turno puro
    run.om=3;g.hero.ended=false;g.hero.shTurn=0;c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);endHeroTurn();r.puro=run.om===3&&!g.hero.st.oscuro;// v10.1: un turno di sola Luce non fa più calare l'Ombra
    // falò
    run.om=6;run.screen='rest';ACT.restHeal({},run);const dopoRiposo=run.om;run.screen='rest';ACT.restOm({},run);r.falo=dopoRiposo===6&&run.om===3;// v10.1: riposare non toglie Ombra, «Medita» sì
    // spento
    SET.lo=false;nuova();r.spento=R.lo===false&&!canShadow({id:'colpo',up:false});SET.lo=true;
    // assorbire in gruppo
    solo=false;isHost=true;ME='pA';myName='Luca';chan=null;R=newLobby('OMBR');R.players.pA.cls='guerriero';R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);
    startRunRoom(0,'OMBRA');startCombat(['goblin'],'combat');R.players.pB.om=8;ctx('pA');const en=g.hero.energy;dispatch('pA',{t:'absorb',p:'pB'});
    r.assorbi=R.players.pB.om===5&&R.players.pA.om===3&&R.combat.heroes.pA.energy===en-1;
    R.players.pA.om=6;R.players.pB.om=6;startCombat(['scheletro'],'combat');r.forzaBuio=(R.combat.enemies[0].st.str|0)===2;
    // villaggio: richieste e costruzione
    solo=true;ME='solo';R=null;localStorage.setItem('valdombra-corone','5000');
    buildVil('locanda');r.bloccato=!getVil().locanda;
    localStorage.setItem('valdombra-statistiche',JSON.stringify({runs:5,floors:60,elites:9,kills:300,wins:2,bosses:['drago','lich','tiranno']}));
    const cr0=getCrowns();buildVil('locanda');r.costruito=getVil().locanda===1&&getCrowns()<cr0;
    VIL.forEach(b=>{for(let i=0;i<4;i++)buildVil(b.id)});r.tutto=vilDone()===vilTot();
    // gemme e cimeli
    setGems(100);buyCim('lanterna');buyCim('ancora');r.cimeli=cimSel().join(',');const gm=getGems();
    const cr1=getCrowns();gemExchange();r.cambio=getCrowns()===cr1+40&&getGems()===gm-5;
    buySkin('guerriero','cremisi');r.aspetto=getGems()===gm-5-12;
    nuova('guerriero');const P=R.players.solo;
    r.bonus={max:P.max,oro:P.gold,pot:P.potions.length,su:P.deck.filter(x=>x.up).length,rel:P.relics.join(',')};
    startCombat(['goblin'],'combat');ctx(ME);r.tempio=g.hero.blk;
    SET.vil=false;SET.gem=false;nuova('guerriero');r.senza={max:R.players.solo.max,rel:R.players.solo.relics.join(',')};SET.vil=true;SET.gem=true;
    R=null;startDaily();r.giorno=JSON.stringify(R.players.solo.vb||{})==='{}';
    // gemme di fine partita
    nuova('guerriero');R.players.solo.stx.elites=2;R.players.solo.stx.bk=1;R.win=true;R.phase='end';const g0=getGems();r.premio=gemsAward();r.premioOk=getGems()===g0+2;r.costanti=ACH_GEM===1&&GEM_DAILY===1;
    // schermate
    R=null;screen='title';render();openVillaggio();render();r.vilModal=!!document.querySelector('.vilsvg,.pxvil');closeModal();
    openBottega();render();r.bottega=document.body.innerHTML.includes('Cimeli permanenti');closeModal();
    openGuida('ombra');render();openGuida('vil');render();closeModal();openSettings();render();r.sviluppo=document.body.innerHTML.includes('Luce e Ombra');closeModal();
    nuova('mago');startCombat(['scheletro','goblin'],'combat');ctx(ME);UI.om=true;render();r.ui=!!document.querySelector('#ombtn')&&!!document.querySelector('.card.shadow')&&!!document.querySelector('.ombar')&&!!document.querySelector('.etrait.dark');UI.om=false;
    return r});
  const mondo=await page.evaluate(async()=>{const r={};SET.lo=true;SET.tut=false;
    const nuova=(cls='guerriero')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls=cls;pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    nuova();R.phase='room';run.screen='shop';run.done=false;genShop();run.gold=1000;const it=run.shop.cards[0];
    run.om=0;r.sconto=omPrice(it.price)===Math.round(it.price*.9);run.om=6;r.rincaro=omPrice(it.price)===Math.round(it.price*1.15);
    const g0=run.gold;dispatch(ME,{t:'buy',kind:'cards',k:0});ctx(ME);r.pagato=g0-run.gold===Math.round(it.price*1.15);
    render();r.vediOmbra=document.body.innerHTML.includes("Mercante d'Ombra")&&document.body.innerHTML.includes('Incenso purificatore');
    const nr=run.relics.length;dispatch(ME,{t:'darkBuy'});ctx(ME);r.ombraPaga=run.relics.length===nr+1&&run.om===9;
    dispatch(ME,{t:'incenso'});ctx(ME);r.incenso=run.om===6&&run.shop.inc;
    // nemici comuni impauriti, caduta rimandata all'inizio del combattimento
    run.om=10;R.phase='map';startCombat(['goblin','scheletro'],'combat');ctx(ME);r.paura=(g.enemies[0].st.weak|0)===1&&!g.enemies[1].st.weak;r.cadeSubito=run.om===10&&!!run.caduto&&!!g.hero.st.oscuro;
    // bottino
    run.om=6;g.enemies.forEach(e=>hurtEnemy(e,9999));checkEnd();await new Promise(r=>setTimeout(r,700));r.bottino=R.phase==='room'&&run.reward&&run.reward.gold>=12;
    // eventi
    for(const id of ['pellegrino','specchio']){const ev=EVENTS.find(e=>e.id===id);ev.opts.forEach((o,k)=>{nuova();run.om=k%2?6:1;run.gold=100;R.phase='room';run.screen='event';run.event={id,result:null};if(o.req&&!o.req())return;dispatch(ME,{t:'ev',k});ctx(ME);r['ev_'+id+k]=!!run.event.result})}
    nuova('ladro');run.deck.push({id:'pugnalerit',up:false});startCombat(['ratto'],'combat');ctx(ME);{const c=g.hero.draw.concat(g.hero.hand).find(x=>x.id==='pugnalerit');if(g.hero.draw.includes(c)){g.hero.draw.splice(g.hero.draw.indexOf(c),1);g.hero.hand.push(c)}g.hero.energy=3;g.enemies[0].hp=1;playCard(c.uid,0,ME)}
    R.combat=null;startCombat(['goblin'],'combat');ctx(ME);{const c=g.hero.draw.concat(g.hero.hand).find(x=>x.id==='pugnalerit');r.pugnale=!!c&&vals(c).d===12}
    r.eventi=Object.keys(r).filter(k=>k.startsWith('ev_')).length;
    SET.lo=false;nuova();R.phase='map';r.eventiSpenti=!EVENTS.filter(e=>e.lo).some(e=>(!e.dg||e.dg.includes('rocca'))&&(!e.lo||LO()));SET.lo=true;
    // le creature d'ombra cercano chi ha più Ombra
    solo=false;isHost=true;ME='pA';myName='Luca';chan=null;R=newLobby('CACC');R.players.pA.cls='guerriero';R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);
    startRunRoom(0,'CACCIA');R.players.pB.om=6;let tutti=true;for(let i=0;i<6;i++){startCombat(['spettro','spettro'],'combat');R.combat.enemies.forEach(e=>{if(e.intent&&e.intent.d&&!e.intent.aoe&&e.intent.tg!=='pB')tutti=false})}r.caccia=tutti;
    // pulsante Gioca
    R=null;solo=true;ME='solo';screen='title';modal=null;render();r.fab=!!document.querySelector('.playfab');openGioca();render();r.menu=document.querySelectorAll('.gopt').length>=4&&!document.querySelector('.playfab');
    pickCls='mago';pickDg='rocca';giocaSolo('surv');r.surv=R&&R.mode==='surv'&&R.phase==='map';R=null;screen='title';openGioca();render();giocaSolo('norm');r.norm=R&&R.mode==='norm'&&R.players.solo.cls==='mago';
    R=null;screen='title';render();return r});
  ok(mondo.sconto&&mondo.rincaro&&mondo.pagato,'il Mercante fa lo sconto a chi è puro e alza i prezzi a chi è nell\'ombra');
  ok(mondo.vediOmbra&&mondo.ombraPaga&&mondo.incenso,'Mercante d\'Ombra (reliquia per 3 Ombra) e Incenso purificatore');
  ok(mondo.paura&&mondo.cadeSubito,'con 7 Ombra i nemici comuni hanno paura; a 10 si cade a inizio combattimento');
  ok(mondo.pugnale,'il Pugnale Rituale torna nel combattimento dopo con i danni guadagnati');
  ok(mondo.bottino,'bottino dell\'ombra');
  ok(mondo.eventi>=6&&mondo.eventiSpenti,`eventi del Pellegrino e dello Specchio (${mondo.eventi} scelte provate), spariscono senza Luce e Ombra`);
  ok(mondo.caccia,'le creature d\'ombra attaccano chi ha più Ombra');
  ok(mondo.fab&&mondo.menu&&mondo.surv&&mondo.norm,'il pulsante Gioca è sempre visibile e fa partire le modalità');
  ok(lo.attiva&&lo.lato,'Luce e Ombra è attiva e solo le carte giuste hanno il lato Ombra');
  ok(lo.ombraDanno===9&&lo.luceDanno===6&&lo.ombra1===1,`lato Ombra: 9 danni e +1 Ombra, lato Luce 6 danni (${lo.ombraDanno}/${lo.luceDanno})`);
  ok(lo.armOmbra===8,'lato Ombra: Armatura +50% ('+lo.armOmbra+')');
  ok(lo.buio&&lo.buioOmbra===6&&lo.buioLuce===7,`creature d'ombra: niente bonus Ombra, +25% con la Luce (${lo.buioOmbra}/${lo.buioLuce})`);
  ok(lo.piuDanni===2,'con 5 Ombra i nemici fanno 2 danni in più');
  ok(lo.caduta&&lo.doppio===12,'a 10 Ombra si cade nell\'ombra e ci si resta: danni doppi ('+lo.doppio+') e PV massimi persi');
  ok(lo.puro&&lo.falo,'l\'Ombra non cala da sola con un turno di sola Luce; al Falò cala solo con «Medita», non riposando');
  ok(lo.spento,'Luce e Ombra: spenta dall\'interno (solo nelle prove) le carte non hanno il lato Ombra');
  ok(lo.assorbi,'in gruppo si assorbe l\'Ombra di un compagno');
  ok(lo.forzaBuio,'le creature d\'ombra si rafforzano con l\'Ombra del gruppo');
  ok(lo.bloccato&&lo.costruito&&lo.tutto,'villaggio: prima la richiesta, poi le Corone; si ricostruisce tutto');
  ok(lo.cimeli==='lanterna,ancora'&&lo.cambio&&lo.aspetto,'gemme: cimeli, cambio in Corone e aspetti ('+lo.cimeli+')');
  ok(lo.bonus.max===98&&lo.bonus.oro===99+75&&lo.bonus.pot===3&&lo.bonus.su===3&&/lanterna/.test(lo.bonus.rel)&&/ancora/.test(lo.bonus.rel)&&lo.tempio>=7,'i bonus del villaggio e i cimeli valgono in partita '+JSON.stringify(lo.bonus)+' armatura '+lo.tempio);
  ok(lo.senza.max===86&&!/lanterna/.test(lo.senza.rel),'senza Villaggio e Gemme (ora sempre accesi) i bonus non si applicano');
  ok(lo.giorno,'nella sfida del giorno il villaggio non vale');
  ok(lo.premio===2&&lo.premioOk&&lo.costanti,'gemme di fine partita (più rare dalla v10.2): niente per le élite, 1 per il boss, 1 per la vittoria; 1 per impresa e per la sfida del giorno');
  ok(lo.vilModal&&lo.bottega&&lo.sviluppo&&lo.ui,'villaggio, bottega, guida, impostazioni e combattimento in Ombra si vedono');

  console.log('7b. Ombra per tutti gli eroi, strade segrete e codice Gemme');
  const nov=await page.evaluate(async()=>{const r={};SET.lo=true;SET.tut=false;SPEED=0;
    const nuova=(cls='guerriero')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls=cls;pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    const carta=(id,up=false)=>{const c={id,up,uid:uid++};g.hero.hand.push(c);g.hero.energy=9;return c};
    // dalla v10.12 accesa di base (prima era in Sviluppo, spenta): anche il Necromante evoca dal lato Ombra; spenta dall'interno solo le carte con danni, Armatura o Veleno
    SET.lox=false;nuova('necromante');const spenta=!R.lox&&!canShadow({id:'evocascheletro',up:false})&&canShadow({id:'colpo',up:false});
    SET.lox=SET_DEF.lox;nuova('necromante');r.spentaBase=spenta&&SET_DEF.lox===true&&R.lox===true&&canShadow({id:'evocascheletro',up:false});
    // accesa: ogni carta giocabile (non i Poteri) ha un lato Ombra
    SET.lox=true;nuova('necromante');r.accesa=R.lox===true;
    const giocabili=Object.keys(CARDS).filter(k=>{const d=CARDS[k];return !d.unplay&&d.t!=='P'&&d.t!=='X'&&!d.nosh});
    r.senzaLato=giocabili.filter(k=>!canShadow({id:k,up:false})||!canShadow({id:k,up:true}));r.potere=!canShadow({id:'furia',up:false})&&!canShadow({id:'pergamene',up:true});
    startCombat(['goblin'],'combat');ctx(ME);let e=g.enemies[0];e.hp=e.max=999;run.om=0;
    run.max=60;run.hp=10;let c=carta('curaferite');playCard(c.uid,null,ME,null,1);ctx(ME);r.cura=run.hp-10;r.om=run.om;
    g.hero.min=[];c=carta('evocascheletro');playCard(c.uid,null,ME,null,1);ctx(ME);r.scheletri=(g.hero.min||[]).length;
    c=carta('marchiomorte');playCard(c.uid,0,ME,null,1);ctx(ME);r.condanna=e.st.doom|0;
    c=carta('marchiomorte');e.st.doom=0;playCard(c.uid,0,ME,null,0);ctx(ME);r.condannaLuce=e.st.doom|0;
    // senza numeri: pesca 1 carta in più
    c=carta('sigillo');let n0=g.hero.hand.length;playCard(c.uid,0,ME,null,1);ctx(ME);r.pescaOmbra=g.hero.hand.length-n0;
    c=carta('sigillo');n0=g.hero.hand.length;playCard(c.uid,0,ME,null,0);ctx(ME);r.pescaLuce=g.hero.hand.length-n0;
    // le carte di base non cambiano
    e.hp=999;e.st={};c=carta('colpo');playCard(c.uid,0,ME,null,1);ctx(ME);r.colpo=999-e.hp;
    // il testo della carta mostra i numeri del lato Ombra
    const tc=cardHTML({id:'curaferite',uid:1,up:false},{sh:true}),ts=cardHTML({id:'sigillo',uid:2,up:false},{sh:true});
    r.testo=/6 PV/.test(tc)&&/Lato Ombra: \+1 Ombra/.test(tc)&&/peschi 1 carta in più/.test(ts)&&/2 volte/.test(cardHTML({id:'azzanna',uid:3,up:false},{sh:true}));
    // ogni carta, normale e potenziata, si gioca dal lato Ombra senza errori
    const errs=[];R.phase='map';startCombat(['orco','goblin'],'combat');
    for(const k of giocabili)for(const up of [false,true]){try{ctx(ME);if(!R.combat||R.combat.won||g.hero.down||R.phase!=='combat'){R.phase='map';startCombat(['orco','goblin'],'combat');ctx(ME)}
      g.enemies.forEach(x=>{x.hp=x.max=999});run.hp=run.max;run.om=0;g.hero.hand=g.hero.hand.slice(-4);const cc={id:k,up,uid:uid++};g.hero.hand.push(cc);g.hero.energy=9;playCard(cc.uid,0,ME,0,1)}catch(x){errs.push(k+(up?'+':'')+': '+x.message)}}
    r.errori=errs;SET.lox=true;
    // strade segrete: circa una partita su quattro, al massimo una per mappa
    nuova('guerriero');let con=0;const seed0=R.seed;
    for(let i=0;i<600;i++){R.seed='prova'+i;R.segN=0;let f=false;for(let y=1;y<ROWS-1&&!f;y++){const x=R.map[y].findIndex(n=>n&&SEG_T.includes(n.type));if(x>=0&&segRoll(y,x,R.map[y][x].type))f=true}if(f)con++}
    R.seed=seed0;R.segN=0;r.quota=con/600;
    r.maiElite=!segRoll(3,0,'elite')&&!segRoll(3,0,'shop')&&!segRoll(3,0,'rest')&&!segRoll(0,0,'combat')&&!segRoll(ROWS-1,0,'combat');
    R.segForce=true;r.maiElite=r.maiElite&&!segRoll(3,0,'elite')&&!segRoll(0,0,'combat');
    const x1=R.map[1].findIndex(n=>n);R.map[1][x1].type='combat';R.phase='map';enterNode(1,x1);ctx(ME);
    r.stanza=R.phase==='room'&&run.screen==='secret'&&run.secret.opts.length===3&&run.secret.opts.filter(o=>o.k==='relic'&&RELICS[o.id].sec).length===2;
    render();r.vista=document.body.innerHTML.includes('Strada segreta')&&document.querySelectorAll('.segitem').length===3&&!!document.querySelector('.segtag');
    const scelta=run.secret.opts[0].id;dispatch(ME,{t:'secret',i:0});ctx(ME);r.presa=run.relics.includes(scelta)&&R.phase==='combat'&&!R.segNext&&R.segN===1;
    r.unaSola=!segRoll(2,0,'combat');R.segForce=false;
    nuova('guerriero');R.segForce=true;const x2=R.map[2].findIndex(n=>n);R.map[2][x2].type='treasure';R.phase='map';enterNode(2,x2);ctx(ME);run.gold=0;const dk=run.deck.filter(d=>d.up).length;
    dispatch(ME,{t:'secret',i:2});ctx(ME);r.scrigno=run.gold===90&&run.deck.filter(d=>d.up).length===dk+2&&R.phase==='room'&&run.screen==='treasure';
    R=null;startDaily();R.segForce=true;r.maiGiorno=!segRoll(2,0,'combat');
    r.fuoriPool=!SECRET_RELICS.some(k=>ALL_RELICS.includes(k)||Object.values(DUNGEONS).some(d=>(d.relics||[]).includes(k)));
    // effetti delle reliquie segrete
    const prova=rel=>{nuova('guerriero');run.relics=rel?[rel]:[];R.phase='map';startCombat(['orco'],'combat');ctx(ME);const h=g.hero,en=g.enemies[0];
      const o={mano:h.hand.length,en:h.energy,str:h.st.str|0,dex:h.st.dex|0,deb:en.st.weak|0,vul:en.st.vuln|0};heroTurnStart(h,2);o.en2=h.energy;return o};
    const b=prova(null),oc=prova('occhiocust'),co=prova('coronaspine'),st=prova('stendardo'),cl=prova('clessidra');
    r.reliquie={occhio:oc.mano-b.mano===2&&oc.en-b.en===1,corona:co.str-b.str===2&&co.dex-b.dex===2,stendardo:st.deb-b.deb===2&&st.vul-b.vul===2,clessidra:cl.en2-b.en2===1};
    nuova('guerriero');const mx=run.max,go=run.gold;gainRelic('calicestelle');gainRelic('borsafondo');r.reliquie.calice=run.max===mx+10;r.reliquie.borsa=run.gold===go+100;
    // codice Gemme: si controlla con due hash finti, il codice vero non è nelle prove
    r.hashGemme=Array.isArray(REDEEM_G)&&REDEEM_G.length===2&&REDEEM_G.every(n=>Number.isInteger(n)&&n>0);
    const sv=REDEEM_G.slice();REDEEM_G[0]=hashStr('vg1#PROVA-GEMME');REDEEM_G[1]=hashStr('vg2#PROVA-GEMME');
    R=null;screen='title';setGems(0);openSettings();render();$('#rcode').value=' prova-gemme ';redeem();r.gemme=getGems()===200;
    openSettings();render();$('#rcode').value='SBAGLIATO';redeem();r.sbagliato=getGems()===200;REDEEM_G[0]=sv[0];REDEEM_G[1]=sv[1];
    // dalla v10.12 non c'è più Sviluppo: nessun interruttore per Luce e Ombra, Ombra per tutti, Villaggio, Gemme, Grafica Pixellab
    openSettings();render();const sw=[...document.querySelectorAll('button.sw')].map(x=>x.getAttribute('aria-label'));
    r.sviluppo=!['Luce e Ombra','Ombra per tutti gli eroi','Villaggio di Valdombra','Gemme','Grafica Pixellab','Strade segrete'].some(k=>sw.includes(k));
    r.sempre=SET_DEF.vil&&SET_DEF.gem&&SET_DEF.px&&SET.vil&&SET.gem;closeModal();modal=null;R=null;screen='title';render();return r});
  ok(nov.spentaBase&&nov.accesa&&!nov.senzaLato.length&&nov.potere,'Ombra per tutti gli eroi: accesa di base (v10.12); accesa, ogni carta giocabile ha un lato Ombra (non i Poteri)'+(nov.senzaLato.length?' senza: '+nov.senzaLato:''));
  ok(nov.cura===8&&nov.om===1&&nov.scheletri===2&&nov.condanna===12&&nov.condannaLuce===8,`lato Ombra esteso: cura 6 (+25% nella Luce = 8), 2 Scheletri, 12 Condanna (Luce 8), +1 Ombra (${nov.cura}/${nov.scheletri}/${nov.condanna})`);
  ok(nov.pescaOmbra===0&&nov.pescaLuce===-1&&nov.colpo===9&&nov.testo,`carte senza numeri: 1 carta in più; le carte di base restano uguali (${nov.colpo} danni); il testo mostra i numeri del lato Ombra`);
  ok(!nov.errori.length,'ogni carta si gioca dal lato Ombra esteso senza errori'+(nov.errori.length?': '+nov.errori.slice(0,5).join(' | '):''));
  ok(nov.quota>.12&&nov.quota<.42&&nov.maiElite&&nov.maiGiorno&&nov.unaSola,`strade segrete: rare (in ${Math.round(nov.quota*100)}% delle mappe), mai su élite, mercante, falò, primo piano o prima del boss, mai nella sfida del giorno, una per mappa`);
  ok(nov.stanza&&nov.vista&&nov.presa&&nov.scrigno,'strada segreta: due reliquie segrete e uno scrigno, se ne sceglie uno, poi si entra nella casella');
  ok(nov.fuoriPool&&Object.values(nov.reliquie).every(Boolean),'reliquie segrete: non si trovano altrove e funzionano '+JSON.stringify(nov.reliquie));
  ok(nov.hashGemme&&nov.gemme&&nov.sbagliato,'codice Gemme: nel sorgente solo gli hash, dà 200 Gemme, un codice sbagliato no');
  ok(nov.sviluppo&&nov.sempre,'niente interruttori per Luce e Ombra, Ombra per tutti, Villaggio, Gemme e Grafica Pixellab: sempre accesi');

  console.log('7c. Equilibrio Luce e Ombra, missioni, reliquie maledette, climi, aiuti, scena');
  const eq=await page.evaluate(async()=>{const r={};SET.lo=true;SET.lox=false;SET.tut=false;SPEED=0;
    const nuova=(cls='guerriero',dg='rocca')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls=cls;pickDg=dg;pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    const lotta=(ids=['orco'])=>{R.phase='map';R.pos=null;startCombat(ids,'combat');ctx(ME);g.enemies.forEach(e=>{e.hp=e.max=999});return g.hero};
    // poteri: nella Luce (0-2) e nell'Ombra (5+), niente in mezzo
    nuova('guerriero');run.relics=[];run.vb={};run.om=0;let h=lotta();r.luceArm=h.blk;run.om=3;h=lotta();r.mezzoArm=h.blk;r.mezzoStr=h.st.str|0;run.om=5;h=lotta();r.ombraStr=h.st.str|0;
    r.poteri=Object.keys(CLASSES).every(c=>OMPOW[c]&&OMPOW[c].L&&OMPOW[c].O);
    // cure: +25% nella Luce, metà da 7 Ombra
    run.om=0;h=lotta();run.max=200;run.hp=50;H(8);r.curaLuce=run.hp-50;run.om=4;run.hp=50;H(8);r.cura=run.hp-50;run.om=8;run.hp=50;H(8);r.curaBuio=run.hp-50;
    // Scudo di Luce: turno di sole carte Luce con 0-2 Ombra
    run.om=1;h=lotta();h.blk=0;let c={id:'colpo',up:false,uid:uid++};h.hand.push(c);h.energy=9;playCard(c.uid,0,ME,null,0);ctx(ME);const b0=h.blk;endHeroTurn();r.scudo=h.blk-b0;
    run.om=4;h=lotta();h.ended=false;h.blk=0;c={id:'colpo',up:false,uid:uid++};h.hand.push(c);h.energy=9;playCard(c.uid,0,ME,null,0);ctx(ME);endHeroTurn();r.scudoNo=h.blk;
    // senza Luce e Ombra niente di tutto questo
    SET.lo=false;nuova('guerriero');run.relics=[];run.vb={};h=lotta();r.spentoArm=h.blk;run.max=200;run.hp=50;H(8);r.spentoCura=run.hp-50;SET.lo=true;
    // reliquie maledette
    nuova('ladro');run.relics=[];run.vb={};run.om=4;h=lotta();const en0=h.energy,ma0=h.hand.length;
    run.relics=['coronanera','occhiovuoto','lamasete'];run.hp=50;h=lotta();r.maledette={energia:h.energy-en0,mano:h.hand.length-ma0,forza:h.st.str|0,cursed:R.combat.cursed===true};
    const hp1=run.hp;heroTurnStart(h,2);r.maledette.sanguina=hp1-run.hp;
    R.phase='room';run.screen='rest';run.done=false;const hpR=run.hp;dispatch(ME,{t:'restHeal'});ctx(ME);r.maledette.niente=run.hp===hpR&&!run.done;render();r.maledette.prosegui=document.body.innerHTML.includes('non ti lascia riposare');dispatch(ME,{t:'done'});ctx(ME);
    nuova('ladro');const mx=run.max;gainRelic('cuorecavo');r.maledette.cuore=run.max===mx+25;run.om=4;run.hp=10;H(8);r.maledette.meta=run.hp-10;
    r.maledette.fuori=!CURSED_RELICS.some(k=>ALL_RELICS.includes(k)||RELIC_POOL.includes(k));
    nuova('ladro');run.om=6;R.phase='room';run.screen='shop';genShop();r.maledette.mercante=!!run.shop.dark&&CURSED_RELICS.includes(run.shop.dark.id);
    // missioni
    nuova('guerriero');r.tre=run.miss.length===3&&run.miss.every(m=>MISS[m.id]);run.miss=Object.keys(MISS).map(id=>({id,ok:false}));
    h=lotta(['ratto']);g.enemies.forEach(e=>hurtEnemy(e,99999));checkEnd();await new Promise(t=>setTimeout(t,700));ctx(ME);
    const ok=id=>run.miss.find(m=>m.id===id).ok;r.lampo=ok('lampo');
    run.deck=run.deck.slice(0,10);run.gold=200;run.om=0;R.phase='map';startCombat([bossId()],'boss');ctx(ME);r.alBoss=ok('snello')&&ok('ricco')&&ok('sobrio')&&ok('riposo')&&ok('luce')&&!ok('elite');
    missDone(run,'segreto');R.phase='end';const cr0=getCrowns(),gm0=getGems();const n=missAward();r.premio=n===7&&getCrowns()===cr0+MISS_CR*7&&MISS_CR===10&&getGems()===gm0;missAward();r.unaVolta=getCrowns()===cr0+MISS_CR*7;render();r.panelFine=document.body.innerHTML.includes('Missioni: 7 su 8')&&document.body.innerHTML.includes('solo completandole tutte');
    {const t0=R.t0;R.t0=(R.t0||0)+7;run.miss.forEach(m=>m.ok=true);const g1=getGems();missAward();r.premio=r.premio&&getGems()===g1+1;R.t0=t0}
    R=null;startDaily();r.maiGiorno=!missOn()&&!climaOf(3)&&!aiutiDisp(R.players.solo).length;
    // climi
    nuova('mago');r.dueClimi=Object.keys(R.clima).length===2;
    const conClima=(cl)=>{R.clima={3:cl};R.phase='map';R.pos={y:3,x:R.map[3].findIndex(q=>q)};run.om=0;startCombat(['goblin'],'combat');ctx(ME);return R.combat};
    let cc=conClima('gelo');r.gelo=(cc.enemies[0].st.weak|0)>=1&&(g.hero.st.weak|0)>=1;
    cc=conClima('nebbia');render();r.nebbia=intentHTML(cc.enemies[0]).includes('Nebbia')&&!!document.querySelector('.climabar');
    cc=conClima('luna');r.luna=run.om===1&&cc.enemies[0].max<=Math.round(17*1.15*.8)+1;
    R.clima={};R.pos=null;lotta(['goblin']);const m0=g.hero.hand.length;R.clima={3:'vento'};cc=conClima('vento');r.vento=g.hero.hand.length===m0+1;
    R.phase='map';R.clima={4:'nebbia'};render();r.mappa=document.querySelectorAll('.clima-r').length===1&&!!document.querySelector('.mapextra');
    // aiuti del villaggio
    nuova('guerriero');run.vb={locanda:1,fucina:1,mercato:1};R.phase='map';r.aiutiLista=aiutiDisp(run).join(',');run.max=100;run.hp=40;run.om=4;
    dispatch(ME,{t:'aiuto',k:'locanda'});ctx(ME);r.aiutoCura=run.hp===65&&run.aiuto==='locanda';const go=run.gold;dispatch(ME,{t:'aiuto',k:'mercato'});ctx(ME);r.aiutoUno=run.gold===go&&!aiutiDisp(run).length;
    // più Ombra, meno aiuto dal villaggio
    nuova('guerriero');run.vb={locanda:1,tempio:1};R.phase='map';run.max=100;run.hp=40;run.om=6;dispatch(ME,{t:'aiuto',k:'locanda'});ctx(ME);r.fidMeta=run.hp===52;
    nuova('guerriero');run.vb={locanda:1,tempio:1};R.phase='map';run.max=100;run.hp=40;run.om=8;dispatch(ME,{t:'aiuto',k:'locanda'});ctx(ME);r.fidNo=run.hp===40&&!run.aiuto;dispatch(ME,{t:'aiuto',k:'tempio'});ctx(ME);r.fidTempio=run.om===4&&run.aiuto==='tempio';
    run.relics=[];run.om=8;h=lotta();const t8=h.blk;run.om=3;h=lotta();r.fidArm=h.blk-t8;
    // limite alle maledizioni in un combattimento (prima il Troll poteva riempire il mazzo di Ferite all'infinito)
    nuova('chierico');h=lotta(['troll']);for(let i=0;i<20;i++)addCurse('ferita',2);r.maledizioni=[...h.draw,...h.hand,...h.disc].filter(x=>x.id==='ferita').length;
    {const tr=g.enemies[0];tr.hp=1;for(let i=0;i<20;i++){tr.intent={heal:14};doIntent(tr)}r.cureNemico=tr.hp-1;r.trollMax=tr.max}
    // purificazione pagata in Gemme
    nuova('guerriero');R.phase='room';run.screen='shop';genShop();run.om=5;setGems(1);render();const bi=[...document.querySelectorAll('.relicbox')].find(x=>x.textContent.includes('Incenso'));bi.click();ctx(ME);r.gemNo=run.om===5&&getGems()===1;
    setGems(5);render();[...document.querySelectorAll('.relicbox')].find(x=>x.textContent.includes('Incenso')).click();ctx(ME);r.gemSi=run.om===2&&getGems()===3;
    nuova('guerriero');run.om=6;R.phase='room';run.screen='event';run.event={id:'pellegrino',result:null};setGems(2);render();r.pelBlocco=!!document.querySelector('.opt[disabled]');chooseEv(0);ctx(ME);r.pelNo=run.om===6&&getGems()===2;
    setGems(10);render();chooseEv(0);ctx(ME);r.pelSi=run.om===0&&getGems()===6;
    // illustrazioni Ombra delle carte
    r.artOmbra=artStrip('colpo',true).includes('pixel/carte-ombra/colpo.png')&&artStrip('colpo',false).includes('pixel/carte/colpo.png')&&!artStrip('colpo').includes('carte-ombra');
    {const im=document.createElement('img');const sp=document.createElement('span');sp.className='artstrip';sp.appendChild(im);document.body.appendChild(sp);pxShOk(im,'colpo',0);r.ricaduta=/pixel\/carte\/colpo\.png/.test(im.src);sp.remove();delete PXCO.colpo}
    // combattimento a scena (dalla v10.12 in Impostazioni, Grafica)
    R=null;screen='title';openSettings();render();r.interruttore=!!document.querySelector('button.sw[aria-label="Combattimento a scena"]')&&SET_DEF.scena===false;closeModal();
    SET.scena=true;applySet();r.scena=document.body.classList.contains('scena');SET.scena=false;applySet();r.scenaVia=!document.body.classList.contains('scena');
    modal=null;R=null;screen='title';render();return r});
  ok(eq.luceArm===eq.mezzoArm+5&&eq.mezzoStr===0&&eq.ombraStr===2&&eq.poteri,`poteri: Guerriero +5 Armatura nella Luce, +2 Forza nell'Ombra, niente tra 3 e 4 Ombra; ogni eroe ne ha due (${eq.luceArm}/${eq.mezzoArm}/${eq.ombraStr})`);
  ok(eq.curaLuce===10&&eq.cura===8&&eq.curaBuio===4&&eq.scudo===3&&eq.scudoNo===0,`Luce: cure +25% (${eq.curaLuce}) e Scudo di Luce +3 (${eq.scudo}); da 7 Ombra le cure sono a metà (${eq.curaBuio})`);
  ok(eq.spentoArm===0&&eq.spentoCura===8,'senza Luce e Ombra niente poteri né cure cambiate');
  ok(eq.maledette.energia===1&&eq.maledette.mano===1&&eq.maledette.forza===3&&eq.maledette.cursed&&eq.maledette.sanguina===2&&eq.maledette.niente&&eq.maledette.prosegui&&eq.maledette.cuore&&eq.maledette.meta===4&&eq.maledette.fuori&&eq.maledette.mercante,'reliquie maledette: forti e con il loro difetto; le vende il Mercante d\'Ombra '+JSON.stringify(eq.maledette));
  ok(eq.tre&&eq.lampo&&eq.alBoss&&eq.premio&&eq.unaVolta&&eq.panelFine&&eq.maiGiorno,'missioni: tre a partita, si completano, Corone per ognuna e 1 Gemma solo completandole tutte, una volta sola, niente nella sfida del giorno '+JSON.stringify({t:eq.tre,l:eq.lampo,b:eq.alBoss,p:eq.premio,u:eq.unaVolta,f:eq.panelFine,g:eq.maiGiorno}));
  ok(eq.dueClimi&&eq.gelo&&eq.nebbia&&eq.luna&&eq.vento&&eq.mappa,'climi: due piani per mappa; Gelo, Nebbia, Luna nera e Vento funzionano e si vedono sulla mappa '+JSON.stringify({d:eq.dueClimi,g:eq.gelo,n:eq.nebbia,l:eq.luna,v:eq.vento,m:eq.mappa}));
  ok(eq.aiutiLista==='locanda,mercato,fucina'&&eq.aiutoCura&&eq.aiutoUno,'aiuti del villaggio: uno per partita, dagli edifici ricostruiti ('+eq.aiutiLista+')');
  ok(eq.fidMeta&&eq.fidNo&&eq.fidTempio&&eq.fidArm===4,'più Ombra, meno aiuto: da 5 a metà, da 7 solo la sacerdotessa; l\'Armatura del Tempio sparisce nell\'Ombra '+JSON.stringify({m:eq.fidMeta,n:eq.fidNo,t:eq.fidTempio,a:eq.fidArm}));
  ok(eq.cureNemico<=Math.floor(eq.trollMax*.5),'un nemico si cura al massimo di metà dei suoi PV per combattimento ('+eq.cureNemico+'/'+eq.trollMax+')');
  ok(eq.maledizioni===10,'al massimo 10 maledizioni per combattimento: niente più combattimenti senza fine ('+eq.maledizioni+')');
  ok(eq.gemNo&&eq.gemSi&&eq.pelBlocco&&eq.pelNo&&eq.pelSi,'purificazione pagata in Gemme: Incenso 2, Pellegrino 4; senza Gemme non si può '+JSON.stringify({a:eq.gemNo,b:eq.gemSi,c:eq.pelBlocco,d:eq.pelNo,e:eq.pelSi}));
  ok(eq.artOmbra&&eq.ricaduta,'carte dal lato Ombra con la loro illustrazione; se manca resta quella normale');
  ok(eq.interruttore&&eq.scena&&eq.scenaVia,'Combattimento a scena: interruttore nelle Impostazioni, spento di base');

  console.log('7d. Aprite il cancello, enciclopedia Ombra, barre, mappa e Gemme');
  const ac=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;SET.lo=true;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    // una partita intera con il bot
    R=null;solo=true;pickCls='guerriero';pickDg='cripte';pickMode='porta';pickLvl=0;startSolo();ctx(ME);const falo=new Set();
    r.inizio=R.mode==='porta'&&R.dg==='rocca'&&R.phase==='combat'&&R.porta.ondata===1&&R.porta.fuori===35&&!run.miss.length;render();r.banner=!!document.querySelector('.portabar')&&document.querySelector('.hud').textContent.includes('Ondata');
    {const c=R.combat;const g0=R.porta.gruppo,s0=R.porta.salvati;c.ferito=1;portaCattura();r.cattura=R.porta.gruppo===g0-1;c.ferito=0;portaCattura();r.senzaFerite=R.porta.gruppo===g0-1;R.porta.gruppo=g0;R.porta.persi=0;R.porta.salvati=s0}
      let passi=0;const skip=new Set();
      while(R.phase!=='end'&&passi<8000){passi++;ctx(ME);
        // il bot gioca male: lo teniamo in vita per arrivare in fondo, ma non nei combattimenti che durano troppo
        if(!(R.combat&&R.combat.turn>40))run.hp=Math.max(run.hp,Math.floor(run.max*.7));
        if(run.pendPot){send({t:'potLeave'});continue}
        if(R.phase==='map'){const a=availNodes();vote(a[0].y,a[0].x);await sleep(0);continue}
        if(R.phase==='combat'){if(R.combat.busy||R.combat.won){await sleep(15);continue}const h=g.hero;render();
          const k=h.hand.findIndex(c=>costOf(c)<=h.energy&&!CARDS[c.id].unplay&&!skip.has(c.uid));
          if(k>=0){const al=alive(),u=h.hand[k].uid,n=h.hand.length,en=h.energy;modal=null;send({t:'play',uid:u,j:al[0]?g.enemies.indexOf(al[0]):null,a:ME,pk:Math.floor(Math.random()*4)});
            // carte che chiedono una scelta (per esempio dagli scarti): se non è successo niente il bot le salta
            ctx(ME);if(g&&g.hero&&g.hero.hand.some(c=>c.uid===u)&&g.hero.energy===en&&g.hero.hand.length===n)skip.add(u);modal=null}
          else{skip.clear();send({t:'end'});await sleep(10)}continue}
        if(R.phase==='room'){const P=run;render();if(P.screen==='rest')falo.add(R.porta.ondata);if(P.screen==='event'&&!P.event.result){const ev=EVENTS.find(e=>e.id===P.event.id);const o=ev.opts.findIndex(o=>!o.pick&&(!o.req||o.req()));send(o>=0?{t:'ev',k:o}:{t:'done'})}
          else if(P.screen==='reward'&&P.reward&&P.reward.cards)send({t:'takeCard',k:0});else if(P.screen==='rest')send(has('coronanera')?{t:'done'}:{t:'restHeal'});else if(P.screen==='secret'&&P.secret)send({t:'secret',i:0});else send({t:'done'});await sleep(0);continue}
        await sleep(5)}

    r.fine=R.phase==='end';r.tutte=R.porta.ondata===8||!R.win;r.conti=R.porta.salvati+R.porta.persi+R.porta.fuori+R.porta.gruppo===40;r.falo=[...falo].join(',');r.win=R.win;r.salvati=R.porta.salvati;
    render();r.schermata=document.body.innerHTML.includes('Abitanti salvati')&&document.body.innerHTML.includes('Riapri il cancello');const pa=UI.lastPorta;r.premio=!!pa&&pa.cr===2*R.porta.salvati&&pa.gm===(R.porta.salvati>=40?1:0);{const P=R.porta,o=P.ondata,f=P.falo;P.ondata=2;P.falo=0;const t1=proseguiTxt();P.ondata=3;const t2=proseguiTxt();P.falo=3;const t3=proseguiTxt();P.ondata=o;P.falo=f;r.pulsante=t1==='Prossima ondata (3/8)'&&t2==='Vai alle Retrovie'&&t3==='Prossima ondata (4/8)'}const c1=getCrowns();render();r.unaVolta=getCrowns()===c1;
    r.record=(parseInt(localStorage.getItem('valdombra-porta-record')||'0',10)||0)>=R.porta.salvati;
    R=null;screen='title';modal=null;openGioca();render();r.menu=document.body.innerHTML.includes('Aprite il cancello');closeModal();
    // enciclopedia: lato Ombra
    SET.lox=false;openDiario('c');UI.diTab='c';render();const om=document.querySelectorAll('.cardgrid .card.shadow').length,no=[...document.querySelectorAll('.cardgrid > .card')].filter(c=>!c.classList.contains('unknown')).length;
    r.encOmbra=om>0&&no>0;SET.lox=true;render();r.encOmbraTutti=document.querySelectorAll('.cardgrid .card.shadow').length>om;
    r.encArte=[...document.querySelectorAll('.cardgrid .card.shadow img')].some(im=>/carte-ombra/.test(im.getAttribute('src')));render();r.encLuce=[...document.querySelectorAll('.cardgrid .duo')].every(d=>d.querySelectorAll('.card').length===2&&d.querySelectorAll('.card.shadow').length===1);SET.lox=false;closeModal();modal=null;
    // barre della vita più alte in combattimento
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls='mago';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);startCombat(['goblin'],'combat');ctx(ME);render();
    {const b=document.querySelector('.combat .ent.enemy .bar');r.barra=b&&b.getBoundingClientRect().height>=17;const sp=b&&b.querySelector('span');r.numeri=sp&&parseFloat(getComputedStyle(sp).fontSize)>=12}
    r.gemme=document.querySelector('.hud').textContent.includes('Gemme');
    // mappa: la figura dell'eroe non prende i tocchi e sta sotto i nodi
    R.combat=null;R.phase='map';const a0=availNodes()[0];R.pos={y:a0.y,x:a0.x};R.path=[[a0.y,a0.x]];render();
    {const fig=document.querySelector('.mapsvg .maperoe');r.figura=!fig||getComputedStyle(fig).pointerEvents==='none';const svg=document.querySelector('.mapsvg');const kids=[...svg.children];const fi=kids.findIndex(k=>k.classList&&k.classList.contains('maperoe')),ni=kids.findIndex(k=>k.classList&&k.classList.contains('node'));r.sotto=fi<0||fi<ni}
    R=null;screen='title';modal=null;render();return r});
  ok(ac.inizio&&ac.banner&&ac.cattura&&ac.senzaFerite,'Aprite il cancello: parte alla Rocca con la prima ondata; i nemici catturano abitanti solo se ti feriscono');
  ok(ac.fine&&ac.tutte&&ac.conti&&(ac.falo==='3,6'||!ac.win),`Aprite il cancello: il bot arriva in fondo (${ac.salvati} salvati), Falò dopo la 3ª e la 6ª ondata (${ac.falo}), i conti degli abitanti tornano`);
  ok(ac.schermata&&ac.premio&&ac.unaVolta&&ac.record&&ac.menu,'Aprite il cancello: schermata finale, 2 Corone per abitante una volta sola, record, pulsante nel menu Gioca');
  ok(ac.pulsante,'Aprite il cancello: dopo la ricompensa il pulsante dice «Prossima ondata (N/8)» o «Vai alle Retrovie», non «Prosegui sulla mappa»; 1 Gemma solo salvandoli tutti');
  ok(ac.encOmbra&&ac.encOmbraTutti&&ac.encArte&&ac.encLuce,'enciclopedia: accanto a ogni carta col lato Ombra c\'è la sua faccia viola, con la sua illustrazione');
  ok(ac.barra&&ac.numeri&&ac.gemme,'combattimento: barre della vita più alte e numeri più grandi; le Gemme si vedono nella barra in alto');
  ok(ac.figura&&ac.sotto,'mappa: la figura dell\'eroe sta sotto i nodi e non prende i tocchi');

  console.log('7e. Aprite il cancello in gruppo e in classifica');
  const gr=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    // stanza di gruppo: l'host sceglie la modalità
    solo=false;isHost=true;ME='pA';myName='Luca';chan=null;R=newLobby('CANC');R.players.pA.cls='guerriero';R.players.pB={pid:'pB',name:'Sara',cls:'chierico',ready:true};R.order.push('pB');online=new Set(R.order);R.ldg='cripte';
    dispatch('pA',{t:'mode',m:'porta'});r.scelta=R.lmode==='porta'&&R.ldg==='rocca';render();r.stanza=document.body.innerHTML.includes('Aprite il cancello')&&document.body.innerHTML.includes('le 8 ondate sono uguali per tutti');
    dispatch('pB',{t:'mode',m:'norm'});r.soloHost=R.lmode==='porta';
    dispatch('pA',{t:'start',lvl:3,seed:'CANCELLO'});r.avvio=R.mode==='porta'&&R.dg==='rocca'&&R.lvl===0&&R.phase==='combat'&&!!R.porta&&Object.keys(R.combat.heroes).length===2;
    // un'ondata vinta in due: ricompense per entrambi, poi l'ondata dopo
    ctx('pA');g.enemies.forEach(e=>hurtEnemy(e,99999));checkEnd();await sleep(700);r.ricompense=R.phase==='room'&&R.players.pA.screen==='reward'&&R.players.pB.screen==='reward';
    const s1=R.porta.salvati;dispatch('pA',{t:'done'});dispatch('pB',{t:'done'});r.seconda=R.phase==='combat'&&R.porta.ondata===2&&s1>=5;
    // la partita riparte nella stessa modalità
    R.phase='end';R.win=false;const ms=window.mpRestart;r.riparte=MODEN[R.mode]==='Aprite il cancello'&&noLvl(R.mode);
    // classifica: con un finto Supabase si controlla la riga inviata (nessuna riga vera)
    const sb0=window.sbClient;let riga=null;const rows=[{id:7,creato:new Date().toISOString(),nomi:'Prova',classi:'guerriero',giocatori:1,piani:31,livello:0,punteggio:3500}];
    const q={eq(){return q},order(){return q},limit:async()=>({data:rows,error:null})};
    window.sbClient=()=>({from:()=>({insert:row=>{riga=row;return {select:()=>({single:async()=>({data:{id:7},error:null})})}},select:()=>q})});
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls='mago';pickDg='rocca';pickMode='porta';pickLvl=0;startSolo();ctx(ME);
    R.porta.salvati=31;R.porta.persi=9;R.porta.ondata=8;R.porta.fuori=0;R.porta.gruppo=0;run.kills=20;endRun(true);UI.lbMsg='';render();await sleep(300);render();
    r.riga=!!riga&&riga.dungeon==='porta'&&riga.piani===31&&riga.modalita==='solo'&&riga.punteggio===31*100+8*50+20*2&&riga.livello===0;r.lbId=R.lbId===7;
    await sleep(100);render();r.classifica=document.body.innerHTML.includes('31 abitanti salvati')&&document.body.innerHTML.includes('Classifica giocatore singolo');
    modal=null;R=null;screen='title';openBoard('solo','porta');await sleep(100);render();r.tab=!!document.querySelector('.modal')&&document.body.innerHTML.includes('100 punti')&&UI.lbDg==='porta';closeModal();modal=null;
    window.sbClient=sb0;UI.lbDg='rocca';
    // scelta della modalità nella schermata da solo
    R=null;screen='title';pickMode='porta';render();r.picker=!!document.querySelector('.modes')&&document.querySelector('.modes').textContent.includes('Aprite il cancello');pickMode='norm';render();
    return r});
  ok(gr.scelta&&gr.stanza&&gr.soloHost&&gr.avvio,'in gruppo: l\'host sceglie «Aprite il cancello», si gioca sempre nella Rocca senza Livello di Assedio '+JSON.stringify({s:gr.scelta,t:gr.stanza,h:gr.soloHost,a:gr.avvio}));
  ok(gr.ricompense&&gr.seconda&&gr.riparte,'in gruppo: dopo un\'ondata vinta ognuno prende la ricompensa, poi arriva l\'ondata dopo');
  ok(gr.riga&&gr.lbId&&gr.classifica&&gr.tab&&gr.picker,'classifica del cancello: riga con abitanti salvati e punteggio, scheda nelle classifiche, modalità nella schermata da solo '+JSON.stringify({r:gr.riga,i:gr.lbId,c:gr.classifica,t:gr.tab,p:gr.picker}));

  console.log('7f. Mercante: pozione con le tasche piene e carta da bruciare');
  const me=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);
    R.phase='room';run.screen='shop';run.done=false;genShop();run.gold=1000;run.om=3;const P3=DG().pots.slice(0,3);run.potions=[...P3];render();
    // pozione con 3 già piene: prima la domanda, l'oro non si tocca finché non scegli
    const it=run.shop.potions[0],pr=omPrice(it.price);buyUI('potions',0);
    r.chiede=!!modal&&modal.title==='Hai già 3 pozioni'&&run.gold===1000&&!it.sold&&document.body.innerHTML.includes('Sei sicuro di volerla comprare');
    r.bottoni=[...document.querySelectorAll('.modal button')].filter(b=>b.textContent==='Annulla').length>=1&&document.querySelectorAll('.modal .prow button').length===3;
    [...document.querySelectorAll('.modal .pkbar button')].find(b=>b.textContent==='Annulla').click();ctx(ME);
    r.annulla=!modal&&run.gold===1000&&!it.sold&&run.potions.join()===P3.join()&&!run.pendPot;
    buyUI('potions',0);document.querySelectorAll('.modal .prow button')[1].click();ctx(ME);
    r.compra=!modal&&run.gold===1000-pr&&it.sold&&run.potions.length===3&&run.potions[1]===it.id&&run.potions[0]===P3[0]&&!run.pendPot;
    // con un posto libero si compra subito, senza domande
    run.potions.pop();const g1=run.gold,it2=run.shop.potions[1];buyUI('potions',1);ctx(ME);r.libera=!modal&&it2.sold&&run.potions.length===3&&run.gold===g1-omPrice(it2.price);
    // brucia una carta: si sceglie, si conferma, con Annulla non si paga
    render();const n0=run.deck.length,g2=run.gold,rp=removePrice();shopRemoveUI();
    r.mazzo=!!modal&&modal.list.length===n0&&document.querySelectorAll('.modal .pk').length===n0&&run.gold===g2;
    pkClick(2);r.scelta=!!document.querySelector('.modal .pk.on')&&[...document.querySelectorAll('.modal .pkbar .btn.primary')].some(b=>b.textContent.includes('Brucia questa carta'))&&document.querySelectorAll('.modal .pk.on').length===1&&run.deck.length===n0&&run.gold===g2;
    r.testa=[...document.querySelectorAll('.modal .mhead button')].some(b=>b.textContent==='Annulla');
    [...document.querySelectorAll('.modal .pkbar button')].find(b=>b.textContent==='Annulla').click();ctx(ME);
    r.annulla2=!modal&&run.deck.length===n0&&run.gold===g2&&!run.shop.removeUsed;
    shopRemoveUI();const id2=run.deck[2].id;pkClick(2);document.querySelector('.modal .pkbar .btn.primary').click();ctx(ME);
    r.brucia=!modal&&run.deck.length===n0-1&&run.gold===g2-rp&&run.shop.removeUsed;
    R=null;modal=null;screen='title';render();return r});
  ok(me.chiede&&me.bottoni&&me.annulla&&me.compra&&me.libera,'mercante: con 3 pozioni chiede conferma e quale sostituire; con Annulla non paga, con un posto libero si compra subito '+JSON.stringify({c:me.chiede,b:me.bottoni,a:me.annulla,p:me.compra,l:me.libera}));
  ok(me.mazzo&&me.scelta&&me.testa&&me.annulla2&&me.brucia,'mercante: «Brucia una carta» apre il mazzo, la carta si conferma, con Annulla non si paga '+JSON.stringify({m:me.mazzo,s:me.scelta,t:me.testa,a:me.annulla2,b:me.brucia}));

  console.log('7g. Anteprima dei danni, Retrovie e abitanti in salvo');
  const an=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;SET.lo=true;
    const nuova=(cls,m='norm')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;UI.om=false;pickCls=cls;pickDg='rocca';pickMode=m;pickLvl=0;startSolo();ctx(ME)};
    // ogni carta di ogni eroe: l'anteprima è uguale ai danni veri e lo stato non cambia
    let prove=0;const diverse=[],cambiato=[];
    for(const cls of Object.keys(CLASSES)){const ids=Object.keys(CARDS).filter(k=>CARDS[k].cl===cls&&!CARDS[k].unplay&&!CARDS[k].ally&&!CARDS[k].choose&&!CARDS[k].pick);
      for(const id of ids)for(const up of [false,true])for(const sh of [0,1]){
        nuova(cls);startCombat(['orco','goblin'],'combat');ctx(ME);g.enemies.forEach((e,i)=>{e.hp=e.max=999;e.blk=i?0:4;e.intent={d:0}});g.enemies[0].st.vuln=1;g.hero.st.str=2;
        const c={id,up,uid:uid++};g.hero.hand.push(c);g.hero.energy=9;if(sh&&!canShadow(c))continue;
        const prima=ser(),rs=rng.s,u0=uid,f0=fxq.length;const pv=simHit('c',c.uid,0,sh);
        if(ser()!==prima||rng.s!==rs||uid!==u0||fxq.length!==f0)cambiato.push(id);
        const e=g.enemies[0],hp0=e.hp,b0=e.blk;dispatch(ME,{t:'play',uid:c.uid,j:0,sh});ctx(ME);const e2=R.combat.enemies[0];prove++;
        if(!pv||pv.tot!==(hp0-e2.hp)+Math.max(0,b0-e2.blk))diverse.push(cls+':'+id+(up?'+':'')+(sh?' ombra':''))}}
    r.tutte=prove>400&&!diverse.length&&!cambiato.length;r.n=prove;r.diverse=diverse.slice(0,5);r.cambiato=cambiato.slice(0,5);
    // Colpo con Forza 2 contro Vulnerabile e 5 Armatura: (6+2)×1,5 = 12, 5 all'Armatura e 7 alla vita
    nuova('guerriero');startCombat(['orco','goblin'],'combat');ctx(ME);g.enemies.forEach(e=>{e.hp=e.max=200;e.intent={d:0}});g.hero.st.str=2;g.enemies[0].st.vuln=2;g.enemies[0].blk=5;
    g.hero.hand=[{id:'colpo',up:false,uid:uid++},{id:'parata',up:false,uid:uid++}];g.hero.energy=3;render();
    const pc=simHit('c',g.hero.hand[0].uid,0,0);r.colpo=!!pc&&pc.tot===12&&pc.bl===5&&pc.hp===7&&!pc.kill;
    const tl=dmgTipHTML(0);r.elenco=tl.includes('Danni su')&&tl.includes('Colpo')&&tl.includes('12')&&tl.includes('7 alla vita')&&tl.includes('Forza +2')&&tl.includes('Vulnerabile +50%')&&!tl.includes('Parata');
    UI.sel={k:'c',uid:g.hero.hand[0].uid,sh:0};render();const bd=document.querySelector('#dmglayer .dmgprev[data-j="0"]');r.numero=!!bd&&bd.textContent.includes('−7 vita')&&bd.textContent.includes("5 all'Armatura")&&document.querySelectorAll('#ent-e0 .bar .loss').length===1;
    const ts=dmgTipHTML(0);r.scelta=ts.includes('Colpo → ')&&ts.includes('12 danni')&&ts.includes("5 all'Armatura, 7 alla vita");
    g.enemies[1].hp=5;const k=dmgTipHTML(1);r.letale=k.includes('Lo sconfiggi');render();const bl=document.querySelector('#dmglayer .dmgprev[data-j="1"]');r.letale=r.letale&&!!bl&&bl.textContent.includes('−5 · letale');
    const el=document.getElementById('ent-e0');dmgTip(el);const tip=document.getElementById('dmgtip');r.riquadro=!!tip&&!tip.hidden&&tip.textContent.includes('12 danni');UI.sel=null;dmgTipHide();
    g.hero.ended=true;r.fineTurno=simHit('c',g.hero.hand[0].uid,0,0)===null;g.hero.ended=false;
    // Retrovie al posto del Falò nel cancello; il Falò resta nella partita normale
    nuova('guardiano','porta');R.phase='room';run.screen='rest';render();const hb=document.querySelector('main').innerHTML;
    r.retrovie=hb.includes('<h2>Retrovie</h2>')&&hb.includes('Fatti bendare')&&hb.includes('Vai dagli armaioli')&&!hb.includes('<h2>Falò</h2>');
    const hp0=run.hp=Math.max(1,run.hp-30);dispatch(ME,{t:'restHeal'});ctx(ME);r.benda=run.hp>hp0;
    nuova('guardiano');R.phase='room';run.screen='rest';render();r.falo=document.querySelector('main').innerHTML.includes('<h2>Falò</h2>');
    // abitanti in salvo (v10.3): uno per abitante, salvati − persi (al massimo 40)
    nuova('guardiano','porta');const N=(a,b)=>{R.porta.salvati=a;R.porta.persi=b;return portaFollaN()};
    r.soglie=N(0,0)===0&&N(1,0)===1&&N(5,0)===5&&N(6,0)===6&&N(23,0)===23&&N(40,0)===40;
    r.calano=N(12,1)===11&&N(12,2)===10&&N(4,4)===0&&N(3,9)===0;
    UI.folla=null;N(12,0);render();let w=0;while(!PXI['abitanti/ab1']&&w<300){await new Promise(t=>setTimeout(t,10));w++}UI.folla=null;render();const f1=document.querySelectorAll('.folla img').length,righe=document.querySelectorAll('.folla .riga').length;
    N(12,3);render();const f2=document.querySelectorAll('.folla img:not(.via)').length,via=document.querySelectorAll('.folla img.via').length;N(13,3);render();const nuovo=document.querySelectorAll('.folla img.nuovo').length;
    r.vede=f1===12&&righe===2&&f2===9&&via===3&&nuovo===1;r.dettFolla=[f1,righe,f2,via,nuovo];
    nuova('guardiano');render();r.normale=!document.querySelector('.folla');
    R=null;modal=null;screen='title';render();return r});
  ok(an.tutte&&an.colpo&&an.elenco&&an.numero&&an.scelta&&an.letale&&an.riquadro&&an.fineTurno,`anteprima dei danni: uguale ai danni veri per ogni carta (${an.n} prove) senza toccare lo stato; elenco col mouse, numero sul bersaglio, letale `+JSON.stringify({t:an.tutte,d:an.diverse,c:an.cambiato,co:an.colpo,e:an.elenco,n:an.numero,s:an.scelta,l:an.letale,q:an.riquadro,f:an.fineTurno}));
  ok(an.retrovie&&an.benda&&an.falo,'Aprite il cancello: Retrovie con bende e armaioli al posto del Falò (che resta nella partita normale) '+JSON.stringify({r:an.retrovie,b:an.benda,f:an.falo}));
  ok(an.soglie&&an.calano&&an.vede&&an.normale,'Aprite il cancello: dietro l\'eroe un abitante per ogni salvato (meno i persi), in file da 10; chi arriva salta dentro, chi si perde sbiadisce '+JSON.stringify({s:an.soglie,c:an.calano,v:an.vede,d:an.dettFolla,n:an.normale}));

  console.log('7h. La vita persa si vede: numeri sui nemici in tante finestre, viste e numeri di nemici');
  {const casi=[['PC',{viewport:{width:1280,height:800}},1],['PC largo',{viewport:{width:1920,height:1000}},1],['PC basso',{viewport:{width:1000,height:560}},1],
      ['tablet',{viewport:{width:768,height:1024},isMobile:true,hasTouch:true},0],['telefono',{viewport:{width:390,height:844},isMobile:true,hasTouch:true},0]];
    const gruppi=[['goblin'],['orco','goblin'],['orco','goblin','bandito'],['signoreguerra','goblin','bandito','goblin','goblin']];
    const male=[];let viste=0,daMouse=0;
    for(const [nome,opt,mouse] of casi)for(const scena of [false,true]){
      const c2=await browser.newContext(opt);await c2.route(/^https?:\/\//,r=>r.abort());const p2=await c2.newPage();const e2=[];p2.on('pageerror',e=>e2.push(e.message));
      await p2.goto(PAGE);await p2.waitForTimeout(300);
      for(const [gi,ids] of gruppi.entries()){
        await p2.evaluate(([ids,scena])=>{SET.tut=false;SET.scena=scena;SET.px=true;saveSet();applySet();SPEED=0;R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;UI.om=false;
          pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);startCombat(ids,ids.length>4?'boss':'combat');ctx(ME);const h=g.hero;h.st.str=2;
          g.enemies.forEach((e,i)=>{e.intent={d:0};if(i%2)e.blk=4});g.enemies[0].st.vuln=2;if(g.enemies[1])g.enemies[1].hp=Math.min(g.enemies[1].hp,9);
          h.hand=[{id:'colpo',up:false,uid:uid++},{id:'possente',up:false,uid:uid++},{id:'fendente',up:false,uid:uid++},{id:'parata',up:false,uid:uid++},{id:'colpo',up:true,uid:uid++}];h.energy=3;render()},[ids,scena]);
        await p2.waitForTimeout(150);
        // controllo: per ogni nemico che perde vita, il numero giusto sta sopra la sua testa, dentro lo schermo, sopra tutto il resto, senza toccare gli altri numeri né l'intenzione
        const controlla=async(cosa,src)=>p2.evaluate(([cosa,src])=>{const out=[];const W=innerWidth,H=innerHeight,prese=[];
          const L=document.getElementById('dmglayer'),zL=L?+getComputedStyle(L).zIndex:0;
          const zMax=Math.max(0,...[...document.querySelectorAll('#cprev,#gltip,#dmgtip,.hand,.hand .card,header.hud,.pilebar')].map(x=>+getComputedStyle(x).zIndex||0));
          if(!(zL>zMax))out.push(cosa+': i numeri non stanno sopra tutto');
          // il testo delle carte deve restare leggibile: carta ingrandita, parole chiave e carte in mano
          const carte=[...document.querySelectorAll('.hand .card,#cprev:not([hidden])>*,#gltip:not([hidden])')].map(x=>x.getBoundingClientRect()).filter(r=>r.width&&r.height);
          g.enemies.forEach((e,j)=>{if(e.hp<=0)return;const r=src.k==='c'?simHit('c',src.x,j,0):null;if(!r||!(r.hp>0))return;
            const b=document.querySelector('#dmglayer .dmgprev[data-j="'+j+'"]');if(!b||b.hidden||!b.offsetWidth){out.push(cosa+' nemico '+j+': numero mancante');return}
            const q=b.getBoundingClientRect(),el=document.getElementById('ent-e'+j),f=el.querySelector('.face').getBoundingClientRect(),it=el.querySelector('.intent'),ir=it&&it.offsetWidth?it.getBoundingClientRect():null;
            const dentro=q.left>=0&&q.top>=0&&q.right<=W&&q.bottom<=H,sopra=q.bottom<=f.top+4||q.top<=4,centrato=q.left<f.right&&q.right>f.left;
            const sucarta=carte.some(c=>q.left<c.right&&q.right>c.left&&q.top<c.bottom&&q.bottom>c.top),vicino=['testa','su','lato','cima','sopra la figura'].includes(b.dataset.pos);
            const tocca=prese.some(o=>q.left<o.right&&q.right>o.left&&q.top<o.bottom&&q.bottom>o.top),intenz=ir&&q.left<ir.right&&q.right>ir.left&&q.top<ir.bottom&&q.bottom>ir.top;prese.push(q);
            const fs=parseFloat(getComputedStyle(b).fontSize),val=b.textContent.includes('−'+r.hp);
            const ps=b.dataset.pos,vic=q.right>f.left-80&&q.left<f.right+80;const posto=ps==='testa'?(sopra&&centrato):ps==='su'?centrato:ps==='lato'?true:ps==='cima'?(vic&&q.top<=f.top+f.height*.4):ps==='sopra la figura'?(centrato&&q.top>=f.top-2&&q.bottom<=f.bottom+2):false;
            if(!(dentro&&posto&&vicino&&!sucarta&&!tocca&&!intenz&&fs>=12&&val))out.push(cosa+' nemico '+j+' ['+b.dataset.pos+']: '+[dentro?'':'fuori schermo',posto?'':'fuori posto',sucarta?'copre il testo di una carta':'',tocca?'sovrapposto a un altro':'',intenz?'copre l\'intenzione':'',fs>=12?'':'troppo piccolo',val?'':'valore sbagliato ('+b.textContent+' invece di −'+r.hp+')'].filter(Boolean).join(', '));
            if(!document.querySelector('#ent-e'+j+' .bar .loss'))out.push(cosa+' nemico '+j+': barra senza la parte da perdere')});
          return out},[cosa,src]);
        // 1) carta scelta (anche su telefono), con più di un nemico
        if(ids.length>1){const u=await p2.evaluate(()=>{const c=g.hero.hand[1];UI.sel={k:'c',uid:c.uid,sh:0};render();return c.uid});await p2.waitForTimeout(80);
          male.push(...(await controlla(nome+(scena?' scena':'')+' '+ids.length+' nemici, carta scelta',{k:'c',x:u})));viste++;
          await p2.evaluate(()=>{UI.sel=null;render()})}
        // 2) col mouse sopra ogni carta d'attacco in mano (Fendente Ampio colpisce tutti)
        if(mouse)for(const i of [0,1,2,4]){const u=await p2.evaluate(i=>g.hero.hand[i].uid,i);await p2.hover('.hand .card >> nth='+i);await p2.waitForTimeout(120);
          male.push(...(await controlla(nome+(scena?' scena':'')+' '+ids.length+' nemici, mouse su carta '+i,{k:'c',x:u})));viste++;daMouse++;await p2.mouse.move(2,2);await p2.waitForTimeout(40)}
      }
      if(e2.length)male.push(nome+': errore JS '+e2[0]);await c2.close()}
    ok(!male.length&&viste>60&&daMouse>40,`la vita persa si vede sempre sopra la testa del nemico senza coprire il testo delle carte (${viste} situazioni: PC, PC largo, PC basso, tablet, telefono; vista classica e a scena; da 1 a 5 nemici; carta scelta e mouse sulla carta)`+(male.length?' — problemi: '+male.slice(0,6).join(' | '):''));}

  console.log('7i. Mercante da uccidere, carta potenziata col nome, mappa su telefono, percorso disegnato');
  const mk=await page.evaluate(async()=>{const r={};SET.tut=false;SET.lo=true;SPEED=0;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    const nuova=cls=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;pickCls=cls;pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    nuova('ladro');R.phase='room';run.screen='shop';run.done=false;genShop();run.gold=500;
    run.om=7;render();r.no7=!document.querySelector('main').innerHTML.includes('Uccidi il mercante');dispatch(ME,{t:'killShop'});ctx(ME);r.no7=r.no7&&!run.shop.dead&&run.om===7;
    run.om=8;render();r.si8=document.querySelector('main').innerHTML.includes('Uccidi il mercante');killShopUI();r.chiede=!!modal&&modal.title==='Uccidere il mercante?';modal=null;
    const d0=run.deck.length,p0=run.potions.length,r0=run.relics.length,g0=run.gold;dispatch(ME,{t:'killShop'});ctx(ME);r.ombra=run.om===10&&!!run.shop.dead;render();r.schermo=document.querySelector('main').innerHTML.includes('Il mercante giace a terra');
    dispatch(ME,{t:'loot',kind:'cards',k:0});dispatch(ME,{t:'loot',kind:'cards',k:1});ctx(ME);r.carta=run.deck.length===d0+1;
    run.potions=run.potions.slice(0,1);const p1=run.potions.length;dispatch(ME,{t:'loot',kind:'potions',k:0});dispatch(ME,{t:'loot',kind:'potions',k:1});ctx(ME);r.pozione=run.potions.length===p1+1;
    dispatch(ME,{t:'loot',kind:'relics',k:0});dispatch(ME,{t:'loot',kind:'relics',k:1});ctx(ME);r.reliquia=run.relics.length===r0+1;
    dispatch(ME,{t:'buy',kind:'cards',k:2});dispatch(ME,{t:'shopRemove',i:0});ctx(ME);r.chiuso=run.gold===g0&&run.deck.length===d0+1;
    // al prossimo combattimento cade nell'ombra: Ombra a 0, PV massimi −4, Forma oscura
    const fa=(run.stx&&run.stx.falls)|0;R.phase='combat';startCombat(['goblin'],'combat');ctx(ME);r.caduta=run.om===10&&!!run.caduto&&!!g.hero.st.oscuro&&fa>=1&&((run.stx&&run.stx.falls)|0)===fa;
    // un solo mercante per partita
    R.phase='room';run.screen='shop';genShop();run.om=9;render();r.unaVolta=!document.querySelector('main').innerHTML.includes('>Uccidi il mercante<')&&document.querySelector('main').innerHTML.includes('Hai già ucciso un mercante');dispatch(ME,{t:'killShop'});ctx(ME);r.unaVolta=r.unaVolta&&!run.shop.dead&&run.om===9;
    // carta potenziata a caso: si dice quale
    nuova('guerriero');R.phase='map';render();const nm=UPRAND(2);render();await sleep(1300);const tt=[...document.querySelectorAll('.toast')].map(x=>x.textContent).join(' ');
    r.nome=nm.length===2&&tt.includes('Carte potenziate')&&nm.every(n=>tt.includes(n+'+'))&&nm.every(n=>run.deck.some(c=>c.up&&CARDS[c.id].n===n));
    // percorso disegnato anche da solo: nodo, poi linee; l'ultima linea toccata di nuovo si toglie; da un nodo a metà si cambia strada
    R.plans={};UI.draw=true;render();r.strumenti=document.body.innerHTML.includes('Fine, torna a giocare');const n0=R.map[0].find(Boolean);nodeTap(n0.y,n0.x);const a=R.map[1][n0.next[0]];
    render();r.linee=document.querySelectorAll('.mapsvg .ehit').length>0;edgeTap(n0.y,n0.x,a.y,a.x);const b=R.map[2][a.next[0]];edgeTap(a.y,a.x,b.y,b.x);const lun=(R.plans.solo||[]).length;
    edgeTap(a.y,a.x,b.y,b.x);const tolto=(R.plans.solo||[]).length;render();r.percorso=lun===3&&tolto===2&&!!document.querySelector('.mapsvg .plan polyline');
    const alt=a.next.find(x=>x!==b.x);if(alt!=null){edgeTap(a.y,a.x,2,alt);r.percorso=r.percorso&&JSON.stringify(R.plans.solo)===JSON.stringify([[n0.y,n0.x],[a.y,a.x],[2,alt]])}
    UI.draw=false;R=null;modal=null;screen='title';render();return r});
  ok(mk.no7&&mk.si8&&mk.chiede&&mk.ombra&&mk.schermo&&mk.carta&&mk.pozione&&mk.reliquia&&mk.chiuso&&mk.caduta&&mk.unaVolta,'mercante: con 8 Ombra si può uccidere (con conferma, una sola volta per partita), Ombra a 10, una carta, una pozione e una reliquia gratis, poi il negozio è chiuso e al combattimento si cade nell\'ombra '+JSON.stringify(mk));
  ok(mk.nome,'carta potenziata a caso: il fumetto dice quale');
  ok(mk.strumenti&&mk.linee&&mk.percorso,'percorso disegnato anche da solo, toccando nodi e linee (si toglie e si cambia strada)');
  {const c3=await browser.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});await c3.route(/^https?:\/\//,r=>r.abort());const p3=await c3.newPage();await p3.goto(PAGE);await p3.waitForTimeout(300);
    const mp=await p3.evaluate(async()=>{SET.tut=false;SET.lo=true;SPEED=0;R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);render();
      const m=document.getElementById('mapwrap'),dt=document.querySelector('details.mapextra');const h=m.getBoundingClientRect().height;const chiuso=!!dt&&!dt.open;dt.open=true;await new Promise(t=>setTimeout(t,50));
      const vis=dt.querySelector('.mxin').getBoundingClientRect().height>0;return {h:Math.round(h),chiuso,vis,sum:dt.querySelector('summary').textContent}});
    ok(mp.h>=300&&mp.chiuso&&mp.vis,`mappa su telefono piccolo (360x640): la mappa è alta ${mp.h} punti, missioni e climi in un riquadro chiuso che si apre («${mp.sum}»)`);await c3.close()}

  console.log('7j. Tempo di gioco');
  const tm=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);render();
    r.hud=!!document.getElementById('htempo');
    R.tAcc=0;R.tLast=Date.now()-5000;commit();r.conta=R.tAcc>=4900&&R.tAcc<6000;
    // una pausa di 10 minuti conta al massimo 2 minuti
    const a=R.tAcc;R.tLast=Date.now()-600000;commit();r.pausa=R.tAcc-a>=119000&&R.tAcc-a<=120500;
    r.formato=fmtTempo(65000)==='1:05'&&fmtTempo(3725000)==='1:02:05';
    // a fine partita il tempo si ferma e si vede nella schermata finale
    endRun(true);commit();const f=R.tFin;R.tLast=Date.now()-60000;commit();r.ferma=f!=null&&R.tFin===f&&tempoMs()===f;render();r.fine=document.body.innerHTML.includes('Tempo di gioco')&&document.body.innerHTML.includes(fmtTempo(f));
    R=null;screen='title';render();return r});
  ok(tm.hud&&tm.conta&&tm.pausa&&tm.formato&&tm.ferma&&tm.fine,'tempo di gioco: nella barra in alto, conta le mosse, le pause lunghe valgono al massimo 2 minuti, a fine partita si ferma e si vede '+JSON.stringify(tm));

  console.log('7k. A 10 Ombra si resta: falò spenti, Malattia, guarigione; corone e gemme senza scritte');
  const om=await page.evaluate(async()=>{const r={};SET.tut=false;SET.lo=true;SPEED=0;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    const nuova=(lvl=0)=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;UI.om=false;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();R.lvl=lvl;ctx(ME)};
    const spenti=()=>R.map.flat().filter(n=>n&&n.spento).length;
    // caduta in combattimento: si resta a 10, i turni di sola Luce non fanno calare, un falò si spegne (livello 0)
    nuova(0);startCombat(['orco'],'combat');ctx(ME);g.enemies[0].hp=g.enemies[0].max=999;run.om=9;const mx=run.max;omAdd(ME,1);ctx(ME);
    const ls=(run.vb&&run.vb.tempio>=3)?2:4;r.resta=run.om===10&&!!run.caduto&&run.max===mx-ls&&!!g.hero.st.oscuro&&spenti()===1;
    const c1={id:'colpo',up:false,uid:uid++};g.hero.hand.push(c1);g.hero.energy=3;dispatch(ME,{t:'play',uid:c1.uid,j:0});dispatch(ME,{t:'end'});let w=0;while(R.combat&&R.combat.busy&&w<300){await sleep(5);w++}ctx(ME);
    r.luce=run.om===10&&!!run.caduto;
    // col Livello di Assedio si spengono più falò: livello 4 → 3
    nuova(4);const tot=R.map.flat().filter(n=>n&&n.type==='rest').length;run.om=10;omFall(ME);r.livello=spenti()===Math.min(tot,3)&&!!run.caduto;
    // falò spento: niente riposo; a 10 Ombra ci si ammala
    const sp=R.map.flat().find(n=>n&&n.spento);R.pos=null;R.path=[];run.screen=null;nodeContent(sp.y,sp.x);ctx(ME);render();
    r.spento=run.screen==='spento'&&document.querySelector('main').innerHTML.includes('Falò spento')&&!!run.malato;const hp0=run.hp;dispatch(ME,{t:'restHeal'});ctx(ME);r.noRiposo=run.hp===hp0&&run.screen==='spento';
    // ogni combattimento una Malattia: a fine turno in mano fa perdere 3 PV
    R.phase='combat';startCombat(['orco'],'combat');ctx(ME);g.enemies[0].hp=g.enemies[0].max=999;g.enemies[0].intent={d:0};const pile=[...g.hero.hand,...g.hero.draw,...g.hero.disc];r.malattia=pile.filter(c=>c.id==='malattia').length===1;
    const ma=pile.find(c=>c.id==='malattia');['hand','draw','disc'].forEach(k=>g.hero[k]=g.hero[k].filter(c=>c!==ma));g.hero.hand.push(ma);const hp1=run.hp;dispatch(ME,{t:'end'});w=0;while(R.combat&&R.combat.busy&&w<300){await sleep(5);w++}ctx(ME);r.perde=run.hp===hp1-3;
    // purificarsi (sotto 10): si esce dalla caduta, la Malattia passa e le sue carte spariscono
    omAdd(ME,-3);ctx(ME);r.guarisce=run.om===7&&!run.caduto&&!run.malato&&![...g.hero.hand,...g.hero.draw,...g.hero.disc].some(c=>c.id==='malattia');
    // sotto 10 un falò spento non fa ammalare
    R.phase='room';run.screen=null;nodeContent(sp.y,sp.x);ctx(ME);r.sanoSotto10=run.screen==='spento'&&!run.malato;
    // mappa: falò spento grigio e in legenda
    R.phase='map';run.screen=null;render();r.mappa=!!document.querySelector('.mapsvg .node.spento')&&document.body.innerHTML.includes('Falò spento');
    // corone e gemme in alto: solo icone e numeri
    R=null;screen='title';modal=null;render();const cb=document.querySelector('.crownbadge');r.corone=!!cb&&!/Corone|Gemme/.test(cb.textContent)&&/\d/.test(cb.textContent);
    return r});
  ok(om.resta&&om.luce&&om.livello,'a 10 Ombra si cade e si resta (i turni di Luce non bastano), si spengono falò: di più col Livello di Assedio '+JSON.stringify(om));
  ok(om.spento&&om.noRiposo&&om.malattia&&om.perde&&om.guarisce&&om.sanoSotto10,'falò spento: niente riposo; a 10 Ombra Malattia a ogni combattimento (−3 PV a fine turno), passa purificandosi');
  ok(om.mappa&&om.corone,'falò spento sulla mappa (grigio, in legenda); corone e gemme in alto solo con icone e numeri');

  console.log('7l. Sfida del giorno più dura, bonus di tempo, Luce e Ombra insieme, menu essenziale, eroi ribilanciati');
  const v9=await page.evaluate(async()=>{const r={};SET.tut=false;SET.lo=true;SPEED=0;
    // sfida del giorno dal 19/11: solo malus e Livello di Assedio 3 (i giorni prima restano com'erano)
    const ids3=DAILY_MODS3.map(m=>m.id),bonus=['ricco','veleno','forgia','mercante'];r.soloMalus=!ids3.some(i=>bonus.includes(i))&&ids3.length>=6;
    let ok3=true;for(let i=0;i<14;i++){const d=dailyInfo(dayAdd('20261119',i));if(!ids3.includes(d.mod.id))ok3=false}r.giorni=ok3;r.oggi=dailyInfo('20261118').mod.id===dailyInfo('20261118').mod.id;
    const tk=todayKey;todayKey=()=>'20261121';try{localStorage.removeItem(DAILY_K)}catch(e){}modal=null;startDaily();ctx(ME);r.livello3=R.lvl===3&&!!R.daily;todayKey=tk;
    // i malus fanno quello che dicono
    const mod=m=>{R.daily.mod=m};mod('furiosi');R.phase='map';startCombat(['goblin'],'combat');ctx(ME);r.furiosi=(g.enemies[0].st.str|0)>=1;
    mod('umido');r.umido=Math.abs(restPct(run)-(run.vb&&run.vb.erbe>=2?.1:.075))<1e-9;
    // bonus di tempo solo vincendo: +30% sotto 5 minuti, +15% fino a 10, +5% fino a 20
    R.win=true;r.tempo=tempoBonus(4*60000)===.3&&tempoBonus(9*60000)===.15&&tempoBonus(19*60000)===.05&&tempoBonus(25*60000)===0;R.win=false;r.tempo=r.tempo&&tempoBonus(60000)===0;
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);R.tAcc=3*60000;R.tLast=Date.now();endRun(true);commit();render();
    r.fine=document.body.innerHTML.includes('+30% tempo');
    // Luce e Ombra insieme: mazzo con le due facce, carta ingrandita con le due facce
    R=null;startSolo();ctx(ME);render();openView(run.deck,'Il tuo mazzo');render();const duo=document.querySelectorAll('.modal .duo').length,sh=document.querySelectorAll('.modal .duo .card.shadow').length;
    r.mazzo=duo>=9&&sh===duo;closeModal();
    startCombat(['orco'],'combat');ctx(ME);g.hero.hand=[{id:'possente',up:false,uid:uid++}];render();const el=document.querySelector('.hand .card');cardZoom(el);r.zoom=document.querySelectorAll('#czoom .card').length===2&&!!document.querySelector('#czoom .card.shadow');cardZoomClose();
    R=null;screen='title';modal=null;['colpo'].forEach(k=>seenAdd('c',[k]));UI.diCls='all';openDiario('c');render();r.enc=!!document.querySelector('.modal .duo .card.shadow');closeModal();
    // menu essenziale (dalla v10.12 in Impostazioni, Grafica): poche cose, eroe e dungeon in una pagina a parte
    SET.menu=true;screen='title';render();{const gb=document.querySelector('.mbig .btn'),gr=document.querySelector('.mtiles');r.largo=!!gb&&!!gr&&Math.abs(gb.getBoundingClientRect().width-gr.getBoundingClientRect().width)<2}
    r.lite=r.largo&&document.querySelectorAll('.mtile').length===8&&!!document.getElementById('guidabtn')&&![...document.querySelectorAll('.mtile')].some(x=>/Guida/.test(x.textContent))&&!document.querySelector('.classes');giocaScroll();render();r.pagina=screen==='solo'&&!!document.querySelector('.classes');
    SET.menu=false;screen='title';render();r.pieno=!!document.querySelector('.classes')&&!document.querySelector('.mtile');
    // eroi ribilanciati
    r.eroi=CLASSES.guerriero.hp===86&&CLASSES.mago.hp===76&&CLASSES.ladro.hp===75&&CLASSES.guardiano.hp===88&&CARDS.scudoarc.v.b===7&&CARDS.dardo.v.d===7&&CARDS.pallafuoco.v.d===9;
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);startCombat(['goblin'],'combat');ctx(ME);r.elmo=(g.hero.st.str|0)>=1;
    R=null;pickCls='mago';startSolo();ctx(ME);startCombat(['goblin'],'combat');ctx(ME);r.grimorio=g.hero.energy>=4;R=null;screen='title';render();
    return r});
  ok(v9.soloMalus&&v9.giorni&&v9.livello3&&v9.furiosi&&v9.umido,'sfida del giorno dal 19/11: solo malus e Livello di Assedio 3 '+JSON.stringify({m:v9.soloMalus,g:v9.giorni,l:v9.livello3,f:v9.furiosi,u:v9.umido}));
  ok(v9.tempo&&v9.fine,'bonus di tempo solo vincendo: +30% sotto 5 minuti, +15% fino a 10, +5% fino a 20; si vede a fine partita');
  ok(v9.mazzo&&v9.zoom&&v9.enc,'Luce e Ombra insieme: nel mazzo, nella carta ingrandita e nell\'enciclopedia '+JSON.stringify({m:v9.mazzo,z:v9.zoom,e:v9.enc}));
  ok(v9.elmo&&v9.grimorio,'Guerriero: l\'Elmo dà 1 Forza a inizio combattimento; Mago: il Grimorio dà anche 1 Energia nel primo turno');
  ok(v9.lite&&v9.pagina&&v9.pieno&&v9.eroi,'menu essenziale nelle Impostazioni (eroe e dungeon in una pagina a parte), menu completo di base; PV degli eroi ribilanciati '+JSON.stringify({l:v9.lite,p:v9.pagina,c:v9.pieno,e:v9.eroi}));

  {const sd=await page.evaluate(async()=>{const r={};const sb0=window.sbClient,st0=SET.stats;const rows=[];let primo=true;SET.stats=true;
      window.sbClient=()=>({from:()=>({insert:row=>{rows.push(JSON.parse(JSON.stringify(row)));const err=primo&&('durata' in row)?{code:'PGRST204',message:'colonna durata'}:null;primo=false;return Promise.resolve({error:err})}})});
      R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);R.tAcc=600000;R.tLast=Date.now();R.win=true;R.phase='end';
      statSend(run,run.stx||{},10);await new Promise(t=>setTimeout(t,50));r.prima=rows[0]&&rows[0].durata>=599&&rows[0].durata<=602;r.riprova=rows.length===2&&!('durata' in rows[1]);
      window.sbClient=sb0;SET.stats=st0;R=null;screen='title';render();return r});
    ok(sd.prima&&sd.riprova,'statistiche: a fine partita si manda anche la durata in secondi; se il database non ha ancora la colonna si riprova senza');}

  console.log('7m. Menu essenziale: descrizione, niente Impostazioni doppie, pulsante Novità con pallino rosso');
  const nv=await page.evaluate(async()=>{const r={};SET.tut=false;const m0=SET.menu;SET.menu=true;R=null;screen='title';modal=null;
    try{localStorage.setItem('valdombra-novita-viste','8.9')}catch(e){}render();
    r.descr=document.querySelector('.tlite .lede')&&document.querySelector('.tlite .lede').textContent.includes('Ignivora');
    r.noImp=![...document.querySelectorAll('.mtile')].some(x=>/Impostazioni/.test(x.textContent))&&document.body.classList.contains('mlite');
    const L=novitaList();r.lista=L.length>=20&&L[0].v===VERSION.replace(/^v/,'')&&L.every(x=>x.t&&x.t[0]===x.t[0].toUpperCase());
    const d=document.querySelector('#novbtn .novdot');r.pallino=!!d&&+d.textContent===L.filter(x=>vNum(x.v)>vNum('8.9')).length;
    openNovita();r.messaggi=document.querySelectorAll('.modal .novmsg').length===L.length&&document.querySelectorAll('.modal .novmsg.nuova').length===+d.textContent&&document.body.classList.contains('hasmodal');
    closeModal();render();r.letti=!document.querySelector('#novbtn .novdot')&&novitaNuove()===0;
    openSettings();r.impSenza=!document.querySelector('.modal').textContent.includes('Novità della');closeModal();
    SET.menu=false;render();openSettings();r.impCon=document.querySelector('.modal').textContent.includes('Novità della');closeModal();r.noBtn=!document.getElementById('novbtn')&&!document.getElementById('guidabtn');
    try{localStorage.removeItem('valdombra-novita-viste')}catch(e){}SET.menu=true;render();r.primaVolta=novitaNuove()===1;SET.menu=m0;render();return r});
  ok(nv.descr&&nv.noImp&&nv.lista&&nv.pallino&&nv.messaggi&&nv.letti&&nv.impSenza&&nv.impCon&&nv.noBtn&&nv.primaVolta,'menu essenziale: descrizione sotto il titolo, Impostazioni solo in alto a destra, Novità come messaggi con pallino rosso per quelle nuove (che sparisce dopo averle lette); col menu completo le Novità restano nelle Impostazioni '+JSON.stringify(nv));

  console.log('7n. Forme del Druido a inizio turno (Gufo: 2 carte in più; Orso: 2 Armatura)');
  const fo=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    const turno=async form=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='druido';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);
      startCombat(['orco'],'combat');ctx(ME);g.enemies[0].hp=g.enemies[0].max=999;g.enemies[0].intent={d:0};const h=g.hero;
      for(let i=0;i<10;i++)h.draw.push({id:'artiglio',up:false,uid:uid++});h.form=form;h.formed=1;h.hand=[];
      dispatch(ME,{t:'end'});let w=0;while(R.combat&&R.combat.busy&&w<400){await sleep(5);w++}ctx(ME);return {mano:g.hero.hand.length,blk:g.hero.blk}};
    const base=await turno(null),gufo=await turno('gufo'),orso=await turno('orso');
    r.gufo=gufo.mano===base.mano+2;r.orso=orso.blk>=base.blk+2;r.dett=[base,gufo,orso];R=null;screen='title';render();return r});
  {// controllo del codice: un commento // messo dopo del codice non deve lasciare altro codice sulla stessa riga (non verrebbe eseguito: è successo al Gufo nella 9.0)
    const src=require('fs').readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');const a0=src.indexOf('<script>'),b0=src.lastIndexOf('</script>');const off=src.slice(0,a0).split('\n').length-1;
    const spenti=[];src.slice(a0,b0).split('\n').forEach((l,i)=>{const m=l.match(/[;})\]]\s*\/\/(?!\/)(.*)$/);if(m&&/if\(|\)\{|=>\{|;\s*[A-Za-z_$][\w$.]*\(|\bconst |\blet |\breturn /.test(m[1]))spenti.push('riga '+(i+off+1)+': '+l.trim().slice(0,90))});
    ok(!spenti.length,'nel codice nessun commento // spegne il resto della riga'+(spenti.length?' — '+spenti.join(' | '):''));
    // carte con lo stesso nome interno: la seconda cancella la prima (v10.3: il Mago partiva con «Gelo nelle Ossa», il Monaco con la Raffica del Ranger)
    const ids={};[...src.matchAll(/^[ \t]*([a-z0-9]+):\{n:'[^']*',cl:'/gm)].forEach(m=>{ids[m[1]]=(ids[m[1]]||0)+1});const doppie=Object.keys(ids).filter(k=>ids[k]>1);
    ok(!doppie.length,'nessuna carta ha lo stesso nome interno di un\'altra (la seconda cancellerebbe la prima)'+(doppie.length?' — '+doppie.join(', '):''));
    const fuori=await page.evaluate(()=>Object.entries(CLASSES).flatMap(([k,c])=>c.deck.filter(id=>!CARDS[id]||(CARDS[id].cl&&CARDS[id].cl!==k)).map(id=>k+':'+id)));
    ok(!fuori.length,'il mazzo iniziale di ogni eroe ha solo carte sue (Raggio di Gelo per il Mago, Raffica di Pugni per il Monaco)'+(fuori.length?' — '+fuori.join(', '):''));}
  ok(fo.gufo&&fo.orso,'forme del Druido a inizio turno: il Gufo fa pescare 2 carte in più, l\'Orso dà 2 Armatura '+JSON.stringify(fo.dett));

  console.log('7o. Carta ingrandita in combattimento: anteprima delle due facce, si gioca solo dalla mano');
  {const c4=await browser.newContext({viewport:{width:1280,height:800}});await c4.route(/^https?:\/\//,r=>r.abort());const p4=await c4.newPage();const e4=[];p4.on('pageerror',e=>e4.push(e.message));await p4.goto(PAGE);await p4.waitForTimeout(300);
    await p4.evaluate(async()=>{SET.tut=false;SET.lo=true;SET.scena=false;SET.px=true;saveSet();applySet();SPEED=0;R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;UI.om=false;
      pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);startCombat(['orco'],'combat');ctx(ME);g.enemies.forEach(e=>{e.hp=e.max=200;e.intent={d:0}});g.hero.st.str=0;run.om=0;
      g.hero.hand=[{id:'colpo',up:false,uid:9001},{id:'possente',up:false,uid:9002},{id:'parata',up:false,uid:9003}];g.hero.energy=3;render();await new Promise(r=>setTimeout(r,250))});
    await p4.hover('.hand .card >> nth=1');await p4.waitForTimeout(350);
    const an=await p4.evaluate(()=>{const p=document.getElementById('cprev');return {aperta:!p.hidden,facce:p.querySelectorAll('.card.zoom').length,ombra:!!p.querySelector('.card.zoom.shadow'),cliccabili:p.querySelectorAll('.playable,.zplay').length,pe:getComputedStyle(p).pointerEvents}});
    // un clic sulla carta grande non gioca niente; la carta si gioca dalla mano
    const big=await p4.$('#cprev .card.zoom.shadow');const q=big?await big.boundingBox():null;if(q){await p4.mouse.click(q.x+q.width/2,q.y+q.height/2);await p4.waitForTimeout(300)}
    const dopo=await p4.evaluate(()=>{ctx(ME);return {mano:g.hero.hand.length,om:run.om,hp:g.enemies[0].hp}});
    await c4.close();
    ok(an.aperta&&an.facce===2&&an.ombra&&an.cliccabili===0&&an.pe==='none'&&dopo.mano===3&&dopo.om===0&&dopo.hp===200&&!e4.length,'in combattimento la carta ingrandita mostra anche la faccia Ombra ma non si gioca da lì (si gioca dalla mano) '+JSON.stringify({an,dopo}));}

  console.log('7p. In gruppo nella vista a scena i compagni stanno accanto al mio eroe');
  {const c6=await browser.newContext({viewport:{width:1280,height:860}});await c6.route(/^https?:\/\//,r=>r.abort());const p6=await c6.newPage();const e6=[];p6.on('pageerror',e=>e6.push(e.message));await p6.goto(PAGE);await p6.waitForTimeout(300);
    const al=await p6.evaluate(async()=>{const out={};SET.tut=false;SET.lo=true;const sc0=SET.scena;
      for(const [scena,n] of [[true,2],[true,4],[true,8],[false,2]]){SET.scena=scena;saveSet();applySet();SPEED=0;solo=false;isHost=true;ME='pA';myName='Prova';chan=null;modal=null;
        R=newLobby('ALLE');rng=new RNG(hashStr('ALLE'));R.players.pA.cls='necromante';
        [['pB','Pan','monaco'],['pC','Sara','chierico'],['pD','Luca','guerriero'],['pE','Giada','mago'],['pF','Marco','ladro'],['pG','Elena','druido'],['pH','Paolo','paladino']].slice(0,n-1).forEach(([id,nm,cl])=>{R.players[id]={pid:id,name:nm,cls:cl,ready:true};R.order.push(id)});
        online=new Set(R.order);startRunRoom(0,'ALLEATI');startCombat(['goblin'],'combat');ctx('pA');render();
        const me=document.getElementById('ent-h-pA').getBoundingClientRect(),hand=document.querySelector('.hand').getBoundingClientRect(),info=document.querySelector('#ent-h-pA .info').getBoundingClientRect();
        const al=[...document.querySelectorAll('.ent.ally')];const vicini=al.every(a=>{const q=a.getBoundingClientRect();return q.bottom<=me.top+4&&q.right>me.left-140&&q.left<me.right+140});
        out[(scena?'scena':'classica')+n]={nella:al.every(a=>!!a.closest('.herorow')),vicini,visibile:info.bottom<=hand.top+2,quanti:al.length}}
      SET.scena=sc0;saveSet();applySet();R=null;screen='title';render();return out});
    await c6.close();
    ok(['scena2','scena4','scena8'].every(k=>al[k].nella&&al[k].vicini&&al[k].visibile&&al[k].quanti===+k.slice(5)-1)&&!al.classica2.nella&&!e6.length,'vista a scena: i compagni (2, 4, 8 giocatori) stanno sopra il mio eroe nella sua colonna e il mio riquadro resta sopra le carte; nella vista classica restano dove erano '+JSON.stringify(al));}

  console.log('7q. Profilo: reimpostare la password');
  const pw=await page.evaluate(async()=>{const r={};const sleep=ms=>new Promise(t=>setTimeout(t,ms));const acc0=ACC,rpc0=window.accRpc;const chiamate=[];let modo='ok';
    window.accRpc=async(fn,args)=>{chiamate.push([fn,args]);if(fn==='profilo_leggi')return [{dati:{},rev:1}];if(fn==='profilo_password'){if(modo==='scaduto')throw new Error('credenziali');return [{token:'22222222-2222-4222-8222-222222222222'}]}return null};
    R=null;screen='title';ACC={nome:'prova',token:'11111111-1111-4111-8111-111111111111',rev:1};openProfilo();await sleep(30);render();
    r.form=!!document.getElementById('pwnuova')&&!!document.getElementById('pwripeti')&&document.querySelector('.modal').textContent.includes('Reimposta la password');
    UI.pw1='ab';UI.pw2='ab';await accNuovaPw();r.corta=/almeno 4/.test(UI.pwMsg)&&!chiamate.some(c=>c[0]==='profilo_password');
    UI.pw1='nuova1';UI.pw2='nuova2';await accNuovaPw();r.diverse=/non sono uguali/.test(UI.pwMsg);
    UI.pw1='nuova1';UI.pw2='nuova1';await accNuovaPw();const ch=chiamate.find(c=>c[0]==='profilo_password');
    r.cambia=!!ch&&ch[1].p_nome==='prova'&&ch[1].p_token==='11111111-1111-4111-8111-111111111111'&&ch[1].p_nuova==='nuova1'&&ACC.token==='22222222-2222-4222-8222-222222222222'&&UI.pwOk&&!UI.pw1;
    r.salvato=JSON.parse(localStorage.getItem(ACC_K)).token==='22222222-2222-4222-8222-222222222222';
    modo='scaduto';UI.pw1='altra1';UI.pw2='altra1';await accNuovaPw();r.scaduto=/scaduto/.test(UI.pwMsg)&&!UI.pwOk;
    // occhio sulle password: mostra e nasconde; riaprendo il Profilo torna nascosta
    const tipi=()=>[...document.querySelectorAll('.pwwrap input')].map(i=>i.type).join(',');openProfilo();await sleep(20);const t1=tipi();pwEye();const t2=tipi();closeModal();openProfilo();await sleep(20);const t3=tipi();
    r.occhio=t1==='password,password'&&t2==='text,text'&&t3==='password,password'&&document.querySelectorAll('.pweye').length===2;
    ACC=null;render();openProfilo();await sleep(20);r.occhioAccesso=tipi()==='password'&&!!document.querySelector('.pweye');closeModal();
    modal=null;ACC=acc0;accKeep();window.accRpc=rpc0;UI.pw1=UI.pw2=UI.pwMsg='';render();return r});
  ok(pw.occhio&&pw.occhioAccesso,'profilo: l\'occhio sui campi password mostra e nasconde quello che si scrive (anche per accedere); riaprendo torna nascosta');
  ok(pw.form&&pw.corta&&pw.diverse&&pw.cambia&&pw.salvato&&pw.scaduto,'profilo: si reimposta la password (controlli su lunghezza e ripetizione, il codice nuovo del dispositivo viene salvato, messaggio se il collegamento è scaduto) '+JSON.stringify(pw));

  console.log('7r. La chat del gruppo si chiude: niente sopra il pulsante «Chiudi»');
  {const res=[];for(const [nome,opt] of [['PC',{viewport:{width:1280,height:800}}],['telefono',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
      const c7=await browser.newContext(opt);await c7.route(/^https?:\/\//,r=>r.abort());const p7=await c7.newPage();await p7.goto(PAGE);await p7.waitForTimeout(300);
      for(const fase of ['stanza','combattimento']){const r=await p7.evaluate(async fase=>{SET.tut=false;SET.menu=true;saveSet();solo=false;isHost=true;ME='pA';myName='Prova';chan=null;modal=null;
          R=newLobby('CHAT');rng=new RNG(hashStr('CHAT'));R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);
          if(fase==='combattimento'){startRunRoom(0,'CHAT');startCombat(['goblin'],'combat');ctx('pA')}render();toggleChat(true);await new Promise(t=>setTimeout(t,80));
          const b=[...document.querySelectorAll('#chat .chead button')].find(x=>/Chiudi/.test(x.textContent));if(!b)return 'manca';const q=b.getBoundingClientRect();
          const sopra=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);const ok=!!sopra&&b.contains(sopra);toggleChat(false);SET.menu=false;saveSet();R=null;screen='title';render();return ok?'ok':'coperto da '+(sopra?sopra.id||sopra.className:'niente')},fase);
        res.push(nome+' '+fase+': '+r)}
      await c7.close()}
    ok(res.every(x=>x.endsWith(': ok')),'chat del gruppo: il pulsante «Chiudi» non è coperto da corone, gemme o versione ('+res.join(' | ')+')');}

  console.log('7s. Gruppo: voti (maggioranza subito, sorteggio solo col pareggio), chat senza ripetizioni, attesa della stanza');
  const gv=await page.evaluate(async()=>{const r={};SET.tut=false;SPEED=0;const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    const stanza=()=>{solo=false;isHost=true;ME='pA';myName='Manu';chan=null;modal=null;R=newLobby('VOTI');rng=new RNG(hashStr('VOTI'));
      [['pB','Pan','monaco'],['pC','Vas','guerriero'],['pD','Zak','ladro']].forEach(([id,nm,cl])=>{R.players[id]={pid:id,name:nm,cls:cl,ready:true};R.order.push(id)});
      online=new Set(R.order);startRunRoom(0,'VOTIGRUPPO');ctx('pA')};
    stanza();const n=availNodes();r.nodi=n.length;const A=n[0].y+','+n[0].x,B=n[1].y+','+n[1].x;
    // 3 contro 1, con due dei tre che per un attimo risultano scollegati: si va subito alla maggioranza
    online=new Set(['pA','pD']);R.votes={pA:A,pB:A,pC:A,pD:B};resolveVote();
    r.maggioranza=!R.voteAnim&&!!R.pos&&R.pos.y+','+R.pos.x===A&&!!R.lastVote&&/3 voti contro 1/.test(R.lastVote.txt);
    // 2 contro 2: sorteggio
    stanza();R.votes={pA:A,pB:A,pC:B,pD:B};resolveVote();r.pareggio=!!R.voteAnim&&R.voteAnim.tie&&R.voteAnim.opts.length===2;R.voteAnim=null;
    stanza();R.votes={pA:A,pB:A};render();{const c=document.querySelector('.mapsvg circle.vbadge'),tx=document.querySelector('.mapsvg .vbadge-t');const f=c&&getComputedStyle(c).fill,t=tx&&getComputedStyle(tx).fill;r.badge=f==='rgb(255, 210, 122)'&&t==='rgb(27, 20, 36)'&&tx.textContent==='2'}
    {solo=true;ME='solo';isHost=true;online=new Set(['solo']);R=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);SET.lo=true;R.phase='room';run.screen='rest';run.om=0;render();const senza=!document.querySelector('main').innerHTML.includes('Medita accanto al fuoco');run.om=5;render();r.medita=senza&&document.querySelector('main').innerHTML.includes('Medita accanto al fuoco');}
    // chat: un messaggio nuovo si mostra una volta sola, anche con tanti aggiornamenti
    stanza();const t0=window.toast;let quanti=0,testi=[];window.toast=m=>{quanti++;testi.push(m)};chatOpen=false;chatLastK=null;render();
    ACT.chat({text:'Oooooo'},R.players.pB,'pB');for(let i=0;i<6;i++){commit();render();await sleep(5)}
    const unaVolta=testi.filter(x=>/Oooooo/.test(x)).length;ACT.chat({text:'Secondo'},R.players.pC,'pC');render();render();
    r.chat=unaVolta===1&&testi.filter(x=>/Secondo/.test(x)).length===1&&!!document.querySelector('.chatbtn .dot');window.toast=t0;
    // chi entra aspetta fino a 40 secondi, con Annulla
    R=null;solo=false;screen='mp';UI.joining='ABCD';render();r.attesa=document.body.innerHTML.includes('fino a 40 secondi')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Annulla');
    UI.joining=null;solo=true;isHost=true;ME='solo';screen='title';render();return r});
  ok(gv.badge&&gv.medita,'mappa: il numero dei voti su ogni nodo si legge (cerchietto chiaro, numero scuro); al Falò «Medita» c\'è solo se hai Ombra '+JSON.stringify({b:gv.badge,m:gv.medita}));
  ok(gv.nodi>=2&&gv.maggioranza&&gv.pareggio,'voti in gruppo: con la maggioranza si parte subito (contano anche i voti di chi è un attimo scollegato), il sorteggio c\'è solo col pareggio '+JSON.stringify(gv));
  ok(gv.chat,'chat del gruppo: ogni messaggio nuovo compare una volta sola nel riquadro in basso, non a ogni aggiornamento');
  ok(gv.attesa,'entrando in una stanza si aspetta fino a 40 secondi chi l\'ha creata, con il pulsante Annulla');

  console.log('7t. Intenzione del nemico: tutto dentro il riquadro, anche il bersaglio');
  {const res=[];for(const [nome,opt] of [['PC',{viewport:{width:1280,height:860}}],['telefono',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
      const c8=await browser.newContext(opt);await c8.route(/^https?:\/\//,r=>r.abort());const p8=await c8.newPage();await p8.goto(PAGE);await p8.waitForTimeout(300);
      for(const sc of [false,true]){const r=await p8.evaluate(async sc=>{SET.tut=false;SET.scena=sc;SET.lo=true;saveSet();applySet();solo=false;isHost=true;ME='pA';myName='Manu';chan=null;modal=null;R=newLobby('INTE');rng=new RNG(1);
          R.players.pB={pid:'pB',name:'PanDoris',cls:'monaco',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'INTE');startCombat(['goblin','scheletro'],'combat');ctx('pA');
          g.enemies[0].intent={d:6,deb:'weak',tg:'pB'};g.enemies[1].intent={d:9,s:2,deb:'vuln',tg:'pB'};render();await new Promise(t=>setTimeout(t,120));
          const bad=[];document.querySelectorAll('.ent.enemy .intent').forEach((it,i)=>{const q=it.getBoundingClientRect();[...it.children].forEach(c=>{const k=c.getBoundingClientRect();if(k.left<q.left-1||k.right>q.right+1||k.top<q.top-1||k.bottom>q.bottom+1)bad.push(i+':'+c.className)})});
          SET.scena=false;saveSet();applySet();R=null;solo=true;isHost=true;ME='solo';screen='title';render();return bad},sc);
        res.push(nome+(sc?' scena':'')+': '+(r.length?'fuori '+r.join(','):'ok'))}
      await c8.close()}
    ok(res.every(x=>x.endsWith(': ok')),'intenzione del nemico: attacco, effetto e bersaglio («→ nome») stanno dentro il riquadro ('+res.join(' | ')+')');}

  console.log('7u. Fine partita e stanza in gruppo: corone e gemme non coprono i pulsanti');
  {const res=[];for(const [nome,opt] of [['PC',{viewport:{width:1280,height:800}}],['telefono',{viewport:{width:390,height:844},isMobile:true,hasTouch:true}]]){
      const c9=await browser.newContext(opt);await c9.route(/^https?:\/\//,r=>r.abort());const p9=await c9.newPage();await p9.goto(PAGE);await p9.waitForTimeout(300);
      for(const fase of ['fine','stanza']){const r=await p9.evaluate(async fase=>{SET.tut=false;saveSet();solo=false;isHost=true;ME='pA';myName='Manu';chan=null;modal=null;R=newLobby('VDG6');rng=new RNG(1);
          [['pB','Pan','monaco'],['pC','Vas','guerriero'],['pD','Zak','ladro']].forEach(([id,nm,cl])=>{R.players[id]={pid:id,name:nm,cls:cl,ready:true};R.order.push(id)});online=new Set(R.order);
          if(fase==='fine'){startRunRoom(0,'FINE');endRun(true)}ctx('pA');render();await new Promise(t=>setTimeout(t,100));
          const cop=[];document.querySelectorAll('header.hud .btn, main .row .btn').forEach(bt=>{const q=bt.getBoundingClientRect();if(!q.width||q.bottom<0||q.top>innerHeight)return;const e=document.elementFromPoint(q.left+q.width/2,q.top+q.height/2);if(e&&!bt.contains(e)&&!e.contains(bt))cop.push(bt.textContent.trim().slice(0,10))});
          const cb=document.querySelector('.crownbadge');const r={cop,badge:!!cb};R=null;solo=true;isHost=true;ME='solo';screen='title';render();return r},fase);
        res.push(nome+' '+fase+': '+(r.badge?'':'senza corone ')+(r.cop.length?'coperti '+r.cop.join(','):'ok'))}
      await c9.close()}
    ok(res.every(x=>x.endsWith(': ok')),'in gruppo (fine partita e stanza) corone e gemme ci sono e non coprono Chat, Menu o altri pulsanti ('+res.join(' | ')+')');}

  console.log('7v. Consigli: ognuno compare nella sua situazione, indica un elemento che si vede e non lo copre; Monaco, Corone e abitanti della 10.3');
  {const cv=await browser.newContext({viewport:{width:1280,height:860}});await cv.route(/^https?:\/\//,r=>r.abort());const pv=await cv.newPage();const ev=[];pv.on('pageerror',e=>ev.push(e.message));await pv.goto(PAGE);await pv.waitForTimeout(400);
    const male=[];for(const id of await pv.evaluate(()=>TUT.map(t=>t.id))){
      const r=await pv.evaluate(async id=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));SET.tut=true;SET.menu=id==='menu';SET.lo=true;SET.anim=false;saveSet();applySet();SPEED=0;modal=null;
        store(TUT_K,JSON.stringify(TUT.filter(t=>t.id!==id).map(t=>t.id)));const st=getStats();st.runs=Math.max(1,st.runs|0);store(STAT_K,JSON.stringify(st));
        const gioca=(mode,kind,ids)=>{R=null;solo=true;pickCls='guerriero';pickDg='rocca';pickMode=mode||'normal';pickLvl=0;startSolo();ctx(ME);if(kind){startCombat(ids,kind);ctx(ME)}};
        if(id==='start'||id==='villaggio'||id==='menu'){R=null;screen='title'}else if(id==='mappa'){gioca();R.phase='map'}
        else if(['energia','carte','intenti','armatura','fineturno'].includes(id))gioca('normal','combat',['goblin']);else if(id==='ombra'){gioca('normal','combat',['goblin']);g.turn=2}
        else if(id==='segnali'){solo=false;isHost=true;ME='pA';chan=null;R=newLobby('TUTO');rng=new RNG(hashStr('TUTO'));R.players.pA.cls='guerriero';R.players.pB={pid:'pB',name:'Amico',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'TUTO1');startCombat(['goblin'],'combat');ctx('pA')}
        else if(id==='amicilobby'){solo=false;isHost=true;ME='pA';chan=null;R=newLobby('TUTA');rng=new RNG(1);online=new Set(['pA'])}
        else if(id==='elite')gioca('normal','elite',['orco']);else if(id==='boss')gioca('normal','boss',[bossId()]);else if(id==='cancello')gioca('porta');
        else if(id==='ricompensa'){gioca('normal','combat',['ratto']);g.enemies.forEach(e=>hurtEnemy(e,99999));checkEnd();await sleep(900);ctx(ME)}
        else if(id==='retrovie'){gioca('porta');R.phase='room';run.screen='rest'}else if(id==='falo'){gioca();R.phase='room';run.screen='rest';run.om=3}
        else if(id==='negozio'){gioca();R.phase='room';run.screen='shop';genShop()}else if(id==='finepartita'){gioca();R.phase='end';R.win=true}
        render();await sleep(200);render();const t=TUT.find(x=>x.id===id),box=document.querySelector('.tutbox'),el=document.querySelector(t.sel.split(',')[0]);
        let vis=false,copre=false;if(el){const q=el.getBoundingClientRect();vis=q.width>0&&q.bottom>0&&q.top<innerHeight;if(box){const c=box.getBoundingClientRect();copre=!(q.right<=c.left||q.left>=c.right||q.bottom<=c.top||q.top>=c.bottom)}}
        const out={id,ok:!!box&&box.dataset.id===id&&vis&&(!copre||id==='negozio')};R=null;solo=true;ME='solo';screen='title';SET.menu=false;saveSet();render();return out},id);
      if(!r.ok)male.push(r.id)}
    ok(!male.length,'consigli: tutti compaiono nella loro situazione e indicano un elemento visibile senza coprirlo'+(male.length?' — non vanno: '+male.join(', '):''));
    const v=await pv.evaluate(()=>({el:ELEM_V.terra===2&&ELEM_V.aria===2&&ELEM_V.acqua===1&&ELEM_V.fuoco===2&&ROSARIO_B===2&&/2 Armatura/.test(RELICS.rosario.d)&&/2 Armatura/.test(ELEMS.terra[1]),
      cr:DUNGEONS.rocca.crowns===40&&DUNGEONS.cripte.crowns===55&&DUNGEONS.abisso.crowns===70&&CR_LVL===10&&MISS_CR===10&&PORTA_CR===2&&ACH.find(a=>a.id&&/Prima vittoria/.test(a.n)).cr===15}));
    ok(v.el,'Monaco (v10.3): Terra 2 Armatura, Aria 2 danni, Acqua 1 PV, Fuoco 2 Bruciatura; Rosario di Giada 2 Armatura');
    ok(v.cr,'Corone circa dimezzate (v10.3): vittoria 40/55/70 +10 per livello, missioni 10, cancello 2 per abitante, Imprese a metà');
    ok(!ev.length,'consigli: nessun errore nella pagina '+ev.slice(0,2).join(' | '));await cv.close()}

  console.log('7w. Amici (v10.4): lista, richieste, codice amico, chi è in gioco, inviti nella stanza (database simulato)');
  {const cw=await browser.newContext({viewport:{width:1280,height:860}});await cw.route(/^https?:\/\//,r=>r.abort());const pw=await cw.newPage();const ew=[];pw.on('pageerror',e=>ew.push(e.message));await pw.goto(PAGE);await pw.waitForTimeout(400);
    const am=await pw.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));SET.tut=false;saveSet();const r={},rpc0=window.accRpc,join0=window.joinRoom;
      const db={lista:[{nome:'pandoris',stato:'amici'},{nome:'sara',stato:'amici'},{nome:'luca',stato:'ricevuta'},{nome:'giada',stato:'inviata'},{nome:'troll',stato:'bloccato'}],ch:[],inviati:[]};
      window.accRpc=async(fn,a)=>{db.ch.push(fn);if(fn==='amici_lista')return db.lista;if(fn==='amici_codice')return a.p_nuovo?'NUOVO2':'K7PX2M';if(fn==='amici_richiedi')return a.p_altro==='nessuno'?'non_trovato':'inviata';
        if(fn==='amici_rispondi'){db.lista=db.lista.map(x=>x.nome===a.p_altro?{nome:x.nome,stato:a.p_si?'amici':'x'}:x);return a.p_si?'amici':'rifiutata'}if(fn==='amici_usa_codice')return [{nome:'marco',esito:'amici'}];if(fn==='amici_togli'){db.lista=db.lista.filter(x=>x.nome!==a.p_altro);return 'tolto'}return null};
      ACC=null;R=null;screen='title';openAmici();r.senzaProfilo=document.querySelector('.modal').textContent.includes('Gli amici sono legati al profilo');closeModal();
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};AMI.lista=null;AMI.codice='';AMI.ch={send:x=>db.inviati.push(x.payload),unsubscribe(){}};AMI.chK=amH('manu');AMI.on=new Set([amH('pandoris')]);
      await amiciCarica();render();r.pallino=!!document.querySelector('main .novdot');
      openAmici();await sleep(30);const M=()=>document.querySelector('.modal');
      r.sezioni=['Vogliono essere tuoi amici','I tuoi amici (2)','Il tuo codice amico','Aggiungi un amico','Richieste che hai mandato','Profili bloccati'].every(t=>M().textContent.includes(t));
      r.verde=M().querySelectorAll('.amdot.on').length===1&&M().querySelector('.amcode').textContent==='K7PX2M';
      UI.amN='nessuno';await amRichiedi();r.nonTrovato=AMI.msg==='Nessun profilo con questo nome.';UI.amN=' Giada2 ';await amRichiedi();r.inviata=AMI.msg==='Richiesta inviata a giada2.'&&!UI.amN;
      await amRispondi('luca',true);r.accetta=amAmici().length===3&&AMI.msg.includes('luca');UI.amC='abc-12';await amUsaCodice();r.corto=/6 caratteri/.test(AMI.msg);UI.amC='abc-123';await amUsaCodice();r.codice=AMI.msg.includes('marco');
      const n0=db.ch.filter(x=>x==='amici_togli').length;amTogli('sara');r.conferma=!!M().querySelector('.btn.danger')&&db.ch.filter(x=>x==='amici_togli').length===n0;await amTogli('sara');r.tolto=!amAmici().some(x=>x.nome==='sara');
      closeModal();solo=false;isHost=true;ME='pA';myName='Manu';chan=null;R=newLobby('QWER');rng=new RNG(1);online=new Set(['pA']);render();
      const lb=document.querySelector('.amlob');r.stanza=!!lb&&[...lb.querySelectorAll('button')].some(b=>b.textContent.trim()==='Invita');
      amiciInvita('pandoris');render();const pl=db.inviati[0]||{};r.invito=pl.a===amH('pandoris')&&pl.da==='manu'&&pl.c==='QWER'&&document.querySelector('.amlob').textContent.includes('Invitato ✓');
      R=null;solo=true;screen='title';render();amiciInvitoArrivato({a:amH('manu'),da:'sconosciuto',c:'HJKL'});amiciInvitoArrivato({a:amH('altro'),da:'pandoris',c:'HJKL'});render();r.filtro=!document.querySelector('.invbox');
      amiciInvitoArrivato({a:amH('manu'),da:'pandoris',c:'ZXCV'});render();const bx=document.querySelector('.invbox');r.banner=!!bx&&bx.textContent.includes('pandoris')&&bx.textContent.includes('ZXCV');
      let entrato=null;window.joinRoom=c=>{entrato=c};amEntra('ZXCV');render();r.entra=entrato==='ZXCV'&&!document.querySelector('.invbox');window.joinRoom=join0;
      solo=false;isHost=true;ME='pA';R=newLobby('PPPP');rng=new RNG(hashStr('PPPP'));online=new Set(['pA']);startRunRoom(0,'PPPP1');amiciInvitoArrivato({a:amH('manu'),da:'pandoris',c:'TTTT'});render();r.inPartita=!!document.querySelector('.invbox')&&!document.querySelector('.invbox .btn.primary');amDopo('TTTT');render();r.dopo=!document.querySelector('.invbox');
      R=null;solo=true;ME='solo';accLogout();r.uscita=AMI.lista===null&&!AMI.ch&&!AMI.inviti.length;window.accRpc=rpc0;ACC=null;modal=null;screen='title';render();return r});
    ok(am.senzaProfilo&&am.pallino&&am.sezioni&&am.verde,'amici: senza profilo invita ad accedere; con il profilo pallino delle richieste, tutte le sezioni, chi è in gioco col pallino verde, codice amico '+JSON.stringify(am));
    ok(am.nonTrovato&&am.inviata&&am.accetta&&am.corto&&am.codice&&am.conferma&&am.tolto,'amici: richiesta per nome (anche con maiuscole e spazi), accetta, codice amico, «Togli» chiede conferma');
    ok(am.stanza&&am.invito&&am.filtro&&am.banner&&am.entra&&am.inPartita&&am.dopo&&am.uscita,'amici: «Invita» nella stanza manda il codice solo a quell\'amico; si accettano inviti solo dagli amici; «Entra» porta nella stanza; durante una partita solo «Più tardi»; uscendo dal profilo si azzera tutto');
    ok(!ew.length,'amici: nessun errore nella pagina '+ew.slice(0,2).join(' | '));await cw.close()}

  console.log('7x. Mappa (v10.5): bonus mai uguali di fila né tre di fila, più rari coi livelli; prima del boss falò, a caso o élite; falò al 15% dal livello 3; riepilogo dei percorsi');
  {const cx=await browser.newContext({viewport:{width:1280,height:860}});await cx.route(/^https?:\/\//,r=>r.abort());const px=await cx.newPage();const ex=[];px.on('pageerror',e=>ex.push(e.message));await px.goto(PAGE);await px.waitForTimeout(400);
    const mp=await px.evaluate(()=>{const r={},BON=['rest','event','treasure'],tot={};let ugual=0,fila3=0;const pre={};
      for(let L=0;L<=5;L++){tot[L]=0;pre[L]=new Set();for(let i=0;i<120;i++){const m=genMap(new RNG(hashStr('P'+i+'#map')),L),fila=new Map();
        for(let y=0;y<ROWS;y++)m[y].forEach(n=>{if(!n)return;if(n.type==='rest'||n.type==='event')tot[L]++;const par=y?m[y-1].filter(q=>q&&q.next.includes(n.x)):[],fx=y===8||(y===ROWS-1&&L<4);
          if(!fx&&BON.includes(n.type)&&par.some(q=>q.type===n.type))ugual++;const f=BON.includes(n.type)?1+Math.max(0,...par.map(q=>fila.get(q)||0)):0;fila.set(n,f);if(f>2&&!fx)fila3++;if(y===ROWS-1)pre[L].add(n.type)})}}
      r.regole=ugual===0&&fila3===0;r.rari=tot[0]>tot[2]&&tot[2]>tot[3]&&tot[3]>tot[5];
      const s=L=>[...pre[L]].sort().join(',');r.primaBoss=s(0)==='rest'&&s(3)==='rest'&&!pre[4].has('rest')&&pre[4].size>1&&s(5)==='elite';r.dett={ugual,fila3,tot,pre:[0,3,4,5].map(L=>L+':'+s(L))};
      const P={vb:{}},E={vb:{erbe:2}};const pc=L=>{R={mode:'norm',lvl:L};return [restPct(P),restPct(E)].join('/')};r.cura=pc(0)==='0.3/0.4'&&pc(2)==='0.3/0.4'&&pc(3)==='0.15/0.2'&&pc(5)==='0.15/0.2';R={mode:'porta',lvl:0};r.curaCancello=restPct(P)===.3;R=null;
      r.desc=/15%/.test(lvlDesc(3))&&/niente falò/.test(lvlDesc(4))&&/solo élite/.test(lvlDesc(5))&&!/15%/.test(lvlDesc(2));
      return r});
    ok(mp.regole&&mp.rari,'mappa: falò, eventi e tesori mai uguali di fila né tre bonus di fila; falò ed eventi più rari salendo di livello '+JSON.stringify(mp.dett));
    ok(mp.primaBoss&&mp.cura&&mp.curaCancello&&mp.desc,'prima del boss: falò fino al livello 3, a caso senza falò al 4, solo élite al 5; falò al 15% (20% con le Erbe) dal livello 3, non nel cancello; descrizioni dei livelli aggiornate');
    const rp=await px.evaluate(async()=>{SET.tut=false;saveSet();const r={};R=null;solo=true;pickCls='guerriero';pickDg='rocca';pickMode='normal';pickLvl=0;startSolo();ctx(ME);R.phase='map';
      const strada=x0=>{const out=[];let y=0,x=x0;while(y<ROWS){const n=R.map[y][x];if(!n)break;out.push([y,x]);if(!n.next.length)break;x=n.next[0];y++}return out};
      const xs=R.map[0].map((n,i)=>n?i:-1).filter(i=>i>=0);R.plans={[ME]:strada(xs[0])};render();const c=planConta(R.plans[ME]);const tot=Object.values(c).reduce((a,b)=>a+b,0);
      const t=(document.querySelector('.planriep')||{}).textContent||'';r.solo=tot===R.plans[ME].length&&/Lungo il percorso/.test(t)&&(!c.rest||/falò/.test(t))&&(!c.elite||/élite/.test(t));
      solo=false;isHost=true;ME='pA';myName='Manu';chan=null;R=newLobby('MAPP');rng=new RNG(1);R.players.pA.name='Manu';R.players.pB={pid:'pB',name:'PanDoris',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'MAPPA1');ctx('pA');
      const ys=R.map[0].map((n,i)=>n?i:-1).filter(i=>i>=0);R.plans={pA:strada(ys[0]),pB:strada(ys[ys.length-1])};render();const righe=[...document.querySelectorAll('.planriep .priep')].map(d=>d.textContent);
      r.gruppo=righe.length===2&&righe[0].startsWith('Manu:')&&righe[1].startsWith('PanDoris:')&&document.querySelectorAll('.planriep .priep img').length>=4;
      R.plans={};render();r.vuoto=!document.querySelector('.planriep');R=null;solo=true;ME='solo';screen='title';render();return r});
    ok(rp.solo&&rp.gruppo&&rp.vuoto,'riepilogo del percorso: da solo «Lungo il percorso: 8 combattimenti · 1 falò…», in gruppo una riga per giocatore con nome, numeri e icone; sparisce senza percorsi');
    ok(!ex.length,'mappa e riepilogo: nessun errore nella pagina '+ex.slice(0,2).join(' | '));await cx.close()}

  console.log('7y. Esperienza degli eroi (v10.6): almeno 30 vittorie per il livello massimo');
  {const xp=await page.evaluate(()=>{const r={},R0=R;const g=(o)=>{R={mode:'norm',floor:16,win:true,lvl:0,players:{[ME]:{kills:25}},...o};const n=xpGain();return n};
    r.vittoria=g({});r.alta=g({lvl:5,players:{[ME]:{kills:60}}});r.persa=g({win:false,floor:8,players:{[ME]:{kills:12}}});r.zero=g({win:false,floor:0,players:{[ME]:{kills:0}}});
    r.surv=(()=>{R={mode:'surv',floor:5,cycle:3,win:false,lvl:0,players:{[ME]:{kills:200}}};return xpGain()})();R=R0;
    r.trenta=Math.ceil(XP_LV[MAXHLV]/XP_MAX)>=30;return r});
    ok(xp.vittoria<=90&&xp.vittoria>=80&&xp.alta===90&&xp.persa===36&&xp.zero===5&&xp.surv<=90&&xp.trenta,'esperienza: una vittoria normale ~'+xp.vittoria+' PE, mai più di 90 a partita (anche al livello 5 e in Sopravvivenza), una sconfitta al piano 8 ne dà '+xp.persa+': servono almeno 30 partite per il livello 10 '+JSON.stringify(xp))}

  console.log('7z. Ombra visibile (v10.7): nella barra in alto e nelle stanze (mercante, falò, eventi, tesori, strade segrete)');
  {const om=await page.evaluate(()=>{const r={};SET.tut=false;SET.lo=true;saveSet();R=null;solo=true;pickCls='guerriero';pickDg='rocca';pickMode='normal';pickLvl=0;startSolo();ctx(ME);run.om=4;
      R.phase='map';render();const h=document.querySelector('.hud .om-t');r.hud=!!h&&/4\/10/.test(h.textContent);
      const st={};for(const sc of ['shop','event','rest','treasure','spento']){R.phase='room';run.screen=sc;if(sc==='shop')genShop();if(sc==='event')run.event={id:EVENTS[0].id,result:null};if(sc==='treasure')run.treasure={gold:30,relic:null};render();const q=document.querySelector('main .omriga');st[sc]=!!q&&/Ombra 4\/10/.test(q.textContent)}
      r.stanze=Object.values(st).every(Boolean);r.dett=st;run.screen='reward';run.reward={title:'Vittoria!',gold:5,cards:null};render();r.ricompensa=!document.querySelector('main .omriga');
      SET.lo=false;R.lo=false;run.screen='rest';render();r.spento=!document.querySelector('main .omriga')&&!document.querySelector('.hud .om-t');SET.lo=true;saveSet();R=null;screen='title';render();return r});
    ok(om.hud&&om.stanze&&om.ricompensa&&om.spento,'Ombra: si vede nella barra in alto e con la sua barra al Mercante, al Falò, negli eventi e nei tesori; non nella ricompensa né senza Luce e Ombra '+JSON.stringify(om))}

  console.log('7aa. Gilda (v10.8): cerca, entra, crea (150 Corone), ruoli, posti con le Gemme, inviti dai compagni (database simulato)');
  {const cg=await browser.newContext({viewport:{width:1280,height:860}});await cg.route(/^https?:\/\//,r=>r.abort());const pg=await cg.newPage();const eg=[];pg.on('pageerror',e=>eg.push(e.message));await pg.goto(PAGE);await pg.waitForTimeout(400);
    const gl=await pg.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));SET.tut=false;saveSet();const r={},rpc0=window.accRpc,c0=getCrowns(),g0=getGems();
      const DB={mia:{gilda:null,richieste_mie:[{id:7,nome:"L'Ordine"}]},ch:[]};
      window.accRpc=async(fn,a)=>{DB.ch.push(fn+':'+JSON.stringify(a));if(fn==='gilda_mia')return DB.mia;if(fn==='gilda_cerca')return [{id:3,nome:'Lupi',descrizione:'',aperta:true,membri:12,posti:15,livello:3},{id:7,nome:"L'Ordine",descrizione:'',aperta:false,membri:4,posti:15,livello:1},{id:8,nome:'Piena',descrizione:'',aperta:true,membri:15,posti:15,livello:2}];
        if(fn==='gilda_crea')return [{id:11,esito:a.p_gilda==='Usata'?'nome_usato':'creata'}];if(fn==='gilda_entra')return a.p_gilda==3?'entrato':'richiesta_inviata';if(fn==='gilda_posto')return [{posti:16,esito:'fatto'}];if(fn==='amici_lista')return [];if(fn==='amici_codice')return 'K7PX2M';return 'fatto'};
      ACC=null;openGilda();r.senzaProfilo=document.querySelector('.modal').textContent.includes('La gilda è legata al profilo');closeModal();
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};AMI.lista=[];GIL.dati=null;GIL.cerca=null;R=null;screen='title';openGilda();await sleep(60);const M=()=>document.querySelector('.modal');
      r.cerca=M().querySelectorAll('.gilrow').length===3&&M().textContent.includes('Chiedi di entrare')&&M().textContent.includes('Piena')&&!!M().querySelector('button[onclick="gilEntra(7)"]');
      setCrowns(200);UI.gilN='Usata';await gilCrea();r.rimborso=getCrowns()===200&&/già una gilda/.test(GIL.msg);UI.gilN='Nuova';await gilCrea();r.crea=getCrowns()===50&&/Nuova/.test(GIL.msg);
      setCrowns(100);UI.gilN='Altra';const nCrea=()=>DB.ch.filter(x=>x.startsWith('gilda_crea')).length,n0=nCrea();await gilCrea();r.poche=getCrowns()===100&&nCrea()===n0&&/servono 150 Corone/.test(GIL.msg);
      await gilEntra(7);r.richiesta=/aspetta/.test(GIL.msg);
      DB.mia={gilda:{id:3,nome:'Lupi',descrizione:'',aperta:false,posti:15,livello:3,pe:0,codice:'QW3RTY'},io:{ruolo:'capo',pe:0},membri:[{nome:'manu',ruolo:'capo',pe:0},{nome:'pandoris',ruolo:'vice',pe:0},{nome:'sara',ruolo:'membro',pe:0}],richieste:[{nome:'giada'}]};
      await gilCarica();render();r.capo=['Chiedono di entrare',"Codice d'invito",'Impostazioni','Membri (3/15)'].every(t=>M().textContent.includes(t))&&gilRicN()===1;
      setGems(4);await gilPosto();r.gemmePoche=getGems()===4&&/5 Gemme/.test(GIL.msg);setGems(10);gilPosto();r.conferma=!!M().querySelector('.btn.danger');await gilPosto();r.posto=getGems()===5;
      const k0=DB.ch.filter(x=>x.startsWith('gilda_caccia')).length;gilCaccia('sara');r.cacciaConferma=DB.ch.filter(x=>x.startsWith('gilda_caccia')).length===k0&&!!M().querySelector('.btn.danger');GIL.conf=null;
      DB.mia.io={ruolo:'membro',pe:0};DB.mia.gilda.codice=null;DB.mia.richieste=[];await gilCarica();render();r.membro=!M().textContent.includes('Impostazioni')&&!M().textContent.includes("Codice d'invito")&&!M().querySelector('button[onclick^="gilCaccia"]');
      closeModal();solo=false;isHost=true;ME='pA';myName='Manu';chan=null;R=newLobby('GILD');rng=new RNG(1);online=new Set(['pA']);AMI.on=new Set([amH('sara')]);AMI.ch={send(){},unsubscribe(){}};render();
      r.stanza=[...document.querySelectorAll('.amlob .amrow')].some(x=>/sara/.test(x.textContent)&&/gilda/.test(x.textContent)&&/Invita/.test(x.textContent));
      R=null;solo=true;ME='solo';screen='title';render();amiciInvitoArrivato({a:amH('manu'),da:'sara',c:'ZZZZ'});render();r.invito=!!document.querySelector('.invbox');AMI.inviti=[];
      accLogout();r.uscita=GIL.dati===null;window.accRpc=rpc0;ACC=null;setCrowns(c0);setGems(g0);modal=null;render();return r});
    ok(gl.senzaProfilo&&gl.cerca&&gl.rimborso&&gl.crea&&gl.poche&&gl.richiesta,'gilda: senza profilo invita ad accedere; ricerca con Entra / Chiedi di entrare / Piena; crearla costa 150 Corone, restituite se il nome è già usato '+JSON.stringify(gl));
    ok(gl.capo&&gl.gemmePoche&&gl.conferma&&gl.posto&&gl.cacciaConferma&&gl.membro,'gilda: il capo vede richieste, codice e impostazioni; un posto in più costa 5 Gemme e chiede conferma; «Allontana» chiede conferma; il membro semplice non vede codice né impostazioni');
    ok(gl.stanza&&gl.invito&&gl.uscita,'gilda: nella stanza i compagni di gilda in gioco si invitano; i loro inviti si accettano; uscendo dal profilo si azzera');
    ok(!eg.length,'gilda: nessun errore nella pagina '+eg.slice(0,2).join(' | '));await cg.close()}

  console.log('7ab. Gilda (v10.9): settimana, livelli, premi da ritirare, partita mandata alla gilda una volta, bonus, titoli e aspetti (database simulato)');
  {const ch=await browser.newContext({viewport:{width:1280,height:860}});await ch.route(/^https?:\/\//,r=>r.abort());const ph=await ch.newPage();const eh=[];ph.on('pageerror',e=>eh.push(e.message));await ph.goto(PAGE);await ph.waitForTimeout(400);
    const gv=await ph.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));SET.tut=false;saveSet();const r={},rpc0=window.accRpc,c0=getCrowns(),g0=getGems(),sk0=load(SKO_K);
      const DB={ch:[],premi:[{id:1,corone:15,gemme:0,motivo:'missione:elite'},{id:2,corone:40,gemme:2,motivo:'boss:drago'}],lv:6,pe:1100};
      const mia=()=>({gilda:{id:3,nome:'Lupi',descrizione:'',aperta:true,posti:15,livello:DB.lv,pe:9200,codice:'QW3RTY'},io:{ruolo:'capo',pe:DB.pe},membri:[{nome:'manu',ruolo:'capo',pe:DB.pe},{nome:'sara',ruolo:'membro',pe:250}],richieste:[],
        settimana:{inizio:'2026-11-16',fine:'2026-11-22',missioni:[{tipo:'elite',obiettivo:26,progresso:26,fatta:'x'},{tipo:'vittorie',obiettivo:8,progresso:5,fatta:null},{tipo:'abitanti',obiettivo:156,progresso:40,fatta:null}],boss:{boss:'drago',vita:2250,danni:1300,sconfitto:null},io:{partite:6,boss:420,missioni:{elite:9}},migliori:[{nome:'manu',boss:420,partite:6}]},premi:DB.premi});
      window.accRpc=async(fn,a)=>{DB.ch.push(fn+':'+JSON.stringify(a));if(fn==='gilda_mia')return mia();if(fn==='gilda_ritira'){const c=DB.premi.reduce((s,x)=>s+x.corone,0),g=DB.premi.reduce((s,x)=>s+x.gemme,0),n=DB.premi.length;DB.premi=[];return [{corone:c,gemme:g,premi:n}]}
        if(fn==='gilda_partita')return {esito:'contata',pe:45,punti_boss:160,missioni_completate:['vittorie'],gilda:{livello:6,pe:9245}};if(fn==='amici_lista')return [];if(fn==='amici_codice')return 'K7PX2M';return 'fatto'};
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};AMI.lista=[];R=null;screen='title';setCrowns(10);setGems(1);store(SKO_K,'[]');try{localStorage.removeItem(GIL_CODA);localStorage.removeItem(GIL_FATTE)}catch(e){}
      await gilCarica();r.stendardo=skOwned().filter(x=>/@stendardo$/.test(x)).length===10&&!skOwned().some(x=>/@leggenda$/.test(x));r.pallino=gilAvvN()===2;
      openGilda();await sleep(60);const M=()=>document.querySelector('.modal');
      r.sezioni=['Premi da ritirare','La settimana della gilda','Sconfiggete 26 élite','Vincete 8 partite','Ignivora della gilda','950 punti di vita su 2250','Livello 6 della gilda','Il tuo livello nella gilda: 5 · Cavaliere'].every(x=>M().textContent.includes(x));
      r.titoli=[...M().querySelectorAll('.amrow .badge')].some(x=>x.textContent==='Recluta');
      await gilRitira();r.ritira=getCrowns()===65&&getGems()===3&&DB.premi.length===0&&!M().textContent.includes('Premi da ritirare');closeModal();
      DB.lv=10;DB.pe=5000;await gilCarica();r.leggenda=skOwned().filter(x=>/@leggenda$/.test(x)).length===10;
      R=null;solo=true;pickCls='guerriero';pickDg='rocca';pickMode='normal';pickLvl=0;startSolo();ctx(ME);r.bonus=run.gilOro===.1&&run.max===91&&run.potions.length===2&&run.relics.length===2&&/gilda/.test(run.vApplied);
      const tk=todayKey;todayKey=()=>'20261121';try{localStorage.removeItem(DAILY_K)}catch(e){}startDaily();ctx(ME);r.giorno=!run.gilOro&&!/gilda/.test(run.vApplied||'');todayKey=tk;
      R=null;solo=true;startSolo();ctx(ME);R.phase='end';R.win=true;render();await sleep(150);render();const n1=DB.ch.filter(x=>x.startsWith('gilda_partita')).length;render();await sleep(60);
      r.fine=n1===1&&DB.ch.filter(x=>x.startsWith('gilda_partita')).length===1&&/\+45 PE/.test(document.querySelector('main').textContent)&&/perde 160 punti/.test(document.querySelector('main').textContent);
      const inv=JSON.parse(DB.ch.find(x=>x.startsWith('gilda_partita')).slice(14));r.dati=inv.p_dati.vinta===true&&typeof inv.p_id==='string'&&inv.p_id.length===36&&jsonArr(GIL_CODA).length===0;
      window.accRpc=async()=>{throw new Error('offline')};R=null;solo=true;startSolo();ctx(ME);R.phase='end';R.win=false;render();await sleep(120);r.coda=jsonArr(GIL_CODA).length===1&&/arriverà/.test(document.querySelector('main').textContent);
      window.accRpc=async(fn,a)=>{DB.ch.push(fn+':'+JSON.stringify(a));if(fn==='gilda_mia')return mia();if(fn==='gilda_partita')return {esito:'contata',pe:10,punti_boss:0};return []};await gilInvia();r.riprova=jsonArr(GIL_CODA).length===0;
      R=null;screen='title';const pl0=skSel().guerriero;openBottega();await sleep(40);const tb=document.querySelector('.modal').textContent;r.bottega=tb.includes('Aspetti di gilda')&&tb.includes('Stendardo')&&tb.includes('Leggenda');closeModal();
      r.cleanGil=JSON.stringify(cleanGil({l:99,n:'x'.repeat(40),t:'Imperatore',c:99}))===JSON.stringify({l:10,n:'x'.repeat(24),t:'',c:PCOL.length-1,i:0})&&cleanGil({l:0})===null;
      accLogout();window.accRpc=rpc0;ACC=null;setCrowns(c0);setGems(g0);store(SKO_K,sk0);R=null;solo=true;ME='solo';modal=null;screen='title';render();return r});
    ok(gv.stendardo&&gv.leggenda&&gv.pallino&&gv.sezioni&&gv.titoli&&gv.ritira,'gilda: la finestra mostra premi, missioni, boss, livello e titolo; «Ritira» aggiunge 55 Corone e 2 Gemme; aspetti Stendardo (livello 5) e Leggenda (10) sbloccati per tutti gli eroi '+JSON.stringify(gv));
    ok(gv.bonus&&gv.giorno,'gilda: al livello 10 la partita parte con +10% oro, una pozione, +5 PV e una reliquia in più; niente bonus nella sfida del giorno');
    ok(gv.fine&&gv.dati&&gv.coda&&gv.riprova,'gilda: a fine partita la partita va alla gilda una volta sola (+45 PE, il boss perde 160 punti); senza rete resta in coda e parte appena si può');
    ok(gv.bottega&&gv.cleanGil,'gilda: nella Bottega gli aspetti di gilda non si comprano; i dati della gilda degli altri giocatori sono ripuliti');
    ok(!eh.length,'gilda (settimana): nessun errore nella pagina '+eh.slice(0,2).join(' | '));await ch.close()}

  console.log('7ac. Menu principale (v10.10): riquadri Gilda e Amici, caselle Gilda e Amici nel menu essenziale');
  {const mm=await page.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={},rpc0=window.accRpc;SET.tut=false;saveSet();
      ACC=null;GIL.dati=null;AMI.lista=null;R=null;solo=true;ME='solo';screen='title';SET.menu=false;render();const g0=document.querySelector('.gilmenu'),a0=document.querySelector('.amimenu');
      r.senzaProfilo=!!g0&&!!a0&&/profilo/.test(g0.textContent)&&/profilo/.test(a0.textContent);
      window.accRpc=async fn=>{if(fn==='gilda_mia')return {gilda:{id:3,nome:'Lupi',livello:6,pe:9200,posti:15,aperta:true},io:{ruolo:'capo',pe:1100},membri:[],richieste:[{nome:'giada'}],settimana:{inizio:'2026-11-16',fine:'2026-11-22',missioni:[{tipo:'elite',obiettivo:26,progresso:26,fatta:'x'}],boss:{boss:'drago',vita:2000,danni:1000}},premi:[{id:1,corone:15,gemme:0,motivo:'missione:elite'}]};
        if(fn==='amici_lista')return [{nome:'pandoris',stato:'amici'},{nome:'luca',stato:'ricevuta'}];if(fn==='amici_codice')return 'K7PX2M';return []};
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};await gilCarica();await amiciCarica();AMI.on=new Set([amH('pandoris')]);render();
      const g=document.querySelector('.gilmenu'),a=document.querySelector('.amimenu');
      r.gilda=/Gilda: Lupi/.test(g.textContent)&&/Livello 6/.test(g.textContent)&&/Cavaliere/.test(g.textContent)&&/boss al 50%/.test(g.textContent)&&/1 premio/.test(g.textContent)&&g.querySelector('.novdot').textContent==='2';
      r.amici=/1 amico/.test(a.textContent)&&/1 in gioco/.test(a.textContent)&&/1 richiesta/.test(a.textContent);
      g.querySelector('button').click();await sleep(20);r.vaiGilda=!!(modal&&modal.gilda);closeModal();a.querySelector('button').click();await sleep(20);r.vaiAmici=!!(modal&&modal.amici);closeModal();
      SET.menu=true;render();const T=[...document.querySelectorAll('.mtile')],tops=T.map(x=>Math.round(x.getBoundingClientRect().top));
      r.caselle=T.length===8&&T.some(x=>/Gilda/.test(x.textContent))&&T.some(x=>/Amici/.test(x.textContent))&&new Set(tops).size===2;
      T.find(x=>/Gilda/.test(x.textContent)).click();await sleep(20);r.casellaGilda=!!(modal&&modal.gilda);closeModal();
      SET.menu=false;saveSet();accLogout();window.accRpc=rpc0;ACC=null;modal=null;screen='title';render();return r});
    ok(mm.senzaProfilo&&mm.gilda&&mm.amici&&mm.vaiGilda&&mm.vaiAmici&&mm.caselle&&mm.casellaGilda,'menu principale: riquadri «Gilda» (livello, titolo, missioni, boss, premi) e «Amici» (in gioco, richieste) che portano subito lì; nel menu essenziale 8 caselle in 2 file con Gilda e Amici '+JSON.stringify(mm))}

  console.log('7ad. Dungeon di gilda (v10.11): stanza solo per la gilda, gradi fino al livello, 8 piani e boss della settimana, premi una volta al giorno (database simulato)');
  {const ci=await browser.newContext({viewport:{width:1280,height:860}});await ci.route(/^https?:\/\//,r=>r.abort());const pi=await ci.newPage();const ei=[];pi.on('pageerror',e=>ei.push(e.message));await pi.goto(PAGE);await pi.waitForTimeout(400);
    const gd=await pi.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));SET.tut=false;saveSet();const r={},rpc0=window.accRpc,cn0=window.connect,c0=getCrowns();
      const DB={ch:[],oggi:null};
      const mia=()=>({gilda:{id:3,nome:'Lupi',descrizione:'',aperta:true,posti:15,livello:5,pe:6000},io:{ruolo:'membro',pe:300},membri:[{nome:'sara',ruolo:'capo',pe:900},{nome:'manu',ruolo:'membro',pe:300},{nome:'luca',ruolo:'membro',pe:50}],richieste:[],
        settimana:{inizio:'2026-11-16',fine:'2026-11-22',missioni:[],boss:{boss:'lich',vita:3000,danni:500,sconfitto:null},io:{partite:0,boss:0,missioni:{}},migliori:[]},premi:[],dungeon:{oggi:DB.oggi,gilda_oggi:!!DB.oggi}});
      window.accRpc=async(fn,a)=>{DB.ch.push(fn+':'+JSON.stringify(a));if(fn==='gilda_mia')return mia();if(fn==='gilda_partita')return {esito:'contata',pe:25,punti_boss:220,missioni_completate:[],dungeon:{premio:true,grado:3,corone:15,gemme:0,pe_gilda:250,pe_tuoi:25}};if(fn==='amici_lista')return [];if(fn==='amici_codice')return 'K7PX2M';return 'fatto'};
      window.connect=(c,f)=>{setTimeout(f,0);return true};
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};AMI.lista=[];R=null;screen='title';await gilCarica();
      const m8=genMap(new RNG(7),2,GD_PIANI,true);r.mappa=m8.length===9&&m8[8][3].type==='boss'&&m8[4].filter(Boolean).every(n=>n.type==='treasure')&&m8[7].filter(Boolean).every(n=>n.type==='rest')&&!m8.slice(1,7).some(w=>w.some(n=>n&&n.type==='rest'));
      r.normale=JSON.stringify(genMap(new RNG(7),2))===JSON.stringify(genMap(new RNG(7),2,ROWS,false))&&genMap(new RNG(7),2).length===16;
      let e8=0,n8=0,e15=0,n15=0;for(let k=0;k<40;k++){genMap(new RNG(k),0,GD_PIANI,true).flat().forEach(n=>{if(n&&n.type!=='boss'){n8++;if(n.type==='elite')e8++}});genMap(new RNG(k),0).flat().forEach(n=>{if(n&&n.type!=='boss'){n15++;if(n.type==='elite')e15++}})}r.elite=e8/n8>e15/n15;
      r.gradi=[1,2,3,4,5,6,7,8,9,10].map(gdAss).join('')==='0112233445'&&gdCor(10)===50&&gdGem(3)===0&&gdGem(4)===1&&gdGem(8)===2&&gdPeG(1)===150;
      openGilda();await sleep(60);const M=()=>document.querySelector('.modal');r.finestra=['Dungeon di gilda','Gradi da 1 a 5','Apri il dungeon di gilda','Morvath','al grado 1 5 Corone','al grado 5 25 Corone e 1 Gemma'].every(x=>M().textContent.includes(x));
      M().querySelector('.gildun .btn.primary').click();await sleep(80);
      r.stanza=!!R&&!solo&&R.phase==='lobby'&&R.lmode==='gilda'&&!!R.lgil&&R.lgil.i===3&&R.lgr===5&&R.lgil.b==='lich'&&!modal;
      render();await sleep(30);const T=()=>document.querySelector('main').textContent;
      r.lobby=T().includes('Dungeon di gilda')&&T().includes('Morvath')&&T().includes('Servono almeno 2 membri')&&document.querySelectorAll('.gdgr .lvl:not([disabled])').length===5&&document.querySelectorAll('.gdgr .lvl[disabled]').length===5&&document.querySelectorAll('.modes .opt').length===4&&!T().includes('Livello di Assedio');
      R.players.pB={pid:'pB',name:'sara',cls:'mago',ready:true,gil:{l:5,n:'Lupi',t:'Scudiero',c:3,i:3}};R.order.push('pB');online.add('pB');
      R.players.pC={pid:'pC',name:'ugo',cls:'ladro',ready:true,gil:{l:2,n:'Orsi',t:'Recluta',c:1,i:9}};R.order.push('pC');online.add('pC');render();await sleep(20);
      r.estraneo=blockers(null,'gilda',0).join()==='pC'&&T().includes('ugo non è nella gilda Lupi')&&T().includes('Non è della gilda');
      send({t:'start',lvl:0,seed:'GILDA1'});r.bloccata=R.phase==='lobby';
      send({t:'kick',p:'pC'});send({t:'gr',g:9});r.gradoMax=R.lgr===5;send({t:'gr',g:3});r.grado3=R.lgr===3;
      const sent=[];AMI.ch={send:x=>sent.push(x.payload)};AMI.on=new Set([amH('luca'),amH('sara')]);gdInvitaTutti();r.invito=sent.length===1&&sent[0].g===3&&sent[0].c===R.code&&sent[0].a===amH('luca');
      AMI.inviti=[];amiciInvitoArrivato({a:amH('manu'),da:'sara',c:'QWER',g:4});r.arrivo=AMI.inviti.length===1&&AMI.inviti[0].g===4&&/apre il dungeon di gilda \(grado 4\)/.test(invitoHTML().replace(/<[^>]+>/g,''));AMI.inviti=[];
      send({t:'start',lvl:0,seed:'GILDA1'});
      r.parte=R.phase==='map'&&!!R.gd&&R.gd.gr===3&&R.mode==='norm'&&R.dg==='cripte'&&R.lvl===1&&R.map.length===9&&bossId()==='lich'&&R.players[ME].miss.length===0&&!missOn();
      render();await sleep(20);const hu=(document.querySelector('.hud')||{}).textContent||'';r.hud=/Piano\s*0\/9/.test(hu)&&/Grado\s*3/.test(hu);
      const sv=R.gd;startCombat(['zombi'],'combat');const h1=R.combat.hpM,d1=R.combat.dM;R.gd=null;startCombat(['zombi'],'combat');const h0=R.combat.hpM,d0=R.combat.dM;R.gd=sv;
      startCombat(['lich'],'boss');const hb=R.combat.hpM;R.gd=null;startCombat(['lich'],'boss');const hb0=R.combat.hpM;R.gd=sv;
      r.forza=Math.abs(h1/h0-1.1)<1e-9&&Math.abs(d1/d0-1.1)<1e-9&&Math.abs(hb/hb0-1.1*1.25)<1e-9;R.combat=null;
      R.phase='end';R.win=true;ctx(ME);render();await sleep(150);render();await sleep(40);
      const t=T(),inv=DB.ch.find(x=>x.startsWith('gilda_partita')),dd=inv&&JSON.parse(inv.slice(14)).p_dati;
      r.fine=t.includes('Dungeon di gilda completato!')&&!!dd&&dd.dungeon===3&&dd.gruppo===true&&/premio del giorno 15 Corone da ritirare/.test(t)&&/la gilda prende 250 PE/.test(t);
      r.corone=!!UI.lastAward&&UI.lastAward.n===Math.round((DUNGEONS.cripte.crowns+CR_LVL)/2)&&!UI.unlocked&&!UI.newDg&&!beaten().includes('cripte');
      r.bottoni=t.includes('Continua: grado 4')&&t.includes('Rigioca il grado 3');const st=getStats();r.imprese=!(st.wins|0)&&st.gdWins===1&&!((st.dg||{}).cripte||{}).wins&&!/Purificatore delle Cripte/.test(t);
      [...document.querySelectorAll('button')].find(b=>/Continua: grado 4/.test(b.textContent)).click();await sleep(20);r.ancora=R.phase==='map'&&!!R.gd&&R.gd.gr===4&&R.lvl===2;
      R.phase='end';send({t:'again'});r.ritorno=R.phase==='lobby'&&!R.gd&&R.lmode==='gilda'&&!!R.players.pB.gil&&R.players.pB.gil.i===3;
      r.giaPreso=/già preso/.test(gdEsitoTxt({premio:false,grado:3}))&&gdEsitoTxt(null)==='';
      const gm=GIL.dati;GIL.dati={gilda:null,premi:[]};send({t:'mode',m:'gilda'});r.senzaGilda=R.lmode==='norm';GIL.dati=gm;
      r.pulito=JSON.stringify(cleanGil({l:5,n:'Lupi',t:'Recluta',c:3,i:3}))==='{"l":5,"n":"Lupi","t":"Recluta","c":3,"i":3}';
      accLogout();window.accRpc=rpc0;window.connect=cn0;ACC=null;AMI.ch=null;R=null;solo=true;ME='solo';modal=null;screen='title';setCrowns(c0);render();return r});
    ok(gd.mappa&&gd.normale&&gd.elite&&gd.gradi,'dungeon di gilda: mappa di 8 piani più il boss (forziere al 5° piano, falò prima del boss, più élite); la mappa normale non cambia; gradi = Assedio g/2, premi 5 Corone × grado e Gemme dal grado 4 '+JSON.stringify(gd));
    ok(gd.finestra&&gd.stanza&&gd.lobby&&gd.estraneo&&gd.bloccata&&gd.gradoMax&&gd.grado3,'dungeon di gilda: dalla Gilda «Apri il dungeon di gilda» crea la stanza; gradi fino al livello della gilda; chi non è della gilda blocca la partenza');
    ok(gd.invito&&gd.arrivo,'dungeon di gilda: «Invita tutta la gilda» manda l\'invito ai compagni in gioco fuori dalla stanza, con il grado; a chi lo riceve compare «apre il dungeon di gilda»');
    ok(gd.parte&&gd.hud&&gd.forza,'dungeon di gilda: parte nel dungeon del boss della settimana (Morvath, Cripte), Assedio dal grado, senza missioni; in alto «Piano 0/9» e «Grado 3»; nemici +10% al grado 3, boss +25% in più');
    ok(gd.fine&&gd.corone&&gd.imprese&&gd.bottoni&&gd.ancora&&gd.ritorno&&gd.giaPreso&&gd.senzaGilda&&gd.pulito,'dungeon di gilda: a fine partita va alla gilda con il grado e mostra il premio del giorno; metà Corone normali, niente sblocchi né Imprese da dungeon completato; «Continua: grado 4»; si torna alla stanza di gilda');
    ok(!ei.length,'dungeon di gilda: nessun errore nella pagina '+ei.slice(0,2).join(' | '));await ci.close()}

  console.log('7ae. Niente più Sviluppo (v10.12): Luce e Ombra e Ombra per tutti sempre accese, Combattimento a scena e Menu essenziale in Grafica, pulsante «A scena» in combattimento');
  {const cs=await browser.newContext({viewport:{width:1280,height:860}});await cs.route(/^https?:\/\//,r=>r.abort());
    await cs.addInitScript(()=>{try{if(!sessionStorage.getItem('prova-sv')){sessionStorage.setItem('prova-sv','1');localStorage.setItem('valdombra-impostazioni',JSON.stringify({lo:false,lox:false,scena:true,menu:true,tut:false}))}}catch(e){}});
    const ps=await cs.newPage();const es=[];ps.on('pageerror',e=>es.push(e.message));await ps.goto(PAGE);await ps.waitForTimeout(500);
    const sv=await ps.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={};
      r.forzate=SET.lo===true&&SET.lox===true&&SET.scena===true&&SET.menu===true&&SET_DEF.lox===true;
      SET.menu=false;R=null;screen='title';openSettings();render();await sleep(30);const M=document.querySelector('.modal');
      const h4=[...M.querySelectorAll('h4')].map(x=>x.textContent.trim()),sw=[...M.querySelectorAll('button.sw')].map(x=>x.getAttribute('aria-label'));
      const graf=[...M.querySelectorAll('.panel')].find(p=>(p.querySelector('h4')||{}).textContent==='Grafica');
      r.pannello=!h4.some(t=>/Sviluppo/.test(t))&&!sw.includes('Luce e Ombra')&&!sw.includes('Ombra per tutti gli eroi')&&!!graf&&!!graf.querySelector('button.sw[aria-label="Combattimento a scena"]')&&!!graf.querySelector('button.sw[aria-label="Menu essenziale"]');
      graf.querySelector('button.sw[aria-label="Menu essenziale"]').click();r.menuSi=SET.menu===true;graf.ownerDocument.querySelector('button.sw[aria-label="Menu essenziale"]').click();r.menuNo=SET.menu===false;closeModal();
      R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls='necromante';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);
      r.partita=R.lo===true&&R.lox===true&&canShadow({id:'evocascheletro',up:false});
      startCombat(['goblin'],'combat');R.phase='combat';ctx(ME);render();await sleep(40);
      let b=document.querySelector('.pilebar .scenabtn');r.bottone=!!b&&b.getAttribute('aria-pressed')==='true'&&document.body.classList.contains('scena');
      b.click();await sleep(30);b=document.querySelector('.pilebar .scenabtn');r.classica=SET.scena===false&&!document.body.classList.contains('scena')&&b.getAttribute('aria-pressed')==='false'&&JSON.parse(localStorage.getItem('valdombra-impostazioni')).scena===false;
      b.click();await sleep(30);r.ancoraScena=SET.scena===true&&document.body.classList.contains('scena');
      r.guida=['base','comb','dungeon','eroi','gruppo','modi','ombra','prog','set','vil'].every(t=>{UI.guTab=t;return guidaHTML().length>200&&!/Sviluppo/.test(guidaHTML())});UI.guTab='base';
      SET.scena=false;saveSet();R=null;solo=true;screen='title';modal=null;render();return r});
    ok(sv.forzate&&sv.pannello&&sv.menuSi&&sv.menuNo,'niente sezione Sviluppo: Luce e Ombra e Ombra per tutti accese anche se salvate spente; «Combattimento a scena» e «Menu essenziale» in Impostazioni, Grafica '+JSON.stringify(sv));
    ok(sv.partita&&sv.bottone&&sv.classica&&sv.ancoraScena&&sv.guida,'in combattimento il pulsante «A scena» cambia la grafica al volo e la ricorda; nella guida niente più Sviluppo');
    ok(!es.length,'niente Sviluppo: nessun errore nella pagina '+es.slice(0,2).join(' | '));await cs.close()}

  console.log('7af. Bottega e menu (v10.14): quanti oggetti si possono portare, descrizione del titolo larga e giustificata');
  {const cb=await browser.newContext({viewport:{width:1280,height:860}});await cb.route(/^https?:\/\//,r=>r.abort());const pb=await cb.newPage();const eb=[];pb.on('pageerror',e=>eb.push(e.message));await pb.goto(PAGE);await pb.waitForTimeout(400);
    const bt=await pb.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={};SET.tut=false;saveSet();
      setCrowns(500);setZaino({potions:['cura'],relics:[],gold:1,hp:2,upg:0});R=null;screen='title';openBottega();await sleep(60);
      const M=document.querySelector('.modal'),t=M.textContent,alt=[...M.querySelectorAll('.panel')].find(x=>/^Altro/.test((x.querySelector('h3')||{}).textContent||'')).textContent;
      r.titoli=/Pozioni \(puoi portarne 2 in tutto · nello zaino 1\)/.test(t)&&/Reliquie \(puoi portarne 2 in tutto · nello zaino 0\)/.test(t);
      r.altro=/Puoi prenderne 3Nello zaino: 1/.test(alt)&&/Al massimo2 su 2/.test(alt)&&/Puoi prenderne 2Nello zaino: 0/.test(alt);
      buyMeta('gold');await sleep(30);r.compra=/Puoi prenderne 3Nello zaino: 2/.test(document.querySelector('.modal').textContent)&&getZaino().gold===2;
      buyMeta('potions','cura');await sleep(30);r.pieno=/Pozioni \(al massimo: 2 su 2 nello zaino\)/.test(document.querySelector('.modal').textContent);closeModal();setZaino({potions:[],relics:[],gold:0,hp:0,upg:0});
      for(const m of [false,true]){SET.menu=m;R=null;screen='title';modal=null;render();await sleep(30);const l=document.querySelector('.lede.intro');r['lede'+m]=!!l&&getComputedStyle(l).textAlign==='justify'&&Math.abs(l.getBoundingClientRect().width-l.parentElement.getBoundingClientRect().width)<2}
      SET.menu=false;saveSet();render();return r});
    ok(bt.titoli&&bt.altro&&bt.compra&&bt.pieno,'Bottega: ogni oggetto dice quanti se ne possono portare e quanti sono nello zaino; si aggiorna comprando '+JSON.stringify(bt));
    ok(bt.ledefalse&&bt.ledetrue,'menu principale: la descrizione sotto il titolo è larga quanto la pagina e giustificata (menu normale ed essenziale)');
    ok(!eb.length,'Bottega e menu: nessun errore nella pagina '+eb.slice(0,2).join(' | '));await cb.close()}

  console.log('7ag. Password dimenticata (v10.15): codice di recupero nel Profilo, «Ho dimenticato la password», reimpostazione dall\'amministrazione (database simulato)');
  {const cr=await browser.newContext({viewport:{width:1280,height:860}});await cr.route(/^https?:\/\//,r=>r.abort());const pr=await cr.newPage();const er=[];pr.on('pageerror',e=>er.push(e.message));await pr.goto(PAGE);await pr.waitForTimeout(400);
    const rc=await pr.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={},rpc0=window.accRpc;SET.tut=false;saveSet();const DB={ch:[],ha:false,errori:0};
      window.accRpc=async(fn,a)=>{DB.ch.push(fn+':'+JSON.stringify(a));
        if(fn==='profilo_recupero_stato')return {ha:DB.ha,creato:DB.ha?'2026-11-19T10:00:00Z':null};if(fn==='profilo_recupero_nuovo'){DB.ha=true;return 'ABCD-EFGH-JKLM'}
        if(fn==='profilo_recupera'){if(String(a.p_codice).replace(/[^A-Z0-9]/gi,'').toUpperCase()!=='ABCDEFGHJKLM')return [{token:null,esito:'codice_sbagliato'}];DB.ha=false;return [{token:'11111111-1111-1111-1111-111111111111',esito:'fatto'}]}
        if(fn==='profilo_accedi')return a.p_pass==='nuovapw'?[{token:'11111111-1111-1111-1111-111111111111',rev:3,dati:{}}]:[];
        if(fn==='admin_reimposta_password')return a.p_altro==='sara'?{esito:'fatto',nome:'sara',password:'K7PXQ2MNRT'}:{esito:'non_trovato'};
        if(fn==='profilo_leggi')return [{rev:ACC?ACC.rev:1,dati:{}}];if(fn==='profilo_salva')return (ACC?ACC.rev:1)+1;if(fn==='admin_e')return true;if(fn==='admin_statistiche')return null;if(fn==='amici_lista')return [];if(fn==='gilda_mia')return {gilda:null,premi:[]};if(fn==='amici_codice')return 'K7PX2M';return null};
      ACC=null;R=null;screen='title';openProfilo();await sleep(40);const M=()=>document.querySelector('.modal');
      r.link=!!M().querySelector('.linkbtn')&&/Ho dimenticato la password/.test(M().textContent);M().querySelector('.linkbtn').click();await sleep(30);
      r.form=/Codice di recupero/.test(M().textContent)&&!!M().querySelector('#reccod');
      UI.accN='Manu';UI.recC='abcd-efgh-jkmm';UI.pw1=UI.pw2='nuovapw';await recRecupera();r.sbagliato=/sbagliati/.test(M().textContent)&&!ACC;
      UI.recC='abcd efgh jklm';UI.pw2='altra';await recRecupera();r.diverse=/non sono uguali/.test(M().textContent);
      UI.pw2='nuovapw';await recRecupera();await sleep(30);r.entra=!!ACC&&ACC.nome==='manu'&&!UI.recOn&&DB.ch.some(x=>x.startsWith('profilo_accedi'));
      openProfilo();await recStato();await sleep(30);r.senzaCodice=/Non hai ancora un codice di recupero/.test(M().textContent);
      [...M().querySelectorAll('.recpanel button')].find(b=>/Crea il codice/.test(b.textContent)).click();await sleep(40);r.mostrato=/ABCD-EFGH-JKLM/.test(M().textContent)&&/non lo vedrai più/.test(M().textContent);
      closeModal();REC.codice='';openProfilo();await sleep(30);r.nascosto=!/ABCD-EFGH-JKLM/.test(M().textContent)&&/Hai un codice di recupero/.test(M().textContent);
      [...M().querySelectorAll('.recpanel button')].find(b=>/Fanne uno nuovo/.test(b.textContent)).click();await sleep(20);r.conferma=/Sì, fanne uno nuovo/.test(M().textContent)&&DB.ch.filter(x=>x.startsWith('profilo_recupero_nuovo')).length===1;closeModal();
      ADM.ok=true;ADM.dati=null;openAdmin();await sleep(40);r.admin=!!M().querySelector('.admpw');ADMPW.nome='Sara';await admPwReimposta();r.admConf=/Sì, reimposta la password di sara/.test(M().textContent)&&!DB.ch.some(x=>x.startsWith('admin_reimposta'));
      await admPwReimposta();await sleep(20);r.admFatto=/K7PXQ2MNRT/.test(M().textContent);ADMPW.nome='nessuno';ADMPW.pw='';await admPwReimposta();await admPwReimposta();r.admNo=/Non c'è nessun profilo/.test(M().textContent);
      closeModal();accLogout();r.pulito=!REC.codice&&!ADMPW.pw&&REC.stato===null;ADM.ok=false;window.accRpc=rpc0;ACC=null;R=null;modal=null;screen='title';render();return r});
    ok(rc.link&&rc.form&&rc.sbagliato&&rc.diverse&&rc.entra,'password dimenticata: «Ho dimenticato la password» con nome, codice e password nuova; codice sbagliato o password diverse fermano; con quello giusto si entra '+JSON.stringify(rc));
    ok(rc.senzaCodice&&rc.mostrato&&rc.nascosto&&rc.conferma,'codice di recupero nel Profilo: si crea, si vede una volta sola, per farne uno nuovo chiede conferma');
    ok(rc.admin&&rc.admConf&&rc.admFatto&&rc.admNo&&rc.pulito,'amministrazione: reimposta la password di un giocatore dopo la conferma e mostra la provvisoria; nome sbagliato avvisa; uscendo dal profilo non resta niente');
    ok(!er.length,'password dimenticata: nessun errore nella pagina '+er.slice(0,2).join(' | '));await cr.close()}

  console.log('7ah. Eroine (v10.16): pulsante Genere per tutti gli eroi, immagini e aspetti femminili, nomi e testi al femminile, nome del profilo in combattimento');
  {const cg=await browser.newContext({viewport:{width:1280,height:860}});await cg.route(/^https?:\/\//,r=>r.abort());const pg=await cg.newPage();const eg=[];pg.on('pageerror',e=>eg.push(e.message));await pg.goto(PAGE);await pg.waitForTimeout(400);
    const gv=await pg.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={};SET.tut=false;SET.px=true;saveSet();SET.menu=false;
      let w=0;while((!PXI['guerriero-f']||!PXI['mago-f-attacco'])&&w<400){await sleep(10);w++}
      r.caricate=['guerriero','mago','ladro','chierico','necromante','ranger','druido','monaco','guardiano','paladino'].every(c=>PXI[c+'-f']&&PXI[c+'-f-attacco']&&PXI[c+'-f-difesa']&&PXI[c+'-f-colpito']&&PXI[c+'-f-attacco'].n===7);
      R=null;solo=true;ME='solo';screen='title';modal=null;render();await sleep(20);const T=()=>document.querySelector('main').textContent;
      const gr=()=>[...document.querySelectorAll('.genrow .btn')];
      r.base=myG()==='m'&&gr().length===2&&gr()[0].getAttribute('aria-pressed')==='true'&&T().includes('Guerriero')&&!T().includes('Guerriera');
      gr()[1].click();await sleep(20);
      r.femm=myG()==='f'&&load(GEN_K)==='f'&&gr()[1].getAttribute('aria-pressed')==='true'&&['Guerriera','Maga','Chierica','Paladina'].every(n=>T().includes(n))&&[...document.querySelectorAll('.classcard .pxs')].some(x=>/guerriero-f\.png/.test(x.getAttribute('style')||''));
      r.nomi=CN('mago','f')==='Maga'&&CN('ranger','f')==='Ranger'&&CNa('mago','del','f')==='della Maga'&&CNa('guerriero','con il','m')==='con il Guerriero'&&gfix('Sei ⟨caduto|caduta⟩')==='Sei caduta'&&SYNC_KEYS.includes(GEN_K);
      pickCls='mago';pickDg='rocca';pickMode='norm';pickLvl=0;ACC=null;startSolo();ctx(ME);
      r.partita=R.players.solo.g==='f'&&R.players.solo.name==='Maga';
      startCombat(['goblin'],'combat');R.phase='combat';ctx(ME);render();await sleep(30);
      const hero=document.querySelector('#ent-h-solo .pxh'),hud=document.querySelector('.hud');
      r.figura=!!hero&&/pixel\/mago-f\.png/.test(hero.getAttribute('style')||'')&&hero.getAttribute('aria-label')==='Maga'&&/Maga/.test(hud.textContent);
      ACC={nome:'manu',token:'00000000-0000-0000-0000-000000000000',rev:1,dirty:false};render();await sleep(20);
      r.profilo=/Manu/.test(document.querySelector('.hud').textContent)&&/Manu/.test(document.querySelector('.combat .hero .nm').textContent);ACC=null;
      store(SKO_K,JSON.stringify(['mago@cremisi']));setSkin('mago','cremisi');await sleep(20);ctx(ME);render();w=0;while(!PXI['aspetti/mago-f-cremisi']&&w<300){await sleep(10);w++}render();await sleep(20);
      const h2=document.querySelector('#ent-h-solo .pxh');r.aspetto=!!h2&&/aspetti\/mago-f-cremisi\.png/.test(h2.getAttribute('style')||'')&&pxKey('mago@cremisi')==='aspetti/mago-cremisi'||(PXI['aspetti/mago-cremisi']===undefined&&!!h2&&/aspetti\/mago-f-cremisi\.png/.test(h2.getAttribute('style')||''));
      setSkin('mago',null);
      R.phase='end';R.win=false;render();await sleep(40);r.testo=/Sei caduta/.test(T())&&!/Sei caduto/.test(T());
      toast('Sei ⟨uscito|uscita⟩ dalla gilda.');r.avviso=document.querySelector('.toast').textContent==='Sei uscita dalla gilda.';
      solo=false;isHost=true;ME='pA';myName='Sara';chan=null;modal=null;R=newLobby('GENE');R.players.pA.cls='guerriero';
      R.players.pB={pid:'pB',name:'Luca',cls:'mago',ready:true,g:'m'};R.order.push('pB');online=new Set(R.order);render();await sleep(20);
      const pl=document.querySelector('.plist').textContent;r.stanza=R.players.pA.g==='f'&&/Guerriera/.test(pl)&&/Mago/.test(pl)&&!/Maga\b/.test(pl);
      ACT.loadout({z:{},tal:[],g:'f'},R.players.pB);r.loadout=R.players.pB.g==='f'&&hg(R.players.pB)==='mago~f';
      setG('m');r.torna=myG()==='m';R=null;solo=true;ME='solo';screen='title';modal=null;render();return r});
    ok(gv.caricate&&gv.base&&gv.femm&&gv.nomi,'eroine: le 40 immagini femminili si caricano; «Genere: Maschile / Femminile» sopra gli eroi, di base Maschile; con Femminile nomi e figure al femminile '+JSON.stringify(gv));
    ok(gv.partita&&gv.figura&&gv.profilo&&gv.aspetto,'eroine: la partita parte con la Maga (figura pixel/mago-f), in combattimento il nome del profilo se c\'è; gli aspetti hanno la versione femminile');
    ok(gv.testo&&gv.avviso,'eroine: i testi che parlano a te seguono il genere («Sei caduta», «Sei uscita»)');
    ok(gv.stanza&&gv.loadout&&gv.torna,'eroine: in gruppo il genere di ognuno viaggia con lo zaino e si vede nella stanza');
    ok(!eg.length,'eroine: nessun errore nella pagina '+eg.slice(0,2).join(' | '));await cg.close()}

  console.log('7ai. Provocazione (v10.17): anche gli attacchi a tutto il gruppo vanno solo su chi provoca');
  {const pv=await page.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={};SET.tut=false;SPEED=0;
      solo=false;isHost=true;ME='pA';myName='Manu';chan=null;modal=null;R=newLobby('PROV');R.players.pA.cls='guardiano';
      R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'PROVA');
      startCombat(['goblin'],'combat');R.phase='combat';const c=R.combat,e=c.enemies[0];e.hp=e.max=999;e.st={};
      const zero=()=>Object.values(c.heroes).forEach(h=>{h.blk=0;h.st={}});
      e.intent={d:10,aoe:1};zero();let a=R.players.pA.hp,b=R.players.pB.hp;ctx('pA');doIntent(e);ctx(ME);r.senza=R.players.pA.hp<a&&R.players.pB.hp<b;
      ctx(ME);render();await sleep(20);r.tutti=/→\s*tutti/.test(document.querySelector('.intent').textContent);
      e.intent={d:10,aoe:1,deb:'weak',dn:1};zero();ctx('pA');TAUNT(1);ctx(ME);render();await sleep(20);
      const t=document.querySelector('.intent').textContent;r.scritta=/→\s*te/.test(t)&&!/tutti/.test(t);
      a=R.players.pA.hp;b=R.players.pB.hp;ctx('pA');doIntent(e);ctx(ME);
      r.soloLui=R.players.pA.hp<a&&R.players.pB.hp===b&&!!c.heroes.pA.st.weak&&!c.heroes.pB.st.weak;
      ME='pB';ctx('pB');render();await sleep(20);r.vistaAltro=/→\s*Manu/.test(document.querySelector('.intent').textContent);ME='pA';
      R=null;solo=true;ME='solo';isHost=true;online=new Set(['solo']);screen='title';render();return r});
    ok(pv.senza&&pv.tutti&&pv.scritta&&pv.soloLui&&pv.vistaAltro,'Provocazione: senza, l\'attacco «→ tutti» colpisce tutti; con Provocazione colpisce (danni e Debole) solo chi provoca e la scritta diventa «→ te» / il suo nome '+JSON.stringify(pv))}

  console.log('7aj. A terra in gruppo (v10.18): messaggio «Sei morto/morta» con cosa si può fare e il pulsante per uscire dal dungeon');
  {const dm=await page.evaluate(async()=>{const sleep=ms=>new Promise(t=>setTimeout(t,ms));const r={};SET.tut=false;SPEED=0;const g0=myG();
      solo=false;isHost=true;ME='pA';myName='Manu';chan=null;modal=null;R=newLobby('MORT');R.players.pA.cls='guardiano';
      R.players.pB={pid:'pB',name:'Sara',cls:'monaco',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'MORTO');
      startCombat(['goblin'],'combat');R.phase='combat';ctx(ME);render();await sleep(20);r.vivo=!document.querySelector('.downmsg');
      const h=R.combat.heroes.pA;h.down=true;h.ended=true;h.hand=[];R.players.pA.hp=0;store(GEN_K,'m');ctx(ME);render();await sleep(20);
      const d=document.querySelector('.downmsg');r.maschio=!!d&&/Sei morto\./.test(d.textContent)&&/rianimarti/.test(d.textContent)&&/uscire dal dungeon/.test(d.textContent)&&!/Riprendi il turno/.test(document.querySelector('.hand').textContent)&&/aspetta i compagni/.test(document.querySelector('.pilebar').textContent);
      store(GEN_K,'f');render();await sleep(20);r.femmina=/Sei morta\./.test(document.querySelector('.downmsg').textContent);
      document.querySelector('.downmsg .btn').click();await sleep(20);r.esci=!!modal&&/Abbandonare il dungeon/.test(modal.title);modal=null;
      store(GEN_K,g0);R=null;solo=true;ME='solo';isHost=true;online=new Set(['solo']);screen='title';render();return r});
    ok(dm.vivo&&dm.maschio&&dm.femmina&&dm.esci,'a terra in gruppo: al posto di «Hai finito il turno» compare «Sei morto/morta» con la rianimazione e il pulsante «Esci dal dungeon» '+JSON.stringify(dm))}

  console.log('8. Grafica Pixellab');
  const px=await page.evaluate(async()=>{const r={};const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    SPEED=0;SET.tut=false;SET.anim=true;setSkin('guerriero',null);r.base=SET_DEF.px===true;
    const nuova=cls=>{solo=false;isHost=true;ME='pA';myName='Prova';chan=null;modal=null;R=newLobby('PIXL');R.players.pA.cls=cls;
      R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'PIXEL');
      startCombat(['orco','goblin'],'combat');R.combat.enemies.forEach(e=>{e.hp=e.max=999;e.intent={d:0}});ctx(ME);g.hero.energy=99;render()};
    const sp=pid=>document.querySelector('#ent-h-'+pid+' .pxh');
    const vedi=pid=>{const s=sp(pid);return s?s.className+'|'+s.style.backgroundImage:''};
    // spenta: lo sprite di sempre
    SET.px=false;saveSet();nuova('guerriero');r.spenta=!document.querySelector('.pxh')&&!!document.querySelector('#ent-h-pA img.spr');
    openSettings();r.interruttore=!document.querySelector('button.sw[aria-label="Grafica Pixellab"]');closeModal();
    // accesa: le 40 immagini e la figura di ogni eroe
    SET.px=true;saveSet();let w=0;while(Object.keys(PXI).length<334&&w<900){await sleep(10);w++}
    r.caricate=Object.values(PXI).filter(Boolean).length;r.mancanti=pxExtraKeys().filter(k=>!PXI[k]);
    r.senzaFigura=Object.keys(CLASSES).filter(cls=>{nuova(cls);const s=sp('pA');return !(s&&s.style.backgroundImage.includes('pixel/'+cls+'.png')&&s.classList.contains('idle'))});
    nuova('guerriero');
    const gioca=pred=>{ctx(ME);const h=g.hero;h.energy=99;let c=h.hand.find(c=>pred(CARDS[c.id]));
      if(!c){const id=Object.keys(CARDS).find(k=>CARDS[k].cl==='guerriero'&&pred(CARDS[k]));c={id,uid:9e6+Math.floor(Math.random()*1e5),up:false};h.hand.push(c)}
      send({t:'play',uid:c.uid,j:g.enemies.indexOf(alive()[0]),a:ME});return vedi('pA')};
    r.attacco=gioca(d=>d.t==='A');render();r.resta=vedi('pA');await sleep(900);r.fine=vedi('pA');
    r.difesa=gioca(d=>d===CARDS.parata);await sleep(900);
    ctx(ME);g.hero.blk=0;hurtHero(5);commit();r.colpito=vedi('pA');await sleep(900);
    ctx('pB');R.combat.heroes.pB.blk=0;hurtHero(3);commit();ctx(ME);r.compagno=vedi('pB');await sleep(900);
    // immagini mancanti: lampo bianco per il colpo, sprite di sempre per la figura
    const kc=PXI['guerriero-colpito'];PXI['guerriero-colpito']=null;ctx(ME);g.hero.blk=0;hurtHero(2);commit();const s=sp('pA');
    r.lampo=!!s&&s.classList.contains('hit')&&!s.style.backgroundImage.includes('colpito');PXI['guerriero-colpito']=kc;
    const kf=PXI.guerriero;PXI.guerriero=null;render();r.sprite=!sp('pA')&&!!document.querySelector('#ent-h-pA img.spr');PXI.guerriero=kf;
    // con un aspetto attivo resta lo sprite dell'aspetto
    setSkin('guerriero','cremisi');{let w=0;while(!PXI['aspetti/guerriero-cremisi-colpito']&&w<300){await sleep(10);w++}}render();{const sa=sp('pA');r.aspetto=!!sa&&sa.style.backgroundImage.includes('aspetti/guerriero-cremisi')}setSkin('guerriero',null);
    // nemici: figura, attacco quando agiscono, colpito quando subiscono danni
    nuova('guerriero');const ne=sel=>{const s=document.querySelector(sel);return s?s.className+'|'+s.style.backgroundImage:''};
    r.nemFig=ne('#ent-e0 .pxe');ctx(ME);const e0=g.enemies[0];e0.intent={d:3};
    const gq=R.combat.enemies.map(x=>x.id);r.nemTutti=Object.keys(PXE).filter(id=>!PXI['nemici/'+id]||!PXI['nemici/'+id+'-attacco']||!PXI['nemici/'+id+'-colpito']||!PXI['nemici/'+id+'-morte']);
    doIntent(e0);commit();r.nemAtt=ne('#ent-e0 .pxe');await sleep(900);
    ctx(ME);hurtEnemy(g.enemies[1],2);fx('e1','-2','dmg');commit();r.nemCol=ne('#ent-e1 .pxe');
    r.nemFlash=!!document.querySelector('#ent-e1 .spr.hit');r.nemiciIn=gq.join(',');await sleep(900);
    ctx(ME);hurtEnemy(g.enemies[1],9999);fx('e1','-99','dmg');commit();r.nemMorte=ne('#ent-e1 .pxe');await sleep(900);r.nemMorto=ne('#ent-e1 .pxe');
    // sfondo del combattimento, mappa, luoghi, villaggio e icone
    r.sfondo=(document.querySelector('.combat')||{style:{}}).style.background||'';
    R.phase='map';render();r.mappa=!!document.querySelector('#mapsvg.pxmap pattern image')&&document.querySelectorAll('#mapsvg image[href^="pixel/mappa/"]').length>0;
    // v7.9: nodi raccolti verso il centro, area da toccare più grande solo sui nodi da scegliere, sfondo su tutto lo schermo
    {const cx=[...document.querySelectorAll('.mapsvg .node circle:first-child')].map(c=>+c.getAttribute('cx'));r.mappaCentro=cx.length>10&&cx.every(x=>x>=80&&x<=620);
      const av=document.querySelectorAll('.mapsvg .node.avail').length;r.mappaTocco=av>0&&document.querySelectorAll('.mapsvg .node .hit').length===av&&document.querySelectorAll('.mapsvg .node.avail .hit').length===av;
      r.mappaPiena=!!document.querySelector('#mapwrap.pxfill')}
    ctx(ME);R.pos={y:0,x:R.map[0].findIndex(Boolean)};render();r.mappaEroi=document.querySelectorAll('#mapsvg image[href="pixel/guerriero.png"]').length>0;
    r.luogo=pxLuogo('shop',60).includes('pixel/luoghi/shop.png');r.icona=ic('r_elmo',20).includes('pixel/icone/r_elmo.png')&&potIc('cura',20).includes('pixel/icone/pot_cura.png');
    R=null;solo=true;ME='solo';screen='title';modal=null;render();r.titolo=!!document.querySelector('.pxtitle img');{const ti=document.querySelector('.pxtitle img'),b=ti?ti.getBoundingClientRect():{width:0,height:0};r.titolo=r.titolo&&b.height>0&&Math.abs(b.width/b.height-16/9)<.03&&getComputedStyle(ti).objectFit!=='cover'}/* v10.13: immagine del titolo intera */
    openVillaggio();r.villaggio=document.querySelectorAll('.pxvil img').length>=5&&document.querySelectorAll('.vilimg').length>=5&&document.querySelector('.pxvil').innerHTML.includes('villaggio/locanda-'+Math.min(getVil().locanda|0,3)+'.png');closeModal();
    // carta «B»: classe sul body con l'interruttore acceso, runa del costo
    {const tmp=document.createElement('div');tmp.innerHTML=cardHTML({id:'colpo',uid:9,up:false},{});document.body.appendChild(tmp);r.cartaB=document.body.classList.contains('pxui')&&getComputedStyle(tmp.querySelector('.cost'),'::before').transform!=='none';tmp.remove()}
    r.guidaLibro=[...document.querySelectorAll('.panel')].some(p=>p.textContent.includes('Guida del gioco')&&p.innerHTML.includes('pixel/icone/i_book.png'));
    // illustrazioni delle carte (v7.7): striscia in mano, ogni carta ha il suo disegno, carta grande tenendo premuto
    nuova('guerriero');
    r.strisce=g.hero.hand.length>0&&document.querySelectorAll('.hand .card .artstrip img').length===g.hero.hand.length;
    // v7.9: in mano tutte della stessa altezza; il testo lungo sfuma
    ctx(ME);g.hero.hand.push({id:'esplosione',uid:9e6+79,up:true});render();
    {const hs=[...document.querySelectorAll('.hand .card')].map(c=>Math.round(c.getBoundingClientRect().height));r.stessaAltezza=hs.length>1&&hs.every(h=>h===hs[0]);r.altezze=hs.join(',')}
    r.sfuma=!!document.querySelector('.hand .card[data-cid="esplosione"] .cdesc.trunc')&&!!document.querySelector('.hand .card[data-cid="esplosione"] .artstrip img');
    ctx(ME);g.hero.hand=g.hero.hand.filter(c=>c.uid!==9e6+79);render();
    r.senzaArte=(await Promise.all(Object.keys(CARDS).map(id=>new Promise(fine=>{const im=new Image();im.onload=()=>fine(null);im.onerror=()=>fine(id);im.src='pixel/carte/'+id+'.png'})))).filter(Boolean);
    r.nCarte=Object.keys(CARDS).length;
    ctx(ME);g.hero.hand.push({id:'parata',uid:9e6+77,up:false});render();
    {const c=document.querySelector('.hand .card[data-cid="parata"]'),n=g.hero.hand.length;
      c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true}));await sleep(550);
      const z=document.querySelector('#czoom');r.grande=!!z&&!z.hidden&&!!z.querySelector('.card.zoom .zart img')&&!!z.querySelector('.zgl b')&&!z.querySelector('.card.zoom .artstrip')&&!z.querySelector('[onclick]');
      document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));c.click();ctx(ME);
      r.nonGiocata=g.hero.hand.length===n&&!document.querySelector('.hand .card.sel');
      await sleep(400);if(z)z.click();r.chiusa=!!z&&z.hidden}
    PXC.colpo=0;r.mancante=!cardHTML({id:'colpo',uid:1,up:false},{}).includes('artstrip');delete PXC.colpo;
    // v7.8: col mouse la carta si vede ingrandita passandoci sopra, con le parole chiave a fianco; inquadratura per carta
    ctx(ME);render();{const c=document.querySelector('.hand .card[data-cid="parata"]');c.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));
      const p=document.querySelector('#cprev'),t=document.querySelector('#gltip');r.anteprima=!!p&&!p.hidden&&!!p.querySelector('.card.zoom .zart img')&&!!p.querySelector('.zgl b')&&(!t||t.hidden)&&getComputedStyle(p).pointerEvents==='none';
      document.body.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));r.anteprimaVia=p.hidden}
    r.inquadra=/object-position:center (\d+)%/.test(cardHTML({id:'possente',uid:1,up:false},{}))&&Object.keys(PXFY).length===Object.keys(CARDS).length;
    // lato Ombra con «Contrasto alto»: il testo resta chiaro sulla carta viola
    {SET.hc=true;applySet();const tmp=document.createElement('div');tmp.innerHTML=cardHTML({id:'colpo',uid:9,up:false},{cls:'shadow'});document.body.appendChild(tmp);
      const m=getComputedStyle(tmp.querySelector('.cdesc')).color.match(/\d+/g).map(Number);r.ombraLeggibile=m[0]+m[1]+m[2]>600;tmp.remove();SET.hc=false;applySet()}
    R=null;solo=true;ME='solo';screen='title';modal=null;render();
    // fuori dal combattimento: scelta dell'eroe e negozio degli aspetti
    R=null;solo=true;ME='solo';screen='title';modal=null;render();
    const scelta=()=>[...document.querySelectorAll('.classes .pxs')].map(e=>e.style.backgroundImage);
    r.scelta=scelta();setSkin('guerriero','cremisi');r.sceltaAspetto=scelta();setSkin('guerriero',null);
    UI.skCls='guerriero';modal={title:'Aspetti',cancel:true,html:skinsHTML()};render();{let w=0;while(!PXI['aspetti/guerriero-gelo']&&w<300){await sleep(10);w++}}render();r.negozio=document.querySelectorAll('.shopgrid .pxs').length>=2;modal=null;
    SET.px=false;saveSet();render();r.rispenta=!document.querySelector('.pxh')&&!document.querySelector('.pxs');r.carteSpente=!document.body.classList.contains('pxui');
    r.senzaStriscia=!cardHTML({id:'colpo',uid:1,up:false},{}).includes('artstrip')&&/<img|<canvas|<svg/.test(ic('i_book',34))&&!ic('i_book',34).includes('pixel/');
    // spenta: tenendo premuto torna il fumetto delle parole chiave
    nuova('guerriero');ctx(ME);g.hero.hand.push({id:'parata',uid:9e6+78,up:false});render();{const c=document.querySelector('.hand .card[data-cid="parata"]');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',isPrimary:true}));render();await sleep(550);// ridisegno durante la pressione
      const z=document.querySelector('#czoom'),t=document.querySelector('#gltip');r.fumetto=(!z||z.hidden)&&!!t&&!t.hidden;document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));c.click();glHide()}
    R=null;solo=true;ME='solo';screen='title';modal=null;render();return r});
  ok(px.base&&px.spenta&&px.interruttore,'Grafica Pixellab: sempre accesa, senza interruttore; se le immagini mancano resta lo sprite di sempre');
  ok(px.caricate>=334&&!px.mancanti.length&&!px.senzaFigura.length,`le immagini in pixel/ si caricano (${px.caricate}, tutte le ${334} di base${px.mancanti.length?'; mancano: '+px.mancanti.slice(0,8):''}) e ogni eroe ha la sua figura${px.senzaFigura.length?' (mancano: '+px.senzaFigura+')':''}`);
  ok(!px.nemTutti.length&&/pixel\/nemici\/.+\.png/.test(px.nemFig)&&/pxan/.test(px.nemAtt)&&/-attacco/.test(px.nemAtt)&&/pxan/.test(px.nemCol)&&/-colpito/.test(px.nemCol)&&!px.nemFlash,`nemici (${px.nemiciIn}): figura, attacco quando agiscono, colpito al posto del lampo; tutti i 30 hanno le immagini${px.nemTutti.length?' (mancano: '+px.nemTutti+')':''}`);
  ok(/pxan/.test(px.nemMorte)&&/-morte/.test(px.nemMorte)&&/pxdead/.test(px.nemMorto)&&/-morte/.test(px.nemMorto),'nemico sconfitto: animazione di morte, poi resta a terra');
  ok(/pxan/.test(px.attacco)&&/guerriero-attacco/.test(px.attacco)&&/pxan/.test(px.resta)&&/idle/.test(px.fine)&&/pixel\/guerriero\.png/.test(px.fine),'carta Attacco: animazione d\'attacco, che continua se la schermata si ridisegna, poi torna la figura ferma');
  ok(/guerriero-difesa/.test(px.difesa)&&/guerriero-colpito/.test(px.colpito)&&!/\bhit\b/.test(px.colpito)&&/mago-colpito/.test(px.compagno),'carta con Armatura: difesa; danni subiti: colpito al posto del lampo, anche per il compagno');
  ok(px.lampo&&px.sprite&&px.rispenta,'se un\'immagine manca resta la grafica di sempre');
  ok(px.aspetto&&px.negozio,'gli aspetti hanno la loro versione Pixellab, anche nel negozio degli aspetti');
  ok(/combattimento-rocca/.test(px.sfondo)&&px.mappa&&px.mappaEroi&&px.luogo&&px.icona&&px.titolo&&px.villaggio,'sfondi del combattimento, mappa con decorazioni e figura dell\'eroe, luoghi, icone, schermata iniziale (immagine intera) e villaggio a stadi '+JSON.stringify({s:!!px.sfondo,m:px.mappa,e:px.mappaEroi,l:px.luogo,i:px.icona,t:px.titolo,v:px.villaggio}));
  ok(px.cartaB&&px.carteSpente,'carte con cornice del tipo e costo a runa solo con l\'interruttore acceso');
  ok(px.strisce&&!px.senzaArte.length&&px.mancante&&px.senzaStriscia,`illustrazioni: striscia sotto il nome in mano, tutte le ${px.nCarte} carte hanno il disegno${px.senzaArte.length?' (mancano: '+px.senzaArte+')':''}, niente striscia se l'immagine manca o l'interruttore è spento`);
  ok(px.grande&&px.nonGiocata&&px.chiusa&&px.fumetto,'tenendo premuta una carta si apre la carta grande con illustrazione e parole chiave (senza giocarla) e si chiude toccando; spento resta il fumetto '+JSON.stringify({g:px.grande,n:px.nonGiocata,c:px.chiusa,f:px.fumetto}));
  ok(px.guidaLibro,'la Guida del gioco ha la sua icona (libro), diversa dalle Impostazioni');
  ok(px.anteprima&&px.anteprimaVia&&px.inquadra,'col mouse, passando sopra una carta si vede ingrandita con le parole chiave a fianco (e sparisce uscendo); ogni illustrazione ha la sua inquadratura '+JSON.stringify({a:px.anteprima,v:px.anteprimaVia,i:px.inquadra}));
  ok(px.ombraLeggibile,'lato Ombra con Contrasto alto: la descrizione resta leggibile');
  ok(px.stessaAltezza&&px.sfuma,`in mano le carte hanno la stessa altezza (${px.altezze}), l'illustrazione resta intera e il testo lungo sfuma`);
  ok(px.mappaCentro&&px.mappaTocco&&px.mappaPiena,'mappa: nodi lontani dai bordi, area da toccare più grande sui nodi da scegliere, sfondo su tutto lo schermo '+JSON.stringify({c:px.mappaCentro,t:px.mappaTocco,p:px.mappaPiena}));
  ok(px.scelta.length>=4&&px.scelta.some(s=>s.includes('pixel/guerriero.png'))&&!px.sceltaAspetto.some(s=>s.includes('pixel/guerriero.png')),`fuori dal combattimento: figure Pixellab nella scelta dell'eroe (${px.scelta.length}), che seguono l'aspetto scelto`);

  console.log('9. Visite e amministrazione');
  const adm=await page.evaluate(async()=>{const r={};const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    const sb0=window.sbClient,rpc0=window.accRpc,acc0=ACC,st0=SET.stats;let chiamate=[];
    try{localStorage.removeItem(VIS_K);localStorage.removeItem(VISNO_K);sessionStorage.removeItem(VISS_K)}catch(e){}
    // nelle prove (file://) non si conta niente
    r.locale=visitaConta()===false&&chiamate.length===0;
    window.sbClient=()=>({rpc:(fn,a)=>{chiamate.push([fn,a]);return Promise.resolve({data:null,error:null})}});
    SET.stats=true;r.prima=visitaConta(true)===true;const a=chiamate[0]&&chiamate[0][1];
    r.dati=!!a&&chiamate[0][0]==='visita_registra'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.p_visitatore)&&a.p_versione===VERSION&&typeof a.p_mobile==='boolean'&&typeof a.p_app==='boolean'&&Object.keys(a).length===4;
    r.stessoCodice=a&&localStorage.getItem(VIS_K)===a.p_visitatore;
    r.unaPerScheda=visitaConta(true)===false&&chiamate.length===1;
    sessionStorage.removeItem(VISS_K);SET.stats=false;r.spenta=visitaConta(true)===false&&chiamate.length===1;SET.stats=true;
    localStorage.setItem(VISNO_K,'1');r.admNonConta=visitaConta(true)===false&&chiamate.length===1;localStorage.removeItem(VISNO_K);
    // pannello: solo per l'amministratrice, dati riassunti dal server
    ACC={nome:'prova',token:'00000000-0000-4000-8000-000000000000',rev:1};ADM.ok=false;openSettings();r.nascosto=!document.querySelector('[onclick="openAdmin()"]');
    window.accRpc=async fn=>{if(fn==='admin_e')return true;if(fn==='admin_statistiche')return {oggi:'18/11/2026',visite:{oggi:3,g7:10,g30:20,tot:25},uniche:{oggi:2,g7:6,g30:9,tot:11},nuovi7:4,mobile30:50,app30:10,
      giorni:Array.from({length:30},(_,i)=>['0'+(i%9+1)+'/11',i,Math.floor(i/2)]),ore:Array.from({length:24},(_,i)=>i%5),versioni:[['v8.0',9]],profili:{tot:3,nuovi7:1,attivi7:2},
      partite:{tot:7,g7:2,vitt:60,gruppo:10},eroi:[['ladro',2,50]],dungeon:[['rocca',3,67,16]],morti:[['goblin,goblin,bandito',2]],carte:[['pugnalata',10],['schivata+',4]],classifica:{tot:4,solo:211,coop:null}};throw new Error('offline')};
    await adminCheck();r.controllo=ADM.ok&&localStorage.getItem(VISNO_K)==='1';render();r.visibile=!!document.querySelector('[onclick="openAdmin()"]');
    openAdmin();await sleep(50);const m=document.querySelector('.admin');
    r.pannello=!!m&&m.querySelectorAll('.adtile').length>=11&&m.querySelectorAll('.adchart').length===2&&m.querySelectorAll('.adchart:not(.ore) .adbar').length===30&&m.textContent.includes('2 Goblin Predone')&&m.textContent.includes('Schivata+')&&m.textContent.includes('Ladro');
    // senza le sezioni nuove del server (piattaforme, api) il pannello non le mostra e non si rompe
    r.vecchioServer=!m.textContent.includes('Client nativi')&&!m.textContent.includes('Da dove giocano');
    // con l'endpoint «api»: piattaforme, chiamate delle app, errori e versioni delle app
    ADM.dati=Object.assign({},ADM.dati,{versioni:[['v8.1',9,'web'],['1.0.0',3,'android']],piattaforme:[['web',20,9,7],['android',4,2,3],['ios',1,1,0]],
      api:{g7:12,errori7:2,dispositivi7:3,giocatori7:1,ultima:'18/11 11:54',azioni:[['android','visita',6,0,0],['android','partita',4,1,1],['ios','accedi',2,1,0]],errori:[['credenziali',1],['dati_non_validi',1]]}});
    render();const m2=document.querySelector('.admin'),tx=m2?m2.textContent:'';
    r.client=tx.includes('Da dove giocano')&&tx.includes('Android')&&tx.includes('iPhone e iPad')&&tx.includes('Client nativi')&&tx.includes('Fine partita')&&tx.includes('Apertura app')&&tx.includes('Nome, password o token sbagliati')&&tx.includes('1.0.0 (Android)')&&tx.includes('18/11 11:54')&&m2.querySelectorAll('.adtile').length>=15;
    r.vecchioTempi=!tx.includes('Tempo di gioco');
    // con database/durata.sql: tempo di gioco delle partite vinte
    ADM.dati=Object.assign({},ADM.dati,{tempi:{con:5,vinte:3,media:12.4,migliore:4.5,fasce:[1,0,2,0],dungeon:[['rocca',3,12.4,4.5]],eroi:[['ladro',2,9.1],['guerriero',1,18.6]]}});render();
    const tx3=(document.querySelector('.admin')||{}).textContent||'';r.tempi=tx3.includes('Tempo di gioco')&&tx3.includes('12,4 min')&&tx3.includes('4,5 min')&&tx3.includes('sotto 5 min 1');
    window.accRpc=async()=>{throw new Error('non_autorizzato')};await adminLoad();r.rifiuto=ADM.stato==='err'&&/non è amministratore/.test(ADM.msg);
    modal=null;window.sbClient=sb0;window.accRpc=rpc0;ACC=acc0;ADM.ok=false;ADM.dati=null;SET.stats=st0;
    try{localStorage.removeItem(VIS_K);localStorage.removeItem(VISNO_K);sessionStorage.removeItem(VISS_K)}catch(e){}render();return r});
  ok(adm.locale&&adm.prima&&adm.dati&&adm.stessoCodice,'visite: una sola chiamata con codice casuale, versione, telefono e app (niente nomi); nelle prove in locale non si conta '+JSON.stringify({l:adm.locale,p:adm.prima,d:adm.dati,c:adm.stessoCodice}));
  ok(adm.unaPerScheda&&adm.spenta&&adm.admNonConta,'visite: una per scheda, niente con «Invia statistiche anonime» spento né sui dispositivi dell\'amministratrice');
  ok(adm.vecchioTempi&&adm.tempi,'amministrazione: tempo di gioco delle partite vinte (medie, migliore, fasce del bonus, per dungeon ed eroe); senza i dati nuovi non compare '+JSON.stringify({v:adm.vecchioTempi,t:adm.tempi}));
  ok(adm.nascosto&&adm.controllo&&adm.visibile&&adm.pannello&&adm.rifiuto,'amministrazione: nascosta agli altri, visibile dopo il controllo sul server, pannello con visite, grafici, eroi, carte e nemici; rifiuto gestito '+JSON.stringify({n:adm.nascosto,c:adm.controllo,v:adm.visibile,p:adm.pannello,r:adm.rifiuto}));
  ok(adm.vecchioServer&&adm.client,'amministrazione: piattaforme e chiamate dei client nativi (app, azioni, errori, versioni delle app); senza questi dati il pannello resta com\'era '+JSON.stringify({v:adm.vecchioServer,c:adm.client}));

  console.log('');
  if(errori.length){console.log('Errori JavaScript nella pagina:');[...new Set(errori)].forEach(e=>console.log('  - '+e));fallite++}
  await browser.close();
  console.log(fallite?`PROVE FALLITE: ${fallite}`:'Tutte le prove sono passate.');
  process.exit(fallite?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
