#!/usr/bin/env node
/**
 * Supprime les doublons exacts dans actualites (même titre, date, acteur, catégorie, source, résumé).
 * Usage : node scripts/dedupe-actualites.mjs --dry-run | --apply
 */
import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig } from './test-helpers.mjs';

const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');

if (!dryRun && !apply) {
  console.error('Précisez --dry-run ou --apply');
  process.exit(1);
}

function rowKey (r) {
  return [
    r.titre || '',
    r.date || '',
    r.acteur_id || '',
    r.categorie || '',
    r.produit_id || '',
    r.source || '',
    (r.resume || '').trim()
  ].join('|');
}

async function fetchAll (sb) {
  const rows = [];
  let from = 0;
  while (true) {
    const res = await sb.from('actualites').select('id,titre,date,acteur_id,categorie,produit_id,source,resume').range(from, from + 499);
    if (res.error) throw new Error(res.error.message);
    if (!res.data?.length) break;
    rows.push(...res.data);
    if (res.data.length < 500) break;
    from += 500;
  }
  return rows;
}

async function run () {
  const cfg = loadSupabaseConfig();
  const sb = createClient(cfg.url, cfg.anonKey);
  const rows = await fetchAll(sb);
  const groups = new Map();
  for (const r of rows) {
    const k = rowKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const toDelete = [];
  const report = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort(function (a, b) { return a.id.localeCompare(b.id); });
    const keep = list[0];
    const dupes = list.slice(1);
    report.push({ keep: keep.id, titre: keep.titre, delete: dupes.map(function (d) { return d.id; }) });
    toDelete.push(...dupes);
  }

  console.log((dryRun ? '[DRY RUN] ' : '') + 'Groupes de doublons:', report.length);
  report.forEach(function (g) {
    console.log('\n•', (g.titre || '').slice(0, 90));
    console.log('  conserver:', g.keep);
    g.delete.forEach(function (id) { console.log('  supprimer:', id); });
  });
  console.log('\nTotal à supprimer:', toDelete.length);

  if (apply) {
    for (const row of toDelete) {
      const del = await sb.from('actualites').delete().eq('id', row.id);
      if (del.error) throw new Error('delete ' + row.id + ': ' + del.error.message);
    }
    console.log('Suppression terminée.');
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
