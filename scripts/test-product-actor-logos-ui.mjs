#!/usr/bin/env node
/**
 * Test logos acteurs sur fiches produit — fixture locale, sans Supabase.
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
  return {
    data: {
      produits: [{
        id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB',
        acteurs: ['Sofinco', 'Cofidis', 'Cetelem'],
        sections: [{ title: 'Offre', rows: [{ critere: 'Nom', values: { Sofinco: 'A', Cofidis: 'B', Cetelem: 'C' } }] }]
      }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites: [{
        id: '1', date: '2026-09-02', acteur: 'Cofidis', type: 'Produit', produit: 'pb',
        categorie: 'produit_tarification', titre: 'Actu test logos', resume: '', source: ''
      }],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Sofinco: 'Nous', Cofidis: 'Groupe', Cetelem: 'Groupe' },
    domains: { Sofinco: 'sofinco.fr', Cofidis: 'cofidis.fr', Cetelem: 'cetelem.fr' },
    idByNom: {}, nomById: {}
  };
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
    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForSelector('#view-product .actor-card');
    await new Promise(function (r) { setTimeout(r, 2500); });

    checks.push(['cartes acteur — logo img présent (34px)', await page.evaluate(function () {
      var cards = Array.from(document.querySelectorAll('#view-product .actor-card'));
      return cards.length === 3 && cards.every(function (card) {
        var img = card.querySelector('.actor-card-logo');
        var ph = card.querySelector('.actor-card-logo-fallback');
        if (!img || !ph) return false;
        var w = parseFloat(window.getComputedStyle(img).width);
        return w >= 30 && getComputedStyle(ph).display === 'none';
      });
    })]);

    checks.push(['cartes acteur — pas de classe badge actu', await page.evaluate(function () {
      return document.querySelectorAll('#view-product .actu-badge-actor').length === 0;
    })]);

    await page.evaluate(function () {
      document.querySelector('#view-product .actor-card').click();
    });
    await page.waitForSelector('#modal-detail.show');
    checks.push(['fiche modal — logo fiche-favicon', await page.evaluate(function () {
      var img = document.querySelector('#modal-detail .fiche-favicon');
      var ph = document.querySelector('#modal-detail .fiche-placeholder');
      return !!img && !!ph && parseFloat(getComputedStyle(img).width) >= 48;
    })]);
    await page.click('#detail-close');

    await page.evaluate(function () { window.navigate('home'); });
    await page.waitForFunction(function () {
      return document.body.textContent.indexOf('Actu test logos') >= 0;
    });
    checks.push(['badge actu — logo compact séparé', await page.evaluate(function () {
      var badge = document.querySelector('.actu-badge-actor');
      if (!badge) return false;
      var img = badge.querySelector('.actu-badge-logo');
      var w = img ? parseFloat(getComputedStyle(img).width) : 0;
      return w > 0 && w <= 22;
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Product actor logos UI test (local, no DB):\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
