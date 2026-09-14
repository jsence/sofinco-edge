#!/usr/bin/env node
/** Capture badges catégorie (libellés complets) sur les 5 pages — local uniquement. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || '/opt/cursor/artifacts/screenshots';

const CATEGORIES = [
  { id: 'produit_tarification', label: 'Produit & Tarification' },
  { id: 'commercial_communication', label: 'Commercial & Communication' },
  { id: 'strategie_corporate', label: 'Stratégie & Corporate' },
  { id: 'rse_juridique', label: 'RSE & Juridique' },
  { id: 'innovation_securite', label: 'Innovation & Sécurité' }
];

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

function buildFixture () {
  const actualites = CATEGORIES.map(function (cat, i) {
    return {
      id: 'actu-' + cat.id,
      date: '2026-09-0' + (i + 1),
      acteur: 'Cofidis',
      type: 'Corporate',
      produit: 'pb',
      categorie: cat.id,
      titre: 'Veille — ' + cat.label,
      resume: 'Résumé pour capture.',
      source: ''
    };
  });
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites, indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
    domains: { Cofidis: 'cofidis.fr' },
    idByNom: {},
    nomById: {}
  };
}

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });
  await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

  for (const cat of CATEGORIES) {
    await page.evaluate(function (id) { window.navigate(id); window.switchCategoryTab('actualites'); }, cat.id);
    await page.waitForSelector('#view-category .actu-badge-cat');
    await new Promise(function (r) { setTimeout(r, 400); });
    const card = await page.$('#view-category .actu-card');
    const file = path.join(outDir, 'actu-category-badge-' + cat.id + '.png');
    if (card) await card.screenshot({ path: file });
    console.log('  wrote', path.basename(file));
  }

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
