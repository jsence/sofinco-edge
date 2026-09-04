#!/usr/bin/env node
/**
 * Test filtres acteur (multi) + produit sur pages catégorie — env test uniquement.
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
const TEST_CAT = 'produit_tarification';
const MARKER = 'TEST CAT FILTER ' + Date.now();

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

async function insertFixtures (sb) {
  const ids = {};
  const a1 = await sb.from('actualites').insert({
    date: '2026-09-02', acteur_id: 'cofidis', type: 'Produit', produit_id: 'pb',
    categorie: TEST_CAT, titre: MARKER + ' Cofidis PB', source: 'https://example.com/cat-filter'
  }).select('id').single();
  const a2 = await sb.from('actualites').insert({
    date: '2026-09-02', acteur_id: 'cetelem', type: 'Produit', produit_id: 'cr',
    categorie: TEST_CAT, titre: MARKER + ' Cetelem CR', source: 'https://example.com/cat-filter'
  }).select('id').single();
  const a3 = await sb.from('actualites').insert({
    date: '2026-09-02', acteur_id: 'cofidis', type: 'Corporate', produit_id: null,
    categorie: TEST_CAT, titre: MARKER + ' Cofidis transverse', source: 'https://example.com/cat-filter'
  }).select('id').single();
  ids.actus = [a1.data?.id, a2.data?.id, a3.data?.id].filter(Boolean);

  const d1 = await sb.from('differenciateurs').insert({
    categorie: TEST_CAT, acteur_id: 'cofidis', produit_id: null,
    difference: MARKER + ' diff cofidis', conclusion: 'Test', tags: []
  }).select('id').single();
  ids.diff = d1.data?.id;

  const t1 = await sb.from('tendances').insert({
    categorie: TEST_CAT, produit_id: 'pb', titre: MARKER + ' tend pb',
    description: 'Test', acteurs_concernes: ['cofidis'], portee: 'produit'
  }).select('id').single();
  ids.tend = t1.data?.id;

  return ids;
}

async function run () {
  const cfg = assertSafeTestTarget();
  const sb = createClient(cfg.url, cfg.anonKey);
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await insertFixtures(sb);
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    });

    const baseCount = await page.evaluate(function () {
      return document.querySelectorAll('#view-category .news-item').length;
    });
    checks.push(['onglet actualités affiche les fixtures', baseCount >= 3]);

    await page.evaluate(function () { window.toggleCategoryActor('produit_tarification', 'Cofidis'); });
    await page.waitForFunction(function () {
      var items = document.querySelectorAll('#view-category .news-item');
      return items.length >= 2 && items.length < 3;
    });
    const cofidisCount = await page.evaluate(function () {
      return document.querySelectorAll('#view-category .news-item').length;
    });
    checks.push(['filtre acteur Cofidis seul', cofidisCount === 2]);

    await page.evaluate(function () { window.setCategoryProduct('produit_tarification', 'pb'); });
    await page.waitForFunction(function () {
      var texts = Array.from(document.querySelectorAll('#view-category .news-text')).map(function (el) { return el.textContent; });
      return texts.some(function (t) { return t.indexOf('Cofidis PB') >= 0; }) &&
        !texts.some(function (t) { return t.indexOf('transverse') >= 0; });
    });
    checks.push(['filtre combiné Cofidis + PB exclut transverse', true]);

    await page.evaluate(function () { window.switchCategoryTab('differenciateurs'); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-category .diff-card').length >= 1;
    });
    checks.push(['onglet différenciateurs avec filtre actif', true]);

    await page.evaluate(function () {
      window.clearCategoryActors('produit_tarification');
      window.setCategoryProduct('produit_tarification', 'all');
      window.switchCategoryTab('decryptage');
    });
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-category .tendance-card').length >= 1;
    });
    checks.push(['onglet décryptage affiche tendance', true]);

    await page.evaluate(function () { window.setCategoryProduct('produit_tarification', 'cr'); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-category .tendance-card').length === 0;
    });
    checks.push(['filtre produit CR masque tendance PB', true]);

    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-product').classList.contains('active');
    });
    const prodOk = await page.evaluate(function () {
      return document.querySelector('#view-product .prod-title') !== null;
    });
    checks.push(['navigation page produit intacte', prodOk]);

    await page.evaluate(function () { window.navigate('commercial_communication'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    });
    const resetActors = await page.evaluate(function () {
      var btn = document.querySelector('#view-category .home-cat-tag[onclick*="clearCategoryActors"]');
      return btn && btn.classList.contains('active');
    });
    checks.push(['changement catégorie réinitialise filtres', resetActors]);

    await cleanupTestData(sb);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Category filters test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
