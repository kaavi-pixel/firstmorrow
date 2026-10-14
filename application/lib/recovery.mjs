import { createHash } from 'node:crypto';
import { joinState } from './sim.mjs';

// Offline validation only. This module cannot connect to or overwrite production.
// Capture the raw Redis backup privately before using this function.
export function validateMigrationBackup(raw) {
  if(typeof raw!=='string')throw new Error('Missing migration backup.');
  const b=JSON.parse(raw);
  if(b.version!==1||typeof b.core!=='string')throw new Error('Invalid backup format.');
  const hash=value=>{
    if(!Array.isArray(value)&&value&&Object.keys(value).length===0)return {};
    if(!Array.isArray(value)||value.length%2||!value.every(v=>typeof v==='string'))
      throw new Error('Invalid backup hash.');
    const out={};
    for(let i=0;i<value.length;i+=2){
      if(Object.hasOwn(out,value[i]))throw new Error('Duplicate backup hash field.');
      out[value[i]]=value[i+1];
    }
    return out;
  };
  const statics=hash(b.statics),days=hash(b.days),core=JSON.parse(b.core);
  if(core.v!==1||!core.world||!Number.isFinite(core.simAt))throw new Error('Unsupported backup schema.');
  const state=joinState(core,Object.fromEntries(Object.entries(statics).map(([id,v])=>[id,JSON.parse(v)])));
  for(const [day,value]of Object.entries(days)){
    const snapshot=JSON.parse(value);
    if(String(snapshot.day)!==day)throw new Error('Mismatched backup timeline.');
  }
  if(b.live&&JSON.parse(b.live).simAt!==state.simAt)throw new Error('Inconsistent backup live state.');
  return {state,core:b.core,live:b.live||null,statics,days,
    sha256:createHash('sha256').update(raw).digest('hex')};
}
