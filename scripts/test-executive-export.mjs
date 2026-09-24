#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, '.executive-export-artifacts');

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
  const CAT = 'produit_tarification';
  return {
    data: {
      produits: [{
        id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB',
        acteurs: ['Sofinco', 'Cofidis'],
        sections: [{ title: 'Montant', rows: [{ critere: 'Min', values: { Sofinco: '500 €', Cofidis: '' } }] }]
      }],
      promos: { pb: [{ actor: 'Sofinco', taux: '0 %', duree: '12 mois' }, { actor: 'Cofidis', taux: '1,5 %', duree: '10 mois' }] },
      differenciateurs: { pb: { Sofinco: { difference: 'D1', pourquoi: 'P1', conclusion: 'C1' }, Cofidis: { difference: '', pourquoi: '', conclusion: '' } } },
      differenciateursByCategorie: { [CAT]: { Cofidis: { difference: 'Diff cat', pourquoi: 'Pourquoi', conclusion: 'Concl' } } },
      tendances: { pb: [{ titre: 'Tendance PB', description: 'Message clé exécutif.', acteurs: ['Sofinco'] }] },
      tendancesByCategorie: { [CAT]: [{ titre: 'Décryptage cat', description: 'Synthèse catégorie.', acteurs: ['Cofidis'], produit: 'pb' }] },
      taux: {},
      actualites: [
        { id: '1', date: '2026-09-10', acteur: 'Cofidis', type: 'Produit', produit: 'pb', categorie: CAT, titre: 'Menace test', impact: 'menace directe', source: 'https://example.com/a' },
        { id: '2', date: '2026-09-05', acteur: 'Sofinco', type: 'Produit', produit: 'pb', categorie: CAT, titre: 'Actu neutre', impact: 'neutre', source: '' }
      ],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Sofinco: 'Nous', Cofidis: 'Groupe' },
    domains: { Sofinco: 'sofinco.fr', Cofidis: 'cofidis.fr' },
    idByNom: {}, nomById: {}
  };
}

async function run () {
  const puppeteer = require('puppeteer');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox'],
    protocolTimeout: 300000
  });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: outDir });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(function () { return typeof window.__testApplyLoadedData === 'function'; });
  await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

  const cases = [
    ['PB', 'product', 'xlsx', '.xlsx'],
    ['PB', 'product', 'word', '.docx'],
    ['PB', 'product', 'pptx', '.pptx'],
    ['Cat', 'category', 'xlsx', '.xlsx'],
    ['Cat', 'category', 'word', '.docx'],
    ['Cat', 'category', 'pptx', '.pptx']
  ];

  const results = [];
  const artifactDir = '/opt/cursor/artifacts/executive-export';
  fs.mkdirSync(artifactDir, { recursive: true });

  for (const c of cases) {
    await page.evaluate(function (scope) {
      if (scope === 'category') window.navigate('produit_tarification');
      else window.navigate('pb');
    }, c[1]);
    await new Promise(function (r) { setTimeout(r, 400); });
    await page.evaluate(function (scope, format) {
      return window.__testRunExecutiveExport(scope, format);
    }, c[1], c[2]);
    await new Promise(function (r) { setTimeout(r, 5000); });
    const files = fs.readdirSync(outDir).filter(function (f) { return f.endsWith(c[3]); });
    files.forEach(function (f) {
      fs.copyFileSync(path.join(outDir, f), path.join(artifactDir, f));
    });
    results.push([c[0] + ' ' + c[2], files]);
  }

  await browser.close();
  server.close();

  console.log('Artifacts:', outDir, '\n');
  var failed = false;
  results.forEach(function (r) {
    console.log(' [' + (r[1].length ? 'OK' : 'FAIL') + ']', r[0], r[1].join(', ') || '—');
    if (!r[1].length) failed = true;
  });
  if (failed) process.exit(1);
}

run().catch(function (e) { console.error(e); process.exit(1); });
