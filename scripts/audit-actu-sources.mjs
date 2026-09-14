#!/usr/bin/env node
/**
 * Inventaire des sources actualités (seed + option Supabase lecture seule).
 * Usage: node scripts/audit-actu-sources.mjs [--supabase]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadSupabaseConfig } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function isSemaphore (s) {
  return /alerte\s+s[eé]maphore/i.test(String(s || '').trim());
}

function looksBare (s) {
  s = String(s || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return false;
  if (/\s/.test(s)) return false;
  return /^[\w.-]+\.[a-z]{2,}([\/?#][^\s]*)?$/i.test(s) || /^www\.[\w.-]+/i.test(s);
}

function classify (source) {
  var s = String(source || '').trim();
  if (!s) return 'empty';
  if (isSemaphore(s)) return 'semaphore';
  if (/^https?:\/\//i.test(s)) return 'url_ok';
  if (looksBare(s)) return 'url_missing_protocol';
  return 'plain_text';
}

function auditList (rows, label) {
  const counts = { empty: 0, url_ok: 0, url_missing_protocol: 0, semaphore: 0, plain_text: 0 };
  const samples = { url_missing_protocol: [], semaphore: [], plain_text: [] };
  rows.forEach(function (row) {
    const kind = classify(row.source);
    counts[kind] = (counts[kind] || 0) + 1;
    if (samples[kind] && samples[kind].length < 8) {
      samples[kind].push({ id: row.id || null, titre: row.titre || '', source: row.source });
    }
  });
  console.log('\n=== ' + label + ' (' + rows.length + ' actualités) ===');
  console.log(JSON.stringify(counts, null, 2));
  ['semaphore', 'url_missing_protocol', 'plain_text'].forEach(function (k) {
    if (samples[k].length) {
      console.log('\nExemples ' + k + ':');
      samples[k].forEach(function (ex) { console.log('  -', ex.source); });
    }
  });
  return counts;
}

async function run () {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'seed-data.json'), 'utf8'));
  auditList(seed.actualites || [], 'seed-data.json');

  if (process.argv.includes('--supabase')) {
    const cfg = loadSupabaseConfig();
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(cfg.url, cfg.anonKey);
    const res = await sb.from('actualites').select('id,titre,source');
    if (res.error) throw new Error(res.error.message);
    auditList(res.data || [], 'Supabase (' + cfg.url + ')');
  } else {
    console.log('\n(Ajoutez --supabase pour inventorier la base liée à supabase-config.js)');
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
