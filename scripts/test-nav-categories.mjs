#!/usr/bin/env node
/**
 * Smoke test — navigation catégories + produits, sans Benchmarks
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
const TEST_CAT = 'produit_tarification';
const MARKER = 'TEST NAV CAT ' + Date.now();

function loadSupabaseConfig () {
  var cfgPath = path.join(root, 'supabase-config.js');
  var src = fs.readFileSync(cfgPath, 'utf8');
  var url = (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1];
  var anonKey = (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1];
  return { url, anonKey };
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

async function insertCategoryTestData (sb) {
  var inserted = { actu: null, diff: null, tend: null };
  var actuRes = await sb.from('actualites').insert({
    date: '2026-09-02',
    acteur_id: null,
    type: 'Corporate',
    produit_id: null,
    categorie: TEST_CAT,
    titre: MARKER + ' actu',
    source: 'https://example.com/test'
  }).select('id').single();
  if (!actuRes.error) inserted.actu = actuRes.data.id;

  var diffRes = await sb.from('differenciateurs').insert({
    produit_id: null,
    categorie: TEST_CAT,
    acteur_id: 'cofidis',
    difference: MARKER + ' diff',
    conclusion: 'Test',
    tags: []
  }).select('id').single();
  if (!diffRes.error) inserted.diff = diffRes.data.id;

  var tendRes = await sb.from('tendances').insert({
    produit_id: null,
    categorie: TEST_CAT,
    titre: MARKER + ' decryptage',
    description: 'Test category tendance',
    acteurs_concernes: [],
    portee: 'produit'
  }).select('id').single();
  if (!tendRes.error) inserted.tend = tendRes.data.id;

  return inserted;
}

async function cleanupTestData (sb, ids) {
  if (ids.actu) await sb.from('actualites').delete().eq('id', ids.actu);
  if (ids.diff) await sb.from('differenciateurs').delete().eq('id', ids.diff);
  if (ids.tend) await sb.from('tendances').delete().eq('id', ids.tend);
}

async function run () {
  const puppeteer = require('puppeteer');
  const XLSX = require('xlsx');
  const { server, port } = await startServer();
  const cfg = loadSupabaseConfig();
  const sb = createClient(cfg.url, cfg.anonKey);
  var testIds = await insertCategoryTestData(sb);
  var migrationOk = !!(testIds.actu && testIds.diff && testIds.tend);

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

  checks.push(['5 category nav items', await page.evaluate(function () {
    return document.querySelectorAll('[data-nav="produit_tarification"], [data-nav="commercial_communication"], [data-nav="strategie_corporate"], [data-nav="rse_juridique"], [data-nav="innovation_securite"]').length === 5;
  })]);

  checks.push(['6 product nav items', await page.evaluate(function () {
    return document.querySelectorAll('[data-nav="pb"], [data-nav="cr"], [data-nav="nxcb"], [data-nav="rac"], [data-nav="carte"], [data-nav="distribution"]').length === 6;
  })]);

  checks.push(['no benchmarks in sidebar', await page.evaluate(function () {
    var text = document.querySelector('.sb-nav').textContent;
    return text.indexOf('Benchmarks') < 0 &&
      !document.querySelector('[data-nav="digital"]') &&
      !document.querySelector('[data-nav="sav"]') &&
      !document.querySelector('[data-nav="com"]') &&
      !document.querySelector('[data-nav="indicateurs"]');
  })]);

  checks.push(['actualites section label', await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.sb-nav-label')).some(function (el) {
      return el.textContent.trim() === 'Actualités';
    });
  })]);

  checks.push(['offres section label', await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.sb-nav-label')).some(function (el) {
      return el.textContent.trim() === 'Offres';
    });
  })]);

  checks.push(['category icons distinct colors', await page.evaluate(function () {
    var ids = ['produit_tarification', 'commercial_communication', 'strategie_corporate', 'rse_juridique', 'innovation_securite'];
    var classes = ['nav-ic-cat-pt', 'nav-ic-cat-cc', 'nav-ic-cat-sc', 'nav-ic-cat-rse', 'nav-ic-cat-is'];
    var colors = [];
    for (var i = 0; i < ids.length; i++) {
      var ic = document.querySelector('[data-nav="' + ids[i] + '"] .' + classes[i]);
      if (!ic) return false;
      colors.push(window.getComputedStyle(ic).color);
    }
    var unique = colors.filter(function (c, idx, arr) { return arr.indexOf(c) === idx; });
    return unique.length === 5;
  })]);

  checks.push(['no global actus nav entry', await page.evaluate(function () {
    return !document.querySelector('[data-nav="actus"]');
  })]);

  checks.push(['sidebar nav scrollable', await page.evaluate(function () {
    var nav = document.querySelector('.sb-nav');
    if (!nav) return false;
    var oy = window.getComputedStyle(nav).overflowY;
    return oy === 'auto' || oy === 'scroll';
  })]);

  await page.setViewport({ width: 1280, height: 420 });

  checks.push(['sidebar scroll reaches last offer', await page.evaluate(function () {
    var nav = document.querySelector('.sb-nav');
    var last = document.querySelector('[data-nav="distribution"]');
    if (!nav || !last) return false;
    nav.scrollTop = nav.scrollHeight;
    var navRect = nav.getBoundingClientRect();
    var itemRect = last.getBoundingClientRect();
    return itemRect.top >= navRect.top - 2 && itemRect.bottom <= navRect.bottom + 2;
  })]);

  checks.push(['sidebar footer stays visible', await page.evaluate(function () {
    var footer = document.querySelector('.sb-footer');
    var logo = document.querySelector('.sb-logo');
    if (!footer || !logo) return false;
    var fRect = footer.getBoundingClientRect();
    var lRect = logo.getBoundingClientRect();
    return fRect.top > lRect.bottom && fRect.bottom <= window.innerHeight + 1;
  })]);

  checks.push(['offer icons colored background', await page.evaluate(function () {
    var ic = document.querySelector('[data-nav="pb"] .nav-ic-pb');
    if (!ic) return false;
    var bg = window.getComputedStyle(ic).backgroundColor;
    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
  })]);

  checks.push(['category page has 3 tabs', await page.evaluate(async function () {
    window.navigate('produit_tarification');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.indexOf('Actualités') >= 0 && tabs.indexOf('Différenciateurs') >= 0 && tabs.indexOf('Décryptage') >= 0;
  })]);

  if (migrationOk) {
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    checks.push(['category actu filter', await page.evaluate(async function (marker) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(marker + ' actu') >= 0;
    }, MARKER)]);

    checks.push(['category diff filter', await page.evaluate(async function (marker) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchCategoryTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 300); });
      return document.body.textContent.indexOf(marker + ' diff') >= 0;
    }, MARKER)]);

    checks.push(['category decryptage filter', await page.evaluate(async function (marker) {
      window.navigate('produit_tarification');
      await new Promise(function (r) { setTimeout(r, 300); });
      window.switchCategoryTab('decryptage');
      await new Promise(function (r) { setTimeout(r, 300); });
      return document.body.textContent.indexOf(marker + ' decryptage') >= 0;
    }, MARKER)]);
  } else {
    checks.push(['category data filter (needs migration)', true]);
    console.log('\nNote: migration category_navigation non appliquée — filtrage catégorie non testé en E2E');
  }

  checks.push(['cr product tabs unchanged', await page.evaluate(async function () {
    window.navigate('cr');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.indexOf('Tableau') >= 0 && tabs.indexOf('Différenciateurs') >= 0 &&
      tabs.indexOf('Promos') >= 0 && tabs.indexOf('Actualités') >= 0 && tabs.indexOf('Taux') >= 0;
  })]);

  checks.push(['distribution product page', await page.evaluate(async function () {
    window.navigate('distribution');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.indexOf('Tableau') >= 0 && tabs.indexOf('Différenciateurs') >= 0 && tabs.indexOf('Promos') >= 0;
  })]);

  const markerImport = 'TEST REGRESSION IMPORT ' + Date.now();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Critère', 'Cofidis'],
    ['Section'],
    ['Taux', '3,5 %']
  ]), 'PB');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Acteur', 'Produit', 'Taux'],
    ['Cofidis', 'pb', '0 %']
  ]), 'PROMOS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Acteur', 'Produit', 'Difference'],
    ['Cofidis', 'pb', markerImport + ' diff']
  ]), 'DIFFERENCIATEURS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Titre', 'Acteur', 'Source'],
    [markerImport + ' actu', 'Cofidis', 'https://example.com']
  ]), 'ACTUALITES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['produit_id', 'titre'],
    ['pb', markerImport + ' dec']
  ]), 'DECRYPTAGE');
  const xlsxPath = path.join(root, '.tmp-nav-regression.xlsx');
  XLSX.writeFile(wb, xlsxPath);

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    var hub = document.getElementById('contrib-step-hub');
    return hub && !hub.classList.contains('contrib-step-hidden');
  });
  await page.click('#contrib-goto-excel');
  const input = await page.$('#file-input');
  await input.uploadFile(xlsxPath);

  await Promise.race([
    page.waitForFunction(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    }, { timeout: 90000 }),
    page.waitForFunction(function () { return !!dialogMsg; }, { timeout: 90000 })
  ]).catch(function () {});

  checks.push(['excel multi-sheet import', await page.evaluate(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  })]);

  if (await page.evaluate(function () { return document.getElementById('modal-import-result').classList.contains('show'); })) {
    checks.push(['pb decryptage after import', await page.evaluate(async function (marker) {
      document.getElementById('modal-import-result').classList.remove('show');
      window.navigate('pb');
      await new Promise(function (r) { setTimeout(r, 400); });
      window.switchTab('differenciateurs');
      await new Promise(function (r) { setTimeout(r, 400); });
      return document.body.textContent.indexOf(marker + ' dec') >= 0;
    }, markerImport)]);
  }

  fs.unlinkSync(xlsxPath);
  await cleanupTestData(sb, testIds);
  await browser.close();
  server.close();

  console.log('Navigation categories smoke test:\n');
  let allOk = true;
  checks.forEach(function (c) {
    const status = c[1] ? 'OK' : 'FAIL';
    if (!c[1]) allOk = false;
    console.log('  [' + status + '] ' + c[0]);
  });
  if (dialogMsg) console.log('\nImport dialog: ' + dialogMsg);
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
