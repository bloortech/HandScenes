# How real is it?

The species is *Atta sexdens*, a South American leafcutter ant. Leafcutters build the biggest
underground nests of any ant: mature colonies have thousands of chambers, reach several metres
down, and hold millions of workers. They don't eat the leaves; they grow a fungus on them and eat that.

The farm is a 2D slab because real ant farms are thin glass slabs too. 1 pixel = 1 mm, and the clock
is a real clock (1× means one real second per second).

## What follows the known biology

- **Founding.** After her mating flight the queen sheds her wings, digs a narrow shaft alone, hollows
  a small chamber at the bottom, plugs the shaft from inside, and starts a fungus garden from a pellet
  she carried from her mother's nest. She raises the first brood sealed in, without foraging.
- **First workers are tiny.** The first brood is mostly minims (garden tenders) and small workers.
  The range of worker sizes widens as the colony grows; big soldiers (majors) only appear in large colonies.
- **Workers open the nest**, dig through the plug, and foraging begins.
- **Fungus farming.** Foragers bring leaf fragments in; the garden grows in chambers from the floor up;
  spent fungus is removed. Egg-laying slows when the garden is short.
- **Nest size follows colony size.** Ants dig when space runs short and stop when it doesn't
  (demand-driven excavation), so the nest grows with the colony.
- **Soil is conserved.** Every grain dug out is carried to the surface and dropped on the mound
  (rolling to a stable slope), so the mound's stripes show which soil layer it came from.
- **Most workers are idle at any moment**, resting in the garden. That's real, and it's also what
  lets the sim fast-forward cheaply.

## What is an estimate (marked `EST` in `sim.js`)

These numbers are from my memory of the literature, **not yet checked against papers**:
the egg-to-worker time (45 days), worker lifespan (120 days), the egg-laying curve, digging speed
per mm², walking speeds per caste, founding shaft depth (~17–23 cm), chamber sizes, the angle of repose,
and how fast the garden is consumed.

## What is a simplification, not biology

- **Blueprints.** Real ants have no plan; tunnels and chambers emerge from local cues (pheromone in the
  soil, crowding, gravity). Here the colony picks a meandering tunnel path or chamber shape, then the
  individual ants dig it pellet by pellet. The digging is agent-by-agent; the plan is not.
- **Foraging off-screen.** Foragers walk the surface to the edge and come back with a leaf after a
  20–70 minute trip. The trees aren't simulated.
- **Dots stand for several ants** once the colony passes 900 workers (the HUD shows the ratio).
- **The farm is 1 m × 70 cm**, so it fills up around the end of year one. A real *Atta* nest keeps
  going for years and metres.

## Good next steps

1. Check the `EST` numbers against Autuori's founding studies and Hölldobler & Wilson's *The Leafcutter Ants*.
2. Swap blueprints for emergent digging (pheromone-laced pellets, Khuong et al. 2016 style).
3. Waste chambers, nuptial flights, a bigger/deeper world, and catch-up time while the tab is closed.
