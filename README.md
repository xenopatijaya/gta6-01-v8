# AURELIA BAY

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/xenopatijaya/gta6-01-v8/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/xenopatijaya/gta6-01-v8/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**AURELIA BAY** is an original open-world crime game that runs entirely in the
browser. You are **Rafe Delgado**, a wheelman in a sun-soaked coastal city at
golden hour, running jobs for fixer **Ines Salgado** — pickups, deliveries,
tails, escapes, a street race against a rival, and one big finale — while a
full wanted system, police interceptors, roadblocks and a searchlight
helicopter try to shut you down.

Everything is procedural: the 7×7 street grid, pastel-and-glass towers with
lit windows, palm-lined avenues, the beach and marina, the lighthouse and the
clock tower are all built from code with vendored three.js. No assets, no
network, no build step.

## Play

Open `game/index.html` through any static server (or run `node serve.ts` in
this repo and visit http://localhost:8080). Click **New Game**, then click the
canvas to lock the mouse.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look / aim (pointer lock; drag also works) |
| Shift | Sprint / boost feel while driving |
| Space | Jump on foot / handbrake in a car |
| E | Enter or exit a car (walk up to any car — a stopped one can be carjacked) |
| F | Start a mission, race or delivery at its marker |
| 1 / 2 / 3 | Fists / pistol / SMG |
| Mouse click | Fire |
| R | Reload |
| Q | Switch radio station (while driving) |
| G | Garage menu (inside the garage marker) |
| Esc / P | Pause |

## Features

- **Two ways to move:** third-person on-foot play and arcade driving in any
  car in the city, with chase camera, damage, smoke, burning wrecks and
  carjacking (the driver is pulled out and runs).
- **Living city:** traffic AI drives the grid, cars park along the kerbs, and
  pedestrians stroll the sidewalks and flee from gunfire, fights and speeding
  cars.
- **Wanted system, 0–5 stars:** theft, collisions, gunfire and mission crimes
  raise it; breaking line of sight lets it decay. Police answer with
  interceptor cars that chase and ram, foot officers at high heat, roadblocks
  from 3 stars, and a helicopter with a sweeping searchlight at 4 stars.
- **Combat:** three weapon slots with ammo and reloads, tracers and muzzle
  flashes, NPC health, player health and armour. Get busted or wasted and you
  wake up at the clinic, lighter in cash.
- **Story:** six chained missions for Ines Salgado with dialogue banners and
  objective markers — a pickup, a hot delivery, a tail, an escape, a race
  against rival driver Marco Vale, and the Aurelia Crown finale.
- **Side activities:** two checkpoint street races against AI drivers and a
  repeatable parcel delivery job.
- **Progression:** cash, Respect ranks (Runner → Wheelman → Fixer's Right
  Hand → Bay Legend), a mission unlock chain, and a stats line (jobs done,
  cars stolen, top speed).
- **Garage:** drive into the bay for repairs, repaints, armour and engine
  upgrades, bought with earned cash.
- **Radio:** three WebAudio-synthesised stations (Sunset FM, Coral Wave,
  Night Pier) — no audio files.
- **HUD:** wanted stars, cash and Respect, health/armour bars, speedometer,
  weapon and ammo, mission banner with objective distance, and a live
  north-up minimap with police blips, mission markers and race checkpoints.
- **Save:** progress, cash, upgrades and stats persist in `localStorage`;
  Continue picks up where you left off.

## Structure

`game/src/` holds one module per system: `city` (world building), `traffic`,
`pedestrians`, `player`, `vehicles`, `police`, `combat`, `missions`,
`activities`, `garage`, `audio`, `hud`, `save`, and `main` (boot and the game
loop). `main.ts` at the repo root performs the make.fun hand-in.
