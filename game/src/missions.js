// missions.js — the six-mission story chain for fixer Ines Salgado, plus the
// generic objective engine (markers, dialogue banners, stage flow) that the
// side activities reuse.
import * as THREE from "three";

export function makeMarker(scene, color = 0xffd23f) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.28, 8, 24),
    new THREE.MeshBasicMaterial({ color })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.1;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 13;
  group.add(ring, beam);
  group.visible = false;
  scene.add(group);
  return group;
}

export const STORY = [
  {
    id: "first-favour",
    title: "First Favour",
    pay: 400,
    intro: [
      ["Ines Salgado", "Rafe. I hear you can drive. Prove it — my courier dropped a case by the marina pier."],
      ["Rafe Delgado", "Pick it up and bring it back. Simple."],
      ["Ines Salgado", "Simple. Just don't let anyone take it off you."],
    ],
    stages: [
      { type: "goto", at: [-140, 252 - 14], label: "Pick up the case at the marina pier" },
      { type: "goto", at: [44, 62], label: "Deliver the case to Ines at the plaza", crimeOnDone: "mission" },
    ],
    outro: [["Ines Salgado", "Clean work. The Bay might have a place for you after all."]],
  },
  {
    id: "hot-parcel",
    title: "Hot Parcel",
    pay: 650,
    intro: [
      ["Ines Salgado", "A parcel, a deadline, and half the Bay PD bored on shift. You know the drill."],
      ["Rafe Delgado", "Ninety seconds. Where to?"],
      ["Ines Salgado", "The clock tower. Go — the clock is already running."],
    ],
    stages: [
      { type: "goto", at: [-36, -70], label: "Collect the parcel from the west kerb" },
      { type: "timed", seconds: 100, at: [52, 35], label: "Reach the clock tower before the timer runs out", needCar: true },
    ],
    outro: [["Ines Salgado", "Right on the wire. The client sends his thanks — and his money."]],
  },
  {
    id: "quiet-tail",
    title: "Quiet Tail",
    pay: 800,
    intro: [
      ["Ines Salgado", "Marco Vale is moving something tonight. Follow him. Close enough to see, far enough to live."],
      ["Rafe Delgado", "Tail him, don't touch him. Got it."],
    ],
    stages: [
      { type: "tail", seconds: 45, label: "Tail Marco's car — stay within 45 m, don't ram him" },
    ],
    outro: [["Ines Salgado", "The old boatyard road. That's where he hides it. Good eyes, Rafe."]],
  },
  {
    id: "break-line",
    title: "Break the Line",
    pay: 950,
    intro: [
      ["Ines Salgado", "That stunt at the boatyard got you noticed. Every badge in the Bay wants a word."],
      ["Rafe Delgado", "Then I won't stop to chat."],
      ["Ines Salgado", "Lose them. All of them. Then we talk business."],
    ],
    stages: [
      { type: "heat", level: 2, label: "You are blown — heat is rising" },
      { type: "escape", label: "Lose the police completely (0 stars)" },
    ],
    outro: [["Ines Salgado", "Gone like sea mist. You are wasted on small jobs, wheelman."]],
  },
  {
    id: "vale-rematch",
    title: "Vale Rematch",
    pay: 1200,
    intro: [
      ["Ines Salgado", "Marco says his tail was luck. He wants a race — harbour loop, his line against yours."],
      ["Rafe Delgado", "Tell him to bring his pride. I'll bring a faster car."],
    ],
    stages: [
      { type: "race", race: 0, label: "Beat Marco Vale in the Harbour Loop race" },
    ],
    outro: [["Marco Vale", "Fine. Fine! The Bay is yours, Delgado. For now."]],
  },
  {
    id: "aurelia-crown",
    title: "The Aurelia Crown",
    pay: 2500,
    intro: [
      ["Ines Salgado", "One last job. The Aurelia Crown — a jewelled tide-crown — sits in a vault by the lighthouse."],
      ["Rafe Delgado", "And every cop in the Bay will come running."],
      ["Ines Salgado", "Grab it, outrun them, and bring it to the marina. Then we are legends."],
    ],
    stages: [
      { type: "goto", at: [196, 226], label: "Reach the lighthouse vault" },
      { type: "goto", at: [-122, 226], label: "Escape with the Crown to the marina pier", crimeOnStart: "mission", heatTo: 3 },
      { type: "escape", label: "Shake the police before you celebrate" },
    ],
    outro: [
      ["Ines Salgado", "The Aurelia Crown. You actually did it."],
      ["Rafe Delgado", "We did it, Ines. Now — about that legend money…"],
    ],
  },
];

export class MissionRunner {
  constructor(scene, hud) {
    this.hud = hud;
    this.marker = makeMarker(scene, 0xffd23f);
    this.active = null; // {def, stageIndex, stage data...}
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.onComplete = null;
    this.onFail = null;
  }

  get busy() {
    return this.active !== null;
  }

  start(def, world) {
    this.active = { def, stageIndex: -1, timer: 0, tailTime: 0, heatApplied: false };
    this.playDialogue(def.intro, () => this.nextStage(world));
  }

  playDialogue(lines, after) {
    this.dialogueQueue = lines.map(([who, text]) => ({ who, text }));
    this.dialogueTimer = 0;
    this.afterDialogue = after || null;
  }

  updateDialogue(dt) {
    if (!this.dialogueQueue.length) {
      this.hud.hideDialogue();
      if (this.afterDialogue) {
        const cb = this.afterDialogue;
        this.afterDialogue = null;
        cb();
      }
      return;
    }
    this.dialogueTimer -= dt;
    if (this.dialogueTimer <= 0) {
      const line = this.dialogueQueue[0];
      this.hud.showDialogue(line.who, line.text);
      this.dialogueTimer = 2.6;
      this.dialogueQueue.shift();
      if (!this.dialogueQueue.length) this.dialogueTimer = 2.6;
    }
  }

  currentStage() {
    if (!this.active) return null;
    return this.active.def.stages[this.active.stageIndex] || null;
  }

  nextStage(world) {
    const run = this.active;
    if (!run) return;
    run.stageIndex++;
    run.timer = 0;
    run.tailTime = 0;
    run.heatApplied = false;
    const stage = this.currentStage();
    if (!stage) {
      const def = run.def;
      this.active = null;
      this.marker.visible = false;
      this.hud.setObjective("");
      this.playDialogue(def.outro, null);
      if (this.onComplete) this.onComplete(def);
      return;
    }
    this.beginStage(stage, world);
  }

  beginStage(stage, world) {
    if (stage.type === "goto" || stage.type === "timed") {
      this.marker.position.set(stage.at[0], 0, stage.at[1]);
      this.marker.visible = true;
      if (stage.type === "timed") this.active.timer = stage.seconds;
    } else if (stage.type === "heat") {
      world.police.addHeat(stage.level);
      this.active.timer = 2.5;
    } else if (stage.type === "tail") {
      // Marco's car joins the traffic flow for the duration of the tail.
      if (!world.activities.tailTarget) world.activities.startTail(world);
    } else if (stage.type === "race") {
      this.marker.visible = false;
      world.activities.startRace(stage.race, world, (won) => {
        if (won) this.nextStage(world);
        else this.fail(world, "Marco beat you to the line. Ines is not pleased.");
      });
    } else {
      this.marker.visible = false;
    }
    if (stage.heatTo) world.police.heat = Math.max(world.police.heat, stage.heatTo);
    if (stage.crimeOnStart) world.onCrime(stage.crimeOnStart, world.player.pos);
    this.hud.setObjective(stage.label);
    world.audio.objective();
  }

  fail(world, why) {
    if (!this.active) return;
    this.active = null;
    this.marker.visible = false;
    this.hud.setObjective("");
    this.hud.banner("JOB FAILED", why, "#e86a5a");
    world.audio.hit();
    if (this.onFail) this.onFail(why);
  }

  markerPos() {
    const stage = this.currentStage();
    if (!stage) return null;
    if (stage.at) return { x: stage.at[0], z: stage.at[1] };
    if (this.marker.visible) return { x: this.marker.position.x, z: this.marker.position.z };
    return null;
  }

  update(dt, world) {
    this.updateDialogue(dt);
    if (this.marker.visible) {
      this.marker.rotation.y += dt * 1.4;
      this.marker.position.y = Math.sin(performance.now() * 0.003) * 0.25;
    }
    const run = this.active;
    const stage = this.currentStage();
    if (!run || !stage) return;
    const player = world.player;

    if (stage.type === "goto") {
      const dist = Math.hypot(player.pos.x - stage.at[0], player.pos.z - stage.at[1]);
      this.hud.setObjective(`${stage.label} — ${Math.round(dist)} m`);
      if (dist < 6.5) {
        if (stage.crimeOnDone) world.onCrime(stage.crimeOnDone, player.pos);
        this.nextStage(world);
      }
    } else if (stage.type === "timed") {
      run.timer -= dt;
      const dist = Math.hypot(player.pos.x - stage.at[0], player.pos.z - stage.at[1]);
      this.hud.setObjective(`${stage.label} — ${Math.round(dist)} m · ${Math.max(0, Math.ceil(run.timer))} s`);
      if (dist < 7) this.nextStage(world);
      else if (run.timer <= 0) this.fail(world, "Out of time. The client walked away.");
    } else if (stage.type === "heat") {
      run.timer -= dt;
      this.hud.setObjective("Sirens everywhere — brace yourself…");
      if (run.timer <= 0) this.nextStage(world);
    } else if (stage.type === "escape") {
      this.hud.setObjective(`${stage.label} — heat ${world.police.stars}★`);
      if (world.police.stars === 0 && world.police.heat <= 0.05) this.nextStage(world);
    } else if (stage.type === "tail") {
      const target = world.activities.tailTarget;
      if (!target) { this.nextStage(world); return; }
      const dist = player.pos.distanceTo(target.car.pos);
      this.hud.setObjective(`${stage.label} — ${Math.round(dist)} m · ${Math.ceil(stage.seconds - run.tailTime)} s`);
      if (dist > 60) { this.fail(world, "You lost Marco in the streets."); return; }
      if (dist < 7 && Math.abs(player.driving?.speed || 0) > 6) {
        this.fail(world, "You spooked Marco. The tail is blown.");
        return;
      }
      run.tailTime += dt;
      if (run.tailTime >= stage.seconds) {
        world.activities.stopTail();
        this.nextStage(world);
      }
    }
  }
}
