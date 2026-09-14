#!/usr/bin/env node
/** Après backfill simulé : 3 actus sept. 2026 visibles sur Commercial & Communication (local). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAT = 'commercial_communication';

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

function actu (id, titre, type, acteur, categorie, date) {
  return {
    id, date: date || '2026-09-10', acteur, type, produit: 'pb',
    categorie: categorie, titre, resume: 'Résumé test', source: 'https://example.com/x'
  };
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const titles = [
    "Sofinco promeut son offre de prêt personnel à 4,90 % TAEG fixe jusqu'au 30/09/2026",
    'AXA Banque revoit à la hausse les TAEG de ses prêts personnels à partir de 5 500 €',
    'Cetelem finance à 0 % TAEG les nouveaux iPhone 18 Pro et 18 Pro Max'
  ];

  const fixture = {
    data: {
      produits: [{ id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Sofinco'], sections: [] }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {},
      actualites: [
        actu('a1', titles[0], 'Communication', 'Sofinco', CAT),
        actu('a2', titles[1], 'Changement de taux', 'AXA Banque', 'produit_tarification'),
        actu('a3', titles[2], 'Opération commerciale', 'Cetelem', CAT, '2026-09-12')
      ],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: {}, domains: {}, idByNom: {}, nomById: {}
  };

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); window.__render(); }, fixture);
    await page.evaluate(function () { window.navigate('commercial_communication'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    }, { timeout: 15000 });
    await page.waitForSelector('#view-category .actu-card', { timeout: 15000 });

    const okCommercial = await page.evaluate(function () {
      var text = document.getElementById('view-category').textContent;
      return text.indexOf('Sofinco promeut') >= 0 && text.indexOf('Cetelem finance') >= 0;
    });

    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/actu-categorie-commercial-after-backfill.png',
      fullPage: true
    });

    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active') &&
        document.getElementById('view-category').textContent.indexOf('Produit & Tarification') >= 0;
    }, { timeout: 15000 });
    await page.waitForSelector('#view-category .actu-card', { timeout: 15000 });
    const okPt = await page.evaluate(function () {
      return document.getElementById('view-category').textContent.indexOf('AXA Banque revoit') >= 0;
    });
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/actu-categorie-pt-axa-after-backfill.png',
      fullPage: true
    });

    if (!okCommercial || !okPt) {
      console.error('FAIL: routage catégorie fixture (commercial ou produit_tarification)');
      process.exit(1);
    }
    console.log('OK: Sofinco + Cetelem sur Commercial ; AXA sur Produit & Tarification (fixture post-mapping).');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
