#!/usr/bin/env node
/** Valide la cohérence interne de seed-data.json */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed-data.json'), 'utf8'));

const checks = [
  ['acteurs', seed.acteurs.length, seed.meta.counts.acteurs],
  ['produits', seed.produits.length, seed.meta.counts.produits],
  ['criteres', seed.criteres.length, seed.meta.counts.criteres],
  ['valeurs', seed.valeurs.length, seed.meta.counts.valeurs],
  ['promos', seed.promos.length, seed.meta.counts.promos],
  ['differenciateurs', seed.differenciateurs.length, seed.meta.counts.differenciateurs],
  ['tendances', seed.tendances.length, seed.meta.counts.tendances],
  ['actualites', seed.actualites.length, seed.meta.counts.actualites],
  ['taux_cr', seed.taux_cr.length, seed.meta.counts.taux_cr]
];

let ok = true;
console.log('Verification seed-data.json:\n');
checks.forEach(function ([label, actual, expected]) {
  const pass = actual === expected;
  if (!pass) ok = false;
  console.log(`${pass ? '✓' : '✗'} ${label}: ${actual} (meta: ${expected})`);
});

// Volumes de référence attendus dans seed-data.json
const REF = {
  produits: 9, criteres: 132, valeurs: 921, promos: 5,
  differenciateurs: 8, tendances: 3, actualites: 4, taux_cr: 18, acteurs: 24
};
console.log('\nVolumes de référence (seed-data.json) :');
Object.entries(REF).forEach(function ([k, v]) {
  const actual = k === 'produits' ? seed.produits.length : seed.meta.counts[k];
  console.log(`  ${k}: ${actual} (attendu ${v}) ${actual === v ? '✓' : '✗'}`);
  if (actual !== v) ok = false;
});

if (!ok) process.exit(1);
console.log('\nseed-data.json OK — prêt pour npm run seed:supabase');
