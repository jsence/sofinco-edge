#!/usr/bin/env node
/** Capture filtre date catégorie Actualités (local uniquement). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || '/opt/cursor/artifacts/screenshots';

const CAT = 'produit_tarification';

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
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Sofinco', 'Cofidis'], sections: [] },
        { id: 'cr', label: 'Crédit renouvelable', shortLabel: 'CR', excelSheet: 'CR', acteurs: ['Sofinco'], sections: [] }
      ],
      promos: {},
      differenciateurs: {},
      differenciateursByCategorie: {},
      tendances: {},
      tendancesByCategorie: {},
      taux: {},
      actualites: [
        { id: '1', date: '2026-09-10', acteur: 'Cofidis', type: 'Produit', produit: 'pb', categorie: CAT, titre: 'Campagne Cofidis — septembre', resume: 'Résumé test.', source: '' },
        { id: '2', date: '2026-09-02', acteur: 'Cetelem', type: 'Produit', produit: 'cr', categorie: CAT, titre: 'Offre Cetelem début septembre', resume: '', source: '' },
        { id: '3', date: '2026-08-20', acteur: 'Cofidis', type: 'Corporate', produit: null, categorie: CAT, titre: 'Communication corporate Cofidis', resume: '', source: '' }
      ],
      indicateurs: [],
      texteLibre: {},
      lastImportAt: null
    },
    groups: { Cofidis: 'Groupe', Cetelem: 'Groupe' },
    domains: {},
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
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });
  await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());
  await page.evaluate(function () { window.navigate('produit_tarification'); });
  await page.waitForSelector('#view-category.active');
  await page.evaluate(function () { window.switchCategoryTab('actualites'); });
  await page.waitForSelector('#view-category .news-item');

  await page.evaluate(function () {
    window.setCategoryDateBound('produit_tarification', 'from', '2026-09-01');
    window.setCategoryDateBound('produit_tarification', 'to', '2026-09-08');
    window.toggleCategoryActor('produit_tarification', 'Cofidis');
    window.toggleCategoryProduct('produit_tarification', 'pb');
  });
  await page.waitForFunction(function () {
    return document.querySelectorAll('#view-category .news-item').length === 0;
  }, { timeout: 10000 }).catch(function () {});

  await page.evaluate(function () {
    window.clearCategoryProducts('produit_tarification');
    window.setCategoryDateBound('produit_tarification', 'from', '2026-09-05');
    window.setCategoryDateBound('produit_tarification', 'to', '2026-09-15');
  });
  await page.waitForFunction(function () {
    return document.querySelectorAll('#view-category .news-item').length === 1;
  }, { timeout: 10000 });

  await new Promise(function (r) { setTimeout(r, 500); });
  const section = await page.$('#view-category #tab-content');
  const out = path.join(outDir, 'category-actu-date-filter-combined.png');
  if (section) await section.screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: false });
  console.log('Wrote', out);

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
