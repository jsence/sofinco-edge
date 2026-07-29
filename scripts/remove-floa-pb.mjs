#!/usr/bin/env node
/**
 * Retire la liaison FLOA ↔ produit PB dans acteurs_produits.
 * Variables : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY)
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

const sb = createClient(url, key);

async function main () {
  const { error, count } = await sb
    .from('acteurs_produits')
    .delete({ count: 'exact' })
    .eq('acteur_id', 'floa')
    .eq('produit_id', 'pb');
  if (error) throw new Error(error.message);
  console.log('Liaison FLOA ↔ PB supprimée (' + (count || 0) + ' ligne(s)).');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
