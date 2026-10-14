import { inhabitantView, observe, atCamp, campOf, walkingRoute, startJourney, TRAVEL } from '../public/exploration.js';
import { pointKey } from '../public/navigation.js';

export const DECISIONS = Object.freeze({ dailyCalls: 24, cooldownMinutes: 720,
  maxOutboundSteps: 40, staleMinutes: 120, timeoutMs: 180000 });
const abs = w => w.day * 1440 + w.minute;
const clone = v => JSON.parse(JSON.stringify(v));
function ledger(S) {
  return S.decisions ||= { serial: 0, pending: null, next: {}, last: {}, cap: { date: '', count: 0 }, tokens: 0 };
}
function event(w, id, personId, text) {
  w.history.push({day:w.day,minute:w.minute,eventId:id,actorId:personId,text});
  if(w.history.length>300)w.history.splice(0,w.history.length-300);
}
export function validateDecision(value) {
  if(!value||typeof value!=='object'||Array.isArray(value)||
    !['stay','scout','return'].includes(value.action))throw new Error('Invalid exploration action.');
  const keys=value.action==='scout'?['action','destination','reason']:['action','reason'];
  if(Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Unexpected exploration fields.');
  if(typeof value.reason!=='string'||!value.reason.trim()||value.reason.length>400)
    throw new Error('A short decision reason is required.');
  if(value.action==='scout'&&(!value.destination||
    Object.keys(value.destination).sort().join(',')!=='x,y'||
    !Number.isInteger(value.destination.x)||!Number.isInteger(value.destination.y)))
    throw new Error('Invalid scouting destination.');
  return clone(value);
}
// This is the only model context for travel. It never receives worldSnapshot,
// global geography, other inhabitants, or unsurveyed regional properties.
export function decisionInput(S, personId) {
  const w=S.world;observe(w,personId);
  const view=inhabitantView(w,personId),home=atCamp(view.position,w);
  const tiles=view.knowledge.tiles,allowed=new Set(Object.keys(tiles));
  const candidates=Object.values(tiles).filter(t=>t.kind==='land'&&!t.blocked&&
    pointKey(t)!==pointKey(view.position)&&
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!tiles[`${t.x+dx},${t.y+dy}`]))
    .map(t=>({t,path:walkingRoute(w,view.position,t,{allowed})}))
    .filter(c=>c.path&&c.path.length-1<=DECISIONS.maxOutboundSteps)
    .sort((a,b)=>b.t.observedAt-a.t.observedAt||a.path.length-b.path.length||a.t.y-b.t.y||a.t.x-b.t.x)
    .slice(0,16).map(({t,path})=>({x:t.x,y:t.y,regionId:t.regionId,
      roundTripMinutes:(path.length-1)*TRAVEL.minutesPerTile*2}));
  return {
    ...view,
    // Durable memory remains complete; bound the serialized model context.
    knowledge:{...view.knowledge,tiles:Object.fromEntries(Object.entries(tiles)
      .sort((a,b)=>b[1].observedAt-a[1].observedAt).slice(0,192))},
    clock:{day:w.day,minute:w.minute},camp:{...campOf(w)},
    ...(home?{campStores:{water:w.resources.water,food:w.resources.food},
      construction:w.buildings.some(b=>b.built===false)?'Work is underway at camp.':'No construction underway.',
      observedAssets:w.buildings.filter(b=>tiles[pointKey(b)]).map(b=>({
        name:b.name,x:b.x,y:b.y,built:b.built!==false,active:b.active,
        installed:clone(b.physical||{})}))}:{}),
    choices:home?['stay',...(candidates.length?['scout']:[])]:['return'],
    scoutDestinations:home?candidates:[],
    rules:{roundTrip:true,maximumOutboundTiles:DECISIONS.maxOutboundSteps,
      regionalRatings:'Observations only, not harvestable stocks. No remote extraction or settlement yet.',
      staying:'Staying is valid. Weigh your own needs and values; exploration is not mandatory.'},
    previous:clone(ledger(S).last[personId]||null)
  };
}
export function requestDecision(S, now) {
  if(!S.world.exploration)return null;
  const d=ledger(S),w=S.world,minute=abs(w);
  if(d.pending){
    if(now-d.pending.requestedAt<=DECISIONS.timeoutMs)return null;
    finishDecision(S,d.pending.id,null,'The decision request timed out.');
  }
  const date=new Date(now).toISOString().slice(0,10);
  if(d.cap.date!==date)d.cap={date,count:0};
  if(d.cap.count>=DECISIONS.dailyCalls)return null;
  // One short scouting expedition at a time keeps a functioning camp workforce.
  if(Object.values(w.exploration.journeys).some(j=>j.status==='active'))return null;
  const away=w.inhabitants.find(p=>!atCamp(w.exploration.positions[p.id],w));
  const p=away||w.inhabitants.filter(p=>(d.next[p.id]||0)<=minute)
    .sort((a,b)=>(d.next[a.id]||0)-(d.next[b.id]||0)||a.id.localeCompare(b.id))[0];
  if(!p||(!away&&(w.minute<420||w.minute>=900)))return null;
  if((d.next[p.id]||0)>minute)return null;
  const input=decisionInput(S,p.id);
  const id=`decision-${++d.serial}`;
  d.pending={id,personId:p.id,requestedAt:now,at:minute,
    position:{...input.position},sequence:(w.exploration.sequences[p.id]||0)+1,
    destinations:input.scoutDestinations.map(({x,y})=>({x,y})),choices:input.choices};
  d.cap.count++;
  return {id,input};
}
export function finishDecision(S,id,result,error=null) {
  const d=ledger(S),r=d.pending,w=S.world;
  if(!r||r.id!==id)return false;
  d.pending=null;
  d.next[r.personId]=abs(w)+DECISIONS.cooldownMinutes;
  const name=w.inhabitants.find(p=>p.id===r.personId).name;
  let decision=null,outcome='rejected',detail=error;
  if(result?.usage){
    const input=Math.max(0,Number(result.usage.input)||0),output=Math.max(0,Number(result.usage.output)||0);
    w.usage.input+=input;w.usage.output+=output;d.tokens+=input+output;
  }
  try{
    if(error)throw new Error(error);
    decision=validateDecision(result?.decision);
    if(abs(w)-r.at>DECISIONS.staleMinutes||
      pointKey(w.exploration.positions[r.personId])!==pointKey(r.position))
      throw new Error('Decision expired as the world advanced.');
    if(!r.choices.includes(decision.action))throw new Error('Action was not offered.');
    if(decision.action==='scout'){
      if(!r.destinations.some(p=>pointKey(p)===pointKey(decision.destination)))
        throw new Error('Destination was not personally observed.');
      if(!atCamp(w.exploration.positions[r.personId],w)||w.minute>=1020)
        throw new Error('Too late to start this scouting journey.');
      if(Object.values(w.exploration.journeys).some(j=>j.status==='active'))
        throw new Error('Another expedition is already underway.');
      const allowed=new Set(Object.keys(w.exploration.knowledge[r.personId].tiles));
      const route=walkingRoute(w,r.position,decision.destination,{allowed});
      if(!route||route.length-1>DECISIONS.maxOutboundSteps)throw new Error('Scouting route is no longer safe.');
      // Leave one day of camp rations for the other four residents.
      if(w.resources.water<75+(route.length-1)*.04||w.resources.food<10500+(route.length-1)*4)
        throw new Error('Camp cannot safely spare a scouting ration.');
      startJourney(w,r.personId,decision.destination,r.sequence,undefined,{allowed,roundTrip:true});
      outcome='departed';detail='A round-trip scouting journey started.';
    }else if(decision.action==='return'){
      startJourney(w,r.personId,campOf(w),r.sequence);
      outcome='returning';detail='A journey back to camp started.';
    }else{outcome='stayed';detail='Stayed at camp.';}
  }catch(e){detail=String(e.message).slice(0,300);}
  d.last[r.personId]={id,at:abs(w),action:decision?.action||null,
    reason:decision?.reason||null,outcome,detail};
  // Observer-facing summary is persisted with daily snapshots, not just server metadata.
  w.exploration.decisions ||= {};
  w.exploration.decisions[r.personId]=clone(d.last[r.personId]);
  event(w,id,r.personId,`${name}: ${decision?.reason||'No new decision.'} ${detail}`);
  return true;
}
