import { atCamp } from './exploration.js';
// Protected physical equations. Sources and assumptions are exposed in the Science inspector.
export const SCIENCE = Object.freeze({
  gravity:9.81,waterKgPerLiter:1,joulesPerKWh:3600000,joulesPerKcal:4184,
  tileSideM:8,tileAreaM2:64,pumpHeadM:20,pumpEfficiency:.5,pvEfficiency:.20,pvPerformanceRatio:.85,
  batteryCapacityKWh:40,waterStorageL:5000,waterPerPersonL:15,foodPerPersonKcal:2100,
  shelterPerPersonM2:3.5,householdEnergyPerPersonKWh:.5,cropSolarEfficiency:.01,
  cropMaturityDays:30,cropCoefficient:1,materialExtractionKWhPerKg:.1,
  // Fictional scenario inputs, not observed weather or a calibrated location.
  temperatureC:34,maxTemperatureC:40,minTemperatureC:28,humidityFraction:.30,
  windMS:2,altitudeM:50,solarKWhM2Day:5,clearSkyMJm2Day:25
});
const nonnegative=n=>Math.max(0,Number.isFinite(n)?n:0);
export function pumpingEnergyKWh(liters,head=SCIENCE.pumpHeadM,efficiency=SCIENCE.pumpEfficiency){
  return nonnegative(liters)*SCIENCE.waterKgPerLiter*SCIENCE.gravity*head/(efficiency*SCIENCE.joulesPerKWh);
}
export function solarEnergyKWh(area,solar=SCIENCE.solarKWhM2Day){
  return nonnegative(area)*solar*SCIENCE.pvEfficiency*SCIENCE.pvPerformanceRatio;
}
export function referenceETmm(climate=SCIENCE){
  // FAO-56 daily Penman–Monteith, G=0. Radiation and climate are scenario inputs.
  const vapor=t=>.6108*Math.exp(17.27*t/(t+237.3)),T=climate.temperatureC;
  const es=(vapor(climate.maxTemperatureC)+vapor(climate.minTemperatureC))/2,ea=es*climate.humidityFraction;
  const delta=4098*vapor(T)/(T+237.3)**2;
  const pressure=101.3*((293-.0065*climate.altitudeM)/293)**5.26,gamma=.000665*pressure;
  const rs=climate.solarKWhM2Day*3.6,netShort=.77*rs;
  const netLong=4.903e-9*((climate.maxTemperatureC+273.16)**4+(climate.minTemperatureC+273.16)**4)/2
    *(.34-.14*Math.sqrt(ea))*(1.35*Math.min(1,rs/climate.clearSkyMJm2Day)-.35);
  const rn=netShort-netLong,u=climate.windMS;
  return Math.max(0,(.408*delta*rn+gamma*900/(T+273)*u*(es-ea))/(delta+gamma*(1+.34*u)));
}
export function validatePhysical(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid physical specification.');
  const specs={solarAreaM2:64,cropAreaM2:64,shelterAreaM2:64,pumpCapacityLDay:2000,materialRateKgDay:10},out={};
  for(const [key,max] of Object.entries(specs)){
    const n=input[key]??0;if(!Number.isFinite(n)||n<0||n>max)throw new Error(`Invalid physical capacity ${key}.`);out[key]=n;
  }
  if(out.solarAreaM2+out.cropAreaM2+out.shelterAreaM2>SCIENCE.tileAreaM2)throw new Error('Allocated areas exceed the 64 m² tile footprint.');
  return out;
}
export function minimumMaterialKg(p){
  // Scenario budgets, not measured bill-of-materials or structural validation.
  return p.solarAreaM2*8+p.shelterAreaM2*12+p.cropAreaM2*.2+
    (p.pumpCapacityLDay?60+p.pumpCapacityLDay*.02:0)+p.materialRateKgDay*10;
}
export function freshPhysicalState(){
  return {groundwaterL:100000,materialReserveKg:5000,
    balances:{waterUsedL:0,evaporatedL:0,builtKg:0,energyUsedKWh:0,energySpilledKWh:0,solarGeneratedKWh:0,foodConsumedKcal:0,cropProducedKcal:0}};
}
export function payConstruction(world,costs){
  const r=world.resources,b=world.balances;
  for(const k of ['water','food','energy','materials'])r[k]-=costs[k];
  b.waterUsedL+=costs.water;b.foodConsumedKcal+=costs.food;b.energyUsedKWh+=costs.energy;b.builtKg+=costs.materials;
}
export function physicalDay(world,requests){
  const r=world.resources,b=world.balances;
  const pairs=requests.map(e=>({effect:e,building:world.buildings.find(v=>v.id===e.buildingId)})).filter(e=>e.building?.active&&e.building.built!==false);
  for(const {effect,building} of pairs){
    const produced=solarEnergyKWh(building.physical.solarAreaM2)*effect.actions.collectSolarFraction;
    const stored=Math.min(produced,Math.max(0,SCIENCE.batteryCapacityKWh-r.energy));
    r.energy+=stored;b.solarGeneratedKWh+=produced;b.energySpilledKWh+=produced-stored;
  }
  for(const {effect,building} of pairs){
    const requested=Math.min(effect.actions.pumpLiters,building.physical.pumpCapacityLDay,world.groundwaterL);
    const pumped=Math.min(requested,r.energy/pumpingEnergyKWh(1),Math.max(0,SCIENCE.waterStorageL-r.water));
    const used=pumpingEnergyKWh(pumped);r.energy-=used;b.energyUsedKWh+=used;
    r.water+=pumped;world.groundwaterL-=pumped;
    const extracted=Math.min(effect.actions.extractKg,building.physical.materialRateKgDay,world.materialReserveKg,r.energy/SCIENCE.materialExtractionKWhPerKg);
    r.materials+=extracted;world.materialReserveKg-=extracted;
    r.energy-=extracted*SCIENCE.materialExtractionKWhPerKg;b.energyUsedKWh+=extracted*SCIENCE.materialExtractionKWhPerKg;
  }
  // Domestic water is reserved first; contending crops share requested irrigation proportionally.
  const present=world.inhabitants.filter(p=>!world.exploration||atCamp(world.exploration.positions[p.id],world));
  const domestic=present.length*SCIENCE.waterPerPersonL;
  const desired=pairs.map(({effect,building})=>Math.min(effect.actions.irrigateLiters,building.physical.cropAreaM2*referenceETmm()*SCIENCE.cropCoefficient));
  const irrigationBudget=Math.max(0,r.water-domestic),total=desired.reduce((s,n)=>s+n,0);
  const allocation=total?Math.min(1,irrigationBudget/total):0;
  pairs.forEach(({building},i)=>{
    const area=building.physical.cropAreaM2,demand=area*referenceETmm()*SCIENCE.cropCoefficient;
    const watered=desired[i]*allocation;r.water-=watered;b.evaporatedL+=watered;
    const ratio=demand?Math.min(1,watered/demand):0;
    // Solar-bounded plant-energy proxy, NOT a calibrated crop-yield model.
    const grown=area*SCIENCE.solarKWhM2Day*SCIENCE.cropSolarEfficiency*SCIENCE.joulesPerKWh/SCIENCE.joulesPerKcal*ratio;
    building.cropStoredKcal=(building.cropStoredKcal||0)+grown;b.cropProducedKcal+=grown;
    building.cropGrowthDays=(building.cropGrowthDays||0)+ratio;
    if(building.cropGrowthDays>=SCIENCE.cropMaturityDays){
      r.food+=building.cropStoredKcal;building.cropStoredKcal=0;building.cropGrowthDays=0;
    }
  });
  const waterTaken=Math.min(domestic,r.water),foodDemand=present.length*SCIENCE.foodPerPersonKcal,foodTaken=Math.min(foodDemand,r.food);
  r.water-=waterTaken;b.waterUsedL+=waterTaken;r.food-=foodTaken;b.foodConsumedKcal+=foodTaken;
  const energyUsed=Math.min(r.energy,world.inhabitants.length*SCIENCE.householdEnergyPerPersonKWh);
  r.energy-=energyUsed;b.energyUsedKWh+=energyUsed;
  const shelter=world.buildings.filter(v=>v.active&&v.built!==false).reduce((s,v)=>s+v.physical.shelterAreaM2,0);
  const local={waterRatio:domestic?waterTaken/domestic:1,foodRatio:foodDemand?foodTaken/foodDemand:1,shelterRatio:Math.min(1,shelter/(Math.max(1,present.length)*SCIENCE.shelterPerPersonM2))};
  const byPerson={};
  for(const person of world.inhabitants){
    if(present.some(p=>p.id===person.id)){byPerson[person.id]={...local};continue;}
    const pack=world.exploration.packs?.[person.id];
    const water=Math.min(pack?.water||0,SCIENCE.waterPerPersonL),food=Math.min(pack?.food||0,SCIENCE.foodPerPersonKcal);
    if(pack){pack.water-=water;pack.food-=food;}
    b.waterUsedL+=water;b.foodConsumedKcal+=food;
    byPerson[person.id]={waterRatio:water/SCIENCE.waterPerPersonL,foodRatio:food/SCIENCE.foodPerPersonKcal,shelterRatio:0};
  }
  return {...local,byPerson};
}
export function conservationErrors(world){
  const r=world.resources,b=world.balances;
  const packed=Object.values(world.exploration?.packs||{}).reduce((s,p)=>({water:s.water+p.water,food:s.food+p.food,materials:s.materials+p.materials}),{water:0,food:0,materials:0});
  return {
    waterL:100750-(r.water+packed.water+world.groundwaterL+b.waterUsedL+b.evaporatedL),
    materialKg:6000-(r.materials+packed.materials+world.materialReserveKg+b.builtKg),
    energyKWh:10+b.solarGeneratedKWh-(r.energy+b.energyUsedKWh+b.energySpilledKWh),
    foodKcal:472500+b.cropProducedKcal-(r.food+packed.food+b.foodConsumedKcal+world.buildings.reduce((s,v)=>s+(v.cropStoredKcal||0),0))
  };
}
