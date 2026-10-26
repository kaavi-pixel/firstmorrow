// ---------------------------------------------------------------------------
// The renderer. Kept from v1: the isometric projection, rotation, pan/zoom,
// day/night tinting, hit testing, speech bubbles and the sprite painter are all
// unchanged. Only the decoration source changed: rocks, dunes, bushes and the
// oasis now come from the terrain instead of a hard-coded list.
// ---------------------------------------------------------------------------
import { terrainAt } from './terrain.mjs';
import { PALETTE, hut, well, garden, solar, hall, workshop } from './forms.mjs';

export { PALETTE, hut, well, garden, solar, hall, workshop };

export const DEMOS=[
  {name:'The shade court',reason:'A shared shelter reduces exposure without assigning anyone a permanent household. Everyone gets access; Ada gains a place for family life and Ren can leave whenever they want.',tradeoff:'Shared shelter is not private housing. It helps everyone a little, but cannot fulfill either Ada’s or Ren’s preferred life on its own.',sprite:hall,x:10,y:10,costs:{materials:18},code:"return {resources:{},needs:world.inhabitants.map(p=>({id:p.id,shelter:1.8,connection:p.id==='p0'?1.2:0.4,autonomy:0}))};"},
  {name:'A solar-fed well',reason:'A small solar pump draws water into a communal basin. Its behavior checks available energy before pumping; it stops when that supply runs low.',tradeoff:'The toy world does not model groundwater depletion. A real design would need an aquifer budget and water quality checks.',sprite:well,x:8,y:10,costs:{materials:20,energy:5},code:"const powered=world.resources.energy>=2;return {resources:{water:powered?12:0,energy:powered?-2:0},needs:[]};"},
  {name:'The seed kitchen',reason:'A small kitchen pairs garden output with shared meals. It uses water to maintain food supply and gives communal-minded inhabitants more social contact.',tradeoff:'Shared meals do not suit everyone. Ren receives no social bonus, and food production competes for the well’s limited water.',sprite:hut,x:10,y:8,costs:{materials:16,food:4},code:"const watered=world.resources.water>=3;return {resources:{food:watered?12:0,water:watered?-3:0},needs:world.inhabitants.map(p=>({id:p.id,connection:p.id==='p1'?0:1}))};"},
  {name:'The quiet garden',reason:'A planted retreat offers solitude and improves the ecological needs score. It is open to everyone, with a larger benefit for Sol’s environmental priorities.',tradeoff:'Planting takes water in a desert. Ecological wellbeing here is only a simplified proxy, not a measured environmental outcome.',sprite:garden,x:12,y:10,costs:{materials:10,water:6},code:"const watered=world.resources.water>=2;return {resources:{water:watered?-2:0},needs:world.inhabitants.map(p=>({id:p.id,ecology:watered?1.5:0,autonomy:p.id==='p1'?1.2:0.4}))};"},
  {name:'A small solar array',reason:'A shared array replenishes energy for the pump and the workshop. It adds a dependency the builders can observe instead of pretending water arrives for free.',tradeoff:'This prototype assumes stable daylight. Weather, maintenance and manufacturing emissions are not represented.',sprite:solar,x:7,y:12,costs:{materials:20},code:"return {resources:{energy:7},needs:[]};"},
  {name:'The open workshop',reason:'A tool-sharing space gives Ivo room to experiment and produces a modest material surplus when energy is available.',tradeoff:'Materials are an abstract stock, not a full mining and manufacturing chain. Workshop output uses energy needed elsewhere.',sprite:workshop,x:12,y:8,costs:{materials:18,energy:3},code:"const powered=world.resources.energy>=2;return {resources:{energy:powered?-2:0,materials:powered?4:0},needs:world.inhabitants.map(p=>({id:p.id,autonomy:p.id==='p4'?2:0.6}))};"},
  {name:'Separate, together',reason:'Small private dwellings add shelter without requiring one family structure. Ren gets independence while Ada can choose family life.',tradeoff:'The prototype does not yet simulate household formation or children. These dwellings only affect bounded shelter and autonomy needs.',sprite:hut,x:10,y:12,costs:{materials:22},code:"return {resources:{},needs:world.inhabitants.map(p=>({id:p.id,shelter:2,autonomy:1}))};"},
  {name:'The listening hall',reason:'A shared space gives inhabitants room to express disagreement. Its social effect is deliberately modest; a building alone cannot create fair governance.',tradeoff:'Connection is not consent. This toy module cannot prove that everyone is heard or that decisions are legitimate.',sprite:hall,x:13,y:12,costs:{materials:14},code:"return {resources:{},needs:world.inhabitants.map(p=>({id:p.id,connection:1,autonomy:0.5}))};"}
].map((d,i)=>{
  const physical=[
    {shelterAreaM2:16},{pumpCapacityLDay:1000},{cropAreaM2:64},
    {cropAreaM2:16},{solarAreaM2:12},{materialRateKgDay:4},{shelterAreaM2:16},{shelterAreaM2:16}
  ][i];
  const behaviors=[
    "return {actions:{},needs:world.inhabitants.map(p=>({id:p.id,connection:p.id==='p0'?1.2:0.4}))};",
    "return {actions:{pumpLiters:Math.max(0,2000-world.resources.water)},needs:[]};",
    "return {actions:{irrigateLiters:2000},needs:world.inhabitants.map(p=>({id:p.id,connection:p.id==='p1'?0:1}))};",
    "return {actions:{irrigateLiters:2000},needs:world.inhabitants.map(p=>({id:p.id,ecology:0.8,autonomy:p.id==='p1'?1.2:0.4}))};",
    "return {actions:{collectSolarFraction:1},needs:[]};",
    "return {actions:{extractKg:world.resources.energy>3?4:0},needs:world.inhabitants.map(p=>({id:p.id,autonomy:p.id==='p4'?2:0.6}))};",
    "return {actions:{},needs:world.inhabitants.map(p=>({id:p.id,autonomy:1}))};",
    "return {actions:{},needs:world.inhabitants.map(p=>({id:p.id,connection:1,autonomy:0.5}))};"
  ];
  if(i===1){d.reason='A pump draws from a finite aquifer. The engine charges electrical energy for lifting water through a 20 m head at 50% efficiency.';d.tradeoff='Aquifer recharge is zero in this scenario. Water quality, drilling geology and pipe friction are not yet modeled.';}
  if(i===2){d.reason='A 64 m² crop plot irrigates against weather-driven evaporative demand. Plant energy accumulates gradually; food is unavailable until the assumed 30-day maturity threshold.';d.tradeoff='Crop yield is a solar-bounded proxy, not a calibrated crop model. Nutrients, carbon supply, pests and crop-specific physiology are assumed non-limiting.';}
  if(i===4){d.reason='Twelve square metres of photovoltaic panels convert incoming sunlight into electricity, with 20% conversion efficiency and a 15% system loss allowance.';d.tradeoff='Daily sunshine and temperature are fictional scenario inputs. No hourly shading, detailed panel temperature, manufacturing supply chain or battery chemistry is modeled.';}
  if(i===5){d.reason='An extraction workshop draws usable material from a finite reserve, spending an assumed 0.1 kWh per kg. It also gives Ivo a place to experiment.';d.tradeoff='Extraction intensity and construction mass budgets are scenario assumptions. Ore grades, machinery fabrication and structural engineering are not modeled.';}
  return {...d,physical,code:behaviors[i],palette:PALETTE,costs:{materials:0}};
});
// Build order for the offline demo: shelter, then power before the pump that needs it.
export const DEMO_ORDER=[0,4,1,2,3,5,6,7];
export function demoArtifact(world){
  const source=DEMOS[world.buildings.length%DEMOS.length],a=JSON.parse(JSON.stringify(source));
  if(world.buildings.some(b=>b.x===a.x&&b.y===a.y)){
    let found=false;
    for(let y=6;y<=16&&!found;y+=2)for(let x=6;x<=16&&!found;x+=2)if(!world.buildings.some(b=>b.x===x&&b.y===y)){a.x=x;a.y=y;found=true;}
    if(!found)throw new Error('Demo settlement is full. Export or reset to begin another experiment.');
    a.name+=` ${Math.floor(world.buildings.length/DEMOS.length)+1}`;
  }
  return a;
}
export function paintSprite(canvas,artifact){
  canvas.width=16;canvas.height=16;const c=canvas.getContext('2d');c.clearRect(0,0,16,16);c.imageSmoothingEnabled=false;
  artifact.sprite.forEach((row,y)=>[...row].forEach((v,x)=>{if(v!=='0'){c.fillStyle=artifact.palette[+v];c.fillRect(x,y,1,1);}}));
}
export function paintPerson(canvas,person){
  canvas.width=8;canvas.height=12;const c=canvas.getContext('2d');
  c.fillStyle=person.hair;c.fillRect(2,0,4,3);c.fillStyle='#dabd99';c.fillRect(2,2,4,3);
  c.fillStyle=person.color;c.fillRect(1,5,6,4);c.fillRect(2,4,4,2);c.fillStyle='#d4b796';c.fillRect(0,6,1,3);c.fillRect(7,6,1,3);
  c.fillStyle='#4a4941';c.fillRect(2,9,2,3);c.fillRect(5,9,2,3);
}
// AI inhabitants: pale robe and a floating marker so they read as different from the five people.
export function paintAgent(canvas,agent){
  canvas.width=8;canvas.height=15;const c=canvas.getContext('2d');
  c.fillStyle=agent.color;c.fillRect(3,0,2,1);c.fillRect(2,1,4,1);c.fillRect(3,2,2,1);
  c.fillStyle='#3d4348';c.fillRect(2,3,4,3);c.fillStyle='#c9b79e';c.fillRect(2,5,4,3);
  c.fillStyle='#e8e4da';c.fillRect(1,8,6,5);c.fillRect(2,7,4,2);c.fillStyle=agent.color;c.fillRect(3,8,2,5);
  c.fillStyle='#c9b79e';c.fillRect(0,9,1,3);c.fillRect(7,9,1,3);
  c.fillStyle='#4a4941';c.fillRect(2,13,2,2);c.fillRect(5,13,2,2);
}
export function createWorldRenderer(canvas,{getWorld,getSpeed,activityFor,onSelect,getAgents=()=>[],agentActivity=()=>null,getSpeech=()=>null}){
  const c=canvas.getContext('2d');
  let w=0,h=0,dpr=1,zoom=null,panX=0,panY=0,hit=[],time=0,prev=performance.now();
  const spriteCache=new Map(),peopleCache=new Map(),pos=new Map(),pointers=new Map();
  let drag=null,pinch=null,yaw=0,yawTarget=0,layoutVersion=null;
  const CY=185,iso=(x,y,z=0)=>({x:(x-y)*16,y:(x+y)*8-z});
  // View rotation around the centre of the land. Everything placed on the ground goes through proj.
  const C=11,rot=(x,y)=>{const cs=Math.cos(yaw),sn=Math.sin(yaw),dx=x-C,dy=y-C;return {x:C+dx*cs-dy*sn,y:C+dx*sn+dy*cs};};
  const proj=(x,y,z=0)=>{const q=rot(x,y);return iso(q.x,q.y,z);};
  const depthOf=(x,y)=>{const q=rot(x,y);return q.x+q.y;};
  function quad(pts,color,dy=0){c.fillStyle=color;c.strokeStyle=color;c.lineWidth=.7;c.beginPath();pts.forEach(([x,y],i)=>{const p=proj(x,y);i?c.lineTo(p.x,p.y+dy):c.moveTo(p.x,p.y+dy);});c.closePath();c.fill();c.stroke();}
  const square=(x,y,s=1,m=0)=>[[x+m,y+m],[x+s-m,y+m],[x+s-m,y+s-m],[x+m,y+s-m]];
  const noise=(x,y,seed)=>{const n=Math.sin(x*127.1+y*311.7+seed)*43758.5453;return n-Math.floor(n);};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function diamond(x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.moveTo(x,y-ry);c.lineTo(x+rx,y);c.lineTo(x,y+ry);c.lineTo(x-rx,y);c.closePath();c.fill();}
  function resize(){
    dpr=Math.min(2,devicePixelRatio||1);w=canvas.clientWidth;h=canvas.clientHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    if(zoom===null)zoom=fit();
  }
  const fit=()=>getWorld().geography?.version ? Math.max(.2,Math.min(w/1400,h/850))
    :w<640?Math.max(1.3,w/290):Math.max(.5,Math.min(3,Math.min(w/720,h/420)));
  const clampZoom=z=>Math.max(getWorld().geography?.version ? .2 : .45,Math.min(5,z));
  const toWorld=(sx,sy)=>({x:(sx-w/2-panX)/zoom,y:(sy-h/2-panY)/zoom+CY});
  function zoomAt(sx,sy,next){const p=toWorld(sx,sy);zoom=clampZoom(next);panX=sx-w/2-p.x*zoom;panY=sy-h/2-(p.y-CY)*zoom;}
  function darkness(minute){
    const t=minute/60;
    if(t<5||t>=20.5)return .55;
    if(t<7)return .55*(1-(t-5)/2);
    if(t>=18)return .55*((t-18)/2.5);
    return 0;
  }
  function sprite(b){let img=spriteCache.get(b.id);if(!img){img=document.createElement('canvas');paintSprite(img,b);spriteCache.set(b.id,img);}return img;}
  function draw(dt=0){
    const world=getWorld(),style=getComputedStyle(document.documentElement);
    const nextLayout=world.geography?.version??0;
    if(layoutVersion!==nextLayout){
      layoutVersion=nextLayout;
      zoom=nextLayout ? Math.max(.2,Math.min(w/1400,h/850)) : fit();
      panX=0;panY=0;
    }
    c.setTransform(dpr,0,0,dpr,0,0);c.imageSmoothingEnabled=false;
    c.fillStyle=style.getPropertyValue('--map').trim()||'#1d1a16';c.fillRect(0,0,w,h);
    c.save();c.translate(Math.round(w/2+panX),Math.round(h/2+panY));c.scale(zoom,zoom);c.translate(0,-CY);
    hit=[];
    const geo=world.geography, bounds=geo?.mainland||{minX:0,minY:0,maxX:21,maxY:21};
    const corners=[[bounds.minX,bounds.minY],[bounds.maxX+1,bounds.minY],[bounds.maxX+1,bounds.maxY+1],[bounds.minX,bounds.maxY+1]];
    for(let depth=32;depth>0;depth-=4)quad(corners,depth>24?'#67513e':depth>12?'#8d694a':'#ab8057',depth);
    const tileColors=['#cba370','#cfa976','#d3ad7b','#c7a06d','#d6b27f'];
    for(let y=bounds.minY;y<=bounds.maxY;y++)for(let x=bounds.minX;x<=bounds.maxX;x++){
      const p=proj(x+.5,y+.5),n=noise(x,y,world.seed);
      const region=geo?.regions.find(r=>r.id===terrainAt(geo,x,y)?.regionId);
      quad(square(x,y),region&&region.id!=='interior'?region.color:tileColors[Math.floor(n*tileColors.length)]);
      if(region&&region.id!=='interior'){
        c.globalAlpha=.035+Math.floor(n*4)*.025;quad(square(x,y),n>.5?'#e8dcc0':'#624c39');c.globalAlpha=1;
      }
      if(n>.63){c.fillStyle='#b89364';c.fillRect(Math.round(p.x-6),Math.round(p.y),3,1);c.fillRect(Math.round(p.x+5),Math.round(p.y+3),2,1);}
    }
    const features=geo?.features||[];
    for(const [x,y,type] of [...features].sort((a,b)=>depthOf(a[0],a[1])-depthOf(b[0],b[1]))){
      const p=proj(x,y);
      if(type==='rock'){diamond(p.x+4,p.y+4,15,6,'#a17e55');c.fillStyle='#89745b';c.fillRect(p.x-8,p.y-12,16,13);c.fillStyle='#a08b6d';c.fillRect(p.x-6,p.y-15,12,4);c.fillStyle='#70654f';c.fillRect(p.x+4,p.y-10,5,11);c.fillStyle='#bd9c6d';c.fillRect(p.x-4,p.y-13,6,2);}
      if(type==='dune'){diamond(p.x,p.y,27,10,'#b99261');diamond(p.x-2,p.y-5,25,9,'#dfbb86');diamond(p.x-7,p.y-8,13,4,'#e5c28d');}
      if(type==='bush'){c.fillStyle='#9e9865';c.fillRect(p.x-3,p.y-6,6,6);c.fillStyle='#717e53';c.fillRect(p.x-2,p.y-9,3,5);c.fillRect(p.x-5,p.y-6,3,3);c.fillRect(p.x+1,p.y-7,4,3);c.fillStyle='#a7a472';c.fillRect(p.x-2,p.y-8,2,2);}
    }
    const oasis=geo?.oasis;if(oasis)for(const [x,y] of [[oasis.x,oasis.y],[oasis.x,oasis.y+1],[oasis.x+1,oasis.y],[oasis.x+1,oasis.y+1]]){const p=proj(x,y);quad(square(x-.5,y-.5),'#b0ab7b');quad(square(x-.5,y-.5,1,.1),'#819e95',-1);c.fillStyle='#acc0a9';c.fillRect(p.x-4,p.y-2,8,1);}
    const drawables=world.buildings.map(b=>({kind:'building',obj:b,depth:depthOf(b.x,b.y)}));
    const speed=getSpeed(),step=Math.min(dt,.25)*(speed?Math.min(1.2+speed*.08,6):0);
    world.inhabitants.forEach((person,i)=>{
      const act=activityFor(i),target=act.tile;let p=pos.get(person.id);
      if(!p){p={x:target.x,y:target.y,moving:false};pos.set(person.id,p);}
      // Durable travel positions must not cosmetically cut corners through a
      // structure when a newer server snapshot is several tiles ahead.
      if(act.kind==='explore'){p.x=target.x;p.y=target.y;p.moving=true;
        drawables.push({kind:'person',obj:person,p,act,depth:depthOf(p.x,p.y)});return;}
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      if(d>.02&&step>0){const k=Math.min(1,step/d);p.x+=dx*k;p.y+=dy*k;p.moving=true;}else p.moving=false;
      if(act.hidden&&d<.1)return;
      drawables.push({kind:'person',obj:person,p,act,depth:depthOf(p.x,p.y)});
    });
    for(const agent of getAgents()){
      const act=agentActivity(agent);if(!act)continue;const target=act.tile;let p=pos.get(agent.id);
      if(!p){p={x:21,y:11,moving:false};pos.set(agent.id,p);}
      const dx=target.x-p.x,dy=target.y-p.y,d=Math.hypot(dx,dy);
      if(d>.02&&step>0){const k=Math.min(1,step*.8/d);p.x+=dx*k;p.y+=dy*k;p.moving=true;}else p.moving=false;
      drawables.push({kind:'agent',obj:agent,p,act,depth:depthOf(p.x,p.y)});
    }
    drawables.sort((a,b)=>a.depth-b.depth);const bubbles=[];
    for(const item of drawables){
      if(item.kind==='building'){
        const b=item.obj,p=proj(b.x,b.y),img=sprite(b);
        diamond(p.x+3,p.y+4,25,9,'#9d7d5444');diamond(p.x,p.y+1,22,10,'#bc9c70');
        if(b.built===false){
          const progress=b.progressHours/b.laborHours,rows=Math.floor(16*progress);
          diamond(p.x,p.y+1,20,9,'#a88660');
          c.fillStyle='#8a6a48';for(let k=-16;k<=16;k+=8)c.fillRect(p.x+k,p.y-1+Math.abs(k)/4,2,1);
          if(rows>0)c.drawImage(img,0,16-rows,16,rows,p.x-24,p.y-43+(16-rows)*3,48,rows*3);
          // Timber scaffold.
          c.fillStyle='#7a5b3c';
          const top=p.y-46;
          for(const sx of [-23,-9,9,21])c.fillRect(p.x+sx,top+(Math.abs(sx)<12?-4:4),2,p.y+2-top-(Math.abs(sx)<12?-4:4));
          for(let yy=top+8;yy<p.y;yy+=12)c.fillRect(p.x-23,yy,46,1);
        }else{
          c.globalAlpha=b.active===false?.5:1;c.drawImage(img,p.x-24,p.y-43,48,48);c.globalAlpha=1;
        }
        hit.push({x:p.x-24,y:p.y-43,w:48,h:48,type:'building',id:b.id});
      }else if(item.kind==='agent'){
        const pt=proj(item.p.x,item.p.y);diamond(pt.x,pt.y+2,7,3,'#896b4e66');
        let img=peopleCache.get(item.obj.id);if(!img){img=document.createElement('canvas');paintAgent(img,item.obj);peopleCache.set(item.obj.id,img);}
        const bob=item.p.moving&&Math.sin(time*9+item.depth)>0?1:0,hover=reduced.matches?0:Math.round(Math.sin(time*2.5));
        c.drawImage(img,0,0,8,3,Math.round(pt.x-6),Math.round(pt.y-30-bob+hover),12,4.5);
        c.drawImage(img,0,3,8,12,Math.round(pt.x-6),Math.round(pt.y-18-bob),12,18);
        if(item.act.kind==='think'&&!reduced.matches){c.fillStyle=item.obj.color;for(let k=0;k<3;k++)if(Math.floor(time*2)%3>=k)c.fillRect(Math.round(pt.x+7+k*3),Math.round(pt.y-24),2,2);}
        bubbles.push({obj:item.obj,x:pt.x,y:pt.y-34});
        hit.push({x:pt.x-10,y:pt.y-32,w:20,h:36,type:'agent',id:item.obj.id});
      }else{
        const pt=proj(item.p.x,item.p.y);diamond(pt.x,pt.y+2,7,3,'#896b4e66');
        let img=peopleCache.get(item.obj.id);if(!img){img=document.createElement('canvas');paintPerson(img,item.obj);peopleCache.set(item.obj.id,img);}
        const bob=item.p.moving&&Math.sin(time*9+item.depth)>0?1:0;
        if(item.act.kind==='sleep'){c.save();c.translate(Math.round(pt.x),Math.round(pt.y-3));c.rotate(-Math.PI/2);c.drawImage(img,-9,-6,12,18);c.restore();}
        else c.drawImage(img,Math.round(pt.x-6),Math.round(pt.y-18-bob),12,18);
        if(item.act.kind==='build'&&!reduced.matches&&Math.sin(time*6+item.depth*3)>.6){c.fillStyle='#f3e2b8';c.fillRect(Math.round(pt.x+6),Math.round(pt.y-14),2,2);}
        hit.push({x:pt.x-10,y:pt.y-24,w:20,h:28,type:'person',id:item.obj.id});
      }
    }
    if(!reduced.matches){for(let i=0;i<8;i++){const px=(time*7+i*91)%640-320,py=40+(i*37)%260;c.fillStyle='#e0bd8540';c.fillRect(px,py,3,1);}}
    c.restore();
    const dark=darkness(world.minute);
    if(dark>0){
      c.fillStyle=`rgba(12,16,38,${dark})`;c.fillRect(0,0,w,h);
      // Warm light from finished shelters after dusk.
      c.save();c.translate(Math.round(w/2+panX),Math.round(h/2+panY));c.scale(zoom,zoom);c.translate(0,-CY);
      for(const b of world.buildings)if(b.built!==false&&b.physical.shelterAreaM2>0){const p=proj(b.x,b.y);c.fillStyle=`rgba(255,196,120,${Math.min(.9,dark*1.6)})`;c.fillRect(p.x-3,p.y-16,3,3);c.fillRect(p.x+5,p.y-16,3,3);}
      c.restore();
    }
    for(const b of bubbles){
      const said=getSpeech(b.obj);if(!said)continue;
      const sx=w/2+panX+b.x*zoom,sy=h/2+panY+(b.y-CY)*zoom;
      c.font='12px '+(style.getPropertyValue('--font-body').trim()||'sans-serif');
      const words=said.split(' '),lines=[];let line='';
      for(const word of words){const next=line?line+' '+word:word;if(c.measureText(next).width>200&&line){lines.push(line);line=word;}else line=next;}
      if(line)lines.push(line);if(lines.length>3){lines.length=3;lines[2]=lines[2].replace(/\s*\S*$/,'')+'…';}
      const bw=Math.max(...lines.map(l=>c.measureText(l).width))+20,bh=lines.length*16+12,bx=Math.round(sx-bw/2),by=Math.round(sy-bh-8);
      c.fillStyle=style.getPropertyValue('--solid').trim()||'#fff';c.strokeStyle=style.getPropertyValue('--line').trim()||'#0002';
      c.beginPath();c.roundRect(bx,by,bw,bh,10);c.moveTo(sx-5,by+bh);c.lineTo(sx,by+bh+6);c.lineTo(sx+5,by+bh);c.fill();c.stroke();
      c.fillStyle=style.getPropertyValue('--text').trim()||'#222';c.textBaseline='top';
      lines.forEach((l,i)=>c.fillText(l,bx+10,by+7+i*16));
    }
  }
  function frame(ts){const dt=Math.min((ts-prev)/1000,.25);prev=ts;time+=dt;
    if(yaw!==yawTarget){const d=yawTarget-yaw;yaw=Math.abs(d)<.002||reduced.matches?yawTarget:yaw+d*Math.min(1,dt*10);}draw(dt);requestAnimationFrame(frame);}
  function pick(sx,sy){const p=toWorld(sx,sy);return [...hit].reverse().find(t=>p.x>=t.x&&p.x<=t.x+t.w&&p.y>=t.y&&p.y<=t.y+t.h)||null;}
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
    if(pointers.size===1)drag={x:e.offsetX,y:e.offsetY,px:panX,py:panY,yaw:yawTarget,turn:e.button===2||e.shiftKey||e.ctrlKey,moved:false};
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:zoom,a:Math.atan2(b.y-a.y,b.x-a.x),yaw:yawTarget};drag=null;}
  });
  canvas.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.offsetX,y:e.offsetY});
    if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];zoomAt((a.x+b.x)/2,(a.y+b.y)/2,pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d);yaw=yawTarget=pinch.yaw+(Math.atan2(b.y-a.y,b.x-a.x)-pinch.a);return;}
    if(drag){const dx=e.offsetX-drag.x,dy=e.offsetY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){if(drag.turn)yaw=yawTarget=drag.yaw+dx*.008;else{panX=drag.px+dx;panY=drag.py+dy;}canvas.classList.add('dragging');}}
  });
  const end=e=>{
    if(drag&&!drag.moved&&pointers.size===1)onSelect(pick(e.offsetX,e.offsetY));
    pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size){drag=null;canvas.classList.remove('dragging');}
  };
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);drag=null;pinch=null;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.offsetX,e.offsetY,zoom*Math.exp(-e.deltaY*.0015));},{passive:false});
  addEventListener('resize',resize);resize();requestAnimationFrame(frame);
  return {draw,clearCache(){spriteCache.clear();peopleCache.clear();pos.clear();},
    zoomBy(f){zoomAt(w/2,h/2,zoom*f);},recenter(){zoom=fit();panX=0;panY=0;},
    rotateBy(rad){yawTarget+=rad;},get angle(){return yaw;},
    focus(x,y){const p=proj(x,y);panX=-p.x*zoom;panY=-(p.y-CY)*zoom;},
    advance(ms){time+=ms/1000;draw(ms/1000);}};
}
