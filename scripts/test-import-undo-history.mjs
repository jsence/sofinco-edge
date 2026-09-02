#!/usr/bin/env node
/**
 * Test historique annulation import (5 niveaux FIFO) — nécessite supabase-config.test.js
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { assertSafeTestTarget, cleanupTestData } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MARKER = 'TEST UNDO HIST ';

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

async function insertMarkerActu (sb, label) {
  var res = await sb.from('actualites').insert({
    date: '2026-09-02',
    acteur_id: 'cofidis',
    type: 'Corporate',
    titre: label,
    source: 'https://example.com/undo-hist-test'
  }).select('id, titre').single();
  if (res.error) throw new Error('insert actu: ' + res.error.message);
  return res.data;
}

async function listMarkerActus (sb) {
  var res = await sb.from('actualites').select('id, titre').ilike('titre', MARKER + '%');
  if (res.error) throw new Error(res.error.message);
  return res.data || [];
}

async function cleanupUndoTestSnapshots (sb) {
  var res = await sb.from('import_undo_snapshot').select('id, payload');
  if (res.error || !res.data) return;
  var ids = res.data.filter(function (row) {
    var actus = (row.payload && row.payload.actualites) || [];
    return actus.some(function (a) { return String(a.titre || '').indexOf(MARKER) === 0; });
  }).map(function (r) { return r.id; });
  for (var i = 0; i < ids.length; i++) {
    await sb.from('import_undo_snapshot').delete().eq('id', ids[i]);
  }
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
    console.log('SKIP: migration import_undo_snapshot non appliquée');
    process.exit(0);
  }

  var puppeteer = require('puppeteer');
  var { server, port } = await startServer();
  var browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  var page = await browser.newPage();
  var checks = [];
  var snapshotIds = [];
  var scope = {
    snapshotAllActualites: true,
    productIds: [],
    promoProductIds: [],
    diffProductIds: [],
    diffCategories: []
  };

  try {
    await cleanupUndoTestSnapshots(sb);
    var existing = await listMarkerActus(sb);
    for (var ei = 0; ei < existing.length; ei++) {
      await sb.from('actualites').delete().eq('id', existing[ei].id);
    }

    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.SofincoImportUndo !== 'undefined' && window.sbClient;
    }, { timeout: 120000 });

    for (var i = 0; i < 6; i++) {
      var captured = await page.evaluate(async function (scope) {
        return await window.SofincoImportUndo.captureImportUndoPayload(window.sbClient, scope);
      }, scope);
      var saved = await page.evaluate(async function (scope, payload, importDate) {
        return await window.SofincoImportUndo.saveImportUndoSnapshot(window.sbClient, scope, payload, importDate);
      }, scope, captured, '2026-09-02');
      snapshotIds.push(saved.id);
      await insertMarkerActu(sb, MARKER + i);
      await new Promise(function (r) { setTimeout(r, 50); });
    }

    var status = await page.evaluate(async function () {
      return await window.SofincoImportUndo.getImportUndoStatus(window.sbClient);
    });
    checks.push(['FIFO: max 5 snapshots', status.items && status.items.length === 5]);
    checks.push(['FIFO: plus ancien purgé', status.items && !status.items.some(function (it) { return it.id === snapshotIds[0]; })]);

    var restoreId = snapshotIds[3];
    await page.evaluate(async function (id) {
      await window.SofincoImportUndo.restoreImportUndoSnapshot(window.sbClient, id);
    }, restoreId);

    var actus = await listMarkerActus(sb);
    var titles = actus.map(function (a) { return a.titre; });
    checks.push(['restore 4e import: M0-M2 présents', ['0', '1', '2'].every(function (n) {
      return titles.indexOf(MARKER + n) >= 0;
    })]);
    checks.push(['restore 4e import: M3-M5 absents', ['3', '4', '5'].every(function (n) {
      return titles.indexOf(MARKER + n) < 0;
    })]);

    var statusAfter = await page.evaluate(async function () {
      return await window.SofincoImportUndo.getImportUndoStatus(window.sbClient);
    });
    checks.push(['après restore: 2 snapshots restants', statusAfter.items && statusAfter.items.length === 2]);

    checks.push(['MAX_UNDO_SNAPSHOTS = 5', await page.evaluate(function () {
      return window.SofincoImportUndo.MAX_UNDO_SNAPSHOTS === 5;
    })]);
  } finally {
    var leftover = await listMarkerActus(sb);
    for (var j = 0; j < leftover.length; j++) {
      await sb.from('actualites').delete().eq('id', leftover[j].id);
    }
    await cleanupUndoTestSnapshots(sb);
    await cleanupTestData(sb);
    await browser.close();
    server.close();
  }

  console.log('Import undo history test:\n');
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
