#!/usr/bin/env node
/**
 * Supprime les données de test E2E des tables actualites, differenciateurs, tendances.
 * Usage : node scripts/cleanup-test-data.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig, cleanupTestData } from './test-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');

async function run () {
  const cfg = loadSupabaseConfig();
  const sb = createClient(cfg.url, cfg.anonKey);
  const result = await cleanupTestData(sb, { dryRun });

  console.log((dryRun ? '[DRY RUN] ' : '') + 'À supprimer :');
  console.log('  actualites:', result.deleted.actus);
  result.rows.actus.forEach(function (r) { console.log('    -', r.id, r.titre); });
  console.log('  differenciateurs:', result.deleted.diffs);
  result.rows.diffs.forEach(function (r) { console.log('    -', r.id, (r.difference || r.conclusion || '').slice(0, 60)); });
  console.log('  tendances:', result.deleted.tends);
  result.rows.tends.forEach(function (r) { console.log('    -', r.id, r.titre); });

  if (!dryRun && (result.deleted.actus + result.deleted.diffs + result.deleted.tends) > 0) {
    console.log('\nSuppression terminée.');
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
