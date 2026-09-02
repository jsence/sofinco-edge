#!/usr/bin/env node
/**
 * Smoke test — feuille DECRYPTAGE : parse + import E2E + régression multi-feuilles
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
  const cfg = assertSafeTestTarget();
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
      typeof window.__parseDecryptageSheet === 'function';
  }, { timeout: 120000 });

  const marker = 'TEST DECRYPTAGE IMPORT ' + Date.now();
  const decryptageAoA = [
    ['produit_id', 'titre', 'description', 'acteurs_concernes', 'portee'],
    ['pb', marker, 'Description test decryptage', 'Cofidis, Cetelem', 'produit'],
    ['', 'ligne sans produit', '', '', ''],
    ['pb', '', 'sans titre', '', '']
  ];

  const checks = [];

  checks.push(['parse valid decryptage row', await page.evaluate(function (rows, marker) {
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    var parsed = window.__parseDecryptageSheet(sheet);
    return parsed.rows.length === 1 &&
      parsed.rows[0].produit_id === 'pb' &&
      parsed.rows[0].titre === marker &&
      parsed.rows[0].acteurs_concernes.length === 2 &&
      parsed.rows[0].portee === 'produit';
  }, decryptageAoA, marker)]);

  checks.push(['parse modele_distribution alias', await page.evaluate(function () {
    var rows = [
      ['produit_id', 'titre'],
      ['modele_distribution', 'Alias distribution test']
    ];
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    var parsed = window.__parseDecryptageSheet(sheet);
    return parsed.rows.length === 1 && parsed.rows[0].produit_id === 'distribution';
  })]);

  const pbSheet = [
    ['Critère', 'Cofidis', 'Cetelem'],
    ['Section test'],
    ['Taux', '3,5 %', '3,9 %']
  ];
  const promosSheet = [
    ['Acteur', 'Produit', 'Taux', 'Durée'],
    ['Cofidis', 'pb', '0 %', '12 mois']
  ];
  const diffSheet = [
    ['Acteur', 'Produit', 'Difference', 'Conclusion'],
    ['Cofidis', 'pb', 'Diff test multi', 'Conclusion test']
  ];
  const actuSheet = [
    ['Titre', 'Acteur', 'Type', 'Source'],
    ['Actu multi ' + Date.now(), 'Cofidis', 'Produit', 'https://example.com']
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pbSheet), 'PB');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(promosSheet), 'PROMOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(diffSheet), 'DIFFERENCIATEURS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actuSheet), 'ACTUALITES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(decryptageAoA), 'DECRYPTAGE');
  const xlsxPath = path.join(root, '.tmp-decryptage-test.xlsx');
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

  const importModalOk = await page.evaluate(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  });

  checks.push(['excel import modal success', importModalOk]);

  if (importModalOk) {
    checks.push(['decryptage visible on pb differenciateurs tab', await page.evaluate(async function (marker) {
      document.getElementById('modal-import-result').classList.remove('show');
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 400); });
      window.switchTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 400); });
      var body = document.body.textContent;
      return body.indexOf('Décryptage') >= 0 && body.indexOf(marker) >= 0;
    }, marker)]);

    checks.push(['multi-sheet promos still loaded', await page.evaluate(async function () {
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchTab('promos');
      await new Promise(function (r) { setTimeout(r, 300); });
      return document.body.textContent.indexOf('Cofidis') >= 0;
    })]);

    checks.push(['multi-sheet diffs still loaded', await page.evaluate(async function () {
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 300); });
      return document.body.textContent.indexOf('Diff test multi') >= 0;
    })]);
  }

  fs.unlinkSync(xlsxPath);
  await browser.close();
  server.close();

  console.log('Decryptage Excel import test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    var ok = pair[1];
    if (!ok) allOk = false;
    console.log('  [' + (ok ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (dialogMsg && !importModalOk) {
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
