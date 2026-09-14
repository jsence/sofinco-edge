#!/usr/bin/env node
/** Modal détail actualité — pas de redondance, ouverture depuis catégories (local). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CATS = [
  'produit_tarification',
  'commercial_communication',
  'strategie_corporate',
  'rse_juridique',
  'innovation_securite'
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
  var actualites = CATS.map(function (cat, i) {
    return {
      id: 'actu-' + cat,
      date: '2026-09-0' + (i + 1),
      acteur: 'Cofidis',
      type: 'Produit',
      produit: 'pb',
      categorie: cat,
      titre: 'Actu modal ' + cat,
      resume: 'Texte ' + cat,
      source: 'https://example.com/' + cat,
      impact: 'à surveiller',
      fiabilite: 'a_verifier'
    };
  });
  return {
    data: {
      produits: [{ id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites, indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
    domains: { Cofidis: 'cofidis.fr' },
    idByNom: {}, nomById: {}
  };
}

function modalFieldsOk () {
  var body = document.getElementById('detail-body');
  if (!body || body.querySelector('.actu-detail-badges')) return false;
  var text = body.textContent;
  var required = ['Acteur', 'Catégorie', 'Produit', 'Type', 'Impact', 'Fiabilité', 'Source'];
  for (var i = 0; i < required.length; i++) {
    if (text.indexOf(required[i]) < 0) return false;
  }
  var names = Array.from(body.querySelectorAll('.detail-ac-name')).map(function (el) { return el.textContent.trim(); });
  var seen = {};
  for (var j = 0; j < names.length; j++) {
    if (seen[names[j]]) return false;
    seen[names[j]] = 1;
  }
  return !!body.querySelector('.actu-detail-source a');
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.__testApplyLoadedData === 'function' &&
        document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

    for (var c = 0; c < CATS.length; c++) {
      var catId = CATS[c];
      await page.evaluate(function (id) {
        window.navigate(id);
        window.switchCategoryTab('actualites');
      }, catId);
      await page.waitForSelector('#view-category .actu-card');
      await page.evaluate(function () {
        document.querySelector('#view-category .actu-card').click();
      });
      await page.waitForSelector('#modal-detail.show');
      checks.push(['ouverture catégorie — ' + catId, await page.evaluate(modalFieldsOk)]);
      await page.click('#detail-close');
      await new Promise(function (r) { setTimeout(r, 250); });
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Actu detail modal test (local, no DB):\n');
  var failed = 0;
  checks.forEach(function (pair) {
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
    if (!pair[1]) failed++;
  });
  if (failed) {
    console.log('\n' + failed + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
