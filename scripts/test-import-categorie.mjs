#!/usr/bin/env node
/**
 * Les tests E2E écrivent sur Supabase : nettoyage automatique en finally via test-helpers.mjs.
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
const TEST_CAT = 'produit_tarification';
const MARKER_DIFF_PROD = 'TEST CAT DIFF PROD ' + Date.now();
const MARKER_DIFF_CAT = 'TEST CAT DIFF CAT ' + Date.now();
const MARKER_DEC_PROD = 'TEST CAT DEC PROD ' + Date.now();
const MARKER_DEC_CAT = 'TEST CAT DEC CAT ' + Date.now();
const MARKER_ACTU_CAT = 'TEST CAT ACTU ' + Date.now();
const MARKER_INVALID = 'TEST CAT INVALID ' + Date.now();

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
  const { server, port } = await startServer();
  const cfg = assertSafeTestTarget();
  const sb = createClient(cfg.url, cfg.anonKey);
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
      typeof window.__parseDiffSheet === 'function';
  }, { timeout: 120000 });

  const checks = [];

  checks.push(['parse diff: produit + categorie rows', await page.evaluate(function (cat, mProd, mCat) {
    var rows = [
      ['Acteur', 'Produit', 'Categorie', 'Difference'],
      ['Cofidis', 'pb', '', mProd],
      ['Cetelem', 'cr', cat, mCat],
      ['Boursorama', 'pb', cat, 'both filled — categorie wins']
    ];
    var parsed = window.__parseDiffSheet(XLSX.utils.aoa_to_sheet(rows));
    return parsed.byProduit.pb && parsed.byProduit.pb.Cofidis &&
      parsed.byProduit.pb.Cofidis.difference === mProd &&
      parsed.byCategorie[cat] && parsed.byCategorie[cat].Cetelem &&
      parsed.byCategorie[cat].Cetelem.difference === mCat &&
      parsed.byCategorie[cat].Boursorama &&
      !parsed.byProduit.cr;
  }, TEST_CAT, MARKER_DIFF_PROD, MARKER_DIFF_CAT)]);

  checks.push(['parse diff: invalid categorie skipped', await page.evaluate(function (invalid) {
    var rows = [
      ['Acteur', 'Produit', 'Categorie', 'Difference'],
      ['Cofidis', 'pb', invalid, 'should skip']
    ];
    var parsed = window.__parseDiffSheet(XLSX.utils.aoa_to_sheet(rows));
    return Object.keys(parsed.byProduit).length === 0 &&
      Object.keys(parsed.byCategorie).length === 0 &&
      parsed.skipped.length === 1;
  }, 'slug_invalide')]);

  checks.push(['parse decryptage: categorie without produit', await page.evaluate(function (cat, mProd, mCat) {
    var rows = [
      ['produit_id', 'Categorie', 'titre'],
      ['pb', '', mProd],
      ['', cat, mCat]
    ];
    var parsed = window.__parseDecryptageSheet(XLSX.utils.aoa_to_sheet(rows));
    return parsed.rows.length === 2 &&
      parsed.rows[0].produit_id === 'pb' && !parsed.rows[0].categorie &&
      !parsed.rows[1].produit_id && parsed.rows[1].categorie === cat &&
      parsed.rows[1].titre === mCat;
  }, TEST_CAT, MARKER_DEC_PROD, MARKER_DEC_CAT)]);

  checks.push(['parse decryptage: invalid categorie skipped', await page.evaluate(function () {
    var rows = [
      ['produit_id', 'Categorie', 'titre'],
      ['', 'bad_slug', 'ignored row']
    ];
    var parsed = window.__parseDecryptageSheet(XLSX.utils.aoa_to_sheet(rows));
    return parsed.rows.length === 0 && parsed.skipped.length === 1;
  })]);

  checks.push(['parse actualites: categorie clears produit', await page.evaluate(function (cat, m) {
    var rows = [
      ['Titre', 'Produit', 'Categorie', 'Source'],
      [m, 'pb', cat, 'https://example.com/cat'],
      ['Produit only', 'cr', '', 'https://example.com/prod']
    ];
    var parsed = window.__parseActualitesSheet(XLSX.utils.aoa_to_sheet(rows));
    return parsed.rows.length === 2 &&
      parsed.rows[0].categorie === cat && parsed.rows[0].produit_id === null &&
      parsed.rows[1].categorie === null && parsed.rows[1].produit_id === 'cr';
  }, TEST_CAT, MARKER_ACTU_CAT)]);

  var migrationOk = false;
  try {
    var probe = await sb.from('differenciateurs').select('categorie').limit(1);
    migrationOk = !probe.error;
  } catch (e) {
    migrationOk = false;
  }

  if (migrationOk) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Acteur', 'Produit', 'Categorie', 'Difference'],
      ['Cofidis', 'pb', '', MARKER_DIFF_PROD],
      ['Cetelem', '', TEST_CAT, MARKER_DIFF_CAT],
      ['Floa', 'pb', 'slug_invalide', MARKER_INVALID]
    ]), 'DIFFERENCIATEURS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['produit_id', 'Categorie', 'titre'],
      ['pb', '', MARKER_DEC_PROD],
      ['', TEST_CAT, MARKER_DEC_CAT]
    ]), 'DECRYPTAGE');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Titre', 'Acteur', 'Categorie', 'Source'],
      [MARKER_ACTU_CAT, 'Cofidis', TEST_CAT, 'https://example.com/cat-import']
    ]), 'ACTUALITES');
    const xlsxPath = path.join(root, '.tmp-categorie-import.xlsx');
    XLSX.writeFile(wb, xlsxPath);

    await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
    await page.type('#contrib-access-code', ACCESS_CODE);
    await page.click('#contrib-access-submit');
    await page.waitForFunction(function () {
      return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden');
    });
    await page.click('#contrib-goto-excel');
    await (await page.$('#file-input')).uploadFile(xlsxPath);

    await page.waitForFunction(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    }, { timeout: 90000 }).catch(function () {});

    checks.push(['e2e import modal success', await page.evaluate(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    })]);

    checks.push(['e2e skipped invalid line in summary', await page.evaluate(function (invalid) {
      var msg = document.getElementById('import-result-msg').textContent;
      return msg.indexOf('ignorée') >= 0 && msg.indexOf(invalid) >= 0;
    }, 'slug_invalide')]);

    checks.push(['e2e diff produit on pb page', await page.evaluate(async function (m) {
      document.getElementById('modal-import-result').classList.remove('show');
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 400); });
      window.switchTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(m) >= 0;
    }, MARKER_DIFF_PROD)]);

    checks.push(['e2e diff categorie on category page', await page.evaluate(async function (m) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 400); });
      window.switchCategoryTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(m) >= 0;
    }, MARKER_DIFF_CAT)]);

    checks.push(['e2e decryptage categorie on category page', await page.evaluate(async function (m) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchCategoryTab('decryptage');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(m) >= 0;
    }, MARKER_DEC_CAT)]);

    checks.push(['e2e actu categorie on category page', await page.evaluate(async function (m) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchCategoryTab('actualites');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(m) >= 0;
    }, MARKER_ACTU_CAT)]);

  checks.push(['e2e invalid row not imported', await page.evaluate(async function (m) {
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 300); });
      return document.body.textContent.indexOf(m) < 0;
    }, MARKER_INVALID)]);

    fs.unlinkSync(xlsxPath);
  } else {
    checks.push(['e2e categorie import (skipped — migration)', true]);
    console.log('\nNote: migration category_navigation non appliquée — tests E2E ignorés');
  }

  await browser.close();
  server.close();

  console.log('Import Categorie test:\n');
  var allOk = true;
  checks.forEach(function (c) {
    if (!c[1]) allOk = false;
    console.log('  [' + (c[1] ? 'OK' : 'FAIL') + '] ' + c[0]);
  });
  if (dialogMsg && migrationOk) {
    console.log('\nNote: dialog — ' + dialogMsg);
  }
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
  } finally {
    const cleaned = await cleanupTestData(sb);
    const n = cleaned.deleted.actus + cleaned.deleted.diffs + cleaned.deleted.tends;
    if (n > 0) {
      console.log('\n[Test cleanup]', cleaned.deleted.actus, 'actus,', cleaned.deleted.diffs, 'diffs,', cleaned.deleted.tends, 'tendances supprimées.');
    }
  }
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
