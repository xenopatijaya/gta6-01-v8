// AURELIA BAY — hand-in program for the make.fun gta6-01 bounty.
// Copies the playable game and its screenshots into the output directory and
// writes the deterministic dossier the scorer expects. Node 22, stdlib only.
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Create the output directory if needed. The directory itself is never
// removed: the grader owns it and deleting it fails with EACCES.
mkdirSync(outDir, { recursive: true });

// Copy every child of game/ and screenshots/ over, overwriting stale files
// from an earlier run so a re-run converges to the same tree.
let copiedFiles = 0;
for (const folder of ["game", "screenshots"]) {
  const srcDir = join(repoRoot, folder);
  const dstDir = join(outDir, folder);
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    cpSync(join(srcDir, entry), join(dstDir, entry), { recursive: true, force: true });
    copiedFiles++;
  }
}

// The dossier is built from the output tree so it describes exactly what was
// handed in. buildDossier is deterministic: two runs give identical bytes.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`AURELIA BAY handed in to ${outDir}: ${copiedFiles} top-level entries copied, dossier ${dossier.length} bytes`);
