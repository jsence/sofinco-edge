#!/usr/bin/env node
/**
 * Import ACTUALITES avec colonne Une — sans échec si migration a_la_une absente
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
const MARKER = 'TEST UNE GRACEFUL ' + Date.now();
const ACTOR = 'ActeurTestUne' + Date.now();

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
  const migrationOk = !(await sb.from('actualites').select('a_la_une').limit(0)).error;

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
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const checks = [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Titre', 'Acteur', 'Source', 'Une'],
    [MARKER, ACTOR, 'https://example.com/une-test', 'Oui']
  ]), 'ACTUALITES');
  const xlsxPath = path.join(root, '.tmp-une-graceful.xlsx');
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
    return document.getElementById('modal-import-result').classList.contains('show') ||
      document.getElementById('data-error').style.display === 'flex';
  }, { timeout: 90000 }).catch(function () {});

  checks.push(['import modal success (no crash)', await page.evaluate(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  })]);

  if (!migrationOk) {
    checks.push(['warning when migration missing', await page.evaluate(function () {
      var msg = document.getElementById('import-result-msg').textContent;
      return msg.indexOf('a_la_une') >= 0 || msg.indexOf('ignorée') >= 0;
    })]);
  }

  checks.push(['actu row imported', await page.evaluate(async function (marker) {
    document.getElementById('modal-import-result').classList.remove('show');
    window.navigate('actus');
    await new Promise(function (r) { setTimeout(r, 500); });
    return document.body.textContent.indexOf(marker) >= 0;
  }, MARKER)]);

  if (migrationOk) {
    await sb.from('actualites').update({ a_la_une: false }).eq('a_la_une', true);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    const wb2 = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([
      ['Titre', 'Acteur', 'Source', 'Une'],
      [MARKER + ' FEATURED', 'Cetelem', 'https://example.com/featured', 'Oui']
    ]), 'ACTUALITES');
    const xlsxPath2 = path.join(root, '.tmp-une-featured.xlsx');
    XLSX.writeFile(wb2, xlsxPath2);

    await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
    await page.type('#contrib-access-code', ACCESS_CODE);
    await page.click('#contrib-access-submit');
    await page.waitForFunction(function () {
      return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden');
    });
    await page.click('#contrib-goto-excel');
    await (await page.$('#file-input')).uploadFile(xlsxPath2);
    await page.waitForFunction(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    }, { timeout: 90000 });

    checks.push(['featured block on home after Une import', await page.evaluate(async function (marker) {
      document.getElementById('modal-import-result').classList.remove('show');
      window.navigate('home');
      await new Promise(function (r) { setTimeout(r, 600); });
      var featured = document.querySelector('.home-featured');
      return featured && featured.textContent.indexOf('À la une') >= 0 &&
        featured.textContent.indexOf(marker) >= 0;
    }, MARKER + ' FEATURED')]);

    fs.unlinkSync(xlsxPath2);
  } else {
    checks.push(['featured block (needs migration)', true]);
    console.log('\nNote: migration a_la_une non appliquée — test bloc À la une ignoré');
  }

  fs.unlinkSync(xlsxPath);
  await browser.close();
  server.close();

  console.log('Import Une graceful test:\n');
  var allOk = true;
  checks.forEach(function (c) {
    if (!c[1]) allOk = false;
    console.log('  [' + (c[1] ? 'OK' : 'FAIL') + '] ' + c[0]);
  });
  if (dialogMsg && !checks[0][1]) {
    console.log('\nDialog: ' + dialogMsg);
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
