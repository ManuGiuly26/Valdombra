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
    run.om=3;g.hero.ended=false;g.hero.shTurn=0;c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);endHeroTurn();r.puro=run.om===2&&!g.hero.st.oscuro;
    // falò
    run.om=6;run.screen='rest';ACT.restHeal({},run);r.falo=run.om===3;
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
    nuova('guerriero');R.players.solo.stx.elites=2;R.players.solo.stx.bk=1;R.win=true;R.phase='end';const g0=getGems();r.premio=gemsAward();r.premioOk=getGems()===g0+3;
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
  ok(lo.puro&&lo.falo,'l\'Ombra cala con un turno di sola Luce e al Falò');
  ok(lo.spento,'dall\'interruttore Sviluppo Luce e Ombra si spegne');
  ok(lo.assorbi,'in gruppo si assorbe l\'Ombra di un compagno');
  ok(lo.forzaBuio,'le creature d\'ombra si rafforzano con l\'Ombra del gruppo');
  ok(lo.bloccato&&lo.costruito&&lo.tutto,'villaggio: prima la richiesta, poi le Corone; si ricostruisce tutto');
  ok(lo.cimeli==='lanterna,ancora'&&lo.cambio&&lo.aspetto,'gemme: cimeli, cambio in Corone e aspetti ('+lo.cimeli+')');
  ok(lo.bonus.max===98&&lo.bonus.oro===99+75&&lo.bonus.pot===3&&lo.bonus.su===3&&/lanterna/.test(lo.bonus.rel)&&/ancora/.test(lo.bonus.rel)&&lo.tempio>=7,'i bonus del villaggio e i cimeli valgono in partita '+JSON.stringify(lo.bonus)+' armatura '+lo.tempio);
  ok(lo.senza.max===86&&!/lanterna/.test(lo.senza.rel),'senza Villaggio e Gemme (ora sempre accesi) i bonus non si applicano');
  ok(lo.giorno,'nella sfida del giorno il villaggio non vale');
  ok(lo.premio===3&&lo.premioOk,'gemme di fine partita (più rare dalla v8.3): niente per le élite, 2 per il boss, 1 per la vittoria');
  ok(lo.vilModal&&lo.bottega&&lo.sviluppo&&lo.ui,'villaggio, bottega, guida, impostazioni e combattimento in Ombra si vedono');

  console.log('7b. Ombra per tutti gli eroi, strade segrete e codice Gemme');
  const nov=await page.evaluate(async()=>{const r={};SET.lo=true;SET.tut=false;SPEED=0;
    const nuova=(cls='guerriero')=>{R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);pickCls=cls;pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME)};
    const carta=(id,up=false)=>{const c={id,up,uid:uid++};g.hero.hand.push(c);g.hero.energy=9;return c};
    // spenta di base: il Necromante ha ancora carte senza lato Ombra
    SET.lox=SET_DEF.lox;nuova('necromante');r.spentaBase=SET_DEF.lox===false&&!R.lox&&!canShadow({id:'evocascheletro',up:false})&&canShadow({id:'colpo',up:false});
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
    r.errori=errs;SET.lox=false;
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
    // in Sviluppo resta solo Luce e Ombra
    openSettings();render();const sw=[...document.querySelectorAll('button.sw')].map(x=>x.getAttribute('aria-label'));
    r.sviluppo=sw.includes('Luce e Ombra')&&sw.includes('Ombra per tutti gli eroi')&&!['Villaggio di Valdombra','Gemme','Grafica Pixellab','Strade segrete'].some(k=>sw.includes(k));
    r.sempre=SET_DEF.vil&&SET_DEF.gem&&SET_DEF.px&&SET.vil&&SET.gem;closeModal();modal=null;R=null;screen='title';render();return r});
  ok(nov.spentaBase&&nov.accesa&&!nov.senzaLato.length&&nov.potere,'Ombra per tutti gli eroi: spenta di base; accesa, ogni carta giocabile ha un lato Ombra (non i Poteri)'+(nov.senzaLato.length?' senza: '+nov.senzaLato:''));
  ok(nov.cura===8&&nov.om===1&&nov.scheletri===2&&nov.condanna===12&&nov.condannaLuce===8,`lato Ombra esteso: cura 6 (+25% nella Luce = 8), 2 Scheletri, 12 Condanna (Luce 8), +1 Ombra (${nov.cura}/${nov.scheletri}/${nov.condanna})`);
  ok(nov.pescaOmbra===0&&nov.pescaLuce===-1&&nov.colpo===9&&nov.testo,`carte senza numeri: 1 carta in più; le carte di base restano uguali (${nov.colpo} danni); il testo mostra i numeri del lato Ombra`);
  ok(!nov.errori.length,'ogni carta si gioca dal lato Ombra esteso senza errori'+(nov.errori.length?': '+nov.errori.slice(0,5).join(' | '):''));
  ok(nov.quota>.12&&nov.quota<.42&&nov.maiElite&&nov.maiGiorno&&nov.unaSola,`strade segrete: rare (in ${Math.round(nov.quota*100)}% delle mappe), mai su élite, mercante, falò, primo piano o prima del boss, mai nella sfida del giorno, una per mappa`);
  ok(nov.stanza&&nov.vista&&nov.presa&&nov.scrigno,'strada segreta: due reliquie segrete e uno scrigno, se ne sceglie uno, poi si entra nella casella');
  ok(nov.fuoriPool&&Object.values(nov.reliquie).every(Boolean),'reliquie segrete: non si trovano altrove e funzionano '+JSON.stringify(nov.reliquie));
  ok(nov.hashGemme&&nov.gemme&&nov.sbagliato,'codice Gemme: nel sorgente solo gli hash, dà 200 Gemme, un codice sbagliato no');
  ok(nov.sviluppo&&nov.sempre,'in Sviluppo restano solo Luce e Ombra e Ombra per tutti gli eroi; Villaggio, Gemme e Grafica Pixellab sempre accesi');

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
    missDone(run,'segreto');R.phase='end';const cr0=getCrowns(),gm0=getGems();const n=missAward();r.premio=n===7&&getCrowns()===cr0+25*7&&getGems()===gm0+1*7;missAward();r.unaVolta=getCrowns()===cr0+25*7;render();r.panelFine=document.body.innerHTML.includes('Missioni: 7 su 8');
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
    // combattimento a scena (Sviluppo)
    R=null;screen='title';openSettings();render();r.interruttore=!!document.querySelector('button.sw[aria-label="Combattimento a scena"]')&&SET_DEF.scena===false;closeModal();
    SET.scena=true;applySet();r.scena=document.body.classList.contains('scena');SET.scena=false;applySet();r.scenaVia=!document.body.classList.contains('scena');
    modal=null;R=null;screen='title';render();return r});
  ok(eq.luceArm===eq.mezzoArm+5&&eq.mezzoStr===0&&eq.ombraStr===2&&eq.poteri,`poteri: Guerriero +5 Armatura nella Luce, +2 Forza nell'Ombra, niente tra 3 e 4 Ombra; ogni eroe ne ha due (${eq.luceArm}/${eq.mezzoArm}/${eq.ombraStr})`);
  ok(eq.curaLuce===10&&eq.cura===8&&eq.curaBuio===4&&eq.scudo===3&&eq.scudoNo===0,`Luce: cure +25% (${eq.curaLuce}) e Scudo di Luce +3 (${eq.scudo}); da 7 Ombra le cure sono a metà (${eq.curaBuio})`);
  ok(eq.spentoArm===0&&eq.spentoCura===8,'senza Luce e Ombra niente poteri né cure cambiate');
  ok(eq.maledette.energia===1&&eq.maledette.mano===1&&eq.maledette.forza===3&&eq.maledette.cursed&&eq.maledette.sanguina===2&&eq.maledette.niente&&eq.maledette.prosegui&&eq.maledette.cuore&&eq.maledette.meta===4&&eq.maledette.fuori&&eq.maledette.mercante,'reliquie maledette: forti e con il loro difetto; le vende il Mercante d\'Ombra '+JSON.stringify(eq.maledette));
  ok(eq.tre&&eq.lampo&&eq.alBoss&&eq.premio&&eq.unaVolta&&eq.panelFine&&eq.maiGiorno,'missioni: tre a partita, si completano, premio di Corone e Gemme una volta sola, niente nella sfida del giorno '+JSON.stringify({t:eq.tre,l:eq.lampo,b:eq.alBoss,p:eq.premio,u:eq.unaVolta,f:eq.panelFine,g:eq.maiGiorno}));
  ok(eq.dueClimi&&eq.gelo&&eq.nebbia&&eq.luna&&eq.vento&&eq.mappa,'climi: due piani per mappa; Gelo, Nebbia, Luna nera e Vento funzionano e si vedono sulla mappa '+JSON.stringify({d:eq.dueClimi,g:eq.gelo,n:eq.nebbia,l:eq.luna,v:eq.vento,m:eq.mappa}));
  ok(eq.aiutiLista==='locanda,mercato,fucina'&&eq.aiutoCura&&eq.aiutoUno,'aiuti del villaggio: uno per partita, dagli edifici ricostruiti ('+eq.aiutiLista+')');
  ok(eq.fidMeta&&eq.fidNo&&eq.fidTempio&&eq.fidArm===4,'più Ombra, meno aiuto: da 5 a metà, da 7 solo la sacerdotessa; l\'Armatura del Tempio sparisce nell\'Ombra '+JSON.stringify({m:eq.fidMeta,n:eq.fidNo,t:eq.fidTempio,a:eq.fidArm}));
  ok(eq.cureNemico<=Math.floor(eq.trollMax*.5),'un nemico si cura al massimo di metà dei suoi PV per combattimento ('+eq.cureNemico+'/'+eq.trollMax+')');
  ok(eq.maledizioni===10,'al massimo 10 maledizioni per combattimento: niente più combattimenti senza fine ('+eq.maledizioni+')');
  ok(eq.gemNo&&eq.gemSi&&eq.pelBlocco&&eq.pelNo&&eq.pelSi,'purificazione pagata in Gemme: Incenso 2, Pellegrino 4; senza Gemme non si può '+JSON.stringify({a:eq.gemNo,b:eq.gemSi,c:eq.pelBlocco,d:eq.pelNo,e:eq.pelSi}));
  ok(eq.artOmbra&&eq.ricaduta,'carte dal lato Ombra con la loro illustrazione; se manca resta quella normale');
  ok(eq.interruttore&&eq.scena&&eq.scenaVia,'Combattimento a scena: interruttore in Sviluppo, spento di base');

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
    render();r.schermata=document.body.innerHTML.includes('Abitanti salvati')&&document.body.innerHTML.includes('Riapri il cancello');const pa=UI.lastPorta;r.premio=!!pa&&pa.cr===4*R.porta.salvati;const c1=getCrowns();render();r.unaVolta=getCrowns()===c1;
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
  ok(ac.schermata&&ac.premio&&ac.unaVolta&&ac.record&&ac.menu,'Aprite il cancello: schermata finale, 4 Corone per abitante una volta sola, record, pulsante nel menu Gioca');
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
    // abitanti in salvo: 2 fino a 5, 5 fino a 10, poi 8, 11, 14; calano con i persi
    nuova('guardiano','porta');const N=(a,b)=>{R.porta.salvati=a;R.porta.persi=b;return portaFollaN()};
    r.soglie=N(0,0)===0&&N(1,0)===2&&N(5,0)===2&&N(6,0)===5&&N(10,0)===5&&N(11,0)===8&&N(20,0)===8&&N(25,0)===11&&N(33,0)===14&&N(40,0)===14;
    r.calano=N(12,1)===8&&N(12,2)===5&&N(4,4)===0&&N(3,9)===0;
    N(12,0);render();let w=0;while(!PXI['abitanti/ab1']&&w<300){await new Promise(t=>setTimeout(t,10));w++}render();const f1=document.querySelectorAll('.folla img').length;
    N(12,3);render();const f2=document.querySelectorAll('.folla img').length;r.vede=f1===8&&f2===5;
    nuova('guardiano');render();r.normale=!document.querySelector('.folla');
    R=null;modal=null;screen='title';render();return r});
  ok(an.tutte&&an.colpo&&an.elenco&&an.numero&&an.scelta&&an.letale&&an.riquadro&&an.fineTurno,`anteprima dei danni: uguale ai danni veri per ogni carta (${an.n} prove) senza toccare lo stato; elenco col mouse, numero sul bersaglio, letale `+JSON.stringify({t:an.tutte,d:an.diverse,c:an.cambiato,co:an.colpo,e:an.elenco,n:an.numero,s:an.scelta,l:an.letale,q:an.riquadro,f:an.fineTurno}));
  ok(an.retrovie&&an.benda&&an.falo,'Aprite il cancello: Retrovie con bende e armaioli al posto del Falò (che resta nella partita normale) '+JSON.stringify({r:an.retrovie,b:an.benda,f:an.falo}));
  ok(an.soglie&&an.calano&&an.vede&&an.normale,'Aprite il cancello: dietro l\'eroe gli abitanti in salvo, a soglie, e calano quando se ne perdono '+JSON.stringify({s:an.soglie,c:an.calano,v:an.vede,n:an.normale}));

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
    mod('umido');r.umido=Math.abs(restPct(run)-(run.vb&&run.vb.erbe>=2?.2:.15))<1e-9;
    // bonus di tempo solo vincendo: +30% sotto 5 minuti, +15% fino a 10, +5% fino a 20
    R.win=true;r.tempo=tempoBonus(4*60000)===.3&&tempoBonus(9*60000)===.15&&tempoBonus(19*60000)===.05&&tempoBonus(25*60000)===0;R.win=false;r.tempo=r.tempo&&tempoBonus(60000)===0;
    R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);R.tAcc=3*60000;R.tLast=Date.now();endRun(true);commit();render();
    r.fine=document.body.innerHTML.includes('+30% tempo');
    // Luce e Ombra insieme: mazzo con le due facce, carta ingrandita con le due facce
    R=null;startSolo();ctx(ME);render();openView(run.deck,'Il tuo mazzo');render();const duo=document.querySelectorAll('.modal .duo').length,sh=document.querySelectorAll('.modal .duo .card.shadow').length;
    r.mazzo=duo>=9&&sh===duo;closeModal();
    startCombat(['orco'],'combat');ctx(ME);g.hero.hand=[{id:'possente',up:false,uid:uid++}];render();const el=document.querySelector('.hand .card');cardZoom(el);r.zoom=document.querySelectorAll('#czoom .card').length===2&&!!document.querySelector('#czoom .card.shadow');cardZoomClose();
    R=null;screen='title';modal=null;['colpo'].forEach(k=>seenAdd('c',[k]));UI.diCls='all';openDiario('c');render();r.enc=!!document.querySelector('.modal .duo .card.shadow');closeModal();
    // menu essenziale (in Sviluppo): poche cose, eroe e dungeon in una pagina a parte
    SET.menu=true;screen='title';render();{const gb=document.querySelector('.mbig .btn'),gr=document.querySelector('.mtiles');r.largo=!!gb&&!!gr&&Math.abs(gb.getBoundingClientRect().width-gr.getBoundingClientRect().width)<2}
    r.lite=r.largo&&document.querySelectorAll('.mtile').length===6&&!!document.getElementById('guidabtn')&&![...document.querySelectorAll('.mtile')].some(x=>/Guida/.test(x.textContent))&&!document.querySelector('.classes');giocaScroll();render();r.pagina=screen==='solo'&&!!document.querySelector('.classes');
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
  ok(v9.lite&&v9.pagina&&v9.pieno&&v9.eroi,'menu essenziale in Sviluppo (eroe e dungeon in una pagina a parte), menu completo di base; PV degli eroi ribilanciati '+JSON.stringify({l:v9.lite,p:v9.pagina,c:v9.pieno,e:v9.eroi}));

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
    ok(!spenti.length,'nel codice nessun commento // spegne il resto della riga'+(spenti.length?' — '+spenti.join(' | '):''));}
  ok(fo.gufo&&fo.orso,'forme del Druido a inizio turno: il Gufo fa pescare 2 carte in più, l\'Orso dà 2 Armatura '+JSON.stringify(fo.dett));

  console.log('7o. Giocare una carta dalla carta ingrandita (faccia Luce o Ombra)');
  {const prep=async(p,ids)=>p.evaluate(async ids=>{SET.tut=false;SET.lo=true;SET.scena=false;SET.px=true;saveSet();applySet();SPEED=0;R=null;solo=true;ME='solo';isHost=true;chan=null;online=new Set(['solo']);modal=null;UI.sel=null;UI.om=false;
      pickCls='guerriero';pickDg='rocca';pickMode='norm';pickLvl=0;startSolo();ctx(ME);startCombat(ids,'combat');ctx(ME);g.enemies.forEach(e=>{e.hp=e.max=200;e.intent={d:0}});g.hero.st.str=0;run.om=0;
      g.hero.hand=[{id:'colpo',up:false,uid:9001},{id:'possente',up:false,uid:9002},{id:'parata',up:false,uid:9003}];g.hero.energy=3;render();await new Promise(r=>setTimeout(r,250))},ids);
    const clicca=async(p,sel)=>{const el=await p.$(sel);if(!el)return false;const q=await el.boundingBox();await p.mouse.move(q.x+q.width/2,q.y+q.height+30);await p.mouse.move(q.x+q.width/2,q.y+q.height/2,{steps:8});await p.waitForTimeout(120);await p.mouse.click(q.x+q.width/2,q.y+q.height/2);await p.waitForTimeout(350);return true};
    const st=p=>p.evaluate(()=>{ctx(ME);return {om:run.om,hp:g.enemies.map(e=>e.hp),mano:g.hero.hand.map(c=>c.id).join(','),aperta:!document.getElementById('cprev').hidden,sel:UI.sel}});
    const c4=await browser.newContext({viewport:{width:1280,height:800}});await c4.route(/^https?:\/\//,r=>r.abort());const p4=await c4.newPage();const e4=[];p4.on('pageerror',e=>e4.push(e.message));await p4.goto(PAGE);await p4.waitForTimeout(300);
    await prep(p4,['orco']);await p4.hover('.hand .card >> nth=1');await p4.waitForTimeout(350);const facce=await p4.evaluate(()=>[...document.querySelectorAll('#cprev .playable')].map(k=>k.dataset.sh).join(','));
    await clicca(p4,'#cprev .playable[data-sh="1"]');const om1=await st(p4);
    await p4.hover('.hand .card >> nth=0');await p4.waitForTimeout(350);await clicca(p4,'#cprev .playable[data-sh="0"]');const lu1=await st(p4);
    await p4.evaluate(()=>{g.hero.energy=0;render()});await p4.hover('.hand .card >> nth=0');await p4.waitForTimeout(350);const nEn=await p4.evaluate(()=>document.querySelectorAll('#cprev .playable').length);
    await prep(p4,['orco','goblin']);await p4.hover('.hand .card >> nth=1');await p4.waitForTimeout(350);await clicca(p4,'#cprev .playable[data-sh="1"]');const sel=await st(p4);await p4.click('#ent-e1');await p4.waitForTimeout(350);const bers=await st(p4);
    await c4.close();
    const c5=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await c5.route(/^https?:\/\//,r=>r.abort());const p5=await c5.newPage();const e5=[];p5.on('pageerror',e=>e5.push(e.message));await p5.goto(PAGE);await p5.waitForTimeout(300);
    await prep(p5,['orco']);await p5.evaluate(()=>cardZoom(document.querySelectorAll('.hand .card')[1]));await p5.waitForTimeout(250);await p5.tap('#czoom .playable[data-sh="1"]');await p5.waitForTimeout(350);
    const tel=await p5.evaluate(()=>{ctx(ME);return {om:run.om,hp:g.enemies[0].hp,chiusa:document.getElementById('czoom').hidden}});await c5.close();
    ok(facce==='0,1'&&om1.om===1&&om1.hp[0]===188&&om1.mano==='colpo,parata'&&!om1.aperta&&lu1.om===1&&lu1.hp[0]===179&&lu1.mano==='parata'&&nEn===0&&!e4.length,
      'col mouse sulla carta ingrandita: la faccia Ombra la gioca dal lato Ombra (12 danni, +1 Ombra), l\'altra dal lato Luce; senza Energia non si gioca '+JSON.stringify({f:facce,o:om1,l:lu1,n:nEn,err:e4.slice(0,2)}));
    ok(sel.sel&&sel.sel.sh===1&&bers.om===1&&bers.hp[1]===188&&bers.hp[0]===200,'con più nemici la faccia Ombra prepara la carta e poi si sceglie il bersaglio '+JSON.stringify({s:sel.sel,b:bers.hp}));
    ok(tel.om===1&&tel.hp===188&&tel.chiusa&&!e5.length,'sul telefono, tenendo premuta la carta, si tocca la faccia Ombra per giocarla '+JSON.stringify(tel));}

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
    SET.px=true;saveSet();let w=0;while(Object.keys(PXI).length<294&&w<900){await sleep(10);w++}
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
    R=null;solo=true;ME='solo';screen='title';modal=null;render();r.titolo=!!document.querySelector('.pxtitle img');
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
      document.body.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));await sleep(400);r.anteprimaVia=p.hidden}// v9.6: se la carta si può giocare, la carta grande aspetta 0,3 secondi prima di sparire
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
  ok(px.caricate>=294&&!px.mancanti.length&&!px.senzaFigura.length,`le immagini in pixel/ si caricano (${px.caricate}, tutte le ${294} di base${px.mancanti.length?'; mancano: '+px.mancanti.slice(0,8):''}) e ogni eroe ha la sua figura${px.senzaFigura.length?' (mancano: '+px.senzaFigura+')':''}`);
  ok(!px.nemTutti.length&&/pixel\/nemici\/.+\.png/.test(px.nemFig)&&/pxan/.test(px.nemAtt)&&/-attacco/.test(px.nemAtt)&&/pxan/.test(px.nemCol)&&/-colpito/.test(px.nemCol)&&!px.nemFlash,`nemici (${px.nemiciIn}): figura, attacco quando agiscono, colpito al posto del lampo; tutti i 30 hanno le immagini${px.nemTutti.length?' (mancano: '+px.nemTutti+')':''}`);
  ok(/pxan/.test(px.nemMorte)&&/-morte/.test(px.nemMorte)&&/pxdead/.test(px.nemMorto)&&/-morte/.test(px.nemMorto),'nemico sconfitto: animazione di morte, poi resta a terra');
  ok(/pxan/.test(px.attacco)&&/guerriero-attacco/.test(px.attacco)&&/pxan/.test(px.resta)&&/idle/.test(px.fine)&&/pixel\/guerriero\.png/.test(px.fine),'carta Attacco: animazione d\'attacco, che continua se la schermata si ridisegna, poi torna la figura ferma');
  ok(/guerriero-difesa/.test(px.difesa)&&/guerriero-colpito/.test(px.colpito)&&!/\bhit\b/.test(px.colpito)&&/mago-colpito/.test(px.compagno),'carta con Armatura: difesa; danni subiti: colpito al posto del lampo, anche per il compagno');
  ok(px.lampo&&px.sprite&&px.rispenta,'se un\'immagine manca resta la grafica di sempre');
  ok(px.aspetto&&px.negozio,'gli aspetti hanno la loro versione Pixellab, anche nel negozio degli aspetti');
  ok(/combattimento-rocca/.test(px.sfondo)&&px.mappa&&px.mappaEroi&&px.luogo&&px.icona&&px.titolo&&px.villaggio,'sfondi del combattimento, mappa con decorazioni e figura dell\'eroe, luoghi, icone, schermata iniziale e villaggio a stadi '+JSON.stringify({s:!!px.sfondo,m:px.mappa,e:px.mappaEroi,l:px.luogo,i:px.icona,t:px.titolo,v:px.villaggio}));
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
