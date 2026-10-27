// Ambient conversation. Not a model call, and not a change to instinct: people
// and agents talk while the simulation does its work. The lines are chosen from
// what is actually happening, and addressed to someone, so the camp sounds alive.
import { weatherOn } from './weather.mjs';
import { waterNeedL } from './validate.mjs';

const DAY = 1440;
const living = S => S.people.filter(p => p.alive);
const dayIndex = S => Math.floor(S.minute / DAY);
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clampDays = n => Math.max(0, n).toFixed(1);

const VOICE = {
  Ada: {
    water: 'I keep thinking about the children and tomorrow’s water.',
    food: 'A family needs to know there will be something to eat tomorrow.',
    storm: 'I do not want anyone sleeping in the open when the wind gets up.',
    work: 'A roof is worth the sore hands if it means a safe place for everyone.',
    design: 'It is starting to feel like somewhere a family could belong.',
    materials: 'Every plank has to earn its place.',
    life: 'I want a home where raising a family is a choice, not a sentence.',
  },
  Ren: {
    water: 'I can fetch my own water, but the camp should not depend on me forever.',
    food: 'I like my independence, but I am not going to eat air to prove it.',
    storm: 'I want a door I can close, not another night pretending the wind is fine.',
    work: 'Let us get it built, then we can each have some room to breathe.',
    design: 'Useful, and it does not tell me how to live.',
    materials: 'Let us not waste good material on a monument.',
    life: 'I need some quiet and a life that is still my own.',
  },
  Mika: {
    water: 'Nobody should be thirsty while there are hands free to carry.',
    food: 'A good average means nothing if somebody is still going hungry.',
    storm: 'The weakest roof is the one everyone ends up under. Let us make it hold.',
    work: 'Many hands make this fair, not just fast.',
    design: 'This is what shared work is supposed to look like.',
    materials: 'We should count what we have before we count what we want.',
    life: 'I want nobody to be the price of somebody else’s comfort.',
  },
  Sol: {
    water: 'The spring is finite. Every trip should teach us to use less.',
    food: 'Wild food buys time, but it cannot be the whole plan.',
    storm: 'A roof is not just comfort; it is what lets the land keep us tomorrow.',
    work: 'Build it to last, and we will not have to take twice from the ground.',
    design: 'This takes pressure off the land instead of adding to it.',
    materials: 'What we take from the ground should come back as years of shelter.',
    life: 'I want this place to feed the people who come after us.',
  },
  Ivo: {
    water: 'I can think of a better way to carry water if someone shows me the spring path.',
    food: 'I am hungry enough to start designing dinner before I eat it.',
    storm: 'Give me a roof and I will find a way to make it stronger.',
    work: 'I can learn the joinery. Just let me get my hands on it.',
    design: 'I want to see what this thing can do, not just what it looks like.',
    materials: 'There has to be a cleverer way to use what is left.',
    life: 'Give me tools and a little room to be different.',
  },
};

const OPENERS = {
  water: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].water} The butt is down to ${clampDays(S._waterDays)} days of water. Can we fetch it before the heat builds?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].water} I am going to the spring. Will you take the next load?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].water} Let us get every canteen filled before we do anything else.`,
  ],
  food: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].food} There is only ${clampDays(S._foodDays)} days of food at camp. We need to eat before we build.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].food} I am going out to forage. Come with me?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].food} I would rather work hungry tomorrow than today. Let us find something to eat.`,
  ],
  storm: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].storm} A storm is coming at ${String(S._stormHour).padStart(2, '0')}:00. We should get under a roof.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].storm} Did you hear the wind? I do not want to be caught out in it.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].storm} Let us check the shelter before the sky turns.`,
  ],
  work: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].work} ${S._site.name} still needs ${Math.ceil(S._site.laborHours - S._site.progressHours)} person-hours. Will you help me finish it?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].work} I am going back to ${S._site.name}. The scaffold will not climb itself.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].work} We are ${Math.round(S._site.progressHours)} of ${S._site.laborHours} hours into ${S._site.name}. Let us keep at it.`,
  ],
  design: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].design} ${S._built.name}: ${S._built.description || 'it gives us something we did not have.'}`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].design} I walked past ${S._built.name} this morning and thought, this is worth the work.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].design} ${S._built.name} is standing. What should we ask the authors for next?`,
  ],
  materials: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].materials} There are only ${Math.round(S.camp.stock.material)} kg of material at camp.`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].materials} Before we start another design, can we gather what we actually need?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].materials} I do not want to undo one thing to make another.`,
  ],
  life: [
    (S, p, t) => `${t.name}, ${VOICE[p.name].life} What would make this place feel like home to you?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].life} What do you want from tomorrow, beyond another day of work?`,
    (S, p, t) => `${t.name}, ${VOICE[p.name].life} When this is over, what part of today would you want to keep?`,
  ],
};

const REPLIES = {
  water: [
    (S, p, t) => `I will take the next load, ${t.name}. Nobody should have to ask twice.`,
    (S, p, t) => `I hear you, ${t.name}. Let us keep the camp covered first.`,
    (S, p, t) => `I can go now. Bring the big canteen if there is one spare.`,
  ],
  food: [
    (S, p, t) => `I will come, ${t.name}. We can eat something better than promises.`,
    (S, p, t) => `You are right. An empty stomach does not lay a straight beam.`,
    (S, p, t) => `Let us get enough for everyone, not just for ourselves.`,
  ],
  storm: [
    (S, p, t) => `I will be inside before it hits, ${t.name}. You should too.`,
    (S, p, t) => `I felt it too. Let us not be brave about the weather.`,
    (S, p, t) => `Good thinking. I would rather lose an hour than a roof.`,
  ],
  work: [
    (S, p, t) => `I will take the next shift, ${t.name}. Tell me where the hard part is.`,
    (S, p, t) => `I can carry the beams if you show me the joins.`,
    (S, p, t) => `Let us finish this one properly before we start anything else.`,
  ],
  design: [
    (S, p, t) => `I like that, ${t.name}. It gives us something we could not make alone.`,
    (S, p, t) => `Yes. And the people still have to live with it, so let us see if it earns its keep.`,
    (S, p, t) => `Maybe something that makes tomorrow a little less like yesterday.`,
  ],
  materials: [
    (S, p, t) => `Then we should gather before we promise more, ${t.name}.`,
    (S, p, t) => `Agreed. Let us make the small thing that works, not the big thing we cannot finish.`,
    (S, p, t) => `I can help haul it. Waste is just another kind of thirst.`,
  ],
  life: [
    (S, p, t) => `Somewhere I can be useful and still be myself, ${t.name}.`,
    (S, p, t) => `A morning where I do not have to fight for the basics. Then maybe something worth making.`,
    (S, p, t) => `People to eat with, and a little space after dinner. Both, if I am honest.`,
  ],
};

const CLOSERS = {
  water: [
    (S, p) => `Good. Once there is water at camp, we can think about the rest.`,
    (S, p) => `That is one less thing to worry about tonight.`,
    (S, p) => `Then let us do it while the sun is still low.`,
  ],
  food: [
    (S, p) => `Right. Food first, then we can get back to building.`,
    (S, p) => `I will feel better once there is something in the larder.`,
    (S, p) => `Let us eat, and then we can argue about the future properly.`,
  ],
  storm: [
    (S, p) => `Good. I would rather be bored under a roof than interesting in a storm.`,
    (S, p) => `Then we are agreed. We get everyone in before it starts.`,
    (S, p) => `I will check the others on my way in.`,
  ],
  work: [
    (S, p) => `Good. One finished thing is worth more than three good intentions.`,
    (S, p) => `Then let us put a few more hours into it today.`,
    (S, p) => `I will sleep better when it is standing.`,
  ],
  design: [
    (S, p) => `It is good to see a design turn into something real.`,
    (S, p) => `Let us use it well, and tell the authors what actually helped.`,
    (S, p) => `Tomorrow can be a little easier, then.`,
  ],
  materials: [
    (S, p) => `Right. We make what we can afford, and we finish it.`,
    (S, p) => `That sounds like a plan I can live with.`,
    (S, p) => `Small and useful, then. I can do that.`,
  ],
  life: [
    (S, p) => `I think I could live with that. Maybe even like it here.`,
    (S, p) => `Then let us make a little room for it while we can.`,
    (S, p) => `That is worth keeping in mind when the work gets loud.`,
  ],
};

const AGENT_OPENERS = {
  water: [
    (S, a, t) => `${t.name}, the camp has ${clampDays(S._waterDays)} days of water. My next design has to shorten the spring run, not just look good beside it.`,
    (S, a, t) => `${t.name}, I am putting water ahead of ornament. The people cannot keep hauling every litre forever.`,
    (S, a, t) => `${t.name}, a dry camp is a design failure before it is a survival problem. What can we build that actually helps?`,
  ],
  food: [
    (S, a, t) => `${t.name}, the larder is down to ${clampDays(S._foodDays)} days. Foraging is a bridge, not a food system.`,
    (S, a, t) => `${t.name}, I want a garden that earns its water, not a pretty field that drinks the camp dry.`,
    (S, a, t) => `${t.name}, wild food is running out. We need something the people can harvest after the bushes are bare.`,
  ],
  storm: [
    (S, a, t) => `${t.name}, there is a storm due at ${String(S._stormHour).padStart(2, '0')}:00. I am checking shelter mass before I draw anything else.`,
    (S, a, t) => `${t.name}, a storm is the wrong time to discover a roof is mostly decoration. Let us build for the wind.`,
    (S, a, t) => `${t.name}, I would rather give them a small shelter that stands than a grand one that folds.`,
  ],
  work: [
    (S, a, t) => `${t.name}, ${S._site.name} is at ${Math.round(S._site.progressHours)} of ${S._site.laborHours} person-hours. I am watching the bottleneck, not adding another one.`,
    (S, a, t) => `${t.name}, ${S._site.name} still needs hands. I will hold the next design until the people have caught up.`,
    (S, a, t) => `${t.name}, my drawing means nothing while ${S._site.name} is a scaffold. Finish first, then expand.`,
  ],
  design: [
    (S, a, t) => `${t.name}, ${S._built.name} is standing. ${S._built.description || 'Now we see whether it earns its mass.'}`,
    (S, a, t) => `${t.name}, ${S._built.name} is real now. I want to know whether the people actually use it.`,
    (S, a, t) => `${t.name}, ${S._built.name} is up. The next design should build on it, not repeat it.`,
  ],
  materials: [
    (S, a, t) => `${t.name}, there are ${Math.round(S.camp.stock.material)} kg of material left. That is a constraint on the drawing, not a footnote.`,
    (S, a, t) => `${t.name}, I am shrinking the next design to the material we can actually gather.`,
    (S, a, t) => `${t.name}, no more grand plans on an empty stockpile. Small, useful, buildable.`,
  ],
  life: [
    (S, a, t) => `${t.name}, the people need more than survival arithmetic. What would make this place worth living in?`,
    (S, a, t) => `${t.name}, I want the next design to give someone back an hour of their own day.`,
    (S, a, t) => `${t.name}, if this only keeps people alive to work, we have designed the wrong world.`,
  ],
};

const AGENT_REPLIES = {
  water: [
    (S, a, t) => `Agreed, ${t.name}. I can make the still efficient; you make the route sensible.`,
    (S, a, t) => `Then let us measure the water saved in litres, not admire the plumbing.`,
    (S, a, t) => `I will take the engineering. Keep the shelter close enough that the trip is possible in heat.`,
  ],
  food: [
    (S, a, t) => `I can make a garden work within the water budget, ${t.name}. Give it a place near the people.`,
    (S, a, t) => `Exactly. Food per litre is the number that matters now.`,
    (S, a, t) => `Then let us keep the first plot small enough to survive a dry week.`,
  ],
  storm: [
    (S, a, t) => `I will put the mass into the joints, ${t.name}. A roof should be a promise the wind cannot break.`,
    (S, a, t) => `Agreed. Shelter for the people first, elegance after the storm.`,
    (S, a, t) => `Let us build where they already gather, so nobody has to run far for cover.`,
  ],
  work: [
    (S, a, t) => `Good call, ${t.name}. I will not queue another site until this one stands.`,
    (S, a, t) => `The people need labour hours more than another sketch. I can wait.`,
    (S, a, t) => `I will use the time to make its program smaller and more useful.`,
  ],
  design: [
    (S, a, t) => `I will watch its output, ${t.name}. If it does not produce, we learn and change.`,
    (S, a, t) => `That is the right next step: improve the process, not just add another object.`,
    (S, a, t) => `Then the next one solves the new bottleneck this creates.`,
  ],
  materials: [
    (S, a, t) => `I can work within that, ${t.name}. Material efficiency is part of the design.`,
    (S, a, t) => `Agreed. I would rather have a working still than a half-built palace.`,
    (S, a, t) => `Then let us put the kilograms where they buy the most days.`,
  ],
  life: [
    (S, a, t) => `A sheltered place to talk without having to work, ${t.name}. Survival needs room for a self.`,
    (S, a, t) => `Exactly. The best structure here might be the one that lets someone rest.`,
    (S, a, t) => `Then we should judge our work by the lives around it, not just its output.`,
  ],
};

const AGENT_CLOSERS = {
  water: [
    (S, a) => `Then I will draft the water works, and you make sure the people can maintain them.`,
    (S, a) => `Good. A shorter walk to water is time returned to everyone.`,
    (S, a) => `Let us make the next litre cheaper than the last.`,
  ],
  food: [
    (S, a) => `Then I will design the garden, and you keep it honest about water.`,
    (S, a) => `Good. A modest harvest that repeats is worth more than one lucky crop.`,
    (S, a) => `Let us give them food they can count on next week.`,
  ],
  storm: [
    (S, a) => `Then I will place the shelter, and you make it strong enough to mean shelter.`,
    (S, a) => `Good. When the wind arrives, the design gets its review whether we are ready or not.`,
    (S, a) => `Let us give everyone somewhere to be when the sky turns.`,
  ],
  work: [
    (S, a) => `Then I will keep the plans quiet until the hammering stops.`,
    (S, a) => `Agreed. The next design starts when this one is finished.`,
    (S, a) => `That is the discipline: buildable first, ambitious second.`,
  ],
  design: [
    (S, a) => `Then I will take the next constraint, and you take the process.`,
    (S, a) => `Good. Let the world tell us what to design next.`,
    (S, a) => `Now we make it earn its place.`,
  ],
  materials: [
    (S, a) => `Then I will keep the mass down and the purpose up.`,
    (S, a) => `Agreed. We spend material like it matters, because it does.`,
    (S, a) => `Small enough to finish, useful enough to matter.`,
  ],
  life: [
    (S, a) => `Then I will leave room for that in the next design.`,
    (S, a) => `Good. A little more living inside the surviving.`,
    (S, a) => `That is worth building for.`,
  ],
};

function context(S) {
  const day = dayIndex(S);
  const w = weatherOn(S.weather, day);
  const alive = Math.max(1, living(S).length);
  const need = waterNeedL(w.tempC);
  S._waterDays = S.camp.stock.water / (need * alive);
  S._foodDays = S.camp.stock.food / (2100 * alive);
  S._stormHour = w.storm?.hour ?? 12;
  S._site = S.structures.find(s => !s.built) || null;
  S._built = [...S.structures].reverse().find(s => s.built) || null;
  return w;
}

function topicFor(S, w, turn) {
  if (w.storm) return 'storm';
  if (S._waterDays < 1) return 'water';
  if (S._foodDays < 1) return 'food';
  if (S._site) return 'work';
  if (S._built && turn % 3 === 0) return 'design';
  if (S.camp.stock.material < 24) return 'materials';
  if (S._built && turn % 3 === 1) return 'design';
  return 'life';
}

function say(S, kind, speaker, target, text) {
  if (!speaker || !target) return;
  const message = {
    t: S.minute, kind, speakerId: speaker.id, speaker: speaker.name,
    targetId: target.id, target: target.name, text: text.trim().slice(0, 240),
  };
  S.conversations.push(message);
  speaker.say = message.text;
  speaker.saidAt = S.minute;
}

function personExchange(S, turn) {
  const people = living(S);
  if (people.length < 2) return false;
  const speaker = people[turn % people.length];
  const target = [...people].filter(p => p.id !== speaker.id)
    .sort((a, b) => distance(a, speaker) - distance(b, speaker) || a.id.localeCompare(b.id))[0];
  const topic = topicFor(S, weatherOn(S.weather, dayIndex(S)), turn);
  const variant = Math.floor(turn / 2) % 3;
  say(S, 'people', speaker, target, OPENERS[topic][variant](S, speaker, target));
  say(S, 'people', target, speaker, REPLIES[topic][variant](S, target, speaker));
  say(S, 'people', speaker, target, CLOSERS[topic][variant](S, speaker, target));
  return true;
}

function agentExchange(S, turn) {
  if (S.authors.length < 2) return false;
  const speaker = S.authors[turn % S.authors.length];
  const target = S.authors[(turn + 1) % S.authors.length];
  const topic = topicFor(S, weatherOn(S.weather, dayIndex(S)), turn);
  const variant = Math.floor(turn / 2) % 3;
  say(S, 'agents', speaker, target, AGENT_OPENERS[topic][variant](S, speaker, target));
  say(S, 'agents', target, speaker, AGENT_REPLIES[topic][variant](S, target, speaker));
  say(S, 'agents', speaker, target, AGENT_CLOSERS[topic][variant](S, speaker, target));
  return true;
}

/** Called with the instinct beat. One short exchange every 30 simulated minutes. */
export function runConversations(S) {
  S.conversations ??= [];
  // A world saved before ambient conversation starts at the next beat, not with
  // hundreds of exchanges invented for a past nobody heard.
  S.conversationClock ??= { nextAt: Math.floor(S.minute / 30) * 30 + 30, turn: 0 };
  context(S);
  while (S.minute >= S.conversationClock.nextAt) {
    const turn = S.conversationClock.turn++;
    const kind = turn % 2 === 0 ? 'people' : 'agents';
    if (kind === 'people' && living(S).length >= 2) personExchange(S, turn);
    else agentExchange(S, turn);
    S.conversationClock.nextAt += 30;
  }
  if (S.conversations.length > 120) S.conversations.splice(0, S.conversations.length - 120);
  delete S._waterDays; delete S._foodDays; delete S._stormHour; delete S._site; delete S._built;
}
