#!/usr/bin/env node
/**
 * Importe seed-data.json vers Supabase.
 * Variables d'environnement requises :
 *   SUPABASE_URL (ou VITE_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (recommandé) ou SUPABASE_ANON_KEY
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed-data.json'), 'utf8'));
const sb = createClient(url, key);

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await sb.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ✓ ${table}: ${rows.length} rows`);
}

async function main() {
  console.log('Seeding Supabase…');

  await upsert('produits', seed.produits.map(function (p) {
    return {
      id: p.id,
      label: p.label,
      short_label: p.short_label,
      a_onglet_taux: p.a_onglet_taux,
      updated_at: p.updated_at
    };
  }), 'id');

  await upsert('acteurs', seed.acteurs, 'id');
  await upsert('acteurs_produits', seed.acteurs_produits, 'acteur_id,produit_id');

  // Critères : supprimer puis réinsérer par produit
  for (const p of seed.produits) {
    await sb.from('criteres').delete().eq('produit_id', p.id);
  }

  const critereIdMap = {};
  const criteresDb = [];
  for (const c of seed.criteres) {
    criteresDb.push({
      produit_id: c.produit_id,
      section: c.section,
      critere: c.critere,
      ordre: c.ordre
    });
  }

  const { data: insertedCrit, error: critErr } = await sb
    .from('criteres')
    .insert(criteresDb)
    .select('id, produit_id, ordre');
  if (critErr) throw new Error('criteres: ' + critErr.message);

  insertedCrit.forEach(function (row) {
    critereIdMap[`${row.produit_id}__${row.ordre}`] = row.id;
  });
  console.log(`  ✓ criteres: ${insertedCrit.length} rows`);

  const valeursDb = seed.valeurs.map(function (v) {
    return {
      critere_id: critereIdMap[v.critere_ref],
      acteur_id: v.acteur_id,
      valeur: v.valeur
    };
  }).filter(function (v) { return v.critere_id; });

  await upsert('valeurs', valeursDb, 'critere_id,acteur_id');

  // Promos : replace per product
  for (const p of seed.produits) {
    await sb.from('promos').delete().eq('produit_id', p.id);
  }
  const { error: promoErr } = await sb.from('promos').insert(seed.promos);
  if (promoErr) throw new Error('promos: ' + promoErr.message);
  console.log(`  ✓ promos: ${seed.promos.length} rows`);

  await upsert('differenciateurs', seed.differenciateurs, 'produit_id,acteur_id');

  for (const p of seed.produits) {
    await sb.from('tendances').delete().eq('produit_id', p.id);
  }
  const { error: tendErr } = await sb.from('tendances').insert(seed.tendances);
  if (tendErr) throw new Error('tendances: ' + tendErr.message);
  console.log(`  ✓ tendances: ${seed.tendances.length} rows`);

  await sb.from('actualites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: actuErr } = await sb.from('actualites').insert(seed.actualites);
  if (actuErr) throw new Error('actualites: ' + actuErr.message);
  console.log(`  ✓ actualites: ${seed.actualites.length} rows`);

  await sb.from('taux_cr').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const tauxRows = seed.taux_cr.map(function (t) {
    return {
      acteur_id: t.acteur_id,
      produit_nom: t.produit_nom,
      categorie: t.categorie,
      rows: t.rows,
      commentaire: t.commentaire
    };
  });
  const { error: tauxErr } = await sb.from('taux_cr').insert(tauxRows);
  if (tauxErr) throw new Error('taux_cr: ' + tauxErr.message);
  console.log(`  ✓ taux_cr: ${tauxRows.length} rows`);

  await upsert('taux_cr_meta', [seed.taux_cr_meta], 'id');

  if (seed.produits_texte_libre && seed.produits_texte_libre.length) {
    await upsert('produits_texte_libre', seed.produits_texte_libre.map(function (row) {
      return {
        produit_id: row.produit_id,
        titre: row.titre || '',
        contenu: row.contenu || '',
        updated_at: row.updated_at || null
      };
    }), 'produit_id');
  }

  console.log('\nSeed complete.');
  console.log(JSON.stringify(seed.meta.counts, null, 2));
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
