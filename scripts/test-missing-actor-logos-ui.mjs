#!/usr/bin/env node
/** Logos acteurs — 13 domaines fallback ajoutés (fixture locale). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ACTORS = [
  'Banque Populaire', 'BNP Paribas', 'Caisse d\'Épargne', 'Caisse d\'Épargne Île-de-France',
  'Cetelem / Cofinoga', 'CIC', 'Crédit Mutuel', 'Crédit Mutuel Arkéa', 'Hello bank!',
  'LCL', 'Monabanq', 'SG', 'FLOA (hors promo)'
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

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const values = {};
  ACTORS.forEach(function (a) { values[a] = 'x'; });

  const fixture = {
    data: {
      produits: [{
        id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB',
        acteurs: ACTORS.concat(['Sofinco', 'Algoan']),
        sections: [{ title: 'Offre', rows: [{ critere: 'Test', values: values }] }]
      }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites: [], indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: {}, domains: {}, idByNom: {}, nomById: {}
  };

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.__testApplyLoadedData === 'function' &&
        document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, fixture);
    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForSelector('#view-product .actor-card', { timeout: 30000 });
    await new Promise(function (r) { setTimeout(r, 2500); });

    const results = await page.evaluate(function (actors) {
      return actors.map(function (name) {
        var card = Array.from(document.querySelectorAll('#view-product .actor-card')).find(function (c) {
          return c.textContent.indexOf(name) >= 0;
        });
        if (!card) return { name: name, ok: false, reason: 'no card' };
        var img = card.querySelector('.actor-card-logo');
        var ph = card.querySelector('.actor-card-logo-fallback');
        var phVisible = ph && getComputedStyle(ph).display !== 'none';
        var initialsOnly = phVisible && (!img || getComputedStyle(img).display === 'none');
        return { name: name, ok: !!img && !initialsOnly, domain: window.SofincoActorDomainDefaults.resolve(name) };
      });
    }, ACTORS);

    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/actor-logos-missing-batch.png',
      fullPage: true
    });

    var failed = results.filter(function (r) { return !r.ok; });
    console.log('Missing actor logos UI test (local):\n');
    results.forEach(function (r) {
      console.log('  [' + (r.ok ? 'OK' : 'FAIL') + '] ' + r.name + ' → ' + (r.domain || r.reason));
    });
    if (failed.length) process.exit(1);
    console.log('\nAll checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
