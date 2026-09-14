#!/usr/bin/env node
/** Captures états vides catégorie (local, fixture). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = '/opt/cursor/artifacts/screenshots';

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
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] },
        { id: 'rac', label: 'Rachat de crédit', shortLabel: 'RAC', excelSheet: 'RAC', acteurs: ['Cofidis'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {},
      tendances: {}, tendancesByCategorie: {},
      taux: {},
      actualites: [{
        id: '1', date: '2026-09-02', acteur: 'Cofidis', type: 'Produit', produit: 'pb',
        categorie: 'produit_tarification', titre: 'Actu PB seule', resume: '', source: ''
      }],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
    domains: { Cofidis: 'cofidis.fr' },
    idByNom: { Cofidis: 'cofidis' },
    nomById: { cofidis: 'Cofidis' }
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

  await page.evaluate(function () { window.navigate('rse_juridique'); });
  await page.waitForSelector('#view-category.active');
  await page.evaluate(function () { window.switchCategoryTab('actualites'); });
  await page.waitForSelector('#view-category [data-empty-kind="no-data"]');
  await page.screenshot({ path: path.join(outDir, 'category-empty-no-data.png') });

  await page.evaluate(function () { window.navigate('produit_tarification'); });
  await page.waitForSelector('#view-category.active');
  await new Promise(function (r) { setTimeout(r, 350); });
  await page.evaluate(function () { window.switchCategoryTab('actualites'); });
  await page.evaluate(function () { window.setCategoryProduct('produit_tarification', 'rac'); });
  await page.waitForFunction(function () {
    return document.querySelector('#view-category [data-empty-kind="filtered"]') !== null;
  }, { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, 'category-empty-filtered.png') });

  await browser.close();
  server.close();
  console.log('Saved category empty state screenshots to', outDir);
}

run().catch(function (e) { console.error(e); process.exit(1); });
