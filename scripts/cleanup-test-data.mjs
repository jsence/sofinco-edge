#!/usr/bin/env node
/**
 * Supprime les données de test E2E des tables Supabase.
 * Usage :
 *   node scripts/cleanup-test-data.mjs --dry-run   # liste sans supprimer
 *   node scripts/cleanup-test-data.mjs --apply     # supprime (autorisé sur prod)
 */
import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig, cleanupTestData } from './test-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!dryRun && !apply) {
  console.error('Précisez --dry-run ou --apply');
  process.exit(1);
}

async function run () {
  const cfg = loadSupabaseConfig();
  const sb = createClient(cfg.url, cfg.anonKey);
  const result = await cleanupTestData(sb, { dryRun, restorePbPromos: apply });

  console.log((dryRun ? '[DRY RUN] ' : '') + 'À supprimer :');
  console.log('  actualites:', result.deleted.actus);
  result.rows.actus.forEach(function (r) { console.log('    -', r.id, r.titre); });
  console.log('  differenciateurs:', result.deleted.diffs);
  result.rows.diffs.forEach(function (r) { console.log('    -', r.id, (r.difference || r.conclusion || '').slice(0, 60)); });
  console.log('  tendances:', result.deleted.tends);
  result.rows.tends.forEach(function (r) { console.log('    -', r.id, r.titre); });
  console.log('  criteres:', result.deleted.criteres);
  result.rows.criteres.forEach(function (r) { console.log('    -', r.id, r.produit_id, r.section, '/', r.critere); });
  console.log('  valeurs:', result.deleted.valeurs);
  result.rows.valeurs.forEach(function (r) { console.log('    -', r.id, r.acteur_id, '=>', r.valeur); });
  console.log('  historique:', result.deleted.historique);
  result.rows.historique.forEach(function (r) { console.log('    -', r.id, r.produit_id, r.acteur_id, r.ancienne_valeur, '->', r.nouvelle_valeur); });
  console.log('  promos:', result.deleted.promos);
  result.rows.promos.forEach(function (r) { console.log('    -', r.id, r.produit_id, r.acteur_id, r.taux, r.duree); });

  if (apply) {
    var total = Object.values(result.deleted).reduce(function (a, b) { return a + b; }, 0);
    if (total > 0) console.log('\nSuppression terminée (' + total + ' lignes).');
    if (result.restoredPromos > 0) {
      console.log('Promos PB restaurées depuis seed-data.json :', result.restoredPromos);
    }
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
