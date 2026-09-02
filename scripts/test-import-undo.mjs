#!/usr/bin/env node
/**
 * Test annulation dernier import Excel — nécessite supabase-config.test.js + migration import_undo_snapshot.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { assertSafeTestTarget } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function startServer () {
  return new Promise(function (resolve) {
    const server = http.createServer(function (req, res) {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      const filePath = path.join(root, rel);
      if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ext = path.extname(filePath);
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server, port: server.address().port });
    });
  });
}

async function insertTestActu (sb, titre) {
  var res = await sb.from('actualites').insert({
    date: '2026-09-02',
    acteur_id: 'cofidis',
    type: 'Corporate',
    titre: titre,
    source: 'https://example.com/undo-test'
  }).select('id, titre').single();
  if (res.error) throw new Error('insert actu: ' + res.error.message);
  return res.data;
}

async function countMarkerActus (sb, prefix) {
  var res = await sb.from('actualites').select('id, titre').ilike('titre', prefix + '%');
  if (res.error) throw new Error(res.error.message);
  return res.data || [];
}

async function run () {
  var cfg;
  try {
    cfg = assertSafeTestTarget();
  } catch (e) {
    console.log('SKIP: ' + e.message.split('\n')[0]);
    process.exit(0);
  }

  var sb = createClient(cfg.url, cfg.anonKey);
  var probe = await sb.from('import_undo_snapshot').select('id').limit(1);
  if (probe.error) {
    console.log('SKIP: migration import_undo_snapshot non appliquée (' + probe.error.message + ')');
    process.exit(0);
  }

  var puppeteer = require('puppeteer');
  var { server, port } = await startServer();
  var browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  var page = await browser.newPage();
  var checks = [];
  var markerPrefix = 'TEST UNDO IMPORT ';
  var markerA = markerPrefix + 'A ' + Date.now();
  var markerB = markerPrefix + 'B ' + Date.now();

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.SofincoImportUndo !== 'undefined' && window.sbClient;
    }, { timeout: 120000 });

    var rowA = await insertTestActu(sb, markerA);

    var scope = { snapshotAllActualites: true, productIds: [], promoProductIds: [], diffProductIds: [], diffCategories: [] };
    var captured = await page.evaluate(async function (scope) {
      return await window.SofincoImportUndo.captureImportUndoPayload(window.sbClient, scope);
    }, scope);

    checks.push(['capture contient actu A', (captured.actualites || []).some(function (a) { return a.titre === markerA; })]);

    await insertTestActu(sb, markerB);
    var afterImport = await countMarkerActus(sb, markerPrefix);
    checks.push(['après import simulé: A et B', afterImport.length >= 2]);

    await page.evaluate(async function (scope, payload, importDate) {
      await window.SofincoImportUndo.saveImportUndoSnapshot(window.sbClient, scope, payload, importDate);
    }, scope, captured, '2026-09-02');

    var statusBefore = await page.evaluate(async function () {
      return await window.SofincoImportUndo.getImportUndoStatus(window.sbClient);
    });
    checks.push(['undo disponible avant annulation', statusBefore.available === true]);

    await page.evaluate(async function () {
      await window.SofincoImportUndo.restoreImportUndoSnapshot(window.sbClient);
    });

    var afterUndo = await countMarkerActus(sb, markerPrefix);
    checks.push(['après annulation: B absent', !afterUndo.some(function (a) { return a.titre === markerB; })]);
    checks.push(['après annulation: A présent', afterUndo.some(function (a) { return a.titre === markerA; })]);

    var statusAfter = await page.evaluate(async function () {
      return await window.SofincoImportUndo.getImportUndoStatus(window.sbClient);
    });
    checks.push(['undo indisponible après annulation', statusAfter.available === false]);

    checks.push(['buildImportUndoScope ACTUALITES', await page.evaluate(function () {
      var scope = window.SofincoImportUndo.buildImportUndoScope(
        { SheetNames: ['ACTUALITES'] },
        { promos: {}, differenciateurs: {} },
        { importedProductIds: [], diffsByCategorie: {}, hasTauxImport: false }
      );
      return scope.snapshotAllActualites === true;
    })]);

    await sb.from('actualites').delete().eq('id', rowA.id);
    await sb.from('import_undo_snapshot').update({ available: false }).eq('id', 'last');
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Import undo test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
