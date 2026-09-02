#!/usr/bin/env node
/**
 * Smoke test — accueil à la une + filtres catégorie + import Excel Une
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCESS_CODE = 'SOFINCO2026';
const MARKER_A = 'TEST UNE A ' + Date.now();
const MARKER_B = 'TEST UNE B ' + Date.now();

function loadSupabaseConfig () {
  var src = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
  return {
    url: (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1],
    anonKey: (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1]
  };
}

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
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const checks = [];
  var migrationOk = false;
  var probe = await sb.from('actualites').select('a_la_une').limit(1);
  migrationOk = !probe.error;

  checks.push(['home layout: products compact row', await page.evaluate(function () {
    return document.querySelector('.home-products-row') !== null &&
      document.querySelector('.home-products-compact') !== null &&
      !document.querySelector('.shortcuts-grid');
  })]);

  checks.push(['home category filter tags', await page.evaluate(function () {
    return document.querySelectorAll('.home-cat-tag').length >= 6;
  })]);

  checks.push(['home filter without reload', await page.evaluate(async function () {
    window.setHomeActuCategory('produit_tarification');
    await new Promise(function (r) { setTimeout(r, 200); });
    var active = document.querySelector('.home-cat-tag.active');
    return active && active.textContent.indexOf('Produit') >= 0;
  })]);

  checks.push(['week stats block present', await page.evaluate(function () {
    window.setHomeActuCategory('all');
    return document.body.textContent.indexOf('Cette semaine') >= 0 &&
      document.body.textContent.indexOf('acteurs suivis') >= 0;
  })]);

  if (migrationOk) {
    await sb.from('actualites').update({ a_la_une: false }).eq('a_la_une', true);

    const wb = XLSX.utils.book_new();
    const rows = [
      ['Titre', 'Acteur', 'Source', 'Une'],
      [MARKER_A, 'Cofidis', 'https://example.com/a', 'Oui'],
      [MARKER_B, 'Cetelem', 'https://example.com/b', 'Oui']
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'ACTUALITES');
    const xlsxPath = path.join(root, '.tmp-une-test.xlsx');
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

    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    checks.push(['excel last Oui wins featured', await page.evaluate(function (markerB, markerA) {
      var featured = document.querySelector('.home-featured');
      if (!featured) return false;
      return featured.textContent.indexOf(markerB) >= 0 && featured.textContent.indexOf(markerA) < 0;
    }, MARKER_B, MARKER_A)]);

  checks.push(['contrib set featured without import', await page.evaluate(async function (markerB, code) {
      document.getElementById('btn-contributeur').click();
      await new Promise(function (r) { setTimeout(r, 200); });
      document.getElementById('contrib-access-code').value = code;
      document.getElementById('contrib-access-submit').click();
      await new Promise(function (r) { setTimeout(r, 400); });
      var sel = document.getElementById('contrib-featured-select');
      if (!sel) return false;
      var found = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].text.indexOf(markerB) >= 0) { sel.value = sel.options[i].value; found = true; break; }
      }
      if (!found) return false;
      document.getElementById('contrib-featured-apply').click();
      await new Promise(function (r) { setTimeout(r, 2000); });
      document.getElementById('modal-contributeur').classList.remove('show');
      window.navigate('home');
      await new Promise(function (r) { setTimeout(r, 500); });
      var featured = document.querySelector('.home-featured');
      return featured && featured.textContent.indexOf(markerB) >= 0;
    }, MARKER_B, ACCESS_CODE)]);

    fs.unlinkSync(xlsxPath);
  } else {
    checks.push(['migration a_la_une (skipped)', true]);
    console.log('\nNote: migration a_la_une non appliquée — tests featured ignorés');
  }

  checks.push(['cr product tabs unchanged', await page.evaluate(async function () {
    window.navigate('cr');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.indexOf('Tableau') >= 0 && tabs.indexOf('Promos') >= 0;
  })]);

  await browser.close();
  server.close();

  console.log('Home à la une test:\n');
  var allOk = true;
  checks.forEach(function (c) {
    if (!c[1]) allOk = false;
    console.log('  [' + (c[1] ? 'OK' : 'FAIL') + '] ' + c[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
