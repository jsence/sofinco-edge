#!/usr/bin/env node
/** Sources actualités — Sémaphore texte / URL sans protocole (local). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

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

function actu (id, source, titre) {
  return {
    id, date: '2026-09-02', acteur: 'Younited', type: 'Produit', produit: 'pb',
    categorie: 'produit_tarification', titre, resume: 'Résumé test', source
  };
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  const fixture = {
    data: {
      produits: [{ id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Younited'], sections: [] }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {},
      actualites: [
        actu('s1', 'Alerte Sémaphore, 12/08/2026', 'Actu Sémaphore'),
        actu('s2', 'younited.com/partners/fr/evenements', 'Actu Younited sans protocole'),
        actu('s3', 'https://www.cofidis.fr/offre', 'Actu URL valide')
      ],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Younited: 'Groupe', Cofidis: 'Groupe' },
    domains: {},
    idByNom: {}, nomById: {}
  };

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.__classifyActuSource === 'function' &&
        document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    checks.push(['classify — sémaphore', await page.evaluate(function () {
      return window.__classifyActuSource('Alerte Sémaphore, 01/09/2026').kind === 'semaphore';
    })]);
    checks.push(['classify — URL sans protocole', await page.evaluate(function () {
      var c = window.__classifyActuSource('younited.com/partners/fr/evenements');
      return c.kind === 'url' && c.href === 'https://younited.com/partners/fr/evenements';
    })]);
    checks.push(['classify — URL https inchangée', await page.evaluate(function () {
      var c = window.__classifyActuSource('https://www.cofidis.fr/x');
      return c.kind === 'url' && c.href === 'https://www.cofidis.fr/x';
    })]);

    await page.evaluate(function (f) { window.__testApplyLoadedData(f); window.__render(); }, fixture);
    await page.evaluate(function () { window.openActuDetail(0); });
    await page.waitForSelector('#modal-detail.show');
    checks.push(['modal Sémaphore — pas de lien', await page.evaluate(function () {
      var block = document.querySelector('#detail-body .actu-detail-source-block');
      return block && !block.querySelector('a') &&
        block.textContent.indexOf('Consulter sur Sémaphore') >= 0 &&
        block.textContent.indexOf('Alerte Sémaphore') >= 0;
    })]);
    await page.click('#detail-close');

    await page.evaluate(function () { window.openActuDetail(1); });
    await page.waitForSelector('#modal-detail.show');
    checks.push(['modal Younited — href https absolu', await page.evaluate(function () {
      var a = document.querySelector('#detail-body .actu-detail-source a');
      return a && a.getAttribute('href') === 'https://younited.com/partners/fr/evenements';
    })]);
    await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/actu-source-younited-fixed.png' });
    await page.click('#detail-close');

    await page.evaluate(function () { window.openActuDetail(2); });
    await page.waitForSelector('#modal-detail.show');
    checks.push(['modal Cofidis — lien https conservé', await page.evaluate(function () {
      var a = document.querySelector('#detail-body .actu-detail-source a');
      return a && a.getAttribute('href') === 'https://www.cofidis.fr/offre';
    })]);
    await page.click('#detail-close');

    await page.evaluate(function () { window.openActuDetail(0); });
    await page.waitForSelector('#modal-detail.show');
    await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/actu-source-semaphore-text.png' });
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Actu source display test (local, no DB):\n');
  var failed = 0;
  checks.forEach(function (pair) {
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
    if (!pair[1]) failed++;
  });
  if (failed) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
