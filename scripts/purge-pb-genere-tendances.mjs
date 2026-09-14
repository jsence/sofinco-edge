#!/usr/bin/env node
/**
 * Suppression ciblée des 3 tendances seed PB (status=genere).
 * Usage: node scripts/purge-pb-genere-tendances.mjs --execute
 * Sans --execute : lecture seule (SELECT avant uniquement).
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadSupabaseConfig } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const TITLES = [
  'Mouvement sur les taux promo',
  'Accélération du 100 % digital',
  'Guerre des durées maximales'
];

async function selectGenere (sb) {
  const res = await sb.from('tendances')
    .select('id, produit_id, categorie, titre, status, portee, created_at')
    .eq('status', 'genere')
    .order('produit_id')
    .order('categorie')
    .order('titre');
  if (res.error) throw new Error(res.error.message);
  return res.data || [];
}

async function run () {
  const execute = process.argv.includes('--execute');
  const cfg = loadSupabaseConfig();
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(cfg.url, cfg.anonKey);

  const before = await selectGenere(sb);
  console.log('=== SELECT tendances status=genere (AVANT) ===');
  console.log(JSON.stringify(before, null, 2));

  if (!execute) {
    console.log('\nMode lecture seule. Ajoutez --execute pour lancer le DELETE.');
    return;
  }

  const del = await sb.from('tendances')
    .delete()
    .eq('status', 'genere')
    .eq('produit_id', 'pb')
    .in('titre', TITLES)
    .select('id, titre');
  if (del.error) throw new Error('DELETE: ' + del.error.message);
  console.log('\n=== DELETE — lignes supprimées ===');
  console.log(JSON.stringify(del.data || [], null, 2));

  const after = await selectGenere(sb);
  console.log('\n=== SELECT tendances status=genere (APRÈS) ===');
  console.log(JSON.stringify(after, null, 2));
}

run().catch(function (e) {
  console.error(e);
  process.exit(1);
});
