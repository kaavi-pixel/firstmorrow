import {validatePhysical,minimumMaterialKg,freshPhysicalState,physicalDay,conservationErrors} from './physics.js';
import { atCamp } from './exploration.js';
import { LANDMARKS, pointKey } from './navigation.js';
export const NEEDS = ['water', 'food', 'shelter', 'connection', 'autonomy', 'ecology'];
export const RESOURCES = ['water', 'food', 'energy', 'materials'];
export const ROLES = ['Architect', 'Ecologist', 'Steward'];
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : 0));
export const clone = v => JSON.parse(JSON.stringify(v));
const profiles = [
  { id:'p0', name:'Ada', color:'#c58b5e', hair:'#574130', values:['Pro-natal','Communitarian'], wish:'I want a place where raising a family is a choice I can afford.', weights:[1,1,1.3,1.6,1,.7] },
  { id:'p1', name:'Ren', color:'#81987f', hair:'#303a35', values:['Anti-natal','Autonomy-first'], wish:'A quiet, independent life. Do not make parenthood the price of belonging.', weights:[1,1,1, .7,2,1.2] },
  { id:'p2', name:'Mika', color:'#bdad77', hair:'#574638', values:['Utilitarian','Egalitarian'], wish:'A good average is not enough if someone is still going hungry.', weights:[1.4,1.4,1.2,1.2,1,1] },
  { id:'p3', name:'Sol', color:'#7e9ea5', hair:'#4c3529', values:['Ecocentric','Long-termist'], wish:'Make something that can keep living without exhausting the land.', weights:[1.2,1.2,.8,.8,1,2.4] },
  { id:'p4', name:'Ivo', color:'#ac8587', hair:'#424443', values:['Autonomy-first','Creative'], wish:'Give me tools, room to experiment, and the freedom to be different.', weights:[1,1,1,1.2,2,.7] }
];
export function freshWorld(seed=2049) {
  return { version:3, seed, day:0, minute:360, resources:{water:750,food:472500,energy:10,materials:1000},...freshPhysicalState(),
    inhabitants:profiles.map((p,i)=>({...clone(p), weights:Object.fromEntries(NEEDS.map((k,j)=>[k,p.weights[j]])),
      needs:{water:65,food:65,shelter:22,connection:42+i*3,autonomy:65,ecology:60}})),
    buildings:[], history:[], usage:{input:0,output:0} };
}
export function wellbeing(person) {
  let total=0, weight=0;
  for (const n of NEEDS) { total+=person.needs[n]*person.weights[n]; weight+=person.weights[n]; }
  const vital=Math.min(person.needs.water,person.needs.food,person.needs.shelter);
  return Math.round((total/weight)*.8+vital*.2);
}
export function meanWellbeing(world){return Math.round(world.inhabitants.reduce((s,p)=>s+wellbeing(p),0)/5);}
export function worldSnapshot(world) {
  return {day:world.day,resources:clone(world.resources),groundwaterL:world.groundwaterL,materialReserveKg:world.materialReserveKg,inhabitants:clone(world.inhabitants),
    clock:clockLabel(world),buildings:world.buildings.map((b,i)=>({id:b.id,name:b.name,x:b.x,y:b.y,built:b.built!==false,progress:b.built===false?b.progressHours/b.laborHours:1,code:i>=world.buildings.length-6?b.code.slice(0,4000):undefined,physical:b.physical,cropGrowthDays:b.cropGrowthDays||0,cropStoredKcal:b.cropStoredKcal||0,active:b.active}))};
}
// Models often format pixel art loosely. Art only affects appearance, so repair small format differences.
export function normalizeArt(a){
  if(!a||typeof a!=='object')return a;
  const hex=c=>{
    if(c===null||c===undefined||/^(transparent|none|null)$/i.test(String(c).trim()))return '#000000';
    let v=String(c).trim().replace(/^#/,'').replace(/^0x/i,'');
    if(/^[a-f0-9]{3,4}$/i.test(v))v=[...v.slice(0,3)].map(x=>x+x).join('');
    if(/^[a-f0-9]{8}$/i.test(v))v=v.slice(0,6);
    return /^[a-f0-9]{6}$/i.test(v)?'#'+v.toLowerCase():c;
  };
  if(a.palette&&!Array.isArray(a.palette)&&typeof a.palette==='object')a.palette=Object.values(a.palette);
  if(Array.isArray(a.palette))a.palette=a.palette.slice(0,9).map(hex);
  if(Array.isArray(a.sprite)){
    const n=Array.isArray(a.palette)?a.palette.length:9;
    let rows=a.sprite.slice(0,16).map(r=>(Array.isArray(r)?r.join(''):String(r??'')).replace(/[^0-9]/g,''));
    rows=rows.map(r=>[...r.slice(0,16).padEnd(16,'0')].map(ch=>+ch<n?ch:'0').join(''));
    while(rows.length<16)rows.push('0'.repeat(16));
    a.sprite=rows;
  }
  return a;
}
export function checkArtifact(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) throw new Error('Invalid creation.');
  for(const [k,max] of [['name',70],['reason',1800],['tradeoff',1000],['code',8000]])
    if(typeof a[k]!=='string'||!a[k].trim()||a[k].length>max)throw new Error(`Invalid creation ${k}.`);
  if(!Array.isArray(a.palette)||a.palette.length<2||a.palette.length>9||!a.palette.every(c=>/^#[a-fA-F0-9]{6}$/.test(c)))throw new Error('Invalid sprite palette.');
  if(!Array.isArray(a.sprite)||a.sprite.length!==16||!a.sprite.every(r=>typeof r==='string'&&r.length===16&&[...r].every(c=>/^[0-8]$/.test(c)&&+c<a.palette.length)))throw new Error('Invalid 16×16 sprite.');
  if(!Number.isInteger(a.x)||!Number.isInteger(a.y)||a.x<2||a.x>19||a.y<2||a.y>19)throw new Error('Creation outside world boundary.');
  const costs={},physical=validatePhysical(a.physical);
  for(const k of RESOURCES){let v=a.costs?.[k]??0;const max={water:1000,food:10000,energy:100,materials:2000}[k];if(!Number.isFinite(v)||v<0||v>max)throw new Error('Invalid construction costs.');costs[k]=v;}
  costs.materials=Math.max(costs.materials,minimumMaterialKg(physical));
  const say=typeof a.say==='string'?a.say.trim().slice(0,160):'';
  return {...Object.fromEntries(['name','reason','tradeoff','code','x','y'].map(k=>[k,a[k]])),palette:a.palette.slice(),sprite:a.sprite.slice(),costs,physical,say};
}
export function normalizeEffects(effect, world) {
  if(!effect||typeof effect!=='object'||Array.isArray(effect))throw new Error('Behavior must return an effects object.');
  if(JSON.stringify(effect).length>18000)throw new Error('Behavior output is too large.');
  if(effect.resources && Object.values(effect.resources).some(v=>v!==0))throw new Error('Direct resource changes are forbidden. Request physical actions instead.');
  const actions={};
  for(const [k,max] of Object.entries({collectSolarFraction:1,pumpLiters:2000,irrigateLiters:2000,extractKg:10})){
    const value=effect.actions?.[k]??0;if(!Number.isFinite(value)||value<0)throw new Error('Invalid physical action request.');actions[k]=clamp(value,0,max);
  }
  const needs=[];
  if(effect.needs!==undefined&&!Array.isArray(effect.needs))throw new Error('Needs effects must be an array.');
  if((effect.needs||[]).length>5)throw new Error('Only the five existing inhabitants can receive effects.');
  const seen=new Set();
  for(const e of effect.needs||[]) {
    if(!world.inhabitants.some(p=>p.id===e.id)||seen.has(e.id))throw new Error('Unknown or duplicate inhabitant.');
    seen.add(e.id);
    const clean={id:e.id};
    for(const n of ['connection','autonomy','ecology']) {
      const value=e[n]??0;if(!Number.isFinite(value))throw new Error('Non-numeric needs effect.');clean[n]=clamp(value,-2,2);
    }
    needs.push(clean);
  }
  return {actions,needs};
}
export function settleDay(world, effects) {
  const ratios=physicalDay(world,effects);
  const personal=Object.fromEntries(world.inhabitants.map(p=>[p.id,{connection:0,autonomy:0,ecology:0}]));
  for(const effect of effects) {
    for(const e of effect.needs){
      if(world.exploration&&!atCamp(world.exploration.positions[e.id],world))continue;
      for(const k of Object.keys(personal[e.id]))personal[e.id][k]+=e[k];
    }
  }
  for(const p of world.inhabitants){
    const ratio=ratios.byPerson?.[p.id]||ratios;
    p.needs.water=clamp(p.needs.water+(ratio.waterRatio===1?2:-12*(1-ratio.waterRatio)),0,100);
    p.needs.food=clamp(p.needs.food+(ratio.foodRatio===1?2:-12*(1-ratio.foodRatio)),0,100);
    p.needs.shelter=clamp(p.needs.shelter+(ratio.shelterRatio*100-p.needs.shelter)*.1,0,100);
    for(const k of Object.keys(personal[p.id]))p.needs[k]=clamp(p.needs[k]+clamp(personal[p.id][k],-5,5)-(k==='connection'?.5:0),0,100);
  }
  world.day++;
}
export function importWorld(input,{keepHistory=false}={}){
  if(input?.geography||input?.exploration)throw new Error('Expanded worlds require the versioned server restore path; legacy import would lose travel state.');
  if(!input||![2,3].includes(input.version)||!Number.isInteger(input.day)||input.day<0||input.day>10000||!Number.isInteger(input.seed))throw new Error('This is not a Firstmorrow physics-v2 world.');
  if(!Array.isArray(input.buildings)||input.buildings.length>80||!Array.isArray(input.inhabitants)||input.inhabitants.length!==5)throw new Error('Invalid world population or creation count.');
  const clean=freshWorld(input.seed);clean.day=input.day;clean.minute=Number.isInteger(input.minute)&&input.minute>=0&&input.minute<1440?input.minute:360;
  for(const k of RESOURCES){if(!Number.isFinite(input.resources?.[k])||input.resources[k]<0||input.resources[k]>1e8)throw new Error('Invalid world resources.');clean.resources[k]=input.resources[k];}
  for(const k of ['groundwaterL','materialReserveKg']){if(!Number.isFinite(input[k])||input[k]<0||input[k]>1e8)throw new Error('Invalid physical reserve.');clean[k]=input[k];}
  for(const k of Object.keys(clean.balances)){if(!Number.isFinite(input.balances?.[k])||input.balances[k]<0||input.balances[k]>1e10)throw new Error('Invalid conservation ledger.');clean.balances[k]=input.balances[k];}
  for(const p of clean.inhabitants){
    const stored=input.inhabitants.find(i=>i.id===p.id);if(!stored)throw new Error('Missing inhabitant.');
    for(const k of NEEDS){if(!Number.isFinite(stored.needs?.[k])||stored.needs[k]<0||stored.needs[k]>100)throw new Error('Invalid needs.');p.needs[k]=stored.needs[k];}
  }
  const occupied=new Set();
  clean.buildings=input.buildings.map((b,i)=>{
    const a=checkArtifact(b),xy=`${a.x}:${a.y}`;if(occupied.has(xy))throw new Error('Overlapping imported structures.');occupied.add(xy);
    for(const k of ['cropStoredKcal','cropGrowthDays'])if(b[k]!==undefined&&(!Number.isFinite(b[k])||b[k]<0||b[k]>1e8))throw new Error('Invalid crop state.');
    const labor=laborHours(a),progress=Number.isFinite(b.progressHours)?clamp(b.progressHours,0,labor):labor;
    const str=(v,n)=>typeof v==='string'?v.slice(0,n):undefined;
    const id=keepHistory&&typeof b.id==='string'&&/^b[\w-]{1,24}$/.test(b.id)&&!clean.buildings?.some?.(o=>o.id===b.id)?b.id:`b${i}`;
    return {...a,id,active:b.active!==false,built:b.built===false?false:true,progressHours:b.built===false?progress:labor,laborHours:labor,
      source:keepHistory?(str(b.source,120)||'Imported'):'Imported',role:keepHistory&&ROLES.includes(b.role)?b.role:ROLES[i%3],
      ...(keepHistory&&typeof b.agentId==='string'&&/^ai-(openai|xai|perplexity)$/.test(b.agentId)?{agentId:b.agentId}:{}),day:Math.min(clean.day,Number.isInteger(b.day)?b.day:0),cropStoredKcal:b.cropStoredKcal||0,cropGrowthDays:b.cropGrowthDays||0};
  });
  if(clean.buildings.filter(b=>!b.built).length>1)throw new Error('Only one structure can be under construction.');
  if(Object.values(conservationErrors(clean)).some(v=>Math.abs(v)>1e-5))throw new Error('World fails its physical conservation checks.');
  if(new Set(clean.buildings.map(b=>b.id)).size!==clean.buildings.length)clean.buildings.forEach((b,i)=>b.id=`b${i}`);
  if(keepHistory){
    const ids=new Set(clean.buildings.map(b=>b.id));
    clean.history=(Array.isArray(input.history)?input.history:[]).slice(-300).filter(h=>h&&typeof h.text==='string'&&Number.isInteger(h.day)&&h.day>=0&&h.day<=clean.day)
      .map(h=>({day:h.day,minute:Number.isInteger(h.minute)&&h.minute>=0&&h.minute<1440?h.minute:0,text:h.text.slice(0,300),...(ids.has(h.buildingId)?{buildingId:h.buildingId}:{})}));
    for(const k of ['input','output'])clean.usage[k]=Number.isFinite(input.usage?.[k])&&input.usage[k]>=0?Math.min(input.usage[k],1e10):0;
    clean.demoDone=input.demoDone===true;
    clean.agents=(Array.isArray(input.agents)?input.agents:[]).filter(a=>a&&['openai','xai','perplexity'].includes(a.provider)).slice(0,3).map(a=>({
      provider:a.provider,name:String(a.name||'').replace(/[^\w .-]/g,'').slice(0,24)||a.provider,model:String(a.model||'').slice(0,140),
      say:String(a.say||'').slice(0,160),proposals:Math.max(0,Math.min(1e6,Math.floor(+a.proposals||0))),built:Math.max(0,Math.min(1e6,Math.floor(+a.built||0))),tokens:Math.max(0,Math.min(1e12,Math.floor(+a.tokens||0)))}));
  }else clean.history=[{day:clean.day,minute:clean.minute,text:'World restored'}];
  return clean;
}

// Construction labour. Scenario assumption: 0.5 person-hours per kg of built mass,
// three inhabitants building during an 8-hour day with a lunch break.
// Ground that cannot be built on, and spacing between structures. Tiles are 8 m across.
// Sphere and UNHCR camp standards ask for at least 2 m between buildings, preferably twice
// their height, so collapsing or burning structures cannot touch. One empty tile (8 m) between
// structures meets that for anything up to 4 m tall and leaves room to walk and carry water.
export const SITE=Object.freeze({tileM:8,minGapTiles:1,
  blocked:LANDMARKS});
export function siteProblem(world,x,y){
  if(SITE.blocked.some(([bx,by])=>bx===x&&by===y))return 'That tile is oasis, rock or dune and cannot be built on.';
  if(world.exploration){
    const k=`${x},${y}`,e=world.exploration;
    if(atCamp({x,y},world)||Object.values(e.positions).some(p=>pointKey(p)===k)||
      Object.values(e.journeys).some(j=>j.status==='active'&&
        (j.roundTrip?j.route:j.route.slice(j.step)).some(p=>pointKey(p)===k)))
      return 'Keep the camp, occupied tiles and active walking routes clear.';
  }
  const near=world.buildings.find(b=>Math.max(Math.abs(b.x-x),Math.abs(b.y-y))<=SITE.minGapTiles);
  if(near)return near.x===x&&near.y===y?'That tile is already taken.':`Too close to ${near.name}. Leave at least one empty 8 m tile between structures for access and fire spacing.`;
  return null;
}
export const WORK=Object.freeze({workers:3,hoursPerKg:.5,minLaborHours:12,planMinutes:180});
export const laborHours=a=>Math.max(WORK.minLaborHours,a.costs.materials*WORK.hoursPerKg);
export const isWorkMinute=m=>{const h=Math.floor(m/60);return (h>=8&&h<12)||(h>=13&&h<17);};
export const currentProject=world=>world.buildings.find(b=>b.built===false)||null;
export function workMinute(world){
  const b=currentProject(world);if(!b||!isWorkMinute(world.minute))return null;
  const workers=world.exploration?world.inhabitants.filter(p=>atCamp(world.exploration.positions[p.id],world)&&world.exploration.journeys[p.id]?.status!=='active').length:WORK.workers;
  b.progressHours=Math.min(b.laborHours,b.progressHours+Math.min(WORK.workers,workers)/60);
  if(b.progressHours>=b.laborHours-1e-9){b.built=true;b.progressHours=b.laborHours;return b;}
  return null;
}
export const workDaysLeft=b=>(b.laborHours-b.progressHours)/(WORK.workers*8);
export function clockLabel(world){const h=Math.floor(world.minute/60),m=world.minute%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
export function activityFor(world,i){
  const person=world.inhabitants[i],position=world.exploration?.positions[person.id],journey=world.exploration?.journeys[person.id];
  if(position&&(journey?.status==='active'||!atCamp(position,world)))
    return {kind:journey?.status==='active'?'explore':'rest',label:journey?.status==='active'?(journey.phase==='return'?'Returning to camp':'Scouting nearby land'):'Away from the settlement',tile:{...position}};
  const h=world.minute/60,project=currentProject(world),built=world.buildings.filter(b=>b.built!==false);
  const shelter=built.find(b=>b.physical.shelterAreaM2>0),crop=built.find(b=>b.physical.cropAreaM2>0);
  const camp={x:10.5+(i-2)*.6,y:11.5+(i%2)*.5};
  const near=(b,k=i)=>({x:b.x+.5+Math.cos(k*1.9)*.9,y:b.y+.5+Math.sin(k*1.9)*.9});
  if(h<6||h>=22)return shelter?{kind:'sleep',label:`Asleep in ${shelter.name}`,tile:{x:shelter.x+.5,y:shelter.y+.5},hidden:true}:{kind:'sleep',label:'Asleep under the open sky',tile:camp};
  if(h>=12&&h<13)return {kind:'eat',label:'Eating together',tile:camp};
  const builder=(world.day+i)%5<WORK.workers;
  if(h>=8&&h<17){
    if(project&&builder)return {kind:'build',label:`Building ${project.name}`,tile:near(project)};
    if(crop)return {kind:'tend',label:`Tending ${crop.name}`,tile:near(crop,i+2)};
    return {kind:'water',label:'Fetching water at the oasis',tile:{x:4.6+(i%2)*.6,y:8.2+(i%3)*.4}};
  }
  return {kind:'rest',label:h<8?'Waking up':'Resting',tile:{x:camp.x+Math.sin(i*2.3),y:camp.y+Math.cos(i*1.3)}};
}
