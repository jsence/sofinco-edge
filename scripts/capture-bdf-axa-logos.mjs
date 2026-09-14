#!/usr/bin/env node
/** Capture logos BDF + AXA sur fiche produit (local). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || '/opt/cursor/artifacts/screenshots';

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
      produits: [{
        id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB',
        acteurs: ['Banque de France', 'AXA Banque', 'Cofidis'],
        sections: [{ title: 'Offre', rows: [{ critere: 'Test', values: { 'Banque de France': '1', 'AXA Banque': '2', Cofidis: '3' } }] }]
      }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites: [], indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
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
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });
  await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());
  await page.evaluate(function () { window.navigate('pb'); });
  await page.waitForSelector('#view-product .actor-card');
  await new Promise(function (r) { setTimeout(r, 3500); });

  const grid = await page.$('#view-product .actors-grid');
  const out = path.join(outDir, 'logos-bdf-axa-product-cards.png');
  if (grid) await grid.screenshot({ path: out });
  else await page.screenshot({ path: out });
  console.log('Wrote', out);

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
