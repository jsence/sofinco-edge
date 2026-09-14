#!/usr/bin/env node
/**
 * Inventaire local des contenus status=genere ("Généré par SofincoEdge").
 * Source : seed-data.json (+ option Supabase TEST via supabase-config.test.js).
 * Ne contacte pas la production (refus si host prod connu).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PROD_HOST_FRAGMENT = 'dyniwckdfmxrqbeziafe.supabase.co';

const PRODUCT_LABELS = {
  pb: 'Prêt Personnel — onglet Différenciateurs, section Décryptage',
  cr: 'Crédit Renouvelable — onglet Différenciateurs, section Décryptage',
  nxcb: 'Paiement Fractionné — onglet Différenciateurs, section Décryptage',
  rac: 'Rachat de Crédit — onglet Différenciateurs, section Décryptage',
  carte: 'Carte — onglet Différenciateurs, section Décryptage'
};

const CATEGORY_LABELS = {
  produit_tarification: 'Catégorie Produit & Tarification — onglet Décryptage',
  commercial_communication: 'Catégorie Commercial & Communication — onglet Décryptage',
  strategie_corporate: 'Catégorie Stratégie & Corporate — onglet Décryptage',
  rse_juridique: 'Catégorie RSE & Juridique — onglet Décryptage',
  innovation_securite: 'Catégorie Innovation & Sécurité — onglet Décryptage'
};

function displayPage (row) {
  if (row.categorie) return CATEGORY_LABELS[row.categorie] || ('Catégorie ' + row.categorie + ' — onglet Décryptage');
  if (row.produit_id) return PRODUCT_LABELS[row.produit_id] || ('Produit ' + row.produit_id + ' — section Décryptage');
  return 'Affichage inconnu';
}

function auditSeed () {
  const seedPath = path.join(root, 'seed-data.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const tendances = (seed.tendances || []).filter(function (t) { return t.status === 'genere'; });
  const diffs = (seed.differenciateurs || []).filter(function (d) { return d.status === 'genere'; });
  return {
    source: 'seed-data.json',
    injectedBy: 'scripts/seed-supabase.mjs (npm run seed:supabase) — remplace tendances par produit avant insert',
    tendances: tendances.map(function (t, i) {
      return {
        index: i + 1,
        table: 'tendances',
        titre: t.titre,
        produit_id: t.produit_id || null,
        categorie: t.categorie || null,
        portee: t.portee || 'produit',
        status: t.status,
        displayPage: displayPage(t),
        acteurs_concernes: t.acteurs_concernes || []
      };
    }),
    differenciateurs: diffs.map(function (d, i) {
      return {
        index: i + 1,
        table: 'differenciateurs',
        acteur_id: d.acteur_id,
        produit_id: d.produit_id,
        status: d.status,
        displayPage: PRODUCT_LABELS[d.produit_id] ? PRODUCT_LABELS[d.produit_id].replace('Décryptage', 'Différenciateurs (carte acteur)') : displayPage(d)
      };
    })
  };
}

async function auditSupabaseTest () {
  var cfgPath = path.join(root, 'supabase-config.test.js');
  if (!fs.existsSync(cfgPath)) return { skipped: true, reason: 'supabase-config.test.js absent' };
  var cfg = require(cfgPath);
  var url = String(cfg.url || '');
  if (url.indexOf(PROD_HOST_FRAGMENT) >= 0) {
    throw new Error('Refus : configuration Supabase de production détectée.');
  }
  var { createClient } = require('@supabase/supabase-js');
  var sb = createClient(cfg.url, cfg.anonKey);
  var tends = await sb.from('tendances').select('id,titre,produit_id,categorie,status,portee,created_at').eq('status', 'genere');
  if (tends.error) throw new Error(tends.error.message);
  var diffs = await sb.from('differenciateurs').select('id,produit_id,acteur_id,status').eq('status', 'genere');
  if (diffs.error) throw new Error(diffs.error.message);
  return {
    source: 'Supabase TEST (' + url + ')',
    tendances: (tends.data || []).map(function (t) {
      return {
        id: t.id,
        table: 'tendances',
        titre: t.titre,
        produit_id: t.produit_id,
        categorie: t.categorie,
        portee: t.portee,
        status: t.status,
        created_at: t.created_at,
        displayPage: displayPage(t)
      };
    }),
    differenciateurs: (diffs.data || []).map(function (d) {
      return {
        id: d.id,
        table: 'differenciateurs',
        produit_id: d.produit_id,
        acteur_id: d.acteur_id,
        status: d.status,
        displayPage: PRODUCT_LABELS[d.produit_id] ? PRODUCT_LABELS[d.produit_id].replace('Décryptage', 'Différenciateurs') : 'Produit ' + d.produit_id
      };
    })
  };
}

function printReport (seedAudit, dbAudit) {
  console.log('=== Audit contenus « Généré par SofincoEdge » (status=genere) ===\n');
  console.log('Tag UI : index.html → renderDiffStatusBadge(status===\'genere\') sur cartes tendances (Décryptage) et différenciateurs.\n');
  console.log('--- Référentiel repo (seed) ---');
  console.log('Origine :', seedAudit.injectedBy);
  console.log('Tendances genere dans seed :', seedAudit.tendances.length);
  seedAudit.tendances.forEach(function (t) {
    console.log('  •', t.titre);
    console.log('    Page :', t.displayPage);
    console.log('    produit_id:', t.produit_id, '| portee:', t.portee, '| acteurs:', (t.acteurs_concernes || []).join(', '));
  });
  console.log('Différenciateurs genere dans seed :', seedAudit.differenciateurs.length);
  if (dbAudit && !dbAudit.skipped) {
    console.log('\n--- Supabase TEST (si configuré) ---');
    console.log('Tendances genere :', dbAudit.tendances.length);
    dbAudit.tendances.forEach(function (t) {
      console.log('  •', t.titre, '| id:', t.id, '|', t.displayPage);
    });
    console.log('Différenciateurs genere :', dbAudit.differenciateurs.length);
  } else if (dbAudit && dbAudit.skipped) {
    console.log('\n(Supabase TEST non audité :', dbAudit.reason + ')');
  }
  console.log('\n--- Aucune suppression effectuée par ce script ---');
  console.log('\nSQL lecture seule (production — à exécuter manuellement après validation équipe) :\n');
  console.log(`SELECT id, produit_id, categorie, titre, status, portee, created_at
FROM tendances
WHERE status = 'genere'
ORDER BY produit_id, categorie, titre;

SELECT id, produit_id, acteur_id, status
FROM differenciateurs
WHERE status = 'genere'
ORDER BY produit_id, acteur_id;`);
  console.log('\nSQL suppression (UNIQUEMENT après validation explicite) :\n');
  console.log(`-- Tendances seed PB (titres connus)
DELETE FROM tendances
WHERE status = 'genere'
  AND produit_id = 'pb'
  AND titre IN (
    'Mouvement sur les taux promo',
    'Accélération du 100 % digital',
    'Guerre des durées maximales'
  );

-- Ou toutes les tendances genere :
-- DELETE FROM tendances WHERE status = 'genere';`);
}

async function run () {
  const seedAudit = auditSeed();
  let dbAudit = { skipped: true, reason: 'non demandé' };
  if (process.argv.includes('--supabase-test')) {
    dbAudit = await auditSupabaseTest();
  }
  printReport(seedAudit, dbAudit);
}

run().catch(function (e) {
  console.error(e);
  process.exit(1);
});
