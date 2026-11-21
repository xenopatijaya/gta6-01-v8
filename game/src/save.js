// save.js — localStorage persistence for AURELIA BAY.
// Stores cash, respect, story progress, car upgrades and lifetime stats so the
// start screen can offer Continue. Everything lives under one versioned key.

const SAVE_KEY = "aurelia-bay-save-v1";

export const RESPECT_TITLES = [
  { at: 0, title: "Runner" },
  { at: 1200, title: "Wheelman" },
  { at: 3500, title: "Fixer's Right Hand" },
  { at: 8000, title: "Bay Legend" },
];

export function respectTitle(earned) {
  let title = RESPECT_TITLES[0].title;
  for (const row of RESPECT_TITLES) if (earned >= row.at) title = row.title;
  return title;
}

export function defaultSave() {
  return {
    cash: 250,
    earned: 0,
    missionIndex: 0, // next story mission to run, 0..6 (6 = story complete)
    storyDone: false,
    upgrades: { armor: 0, engine: 0 },
    paint: -1, // -1 = keep each car's own colour
    stats: { jobs: 0, stolen: 0, topSpeed: 0, racesWon: 0, deliveries: 0, busted: 0 },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = defaultSave();
    return {
      ...base,
      ...data,
      upgrades: { ...base.upgrades, ...(data.upgrades || {}) },
      stats: { ...base.stats, ...(data.stats || {}) },
    };
  } catch {
    return null;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function storeSave(save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or quota: the game simply runs unsaved.
  }
}

export function wipeSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to wipe.
  }
}
