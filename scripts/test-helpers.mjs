/**
 * Helpers partagés pour les tests E2E — nettoyage des données de test Supabase.
 * Les tests écrivent sur la base configurée dans supabase-config.js : toujours nettoyer en finally.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function loadSupabaseConfig () {
  var src = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
  return {
    url: (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1],
    anonKey: (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1]
  };
}

export function isTestActualite (row) {
  var titre = String(row.titre || '');
  var source = String(row.source || '');
  if (/^TEST\b/i.test(titre)) return true;
  if (/^Actu multi \d+/.test(titre)) return true;
  if (titre === 'Actu avec acteur test') return true;
  if (/example\.com/i.test(source)) return true;
  return false;
}

export function isTestDifferenciateur (row) {
  var diff = String(row.difference || '');
  var conclusion = String(row.conclusion || '');
  if (/^TEST\b/i.test(diff) || /^TEST\b/i.test(conclusion)) return true;
  if (/Diff test multi/i.test(diff)) return true;
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
  return { actus, diffs, tends };
}

/** Supprime toutes les lignes de test reconnues. Retourne le décompte supprimé. */
export async function cleanupTestData (sb, opts) {
  opts = opts || {};
  const listed = await listTestData(sb);
  if (opts.dryRun) return { deleted: { actus: listed.actus.length, diffs: listed.diffs.length, tends: listed.tends.length }, rows: listed };

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

  return {
    deleted: {
      actus: listed.actus.length,
      diffs: listed.diffs.length,
      tends: listed.tends.length
    },
    rows: listed
  };
}
