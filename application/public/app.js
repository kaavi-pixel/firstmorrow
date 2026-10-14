// Viewer for the one shared world. The server runs the world; this page shows it, moves the
// clock forward between updates, and can show any finished day from the timeline.
import {clone,wellbeing,meanWellbeing,NEEDS,workMinute,activityFor,currentProject,clockLabel,workDaysLeft,WORK} from './core.js';
import {paintSprite,paintPerson,paintAgent,createWorldRenderer} from './art.js';
import {SCIENCE,conservationErrors} from './physics.js';
import {advanceJourneys} from './exploration.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const API='__PORT_3000__'.startsWith('__')?'':'__PORT_3000__';
const POLL_MS=20000,MAX_LOCAL_MIN=360,AGENT_COLOR='#5fa8c4';
let live=null,statics=new Map(),skew=0,base=null,world=null,agents=[],plan=null;
let view=null,viewDay=null,panel=null,selected=null,toastTimer,lastSeen=null,fetchedAt=0;

const abs=()=>world.day*1440+world.minute;
const stamp=(d,m)=>`Day ${d+1} ${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const fmt=(n,d=0)=>new Intl.NumberFormat('en',{notation:n>99999?'compact':'standard',maximumFractionDigits:d}).format(n);
function toast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),6000);}
async function getJSON(path){const r=await fetch(`${API}/api/${path}`,{credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(d.error||'Request failed.'),{status:r.status});return d;}

// Live data.
function merge(dyn){return dyn.map(d=>{const s=statics.get(d.id);return s?{...s,...d}:null;}).filter(Boolean);}
async function refresh(){
  try{
    const d=await getJSON('live');
    if(d.staticCount>statics.size){const b=await getJSON(`buildings?n=${d.staticCount}`);for(const s of b.buildings)statics.set(s.id,s);renderer.clearCache();}
    skew=d.serverNow-Date.now();live=d;fetchedAt=Date.now();
    if(d.preview){
      document.querySelector('.welcome-card h1').textContent='Regional terrain preview';
      document.querySelector('.welcome-card p').textContent='An isolated development world with no model calls. The live world runs separately; boats remain disabled.';
      $('preview-note').hidden=false;
    }
    base={...clone(d.world),buildings:merge(d.world.buildings)};
    plan=d.plan;agents=[{...d.agent,color:AGENT_COLOR}];
    const newest=base.history.at(-1);
    if(lastSeen&&newest&&newest.text!==lastSeen.text&&viewDay===null)toast(newest.text);
    lastSeen=newest;
    localAdvance();updateScrubber();if(panel==='log')renderLog();if(panel==='settings')renderAbout();
    try { $('welcome').hidden=localStorage.getItem('fm-seen')==='1'; } catch { /* Opaque previews have no local storage. */ }
  }catch(e){if(!live)toast(e.status===503?'The world is starting.':'Could not reach the world. Retrying.');}
}
// Between updates, move the clock and construction forward locally. Day-end physics waits for the server.
function localAdvance(){
  if(!base)return;
  const now=Date.now()+skew,minutes=Math.max(0,Math.min(MAX_LOCAL_MIN,Math.floor((now-live.simAt)/1000)));
  const w=clone(base);
  for(let i=0;i<minutes;i++){w.minute++;if(w.minute>=1440){w.minute=0;w.day++;}advanceJourneys(w);if(currentProject(w))workMinute(w);}
  world=w;if(viewDay===null)view=world;
}
setInterval(()=>{if(base){localAdvance();update();}},1000);
setInterval(refresh,POLL_MS);
addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-fetchedAt>5000)refresh();});

// Timeline: any finished day, as it ended.
const dayCache=new Map();
function updateScrubber(){
  const s=$('scrub'),today=world?.day??0;
  s.max=String(today);if(viewDay===null)s.value=String(today);
  s.disabled=today===0;
}
async function showDay(d){
  if(!world)return;
  if(d>=world.day){goLive();return;}
  viewDay=d;$('scrub-label').textContent=`Day ${d+1}`;
  document.querySelector('.timeline').classList.add('past');$('status').classList.add('past');$('status-label').textContent='Back to live';
  try{
    let snap=dayCache.get(d);if(!snap){snap=await getJSON(`day?d=${d}`);dayCache.set(d,snap);}
    if(viewDay!==d)return;
    const w=clone(base);
    if (!snap.geographyVersion) { delete w.geography; delete w.exploration; }
    else if(snap.exploration)w.exploration=clone(snap.exploration);
    Object.assign(w,{day:d,minute:960,resources:snap.resources,groundwaterL:snap.groundwaterL,materialReserveKg:snap.materialReserveKg,balances:snap.balances,history:snap.log});
    for(const p of w.inhabitants)if(snap.needs[p.id])p.needs=snap.needs[p.id];
    w.buildings=merge(snap.buildings);
    view=w;renderer.clearCache();closeCard();update();if(panel)openPanel(panel,true);
  }catch(e){toast(e.message);}
}
function goLive(){
  viewDay=null;view=world;$('scrub').value=String(world?.day??0);$('scrub-label').textContent='Live';
  document.querySelector('.timeline').classList.remove('past');$('status').classList.remove('past');$('status-label').textContent='Live';
  renderer.clearCache();update();if(panel)openPanel(panel,true);
}
let scrubTimer;
$('scrub').addEventListener('input',e=>{const d=+e.target.value;$('scrub-label').textContent=d>=(world?.day??0)?'Live':`Day ${d+1}`;clearTimeout(scrubTimer);scrubTimer=setTimeout(()=>showDay(d),120);});
$('status').addEventListener('click',()=>{if(viewDay!==null)goLive();});

// People and the AI.
function agentActivity(a){
  const w=view,h=w.minute/60,proj=currentProject(w),t=Date.now()/1000;
  const wander=(seed,r=3)=>{const k=Math.floor(t/45)+seed;return {x:11+Math.round(Math.sin(k*1.7)*r),y:11+Math.round(Math.cos(k*2.3)*r)};};
  if(viewDay===null&&plan&&plan.agentId===a.id){
    if(plan.pending)return {kind:'think',label:a.status==='resting'?'Resting until tomorrow':'Thinking about what to build',tile:wander(7,5)};
    if(plan.artifactName)return {kind:'survey',label:`Marking out ${plan.artifactName}`,tile:{x:(plan.x??10)+1,y:plan.y??10}};
  }
  if(proj&&proj.agentId===a.id&&h>=8&&h<17)return {kind:'direct',label:`Directing work on ${proj.name}`,tile:{x:proj.x+1,y:proj.y+1}};
  if(h>=22||h<6)return {kind:'watch',label:'Keeping watch',tile:{x:12,y:12}};
  if(a.status==='error')return {kind:'idle',label:'Could not reach its model',tile:{x:13,y:11}};
  return {kind:'idle',label:'Watching the settlement',tile:wander(13,4)};
}
const renderer=createWorldRenderer($('world'),{
  getWorld:()=>view||{day:0,minute:360,inhabitants:[],buildings:[]},getSpeed:()=>viewDay===null?1:0,
  activityFor:i=>activityFor(view,i),onSelect:t=>{if(t){selected=t;renderCard();}else closeCard();},
  getAgents:()=>view?agents:[],agentActivity:a=>agentActivity(a),
  getSpeech:a=>viewDay===null&&a.say&&world&&abs()-a.sayAt<240?a.say:null
});

// Interface.
function update(){
  if(!view)return;
  if(live?.preview&&viewDay===null)$('status-label').textContent='Preview';
  $('day').textContent=`Day ${view.day+1}`;$('time').textContent=viewDay===null?clockLabel(view):'End of day';
  const project=currentProject(view);
  const showPlan=viewDay===null&&plan,showWait=viewDay===null&&live?.waiting;
  $('project').hidden=!project&&!showPlan&&!showWait;
  if(project){
    const pct=project.progressHours/project.laborHours,left=workDaysLeft(project);
    $('project-name').textContent=project.name;$('project-bar').style.width=`${pct*100}%`;
    $('project-left').textContent=left<1?`${Math.ceil(left*8)} h left`:`${left.toFixed(1)} days left`;
  }else if(showWait){$('project-name').textContent='Waiting for materials';$('project-bar').style.width='0';$('project-left').textContent='';}
  else if(showPlan){const a=agents[0];$('project-name').textContent=a.status==='resting'?`${a.name} is resting`:`${a.name} is ${plan.pending?'thinking':'planning'}`;$('project-bar').style.width=`${Math.min(1,(abs()-plan.start)/WORK.planMinutes)*100}%`;$('project-left').textContent='';}
  if(panel==='people')renderPeople();if(panel==='stock')renderStock();
  if(selected)renderCard(true);
  updateScrubber();
}
function openPanel(name,refresh=false){
  if(panel===name&&!refresh){closePanel();return;}
  panel=name;$('panel').hidden=false;
  $('panel-title').textContent={people:'People',stock:'World',log:viewDay===null?'Log':`Day ${viewDay+1}`,settings:'About'}[name];
  document.querySelectorAll('[data-view]').forEach(s=>s.hidden=s.dataset.view!==name);
  document.querySelectorAll('[data-panel]').forEach(b=>b.classList.toggle('on',b.dataset.panel===name));
  if(name==='people')renderPeople();if(name==='stock')renderStock();if(name==='log')renderLog();if(name==='settings')renderAbout();
  if(innerWidth<=640&&!refresh)closeCard();
}
function closePanel(){panel=null;$('panel').hidden=true;document.querySelectorAll('[data-panel]').forEach(b=>b.classList.remove('on'));}
function closeCard(){selected=null;$('card').hidden=true;}
function paintPeople(root){root.querySelectorAll('[data-sprite-person]').forEach(c=>paintPerson(c,view.inhabitants.find(p=>p.id===c.dataset.spritePerson)));root.querySelectorAll('[data-sprite-agent]').forEach(c=>{const a=agents.find(a=>a.id===c.dataset.spriteAgent);if(a)paintAgent(c,a);});}
function renderPeople(){
  if(!view)return;
  const html=view.inhabitants.map((p,i)=>`<button class="row-item" data-person="${p.id}"><canvas data-sprite-person="${p.id}"></canvas><span><strong>${p.name}</strong><small>${esc(activityFor(view,i).label)}</small></span><span class="mono">${wellbeing(p)}%</span></button>`).join('')
    +agents.map(a=>`<button class="row-item" data-agent="${a.id}"><canvas data-sprite-agent="${a.id}"></canvas><span><strong>${esc(a.name)}</strong><small>${esc(agentActivity(a).label)}</small></span><span class="mono">AI</span></button>`).join('');
  if($('people-list').dataset.html!==html){$('people-list').innerHTML=html;$('people-list').dataset.html=html;paintPeople($('people-list'));}
}
function renderStock(){
  if(!view)return;
  const r=view.resources,crops=view.buildings.filter(b=>b.built!==false).reduce((s,b)=>s+b.physical.cropAreaM2,0);
  const items=[['Water',fmt(r.water),'L'],['Food',fmt(r.food/(view.inhabitants.length*SCIENCE.foodPerPersonKcal),0),'days'],['Energy',fmt(r.energy,1),'kWh'],['Materials',fmt(r.materials),'kg'],['Aquifer',fmt(view.groundwaterL/1000,1),'kL'],['Crops',crops,'m²']];
  const html=items.map(([k,v,u])=>`<div><span>${k}</span><strong>${v}</strong><small>${u}</small></div>`).join('');
  if($('stock').innerHTML!==html)$('stock').innerHTML=html;
  if(!$('assumptions').hidden)$('balance').textContent=Object.entries(conservationErrors(view)).map(([k,v])=>`${k} ${Math.abs(v)<1e-6?'balanced':v.toExponential(2)}`).join('\n');
}
function renderLog(){
  if(!view)return;
  const items=[...view.history].reverse();
  $('log').innerHTML=items.length?items.map(n=>`<li><time>${stamp(n.day,n.minute??0)}</time>${n.buildingId?`<button data-building="${n.buildingId}">${esc(n.text)}</button>`:`<span>${esc(n.text)}</span>`}</li>`).join(''):`<li><time></time><span class="muted">${viewDay===null?'Nothing yet.':'A quiet day.'}</span></li>`;
}
function renderAbout(){
  if(!live)return;
  $('agent-model').textContent=`${live.agent.name}, an AI (${live.agent.model.split('/').pop()})`;
  $('agent-cap').textContent=live.cap.daily;$('cap-used').textContent=`${live.cap.used} of ${live.cap.daily}`;
  $('since').textContent=new Date(live.startedAt).toLocaleDateString([], {day:'numeric',month:'short',year:'numeric'});
}
function renderCard(soft=false){
  const t=selected,card=$('card');if(!view)return;
  if(t.type==='agent'){
    const a=agents.find(a=>a.id===t.id);if(!a)return closeCard();
    const html=`<div class="card-head"><canvas class="person" data-sprite-agent="${a.id}"></canvas><div><h2>${esc(a.name)}</h2><p>${esc(agentActivity(a).label)}</p></div><button class="x" data-close="card" aria-label="Close">×</button></div>
      ${a.say?`<p class="quote">“${esc(a.say)}”</p>`:''}
      <dl class="facts"><div><dt>Model</dt><dd>${esc(a.model)}</dd></div><div><dt>Proposals</dt><dd>${a.proposals}</dd></div><div><dt>Built</dt><dd>${a.built}</dd></div><div><dt>Tokens</dt><dd>${fmt(a.tokens||0)}</dd></div></dl>`;
    if(card.dataset.html!==html){card.innerHTML=html;card.dataset.html=html;paintPeople(card);}
  }else if(t.type==='person'){
    const i=view.inhabitants.findIndex(p=>p.id===t.id),p=view.inhabitants[i];if(!p)return closeCard();
    const exploration=view.exploration,decision=exploration?.decisions?.[p.id],pack=exploration?.packs?.[p.id],
      known=Object.keys(exploration?.knowledge?.[p.id]?.tiles||{}).length;
    const html=`<div class="card-head"><canvas class="person" data-sprite-person="${p.id}"></canvas><div><h2>${p.name}</h2><p>${esc(activityFor(view,i).label)}</p></div><button class="x" data-close="card" aria-label="Close">×</button></div>
      <p class="quote">“${esc(p.wish)}”</p><div class="tags">${p.values.map(v=>`<span class="tag">${esc(v)}</span>`).join('')}</div>
      ${NEEDS.map(k=>`<div class="need"><span>${k[0].toUpperCase()+k.slice(1)}</span><span class="bar"><i style="width:${p.needs[k]}%"></i></span><span>${Math.round(p.needs[k])}</span></div>`).join('')}
      ${exploration?`<dl class="facts"><div><dt>Observed</dt><dd>${known} tiles</dd></div><div><dt>Carrying</dt><dd>${fmt(pack?.water||0,1)} L · ${fmt(pack?.food||0)} kcal</dd></div></dl>`:''}
      ${decision?`<details open><summary>Last decision · ${esc(decision.outcome)}</summary><p>${esc(decision.reason||'No new decision.')}</p><p class="muted">${esc(decision.detail)}</p></details>`:''}`;
    if(card.dataset.html!==html){card.innerHTML=html;card.dataset.html=html;paintPeople(card);}
  }else{
    const b=view.buildings.find(b=>b.id===t.id);if(!b)return closeCard();
    const status=b.built===false?`Under construction · ${Math.round(b.progressHours/b.laborHours*100)}%`:b.active===false?'Stopped':b.physical.cropAreaM2?`Growing · day ${Math.floor(b.cropGrowthDays||0)} of ${SCIENCE.cropMaturityDays}`:'In use';
    const by=b.agentId&&agents.find(a=>a.id===b.agentId);
    const html=`<div class="card-head"><canvas data-sprite-building="${b.id}"></canvas><div><h2>${esc(b.name)}</h2><p>${status}${by?` · by ${esc(by.name)}`:''}</p></div><button class="x" data-close="card" aria-label="Close">×</button></div>
      <p>${esc(b.reason)}</p>
      <details><summary>Trade-off</summary><p>${esc(b.tradeoff)}</p></details>
      <details><summary>Behavior</summary><pre>${esc(b.code)}</pre></details>`;
    if(card.dataset.html!==html){
      const open=[...card.querySelectorAll('details')].map(d=>d.open);
      card.innerHTML=html;card.dataset.html=html;card.querySelectorAll('details').forEach((d,i)=>d.open=!!open[i]&&soft);
      paintSprite(card.querySelector('canvas'),b);
    }
  }
  card.hidden=false;if(innerWidth<=640&&!soft)closePanel();
}

document.addEventListener('click',e=>{
  const t=e.target.closest('button,a');if(!t)return;
  if(t.dataset.panel)openPanel(t.dataset.panel);
  if(t.dataset.close==='panel')closePanel();
  if(t.dataset.close==='card')closeCard();
  if(t.dataset.person){selected={type:'person',id:t.dataset.person};renderCard();}
  if(t.dataset.agent){selected={type:'agent',id:t.dataset.agent};renderCard();}
  if(t.dataset.building){selected={type:'building',id:t.dataset.building};renderCard();const b=view?.buildings.find(b=>b.id===t.dataset.building);if(b)renderer.focus(b.x,b.y);}
});
$('rotate').addEventListener('click',()=>renderer.rotateBy(Math.PI/2));
$('begin').addEventListener('click',()=>{$('welcome').hidden=true;try{localStorage.setItem('fm-seen','1');}catch{}});
$('assumptions-toggle').addEventListener('click',()=>{$('assumptions').hidden=!$('assumptions').hidden;renderStock();});
$('theme').addEventListener('click',()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';});
addEventListener('keydown',e=>{
  if(e.target.closest('input,select,textarea'))return;
  if(e.key==='Escape'){closeCard();closePanel();}
  if(e.key==='q'||e.key==='Q')renderer.rotateBy(-Math.PI/2);if(e.key==='e'||e.key==='E')renderer.rotateBy(Math.PI/2);
  if(e.key==='+'||e.key==='=')renderer.zoomBy(1.2);if(e.key==='-')renderer.zoomBy(1/1.2);
  if(e.key==='ArrowLeft'&&world){const d=Math.max(0,(viewDay??world.day)-1);$('scrub').value=d;showDay(d);}
  if(e.key==='ArrowRight'&&world&&viewDay!==null){const d=viewDay+1;$('scrub').value=d;showDay(d);}
});
document.documentElement.dataset.theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';
window.render_game_to_text=()=>view&&JSON.stringify({live:viewDay===null,viewDay,day:view.day,clock:clockLabel(view),plan,
  preview:!!live?.preview,geographyVersion:view.geography?.version??null,islandsEnabled:view.geography?.islandsEnabled??false,
  resources:view.resources,balances:conservationErrors(view),wellbeing:meanWellbeing(view),
  inhabitants:view.inhabitants.map((p,i)=>({id:p.id,name:p.name,activity:activityFor(view,i).kind,
    position:view.exploration?.positions[p.id],journey:view.exploration?.journeys[p.id]?.status,
    decision:view.exploration?.decisions?.[p.id]?.outcome})),
  agents:agents.map(a=>({name:a.name,model:a.model,status:a.status,say:a.say})),
  buildings:view.buildings.map(b=>({id:b.id,name:b.name,x:b.x,y:b.y,built:b.built!==false,progress:+(b.progressHours/b.laborHours).toFixed(3)})),last:view.history.at(-1)?.text});
window.advanceTime=ms=>renderer.advance(ms);
window.showDay=showDay;
refresh();
