// main.js — boots AURELIA BAY: renderer, city, every gameplay system, input,
// the start/pause flow, and the fixed-step game loop that ties them together.
import * as THREE from "three";
import { City } from "./city.js";
import { Player } from "./player.js";
import { TrafficSystem } from "./traffic.js";
import { PedestrianSystem, Pedestrian } from "./pedestrians.js";
import { PoliceSystem, CRIME_HEAT } from "./police.js";
import { Combat } from "./combat.js";
import { MissionRunner, STORY, makeMarker } from "./missions.js";
import { Activities, RACES } from "./activities.js";
import { Garage } from "./garage.js";
import { AudioEngine } from "./audio.js";
import { Hud } from "./hud.js";
import { loadSave, storeSave, wipeSave, defaultSave, hasSave, respectTitle } from "./save.js";
import { updateFx } from "./vehicles.js";

const container = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.className = "webgl";
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(80, 40, 120);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const hud = new Hud();
const audio = new AudioEngine();

const world = {
  scene,
  city: new City(scene),
  player: new Player(scene),
  traffic: null,
  pedestrians: null,
  police: new PoliceSystem(scene),
  combat: null,
  missions: null,
  activities: null,
  garage: null,
  audio,
  hud,
  save: defaultSave(),
  started: false,
  paused: false,
  over: false,
  time: 0,
  crashCooldown: 0,
  allCars() {
    const cars = [];
    if (this.traffic) {
      for (const d of this.traffic.drivers) cars.push(d.car);
      for (const c of this.traffic.parked) cars.push(c);
    }
    for (const c of this.police.cars) cars.push(c);
    for (const c of this.police.blocks) cars.push(c);
    if (this.activities?.race) for (const r of this.activities.race.rivals) cars.push(r.car);
    if (this.activities?.tailTarget) cars.push(this.activities.tailTarget.car);
    return cars;
  },
  earn(amount, why) {
    this.save.cash += amount;
    this.save.earned += amount;
    if (why === "job") this.save.stats.jobs++;
    audio.cash();
    this.persist();
  },
  persist() {
    storeSave(this.save);
  },
  onCrime(kind, pos) {
    const heat = CRIME_HEAT[kind];
    if (heat) this.police.addHeat(heat);
    void pos;
  },
  onTrafficCrash(car, impact) {
    if (this.crashCooldown > 0) return;
    this.crashCooldown = 1.2;
    if (this.player.driving && Math.abs(impact) > 8) this.onCrime("crashCar", car.pos);
  },
  onPlayerRam(car, impact) {
    this.player.shake = Math.min(1, impact * 0.05);
    audio.crash(impact > 14);
    if (!this.player.driving) this.player.hurt(impact * 0.35);
  },
  onPlayerShot() {
    this.player.shake = Math.max(this.player.shake, 0.25);
  },
  onBusted() {
    handleBustedOrWasted("BUSTED");
  },
};

world.traffic = new TrafficSystem(scene, world.city);
world.pedestrians = new PedestrianSystem(scene, world.city);
world.combat = new Combat(scene, audio);
world.missions = new MissionRunner(scene, hud);
world.activities = new Activities(scene, hud);
world.garage = new Garage(hud);

// Job markers in the world: gold story, cyan races, green delivery.
const storyMarker = makeMarker(scene, 0xffd23f);
storyMarker.position.set(56, 0, 56);
const raceMarkers = RACES.map((race, i) => {
  const marker = makeMarker(scene, 0x53c2c9);
  marker.position.set(race.start[0], 0, race.start[1]);
  marker.userData.raceIndex = i;
  return marker;
});
const deliveryMarker = makeMarker(scene, 0x7ac74f);
deliveryMarker.position.set(14, 0, 35);

// --- Input ------------------------------------------------------------------
const input = { keys: new Set(), mouseDX: 0, mouseDY: 0, locked: false };
let dragLook = false;
let lastMouse = null;

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  if (key === " ") e.preventDefault();
  input.keys.add(key === " " ? " " : key);
  if (!world.started || world.paused) return;
  if (key === "e") tryEnterExit();
  if (key === "f") tryInteract();
  if (key === "1") world.combat.select("fists");
  if (key === "2") world.combat.select("pistol");
  if (key === "3") world.combat.select("smg");
  if (key === "r") world.combat.startReload();
  if (key === "q" && world.player.driving) {
    hud.setRadio(audio.cycleStation());
    audio.objective();
  }
  if (key === "g") world.garage.toggle(world);
  if (world.garage.open && ["1", "2", "3", "4"].includes(key)) world.garage.buy(Number(key) - 1, world);
});
window.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  input.keys.delete(key === " " ? " " : key);
  if (key === "escape" || key === "p") togglePause();
});
window.addEventListener("mousedown", (e) => {
  if (!world.started || world.paused) return;
  audio.unlock();
  if (e.button === 0) {
    world.combat.firing = true;
    if (!input.locked) { dragLook = true; lastMouse = [e.clientX, e.clientY]; }
  }
});
window.addEventListener("mouseup", (e) => {
  if (e.button === 0) { world.combat.firing = false; dragLook = false; }
});
window.addEventListener("mousemove", (e) => {
  if (input.locked) {
    input.mouseDX += e.movementX || 0;
    input.mouseDY += e.movementY || 0;
  } else if (dragLook && lastMouse) {
    input.mouseDX += (e.clientX - lastMouse[0]) * 1.6;
    input.mouseDY += (e.clientY - lastMouse[1]) * 1.6;
    lastMouse = [e.clientX, e.clientY];
  }
});
renderer.domElement.addEventListener("click", () => {
  if (world.started && !world.paused && !input.locked) {
    renderer.domElement.requestPointerLock?.();
  }
});
document.addEventListener("pointerlockchange", () => {
  input.locked = document.pointerLockElement === renderer.domElement;
});

// --- Interaction -------------------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of world.allCars()) {
    const d = car.pos.distanceTo(world.player.pos);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  return best;
}

function tryEnterExit() {
  const player = world.player;
  if (player.driving) {
    const car = player.driving;
    player.driving = null;
    car.occupied = false;
    player.mesh.visible = true;
    const side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
    player.pos.copy(car.pos).addScaledVector(side, 2.6);
    player.pos.y = 0;
    audio.setEngine(0, false);
    hud.setRadio("");
    return;
  }
  const car = nearestCar(4.2);
  if (!car || car.dead) return;
  const wasTraffic = world.traffic.drivers.find((d) => d.car === car);
  const wasParked = world.traffic.parked.includes(car);
  if (wasTraffic) {
    // Carjack: pull the driver out — he lands on the street and runs.
    world.traffic.drivers = world.traffic.drivers.filter((d) => d.car !== car);
    world.traffic.parked.push(car);
    const driver = new Pedestrian(scene, car.pos.x + 2.4, car.pos.z);
    driver.scare(car.pos, 6);
    world.pedestrians.list.push(driver);
    world.save.stats.stolen++;
    world.onCrime("carjack", car.pos);
    hud.banner("CARJACKED", "The driver won't forget that. Neither will the police.", "#e8b04a");
  } else if (wasParked) {
    world.save.stats.stolen++;
    world.onCrime("carTheft", car.pos);
  }
  car.occupied = true;
  car.engineLevel = world.save.upgrades.engine;
  if (world.save.paint >= 0 && car.kind === "civilian") car.repaint(world.save.paint);
  player.driving = car;
  player.mesh.visible = false;
  audio.setRadio(true);
  hud.setRadio(audio.stationName());
  world.persist();
}

function tryInteract() {
  const player = world.player;
  if (player.pos.distanceTo(storyMarker.position) < 6 && storyMarker.visible) {
    startStoryMission();
    return;
  }
  for (const marker of raceMarkers) {
    if (marker.visible && player.pos.distanceTo(marker.position) < 7) {
      world.activities.startRace(marker.userData.raceIndex, world, null);
      return;
    }
  }
  if (deliveryMarker.visible && player.pos.distanceTo(deliveryMarker.position) < 6) {
    if (!world.activities.delivery) world.activities.startDelivery(world);
  }
}

function startStoryMission() {
  const index = world.save.missionIndex;
  if (index >= STORY.length) return;
  const def = STORY[index];
  world.missions.start(def, world);
}

world.missions.onComplete = (def) => {
  world.save.missionIndex++;
  if (world.save.missionIndex >= STORY.length) world.save.storyDone = true;
  world.earn(def.pay, "job");
  hud.banner("JOB COMPLETE", `${def.title} — +$${def.pay}. Respect: ${respectTitle(world.save.earned)}.`, "#7ac74f");
  world.persist();
};
world.missions.onFail = () => {
  hud.setObjective("Return to the gold marker to retry the job.");
};

// --- Busted / wasted -----------------------------------------------------------
function handleBustedOrWasted(kind) {
  if (world.over) return;
  world.over = true;
  const fee = Math.min(world.save.cash, kind === "BUSTED" ? 150 : 200);
  world.save.cash -= fee;
  world.save.stats.busted++;
  world.police.clearWanted();
  hud.banner(kind, kind === "BUSTED"
    ? `The Bay PD take $${fee} and your dignity. You wake outside the clinic.`
    : `You wake at Aurelia Clinic. Treatment cost $${fee}.`, "#e83a3a");
  audio.hit();
  setTimeout(() => {
    const player = world.player;
    if (player.driving) {
      player.driving.occupied = false;
      player.driving = null;
    }
    player.mesh.visible = true;
    player.respawn(world.city.clinicPos.clone(), world.save.upgrades.armor);
    world.over = false;
    world.persist();
  }, 1600);
}

// --- Start / pause flow ---------------------------------------------------------
const startScreen = document.getElementById("startScreen");
const pauseScreen = document.getElementById("pauseScreen");
const continueBtn = document.getElementById("continueBtn");

function refreshStartScreen() {
  continueBtn.disabled = !hasSave();
  const saved = loadSave();
  document.getElementById("statsLine").textContent = saved
    ? `Saved: $${saved.cash} · ${respectTitle(saved.earned)} · Jobs ${saved.stats.jobs} · Cars stolen ${saved.stats.stolen} · Top speed ${Math.round(saved.stats.topSpeed * 3.6)} km/h`
    : "No saved game yet — New Game starts Rafe's story.";
}

function beginGame(withSave) {
  audio.unlock();
  world.save = withSave ? (loadSave() || defaultSave()) : defaultSave();
  if (!withSave) wipeSave();
  world.player.armor = world.save.upgrades.armor * 25;
  world.player.health = 100;
  world.started = true;
  startScreen.style.display = "none";
  hud.banner("AURELIA BAY", world.save.missionIndex >= STORY.length
    ? "The story is told — the Bay is yours. Races, parcels and the garage still pay."
    : "Find the gold marker by the plaza. Ines is waiting.", "#ffd23f");
  world.persist();
  refreshJobMarkers();
}

function refreshJobMarkers() {
  storyMarker.visible = world.started && world.save.missionIndex < STORY.length && !world.missions.busy;
}

function togglePause() {
  if (!world.started) return;
  world.paused = !world.paused;
  pauseScreen.style.display = world.paused ? "flex" : "none";
  if (world.paused) {
    const s = world.save;
    document.getElementById("pauseStats").textContent =
      `$${s.cash} · ${respectTitle(s.earned)} · Jobs done ${s.stats.jobs} · Cars stolen ${s.stats.stolen} · Races won ${s.stats.racesWon} · Deliveries ${s.stats.deliveries} · Top speed ${Math.round(s.stats.topSpeed * 3.6)} km/h`;
    document.exitPointerLock?.();
  }
}

document.getElementById("newGameBtn").addEventListener("click", () => beginGame(false));
continueBtn.addEventListener("click", () => beginGame(true));
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document.getElementById("restartBtn").addEventListener("click", () => { wipeSave(); location.reload(); });
refreshStartScreen();

// Debug / screenshot hook: the live game state, readable by tooling.
window.AURELIA = world;

// --- Per-frame update -------------------------------------------------------------
function updateInteractPrompt() {
  const player = world.player;
  if (world.garage.open) { hud.setInteract("Garage open — 1–4 buy · G close"); return; }
  if (world.garage.inGarage(world) && player.driving) { hud.setInteract("G — Garage menu"); return; }
  if (player.driving) { hud.setInteract("E — Exit car · Q — Radio"); return; }
  if (nearestCar(4.2)) { hud.setInteract("E — Enter car"); return; }
  if (storyMarker.visible && player.pos.distanceTo(storyMarker.position) < 6) { hud.setInteract("F — Job for Ines"); return; }
  for (const marker of raceMarkers) {
    if (marker.visible && player.pos.distanceTo(marker.position) < 7) { hud.setInteract("F — Street race"); return; }
  }
  if (deliveryMarker.visible && player.pos.distanceTo(deliveryMarker.position) < 6 && !world.activities.delivery) {
    hud.setInteract("F — Parcel run ($220)");
    return;
  }
  hud.setInteract("");
}

function step(dt) {
  world.time += dt;
  world.crashCooldown = Math.max(0, world.crashCooldown - dt);
  const player = world.player;

  // Mouse look.
  if (world.started && !world.paused) {
    player.yaw -= input.mouseDX * 0.0026;
    player.pitch = Math.max(-0.15, Math.min(1.1, player.pitch + input.mouseDY * 0.0022));
  }
  input.mouseDX = 0;
  input.mouseDY = 0;

  const threats = world.allCars();
  world.traffic.update(dt, world);
  world.pedestrians.update(dt, world.city, threats);

  if (world.started && !world.paused && !world.over) {
    if (player.driving) {
      const car = player.driving;
      let throttle = 0;
      if (input.keys.has("w")) throttle = 1;
      if (input.keys.has("s")) throttle = -1;
      let steer = 0;
      if (input.keys.has("a")) steer = -1;
      if (input.keys.has("d")) steer = 1;
      const handbrake = input.keys.has(" ");
      const impact = car.drive(dt, throttle, steer, handbrake, world.city, world.allCars());
      player.pos.copy(car.pos);
      if (impact > 6) {
        player.shake = Math.min(1, impact * 0.06);
        audio.crash(impact > 13);
        world.onCrime("crashCar", car.pos);
        if (impact > 16) player.hurt((impact - 14) * 0.7);
      }
      // Running someone down is very much a crime.
      for (const ped of world.pedestrians.list) {
        if (ped.state === "down" || ped.state === "driver") continue;
        if (ped.pos.distanceTo(car.pos) < 2.1 && Math.abs(car.speed) > 3) {
          if (ped.knockDown(Math.abs(car.speed) * 6)) world.onCrime("pedDown", ped.pos);
          audio.hit();
        }
      }
      const kmh = Math.abs(car.speed) * 3.6;
      if (car.speed > world.save.stats.topSpeed) {
        world.save.stats.topSpeed = car.speed;
      }
      hud.setSpeed(kmh, true);
      audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
      audio.updateRadio(dt, true);
    } else {
      player.updateOnFoot(dt, input, world.city);
      hud.setSpeed(0, false);
      audio.setEngine(0, false);
    }
    world.combat.firing = world.combat.firing && !player.driving;
    world.combat.tryFire(dt, world);
    world.police.update(dt, world);
    world.missions.update(dt, world);
    world.activities.update(dt, world);
    if (player.health <= 0) handleBustedOrWasted("WASTED");
  }

  world.combat.update(dt);
  world.city.update(dt, world.time);
  updateFx(scene, dt);

  // Cameras.
  if (world.started) {
    player.updateCamera(dt, camera, input);
  } else {
    const t = world.time * 0.05;
    camera.position.set(Math.sin(t) * 150, 55, Math.cos(t) * 150);
    camera.lookAt(0, 8, 0);
  }

  // HUD refresh.
  hud.setStars(world.police.stars);
  hud.setMoney(world.save.cash, respectTitle(world.save.earned));
  hud.setVitals(player.health, player.armor);
  hud.setWeapon(world.combat.current().name, world.combat.ammoText(), world.combat.reloading > 0);
  hud.setBust(world.police.bustTimer / 2.4);
  hud.update(dt);
  hud.drawMinimap(world);
  updateInteractPrompt();
  refreshJobMarkers();
  for (const marker of raceMarkers) {
    marker.visible = world.started && !world.activities.race;
    marker.rotation.y += dt;
  }
  deliveryMarker.visible = world.started && !world.activities.delivery;
  deliveryMarker.rotation.y += dt;
  storyMarker.rotation.y += dt;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  // Sub-step so game time tracks real time even on slow machines, while no
  // single physics step ever exceeds 50 ms.
  let dt = Math.min(0.15, (now - last) / 1000);
  last = now;
  if (!world.paused) {
    while (dt > 0) {
      const chunk = Math.min(0.05, dt);
      step(chunk);
      dt -= chunk;
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
