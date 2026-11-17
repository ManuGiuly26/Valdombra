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
          else if(P.screen==='reward'&&P.reward&&P.reward.cards)send({t:'takeCard',k:0});else if(P.screen==='rest')send({t:'restHeal'});else send({t:'done'});await sleep(0);continue}
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
    startCombat(['goblin'],'combat');ctx(ME);let e=g.enemies[0];e.hp=e.max=999;
    let c=carta('colpo');r.lato=canShadow(c)&&!canShadow({id:'furia',up:false});
    playCard(c.uid,0,ME,null,1);ctx(ME);r.ombraDanno=999-e.hp;r.ombra1=run.om;
    e.hp=999;c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);r.luceDanno=999-e.hp;
    const b0=g.hero.blk;c=carta('parata');playCard(c.uid,null,ME,null,1);ctx(ME);r.armOmbra=g.hero.blk-b0;
    // creatura d'ombra
    startCombat(['scheletro'],'combat');ctx(ME);e=g.enemies[0];e.hp=e.max=999;r.buio=isDark(e);
    c=carta('colpo');playCard(c.uid,0,ME,null,1);ctx(ME);r.buioOmbra=999-e.hp;e.hp=999;
    c=carta('colpo');playCard(c.uid,0,ME,null,0);ctx(ME);r.buioLuce=999-e.hp;
    // con 5 Ombra i nemici colpiscono più forte
    startCombat(['goblin'],'combat');ctx(ME);e=g.enemies[0];e.intent={d:6,tg:ME};run.om=0;const d0=calcDmg(enemyBase(e,e.intent),e,g.hero);run.om=5;r.piuDanni=calcDmg(enemyBase(e,e.intent),e,g.hero)-d0;
    // caduta nell'ombra
    run.om=9;const mx=run.max;e.hp=e.max=999;c=carta('colpo');playCard(c.uid,0,ME,null,1);ctx(ME);r.caduta=run.om===0&&run.max===mx-4&&!!g.hero.st.oscuro;
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
    nuova('guerriero');R.players.solo.stx.elites=2;R.players.solo.stx.bk=1;R.win=true;R.phase='end';const g0=getGems();r.premio=gemsAward();r.premioOk=getGems()===g0+7;
    // schermate
    R=null;screen='title';render();openVillaggio();render();r.vilModal=!!document.querySelector('.vilsvg');closeModal();
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
    run.om=10;R.phase='map';startCombat(['goblin','scheletro'],'combat');ctx(ME);r.paura=(g.enemies[0].st.weak|0)===1&&!g.enemies[1].st.weak;r.cadeSubito=run.om===0&&!!g.hero.st.oscuro;
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
  ok(lo.caduta&&lo.doppio===12,'a 10 Ombra si cade nell\'ombra: danni doppi ('+lo.doppio+') e PV massimi persi');
  ok(lo.puro&&lo.falo,'l\'Ombra cala con un turno di sola Luce e al Falò');
  ok(lo.spento,'dall\'interruttore Sviluppo Luce e Ombra si spegne');
  ok(lo.assorbi,'in gruppo si assorbe l\'Ombra di un compagno');
  ok(lo.forzaBuio,'le creature d\'ombra si rafforzano con l\'Ombra del gruppo');
  ok(lo.bloccato&&lo.costruito&&lo.tutto,'villaggio: prima la richiesta, poi le Corone; si ricostruisce tutto');
  ok(lo.cimeli==='lanterna,ancora'&&lo.cambio&&lo.aspetto,'gemme: cimeli, cambio in Corone e aspetti ('+lo.cimeli+')');
  ok(lo.bonus.max===92&&lo.bonus.oro===99+75&&lo.bonus.pot===3&&lo.bonus.su===3&&/lanterna/.test(lo.bonus.rel)&&/ancora/.test(lo.bonus.rel)&&lo.tempio>=7,'i bonus del villaggio e i cimeli valgono in partita '+JSON.stringify(lo.bonus)+' armatura '+lo.tempio);
  ok(lo.senza.max===80&&!/lanterna/.test(lo.senza.rel),'spegnendo Villaggio e Gemme i bonus spariscono');
  ok(lo.giorno,'nella sfida del giorno il villaggio non vale');
  ok(lo.premio===7&&lo.premioOk,'gemme di fine partita: 1 per élite, 3 per boss, 2 per la vittoria');
  ok(lo.vilModal&&lo.bottega&&lo.sviluppo&&lo.ui,'villaggio, bottega, guida, impostazioni e combattimento in Ombra si vedono');

  console.log('8. Grafica Pixellab (Sviluppo)');
  const px=await page.evaluate(async()=>{const r={};const sleep=ms=>new Promise(t=>setTimeout(t,ms));
    SPEED=0;SET.tut=false;SET.anim=true;setSkin('guerriero',null);r.base=SET_DEF.px===false;
    const nuova=cls=>{solo=false;isHost=true;ME='pA';myName='Prova';chan=null;modal=null;R=newLobby('PIXL');R.players.pA.cls=cls;
      R.players.pB={pid:'pB',name:'Sara',cls:'mago',ready:true};R.order.push('pB');online=new Set(R.order);startRunRoom(0,'PIXEL');
      startCombat(['orco','goblin'],'combat');R.combat.enemies.forEach(e=>{e.hp=e.max=999;e.intent={d:0}});ctx(ME);g.hero.energy=99;render()};
    const sp=pid=>document.querySelector('#ent-h-'+pid+' .pxh');
    const vedi=pid=>{const s=sp(pid);return s?s.className+'|'+s.style.backgroundImage:''};
    // spenta: lo sprite di sempre
    SET.px=false;saveSet();nuova('guerriero');r.spenta=!document.querySelector('.pxh')&&!!document.querySelector('#ent-h-pA img.spr');
    openSettings();r.interruttore=document.querySelector('button.sw[aria-label="Grafica Pixellab"]')?.getAttribute('aria-pressed')==='false';closeModal();
    // accesa: le 40 immagini e la figura di ogni eroe
    SET.px=true;saveSet();let w=0;while(Object.keys(PXI).length<130&&w<600){await sleep(10);w++}
    r.caricate=Object.values(PXI).filter(Boolean).length;
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
    setSkin('guerriero','cremisi');r.aspetto=!sp('pA')&&!!document.querySelector('#ent-h-pA img.spr');setSkin('guerriero',null);
    // nemici: figura, attacco quando agiscono, colpito quando subiscono danni
    nuova('guerriero');const ne=sel=>{const s=document.querySelector(sel);return s?s.className+'|'+s.style.backgroundImage:''};
    r.nemFig=ne('#ent-e0 .pxe');ctx(ME);const e0=g.enemies[0];e0.intent={d:3};
    const gq=R.combat.enemies.map(x=>x.id);r.nemTutti=Object.keys(PXE).filter(id=>!PXI['nemici/'+id]||!PXI['nemici/'+id+'-attacco']||!PXI['nemici/'+id+'-colpito']);
    doIntent(e0);commit();r.nemAtt=ne('#ent-e0 .pxe');await sleep(900);
    ctx(ME);hurtEnemy(g.enemies[1],2);fx('e1','-2','dmg');commit();r.nemCol=ne('#ent-e1 .pxe');
    r.nemFlash=!!document.querySelector('#ent-e1 .spr.hit');r.nemiciIn=gq.join(',');await sleep(900);
    // fuori dal combattimento: scelta dell'eroe e negozio degli aspetti
    R=null;solo=true;ME='solo';screen='title';modal=null;render();
    const scelta=()=>[...document.querySelectorAll('.classes .pxs')].map(e=>e.style.backgroundImage);
    r.scelta=scelta();setSkin('guerriero','cremisi');r.sceltaAspetto=scelta();setSkin('guerriero',null);
    UI.skCls='guerriero';modal={title:'Aspetti',cancel:true,html:skinsHTML()};render();r.negozio=!document.querySelector('.shopgrid .pxs')&&document.querySelectorAll('.shopgrid img.spr').length>0;modal=null;
    SET.px=false;saveSet();render();r.rispenta=!document.querySelector('.pxh')&&!document.querySelector('.pxs');
    R=null;solo=true;ME='solo';screen='title';modal=null;render();return r});
  ok(px.base&&px.spenta&&px.interruttore,'Grafica Pixellab: spenta di base, con l\'interruttore in Sviluppo, e senza resta lo sprite di sempre');
  ok(px.caricate===130&&!px.senzaFigura.length,`le immagini in pixel/ si caricano (${px.caricate}/130) e ogni eroe ha la sua figura${px.senzaFigura.length?' (mancano: '+px.senzaFigura+')':''}`);
  ok(!px.nemTutti.length&&/pixel\/nemici\/.+\.png/.test(px.nemFig)&&/pxan/.test(px.nemAtt)&&/-attacco/.test(px.nemAtt)&&/pxan/.test(px.nemCol)&&/-colpito/.test(px.nemCol)&&!px.nemFlash,`nemici (${px.nemiciIn}): figura, attacco quando agiscono, colpito al posto del lampo; tutti i 30 hanno le immagini${px.nemTutti.length?' (mancano: '+px.nemTutti+')':''}`);
  ok(/pxan/.test(px.attacco)&&/guerriero-attacco/.test(px.attacco)&&/pxan/.test(px.resta)&&/idle/.test(px.fine)&&/pixel\/guerriero\.png/.test(px.fine),'carta Attacco: animazione d\'attacco, che continua se la schermata si ridisegna, poi torna la figura ferma');
  ok(/guerriero-difesa/.test(px.difesa)&&/guerriero-colpito/.test(px.colpito)&&!/\bhit\b/.test(px.colpito)&&/mago-colpito/.test(px.compagno),'carta con Armatura: difesa; danni subiti: colpito al posto del lampo, anche per il compagno');
  ok(px.lampo&&px.sprite&&px.aspetto&&px.rispenta,'se un\'immagine manca o c\'è un aspetto attivo resta la grafica di sempre');
  ok(px.scelta.length>=4&&px.scelta.some(s=>s.includes('pixel/guerriero.png'))&&!px.sceltaAspetto.some(s=>s.includes('pixel/guerriero.png'))&&px.negozio,`fuori dal combattimento: figure Pixellab nella scelta dell'eroe (${px.scelta.length}), sprite con un aspetto attivo e nel negozio degli aspetti`);

  console.log('');
  if(errori.length){console.log('Errori JavaScript nella pagina:');[...new Set(errori)].forEach(e=>console.log('  - '+e));fallite++}
  await browser.close();
  console.log(fallite?`PROVE FALLITE: ${fallite}`:'Tutte le prove sono passate.');
  process.exit(fallite?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
