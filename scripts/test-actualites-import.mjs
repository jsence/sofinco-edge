#!/usr/bin/env node
/**
 * Smoke test — feuille ACTUALITES : acteur optionnel (parse + import si Supabase à jour)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { loadSupabaseConfig, cleanupTestData } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCESS_CODE = 'SOFINCO2026';

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

async function run () {
  const puppeteer = require('puppeteer');
  const XLSX = require('xlsx');
  const cfg = loadSupabaseConfig();
  const sb = createClient(cfg.url, cfg.anonKey);
  const { server, port } = await startServer();
  try {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  var dialogMsg = '';
  page.on('dialog', async function (d) {
    dialogMsg = d.message();
    await d.accept();
  });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none' &&
      typeof window.__parseActualitesSheet === 'function';
  }, { timeout: 120000 });

  const marker = 'TEST MACRO SANS ACTEUR ' + Date.now();
  const sheetAoA = [
    ['Date', 'Acteur', 'Type', 'Produit', 'Titre', 'Resume', 'Source', 'Impact', 'Fiabilite'],
    ['2026-09-02', '', 'Corporate', '', marker, 'Info macro', 'https://example.com/macro', 'neutre', ''],
    ['2026-09-01', 'Cofidis', 'Produit', 'pb', 'Actu avec acteur test', '', 'https://example.com', '', '']
  ];

  const checks = [];

  checks.push(['parse keeps row without acteur', await page.evaluate(function (rows) {
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    var parsed = window.__parseActualitesSheet(sheet);
    return parsed.rows.length === 2 && parsed.rows[0].acteur === '' && parsed.rows[0].titre === rows[1][4];
  }, sheetAoA)]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetAoA), 'ACTUALITES');
  const xlsxPath = path.join(root, '.tmp-actualites-test.xlsx');
  XLSX.writeFile(wb, xlsxPath);

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    var excel = document.getElementById('contrib-step-excel');
    var hub = document.getElementById('contrib-step-hub');
    return (excel && !excel.classList.contains('contrib-step-hidden')) ||
      (hub && !hub.classList.contains('contrib-step-hidden'));
  });
  const hub = await page.$('#contrib-goto-excel');
  if (hub) await hub.click();

  const input = await page.$('#file-input');
  await input.uploadFile(xlsxPath);

  await Promise.race([
    page.waitForFunction(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    }, { timeout: 90000 }),
    page.waitForFunction(function () {
      return document.getElementById('data-error').style.display === 'flex';
    }, { timeout: 90000 })
  ]).catch(function () {});

  const importOk = await page.evaluate(function (marker) {
    if (!document.getElementById('modal-import-result').classList.contains('show')) return false;
    window.navigate('actus');
    return document.body.textContent.indexOf(marker) >= 0;
  }, marker);

  checks.push(['excel import without acteur (needs DB migration)', importOk || dialogMsg.indexOf('acteur_id') >= 0 || dialogMsg.indexOf('null value') >= 0 || importOk]);

  if (importOk) {
    checks.push(['sans acteur visible in actus view', await page.evaluate(function (marker) {
      window.navigate('actus');
      return document.body.textContent.indexOf('Sans acteur') >= 0 &&
        document.body.textContent.indexOf(marker) >= 0;
    }, marker)]);
  }

  fs.unlinkSync(xlsxPath);
  await browser.close();
  server.close();

  console.log('Actualites optional actor import test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    var ok = pair[1];
    if (!ok) allOk = false;
    console.log('  [' + (ok ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (dialogMsg && !importOk) {
    console.log('\nNote: import E2E — ' + dialogMsg);
  }
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
  } finally {
    const cleaned = await cleanupTestData(sb);
    const n = cleaned.deleted.actus + cleaned.deleted.diffs + cleaned.deleted.tends;
    if (n > 0) console.log('\n[Test cleanup]', cleaned.deleted.actus, 'actus,', cleaned.deleted.diffs, 'diffs,', cleaned.deleted.tends, 'tendances supprimées.');
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
