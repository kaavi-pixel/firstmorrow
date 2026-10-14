# Land Extension Features: Annotated Review

The strongest idea is the tension between improving an established settlement and leaving for a potentially better location. Preserve that tension rather than making migration the required route to progress.

The original proposal is unchanged. Quotes below reproduce its substantive text; review comments and suggested replacements are separate. These are design recommendations, not approved implementation requirements.

## Landscape

> We are extending the landscape, part of that includes making the world in a similar way to Australia.
>
> Australia is built in a way where most of it is barely inhabitable desert, and a few coastal regions are inhabitable.

**Comment 1 | Medium | Geographic framing:** “Barely inhabitable” is too broad, and the desert/coast split should be presented as a design inspiration rather than a geographic rule. Australia's Bureau of Meteorology describes tropical, subtropical, temperate, desert, and grassland conditions, with variations shaped by mountains and ocean influences ([Australian climate zones](https://www.bom.gov.au/resources/learn-and-explore/climate-knowledge-centre/australian-climate-zones)).

Suggested replacement:

> Create an Australia-inspired landscape with a large arid interior and scattered regions with different settlement advantages. Use this as inspiration, not a literal reconstruction.

**Comment 2 | Medium | Regional trade-offs:** A single “habitability” ranking risks making every inhabitant prefer the same destination. Define separate properties such as freshwater availability, heat exposure, soil quality, accessible materials, and travel difficulty; let inhabitants evaluate them against their needs and values.

Suggested addition:

> No region is best at everything. A greener region might offer water and food potential but fewer accessible building materials or a more difficult journey.

## Starting conditions and exploration

> Start the character's in a barren desert as usual, but add initiative to explore and find new area's that are possibly more habitable.

**Comment 3 | Medium | Survival runway:** Clarify what “barren” permits. If survival is part of the simulation, specify starting supplies or nearby resources so inhabitants can survive long enough to investigate alternatives; do not make scouting depend on abandoning all shelter.

Suggested addition:

> The starting area is resource-poor but supports early survival. Inhabitants can improve it, scout nearby land, or prepare for migration.

**Comment 4 | Medium | Information and autonomy:** “Add initiative” does not explain what inhabitants know or how they decide. Prefer limited observations and explicit needs over a hardcoded command to explore; distinguish unknown land from observed land and allow information to become outdated.

Suggested replacement:

> Inhabitants may explore when their needs, observations, or goals justify the cost. They learn about new land through travel and shared reports rather than knowing the entire map in advance.

Suggested test:

> An inhabitant can discover a promising location without being forced to move there, and can explain why it scouts, stays, or migrates.

## Relocation

> Add a limitation for transferring buildings, where it takes time and energy to move buildings across land. This way, some people choose to not move all they have built and stay is possibly worse areas depending on the trade-offs.

**Comment 5 | Medium | Physical relocation:** Charging time and energy still leaves the mechanism unspecified. Distinguish carrying possessions, transporting suitable structures, dismantling and salvaging materials, and building again; relocation should depend on what was actually constructed rather than treating every building as a movable object.

Suggested replacement:

> Moving requires travel time, labor, and transport capacity. Inhabitants can carry possessions, move structures if their construction permits it, salvage materials, or leave structures behind and rebuild.

**Comment 6 | Medium | Reasons to stay:** Avoid relying only on prior investment to explain staying. An established location should retain practical value through shelter, stored supplies, productive systems, relationships, or access to useful resources; compare future costs and benefits, not merely work already spent.

Suggested addition:

> Staying, migrating, and establishing a second outpost are all possible strategies. Abandoned structures remain in the world, with ownership and reuse rules defined before other inhabitants can claim them.

Suggested tests:

> No structure changes location instantly. Moving cannot duplicate structures or materials, and a failed journey does not silently erase the original settlement.

## Weather and environmental change

> As the people expand their territory change the climate and weather.

**Comment 7 | Medium | Causality:** This could mean discovering different regional climates, seasonal weather changing independently, or inhabitants altering the environment. Separate these mechanisms; expanding a territory boundary alone should not change conditions if the goal is a physically grounded world.

Suggested replacement:

> Each region has baseline environmental conditions and changing weather. Inhabitants may alter local conditions through specific actions, such as clearing vegetation or redirecting water, rather than through territory expansion alone.

**Comment 8 | Medium | Scope and timescale:** “Climate and weather” is too large an implementation requirement without variables, timescales, and limits. Start with a small model of temperature, rainfall, and water availability, and label it a simplified model; defer broader feedback until the core settlement loop works.

Suggested test:

> Environmental changes have an identifiable cause and an explicit timescale. Inhabitants can observe the consequences and adjust their plans.

## Suggested first release

- **Landscape:** A finite map with an arid starting area and a few contrasting regions. Keep region properties simple and inspectable.
- **Exploration:** Travel has duration and cost; observations reveal land gradually. Add shared reports only once individual observations work.
- **Settlement choice:** Support staying and rebuilding elsewhere first. Add outposts and sophisticated transport later.
- **Relocation:** Track carried items and salvaged materials without duplication. Keep structure movement dependent on construction capabilities.
- **Environment:** Begin with regional conditions and a simple weather cycle. Defer inhabitant-driven environmental feedback until its causes can be represented consistently.
- **Observer experience:** Show discoveries, departure and arrival, and brief decision explanations in the world timeline. Distinguish stated intentions from completed actions.

## Wording and formatting

Remove the backslashes before Markdown heading markers and the stray `&#x20;`. Replace “character's” with “characters” or, preferably, “inhabitants”; replace “area's” with “areas”; use “incentive” or specify a decision mechanism instead of “initiative”; and replace “stay is possibly worse areas” with “remain in less favorable areas.”

The main improvement is specificity, not a longer feature list. Define what agents observe, what actions cost, what remains after migration, and what causes the environment to change.
