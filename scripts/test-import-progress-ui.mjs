#!/usr/bin/env node
/**
 * Barre de progression import Excel — local uniquement (pas de prod).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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
      const types = { '.html': 'text/html', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server, port: server.address().port });
    });
  });
}

async function openContribExcel (page) {
  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    var hub = document.getElementById('contrib-step-hub');
    return hub && !hub.classList.contains('contrib-step-hidden');
  });
  await page.click('#contrib-goto-excel');
  await page.waitForSelector('#contrib-step-excel:not(.contrib-step-hidden)');
}

async function runOptionalSupabaseE2E (page, checks) {
  let assertSafeTestTarget;
  let cleanupTestData;
  let createClient;
  try {
    const helpers = await import('./test-helpers.mjs');
    assertSafeTestTarget = helpers.assertSafeTestTarget;
    cleanupTestData = helpers.cleanupTestData;
    createClient = (await import('@supabase/supabase-js')).createClient;
  } catch (e) {
    return;
  }
  let sb;
  try {
    const cfg = assertSafeTestTarget();
    sb = createClient(cfg.url, cfg.anonKey);
  } catch (e) {
    console.log('\n[E2E Supabase] ignoré — ' + e.message.split('\n')[0]);
    return;
  }
  const XLSX = require('xlsx');
  const pbSheet = [['Critère', 'Cofidis'], ['Section'], ['Taux', '1 %']];
  const actuSheet = [['Titre', 'Acteur', 'Type', 'Source'],
    ['TEST PROGRESS ' + Date.now(), 'Cofidis', 'Produit', 'https://example.com/p']];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pbSheet), 'PB');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(actuSheet), 'ACTUALITES');
  const goodPath = path.join(root, '.tmp-progress-import.xlsx');
  XLSX.writeFile(wb, goodPath);

  await page.click('#contrib-back-hub-from-excel');
  await page.waitForSelector('#contrib-step-hub:not(.contrib-step-hidden)');
  await page.click('#contrib-goto-excel');
  await page.evaluate(function () { globalThis.__IMPORT_PROGRESS_THROTTLE_MS = 300; });
  await (await page.$('#file-input')).uploadFile(goodPath);
  await page.waitForFunction(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  }, { timeout: 120000 });
  checks.push(['E2E test Supabase — résumé import', await page.evaluate(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  })]);
  fs.unlinkSync(goodPath);
  const cleaned = await cleanupTestData(sb);
  const n = cleaned.deleted.actus + cleaned.deleted.diffs + cleaned.deleted.tends;
  if (n > 0) console.log('\n[Test cleanup]', n, 'lignes supprimées.');
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none' &&
        typeof window.__testImportProgressDemo === 'function';
    }, { timeout: 120000 });

    const badPath = path.join(root, '.tmp-bad-import.xlsx');
    fs.writeFileSync(badPath, 'contenu invalide pas un zip xlsx');
    await openContribExcel(page);
    await (await page.$('#file-input')).uploadFile(badPath);
    await page.waitForSelector('#contrib-import-progress[data-import-state="error"]');
    checks.push(['fichier invalide — barre en échec', await page.evaluate(function () {
      var p = document.getElementById('contrib-import-progress');
      var status = document.getElementById('contrib-import-progress-status').textContent;
      return p.getAttribute('data-import-state') === 'error' &&
        (status.indexOf('invalide') >= 0 || status.indexOf('lecture') >= 0);
    })]);

    await page.evaluate(function () { globalThis.__IMPORT_PROGRESS_THROTTLE_MS = 250; });
    await page.evaluate(function () { return window.__testImportProgressDemo(); });
    await page.waitForSelector('#modal-import-result.show');
    checks.push(['démo progression — résumé final', await page.evaluate(function () {
      return document.getElementById('modal-import-result').classList.contains('show') &&
        document.getElementById('import-result-msg').textContent.length > 5;
    })]);

    await page.evaluate(function () {
      document.getElementById('import-result-close').click();
      document.getElementById('modal-contributeur').classList.add('show');
      document.getElementById('contrib-step-access').classList.add('contrib-step-hidden');
      document.getElementById('contrib-step-hub').classList.add('contrib-step-hidden');
      document.getElementById('contrib-step-excel').classList.remove('contrib-step-hidden');
    });
    await page.evaluate(async function () {
      globalThis.__IMPORT_PROGRESS_THROTTLE_MS = 200;
      window.resetImportProgressUI();
      window.beginImportProgressUI('pause.xlsx');
      window.advanceImportProgressStep('parse', 'Analyse…', 40);
      await new Promise(function (r) { setTimeout(r, 50); });
    });
    checks.push(['progression en cours — 5 étapes listées', await page.evaluate(function () {
      var p = document.getElementById('contrib-import-progress');
      return p.getAttribute('data-import-state') === 'running' &&
        document.querySelectorAll('#contrib-import-progress-steps li').length === 5;
    })]);

    fs.unlinkSync(badPath);
    await runOptionalSupabaseE2E(page, checks);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Import progress UI test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
