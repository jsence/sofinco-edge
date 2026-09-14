#!/usr/bin/env node
/**
 * Dry-run / apply backfill categorie actualites (Type → slug).
 *   node scripts/backfill-actu-categorie.mjs              # comptes avant + simulation
 *   node scripts/backfill-actu-categorie.mjs --apply --confirm-production
 * Ne pas utiliser --apply sans validation explicite.
 */
import { createRequire } from 'module';
import { loadSupabaseConfig } from './test-helpers.mjs';

const require = createRequire(import.meta.url);

const STEPS = [
  {
    label: 'commercial_communication',
    filter: function (q) {
      return q.in('type', ['Opération commerciale', 'Communication', 'Marketing']);
    }
  },
  {
    label: 'produit_tarification',
    filter: function (q) {
      return q.in('type', ['Changement de taux', 'Taux', 'Produit', 'Evolution de produit ou service']);
    }
  },
  {
    label: 'strategie_corporate (Corporate)',
    filter: function (q) { return q.eq('type', 'Corporate'); }
  },
  {
    label: 'innovation_securite',
    filter: function (q) {
      return q.in('type', ['Digital', 'Fonctionnalité App mobile']);
    }
  },
  {
    label: 'strategie_corporate (reliquat)',
    filter: function (q) { return q; },
    slug: 'strategie_corporate'
  }
];

function emptyCatQuery (sb) {
  return sb.from('actualites').select('id', { count: 'exact', head: true })
    .or('categorie.is.null,categorie.eq.');
}

async function countStep (sb, step) {
  var q = sb.from('actualites').select('id', { count: 'exact', head: true })
    .or('categorie.is.null,categorie.eq.');
  q = step.filter(q);
  var res = await q;
  if (res.error) throw new Error(res.error.message);
  return res.count || 0;
}

async function run () {
  const cfg = loadSupabaseConfig();
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(cfg.url, cfg.anonKey);

  const before = await emptyCatQuery(sb);
  if (before.error) throw new Error(before.error.message);
  console.log('COUNT categorie vide AVANT:', before.count);

  console.log('\nComptes par étape SQL (état actuel de la base, étapes 1–4 = partition par Type):\n');
  var sum = 0;
  for (var i = 0; i < STEPS.length - 1; i++) {
    var n = await countStep(sb, STEPS[i]);
    sum += n;
    console.log('  Étape ' + (i + 1) + ' → ' + STEPS[i].label + ': ' + n + ' ligne(s)');
  }
  var reliquat = await countStep(sb, STEPS[STEPS.length - 1]);
  var typesCovered = sum;
  console.log('  Étape 5 → strategie_corporate (reliquat après 1–4): ' +
    Math.max(0, reliquat - typesCovered) + ' ligne(s) attendu(s) si 1–4 appliquées d\'abord');
  console.log('  (Somme étapes 1–4 = ' + sum + ', doit égaler COUNT avant si tous les Type sont mappés)');

  const apply = process.argv.includes('--apply');
  if (!apply) {
    console.log('\nAucune écriture (--apply absent). SQL : scripts/sql/backfill-actu-categorie.sql');
    return;
  }
  if (!process.argv.includes('--confirm-production')) {
    console.error('Refus : ajoutez --confirm-production pour exécuter les UPDATE.');
    process.exit(1);
  }

  const slugs = [
    'commercial_communication',
    'produit_tarification',
    'strategie_corporate',
    'innovation_securite',
    'strategie_corporate'
  ];

  for (var j = 0; j < STEPS.length; j++) {
    var slug = slugs[j];
    var idsRes = await (function () {
      var q = sb.from('actualites').select('id').or('categorie.is.null,categorie.eq.');
      q = STEPS[j].filter(q);
      return q;
    })();
    if (idsRes.error) throw new Error(idsRes.error.message);
    var ids = (idsRes.data || []).map(function (r) { return r.id; });
    if (!ids.length) {
      console.log('Étape ' + (j + 1) + ': 0 ligne');
      continue;
    }
    var upd = await sb.from('actualites').update({ categorie: slug }).in('id', ids).select('id');
    if (upd.error) {
      console.error('Échec étape ' + (j + 1) + ':', upd.error.message);
      process.exit(1);
    }
    console.log('Étape ' + (j + 1) + ': ' + (upd.data || []).length + ' ligne(s) → ' + slug);
  }

  const after = await emptyCatQuery(sb);
  if (after.error) throw new Error(after.error.message);
  console.log('\nCOUNT categorie vide APRÈS:', after.count);
}

run().catch(function (e) { console.error(e); process.exit(1); });
