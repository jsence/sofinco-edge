#!/usr/bin/env node
/**
 * Smoke responsive mobile — overflow horizontal + navigation burger (127.0.0.1, fixture).
 */
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

function buildFixture () {
  const CAT = 'produit_tarification';
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Sofinco', 'Cofidis'], sections: [{ title: 'Montant', rows: [{ critere: 'Min', values: { Sofinco: '500 €', Cofidis: '300 €' } }] }] },
        { id: 'cr', label: 'Crédit renouvelable', shortLabel: 'CR', excelSheet: 'CR', acteurs: ['Sofinco'], sections: [] },
        { id: 'nxcb', label: 'NxCB', excelSheet: 'NxCB', acteurs: ['Sofinco'], sections: [] },
        { id: 'rac', label: 'RAC', excelSheet: 'RAC', acteurs: ['Sofinco'], sections: [] },
        { id: 'carte', label: 'Carte', excelSheet: 'CARTE', acteurs: ['Sofinco'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {},
      tendances: {}, tendancesByCategorie: {}, taux: {},
      actualites: [{
        id: 'a1', date: '2026-09-10', acteur: 'Sofinco', type: 'Produit', produit: 'pb',
        categorie: CAT, titre: 'Actu mobile', resume: 'R', source: 'https://example.com', impact: 'neutre'
      }],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Sofinco: 'Nous', Cofidis: 'Groupe' },
    domains: {}, idByNom: {}, nomById: {}
  };
}

function hasOverflow () {
  var doc = document.documentElement;
  return doc.scrollWidth > doc.clientWidth + 2;
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(function () { return typeof window.__testApplyLoadedData === 'function'; }, { timeout: 60000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

    for (const nav of ['home', 'produit_tarification', 'pb']) {
      await page.evaluate(function (id) { window.navigate(id); }, nav);
      await new Promise(function (r) { setTimeout(r, 400); });
      checks.push(['pas overflow — ' + nav, await page.evaluate(hasOverflow) === false]);
    }

    await page.evaluate(function () { document.getElementById('burger').click(); });
    checks.push(['sidebar open', await page.evaluate(function () {
      return document.getElementById('sidebar').classList.contains('open');
    })]);
    await page.evaluate(function () {
      document.querySelector('[data-nav="cr"]').click();
    });
    await page.waitForFunction(function () {
      return document.querySelector('[data-nav="cr"]').classList.contains('active') &&
        document.getElementById('view-product').classList.contains('active');
    }, { timeout: 8000 });
    checks.push(['sidebar fermée après nav', await page.evaluate(function () {
      return !document.getElementById('sidebar').classList.contains('open');
    })]);
    checks.push(['nav cr active', await page.evaluate(function () {
      return document.querySelector('[data-nav="cr"]').classList.contains('active');
    })]);

    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(function () { window.navigate('home'); });
    await new Promise(function (r) { setTimeout(r, 300); });
    checks.push(['desktop home — pas overflow', await page.evaluate(hasOverflow) === false]);

    console.log('Mobile responsive UI test:\n');
    var failed = 0;
    checks.forEach(function (c) {
      console.log('  [' + (c[1] ? 'OK' : 'FAIL') + '] ' + c[0]);
      if (!c[1]) failed++;
    });
    if (failed) process.exit(1);
    console.log('\nAll checks passed.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
