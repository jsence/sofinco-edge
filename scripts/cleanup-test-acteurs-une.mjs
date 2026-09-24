#!/usr/bin/env node
/**
 * Supprime les acteurs test « ActeurTestUne* » si aucune dépendance.
 *   node scripts/cleanup-test-acteurs-une.mjs           # dry-run
 *   node scripts/cleanup-test-acteurs-une.mjs --apply
 */
import { createRequire } from 'module';
import { loadSupabaseConfig } from './test-helpers.mjs';
const require = createRequire(import.meta.url);
const NAMES = ['ActeurTestUne1788366515918', 'ActeurTestUne1788366996755'];

async function deps (sb, id) {
  const tables = ['actualites', 'differenciateurs', 'promos', 'acteurs_produits', 'valeurs'];
  let total = 0;
  for (const t of tables) {
    const res = await sb.from(t).select('id', { count: 'exact', head: true }).eq('acteur_id', id);
    if (res.error) throw new Error(t + ': ' + res.error.message);
    total += res.count || 0;
  }
  return total;
}

async function run () {
  const apply = process.argv.includes('--apply');
  const cfg = loadSupabaseConfig();
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(cfg.url, cfg.anonKey);
  const { data: rows, error } = await sb.from('acteurs').select('id,nom').in('nom', NAMES);
  if (error) throw new Error(error.message);
  if (!rows?.length) {
    console.log('Aucun acteur test trouvé.');
    return;
  }
  for (const a of rows) {
    const n = await deps(sb, a.id);
    console.log(a.nom, 'id=' + a.id, 'deps=' + n);
    if (n > 0) {
      console.error('Refus : dépendances restantes.');
      process.exit(1);
    }
    if (apply) {
      const del = await sb.from('acteurs').delete().eq('id', a.id);
      if (del.error) throw new Error(del.error.message);
      console.log('  → supprimé');
    } else {
      console.log('  → dry-run (ajoutez --apply)');
    }
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
