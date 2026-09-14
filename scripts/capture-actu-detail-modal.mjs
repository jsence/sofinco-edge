#!/usr/bin/env node
/** Capture modal détail actualité (local). Usage: node capture-actu-detail-modal.mjs [before|after] */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const suffix = process.argv[2] || 'after';
const outDir = process.argv[3] || '/opt/cursor/artifacts/screenshots';

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

function buildFixtures () {
  return [
    {
      file: 'actu-detail-modal-produit-' + suffix + '.png',
      data: {
        produits: [{ id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] }],
        promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
        taux: {},
        actualites: [{
          id: 'a1', date: '2026-09-10', acteur: 'Cofidis', type: 'Produit', produit: 'pb',
          categorie: 'produit_tarification', titre: 'Campagne sans frais — septembre',
          resume: 'Résumé détaillé pour la capture modal : offre concurrente sur le prêt personnel avec conditions clarifiées.',
          source: 'https://example.com/source-produit', impact: 'à surveiller', fiabilite: 'a_verifier'
        }],
        indicateurs: [], texteLibre: {}, lastImportAt: null
      }
    },
    {
      file: 'actu-detail-modal-transverse-' + suffix + '.png',
      data: {
        produits: [{ id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] }],
        promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
        taux: {},
        actualites: [{
          id: 'a2', date: '2026-08-22', acteur: 'Oney', type: 'Corporate', produit: null,
          categorie: 'strategie_corporate', titre: 'Communication corporate groupe',
          resume: 'Actualité transverse sans produit rattaché — métadonnées complètes dans la grille unique.',
          source: 'https://example.com/source-corporate', impact: 'neutre', fiabilite: 'confirmee'
        }],
        indicateurs: [], texteLibre: {}, lastImportAt: null
      }
    }
  ];
}

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  for (const item of buildFixtures()) {
    await page.evaluate(function (payload) {
      window.__testApplyLoadedData({
        data: payload.data,
        groups: { Cofidis: 'Groupe', Oney: 'Groupe' },
        domains: { Cofidis: 'cofidis.fr', Oney: 'oney.fr' },
        idByNom: {}, nomById: {}
      });
      window.navigate('home');
    }, item);
    await page.waitForSelector('.home-feed-wide .actu-card');
    await page.evaluate(function () { window.openActuDetail(0); });
    await page.waitForSelector('#modal-detail.show');
    await new Promise(function (r) { setTimeout(r, 400); });
    const target = await page.$('#modal-detail .modal');
    await target.screenshot({ path: path.join(outDir, item.file) });
    console.log('  wrote', item.file);
    await page.click('#detail-close');
    await new Promise(function (r) { setTimeout(r, 200); });
  }

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
