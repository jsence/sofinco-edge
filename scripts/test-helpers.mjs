/**
 * Helpers partagés pour les tests E2E — nettoyage des données de test Supabase.
 * Les tests ne doivent PAS s'exécuter sur la production (voir assertSafeTestTarget).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PRODUCTION_HOST = 'dyniwckdfmxrqbeziafe.supabase.co';

export function loadSupabaseConfig () {
  var src = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
  return {
    url: (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1],
    anonKey: (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1]
  };
}

export function loadTestSupabaseConfig () {
  var testPath = path.join(root, 'supabase-config.test.js');
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_ANON_KEY) {
    return { url: process.env.SUPABASE_TEST_URL, anonKey: process.env.SUPABASE_TEST_ANON_KEY };
  }
  if (fs.existsSync(testPath)) {
    var src = fs.readFileSync(testPath, 'utf8');
    return {
      url: (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1],
      anonKey: (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1]
    };
  }
  return null;
}

export function isProductionUrl (url) {
  return String(url || '').includes(PRODUCTION_HOST);
}

/** Bloque les scripts test-* sur la prod sauf nettoyage explicite. */
export function assertSafeTestTarget (opts) {
  opts = opts || {};
  if (opts.allowProduction) return loadSupabaseConfig();

  var testCfg = loadTestSupabaseConfig();
  if (testCfg && testCfg.url && testCfg.anonKey) return testCfg;

  var prodCfg = loadSupabaseConfig();
  if (isProductionUrl(prodCfg.url)) {
    throw new Error(
      'Refus : les tests E2E ne doivent pas s\'exécuter sur la base de production.\n' +
      '  → Créez supabase-config.test.js (voir supabase-config.test.example.js)\n' +
      '  → ou exportez SUPABASE_TEST_URL + SUPABASE_TEST_ANON_KEY\n' +
      '  → Nettoyage prod uniquement : node scripts/cleanup-test-data.mjs --apply'
    );
  }
  return prodCfg;
}

export function isTestActualite (row) {
  var titre = String(row.titre || '');
  var source = String(row.source || '');
  if (/^TEST\b/i.test(titre)) return true;
  if (/^Actu multi \d+/.test(titre)) return true;
  if (titre === 'Actu avec acteur test') return true;
  if (/^Test actu$/i.test(titre)) return true;
  if (/example\.com/i.test(source)) return true;
  if (isTestImportActualite(row)) return true;
  return false;
}

/** Actualités générées par les imports Excel de test (PB sheet minimal). */
export function isTestImportActualite (row) {
  if (row.source !== 'Détecté via import') return false;
  var titre = String(row.titre || '');
  if (/^Changement détecté : Taux —/.test(titre)) return true;
  if (/^Changement détecté : Montant min — \(vide\) →/.test(titre)) return true;
  return false;
}

export function isTestDifferenciateur (row) {
  var diff = String(row.difference || '');
  var conclusion = String(row.conclusion || '');
  if (/^TEST\b/i.test(diff) || /^TEST\b/i.test(conclusion)) return true;
  if (/Diff test multi/i.test(diff)) return true;
  if (/Diff test$/i.test(diff)) return true;
  if (/TEST REGRESSION IMPORT/i.test(diff)) return true;
  if (/TEST NAV CAT/i.test(diff)) return true;
  return false;
}

export function isTestTendance (row) {
  var titre = String(row.titre || '');
  var desc = String(row.description || '');
  if (/^TEST\b/i.test(titre)) return true;
  if (/Alias distribution test/i.test(titre)) return true;
  if (/TEST REGRESSION IMPORT/i.test(titre)) return true;
  if (/TEST NAV CAT/i.test(titre)) return true;
  if (/test decryptage/i.test(desc)) return true;
  return false;
}

/**
 * Critères créés par les imports Excel de test (feuilles PB minimales).
 * Ne touche PAS au Montant min section « Produit » (données réelles).
 */
export function isTestCritere (row) {
  var section = String(row.section || '');
  var critere = String(row.critere || '');
  if (section === 'Section test') return true;
  if (section === 'Section' && critere === 'Taux') return true;
  if ((section === 'Sans section' || section === '') && critere === 'Montant min') return true;
  return false;
}

export function isTestPromo (row) {
  return row.produit_id === 'pb' &&
    row.acteur_id === 'cofidis' &&
    String(row.taux || '').trim() === '0 %' &&
    String(row.duree || '').trim() === '12 mois' &&
    !row.montant && !row.date_fin;
}

export function isTestHistorique (row, testCritereIds) {
  if (row.source !== 'import') return false;
  return testCritereIds.has(row.critere_id);
}

async function fetchAll (sb, table) {
  var rows = [];
  var from = 0;
  var pageSize = 500;
  while (true) {
    var res = await sb.from(table).select('*').range(from, from + pageSize - 1);
    if (res.error) throw new Error(table + ': ' + res.error.message);
    if (!res.data || !res.data.length) break;
    rows = rows.concat(res.data);
    if (res.data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export async function listTestData (sb) {
  const actus = (await fetchAll(sb, 'actualites')).filter(isTestActualite);
  const diffs = (await fetchAll(sb, 'differenciateurs')).filter(isTestDifferenciateur);
  const tends = (await fetchAll(sb, 'tendances')).filter(isTestTendance);
  const criteres = (await fetchAll(sb, 'criteres')).filter(isTestCritere);
  const testCritIds = new Set(criteres.map(function (c) { return c.id; }));
  const valeurs = (await fetchAll(sb, 'valeurs')).filter(function (v) { return testCritIds.has(v.critere_id); });
  const historique = (await fetchAll(sb, 'historique')).filter(function (h) { return isTestHistorique(h, testCritIds); });
  const promos = (await fetchAll(sb, 'promos')).filter(isTestPromo);
  return { actus, diffs, tends, criteres, valeurs, historique, promos, testCritIds };
}

/** Supprime toutes les lignes de test reconnues. Retourne le décompte supprimé. */
export async function cleanupTestData (sb, opts) {
  opts = opts || {};
  const listed = await listTestData(sb);
  if (opts.dryRun) {
    return {
      deleted: {
        actus: listed.actus.length,
        diffs: listed.diffs.length,
        tends: listed.tends.length,
        criteres: listed.criteres.length,
        valeurs: listed.valeurs.length,
        historique: listed.historique.length,
        promos: listed.promos.length
      },
      rows: listed
    };
  }

  for (var i = 0; i < listed.actus.length; i++) {
    var delA = await sb.from('actualites').delete().eq('id', listed.actus[i].id);
    if (delA.error) throw new Error('delete actualites: ' + delA.error.message);
  }
  for (var j = 0; j < listed.diffs.length; j++) {
    var delD = await sb.from('differenciateurs').delete().eq('id', listed.diffs[j].id);
    if (delD.error) throw new Error('delete differenciateurs: ' + delD.error.message);
  }
  for (var k = 0; k < listed.tends.length; k++) {
    var delT = await sb.from('tendances').delete().eq('id', listed.tends[k].id);
    if (delT.error) throw new Error('delete tendances: ' + delT.error.message);
  }
  for (var p = 0; p < listed.promos.length; p++) {
    var delP = await sb.from('promos').delete().eq('id', listed.promos[p].id);
    if (delP.error) throw new Error('delete promos: ' + delP.error.message);
  }
  for (var h = 0; h < listed.historique.length; h++) {
    var delH = await sb.from('historique').delete().eq('id', listed.historique[h].id);
    if (delH.error) throw new Error('delete historique: ' + delH.error.message);
  }
  for (var v = 0; v < listed.valeurs.length; v++) {
    var delV = await sb.from('valeurs').delete().eq('id', listed.valeurs[v].id);
    if (delV.error) throw new Error('delete valeurs: ' + delV.error.message);
  }
  for (var c = 0; c < listed.criteres.length; c++) {
    var delC = await sb.from('criteres').delete().eq('id', listed.criteres[c].id);
    if (delC.error) throw new Error('delete criteres: ' + delC.error.message);
  }

  var restoredPromos = 0;
  if (opts.restorePbPromos && listed.promos.length > 0) {
    restoredPromos = await restorePbPromosFromSeed(sb);
  }

  return {
    deleted: {
      actus: listed.actus.length,
      diffs: listed.diffs.length,
      tends: listed.tends.length,
      criteres: listed.criteres.length,
      valeurs: listed.valeurs.length,
      historique: listed.historique.length,
      promos: listed.promos.length
    },
    restoredPromos: restoredPromos,
    rows: listed
  };
}

/** Réinsère les promos PB de seed-data.json si l'import de test les a écrasées. */
export async function restorePbPromosFromSeed (sb) {
  var seed = JSON.parse(fs.readFileSync(path.join(root, 'seed-data.json'), 'utf8'));
  var pbPromos = (seed.promos || []).filter(function (p) { return p.produit_id === 'pb'; });
  if (!pbPromos.length) return 0;

  var { data: existing } = await sb.from('promos').select('id').eq('produit_id', 'pb');
  if (existing && existing.length > 0) return 0;

  var rows = pbPromos.map(function (p) {
    return {
      produit_id: p.produit_id,
      acteur_id: p.acteur_id,
      taux: p.taux || null,
      duree: p.duree || null,
      montant: p.montant || null,
      date_fin: p.date_fin || null,
      canal: p.canal || null,
      lien: p.lien || null
    };
  });
  var { error } = await sb.from('promos').insert(rows);
  if (error) throw new Error('restore promos pb: ' + error.message);
  return rows.length;
}
