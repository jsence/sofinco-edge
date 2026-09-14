#!/usr/bin/env node
/** Capture onglet Décryptage pour avant/après (local uniquement). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const suffix = process.argv[2] || 'after';
const outDir = process.argv[3] || '/opt/cursor/artifacts/screenshots';

const LONG_DESC =
  'Le marché du crédit à la consommation connaît une accélération des parcours digitaux. ' +
  'Les acteurs historiques renforcent leurs offres sans frais et simplifient les étapes de souscription. ' +
  'La concurrence s\'intensifie sur les taux d\'appel et la visibilité des promotions.\n\n' +
  'Les clients comparent davantage en ligne avant de choisir un financement. ' +
  'La transparence des conditions et la rapidité de réponse deviennent des critères déterminants.';

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
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Sofinco', 'Cofidis', 'Cetelem'], sections: [] },
        { id: 'cr', label: 'Crédit renouvelable', shortLabel: 'CR', excelSheet: 'CR', acteurs: ['Sofinco'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {},
      tendances: {}, tendancesByCategorie: {
        produit_tarification: [{
          titre: 'Accélération des parcours 100 % digitaux',
          description: LONG_DESC,
          acteurs: ['Cofidis', 'Cetelem', 'Sofinco'],
          produit: 'pb',
          portee: 'produit'
        }],
        strategie_corporate: [{
          titre: 'Visibilité des campagnes promotionnelles',
          description: LONG_DESC,
          acteurs: ['Oney', 'Franfinance'],
          produit: null,
          portee: 'produit'
        }]
      },
      taux: {}, actualites: [], indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Sofinco: 'Nous', Cofidis: 'Groupe', Cetelem: 'Groupe', Oney: 'Groupe', Franfinance: 'Groupe' },
    domains: {},
    idByNom: {}, nomById: {}
  };
}

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });
  await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

  const cats = [
    { id: 'produit_tarification', file: 'decryptage-produit-tarification-' + suffix + '.png' },
    { id: 'strategie_corporate', file: 'decryptage-strategie-corporate-' + suffix + '.png' }
  ];

  for (const cat of cats) {
    await page.evaluate(function (id) { window.navigate(id); }, cat.id);
    await new Promise(function (r) { setTimeout(r, 400); });
    await page.waitForSelector('#view-category.active', { timeout: 60000 });
    await page.evaluate(function () { window.switchCategoryTab('decryptage'); });
    await page.waitForFunction(function () {
      return document.querySelector('#view-category .tendance-card') !== null;
    }, { timeout: 60000 });
    await new Promise(function (r) { setTimeout(r, 1200); });
    const el = await page.$('#view-category .tendances-section');
    if (!el) throw new Error('Missing tendances-section for ' + cat.id);
    await el.screenshot({ path: path.join(outDir, cat.file) });
    console.log('  wrote', cat.file);
  }

  await browser.close();
  server.close();
  console.log('Saved decryptage screenshots (' + suffix + ') to', outDir);
}

run().catch(function (e) { console.error(e); process.exit(1); });
