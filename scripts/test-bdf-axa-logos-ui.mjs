#!/usr/bin/env node
/** Logos Banque de France & AXA Banque — fixture locale. */
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
        acteurs: ['Sofinco', 'Banque de France', 'AXA Banque', 'Cofidis'],
        sections: [{ title: 'Offre', rows: [{ critere: 'Test', values: { Sofinco: '1', 'Banque de France': '2', 'AXA Banque': '3', Cofidis: '4' } }] }]
      }],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites: [{
        id: '1', date: '2026-09-02', acteur: 'Banque de France', type: 'Corporate', produit: 'pb',
        categorie: 'produit_tarification', titre: 'Actu BDF logo', resume: '', source: ''
      }],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Sofinco: 'Nous', Cofidis: 'Groupe' },
    domains: {},
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
    await new Promise(function (r) { setTimeout(r, 3000); });

    checks.push(['Banque de France — logo (pas initiales BA)', await page.evaluate(function () {
      var card = Array.from(document.querySelectorAll('#view-product .actor-card')).find(function (c) {
        return c.textContent.indexOf('Banque de France') >= 0;
      });
      if (!card) return false;
      var ph = card.querySelector('.actor-card-logo-fallback');
      if (ph && getComputedStyle(ph).display !== 'none' && ph.textContent.trim() === 'BA') return false;
      var img = card.querySelector('.actor-card-logo');
      return !!img && parseFloat(getComputedStyle(img).width) >= 28;
    })]);

    checks.push(['AXA Banque — logo (pas initiales AX)', await page.evaluate(function () {
      var card = Array.from(document.querySelectorAll('#view-product .actor-card')).find(function (c) {
        return c.textContent.indexOf('AXA Banque') >= 0;
      });
      if (!card) return false;
      var ph = card.querySelector('.actor-card-logo-fallback');
      if (ph && getComputedStyle(ph).display !== 'none' && ph.textContent.trim() === 'AX') return false;
      var img = card.querySelector('.actor-card-logo');
      return !!img && parseFloat(getComputedStyle(img).width) >= 28;
    })]);

    checks.push(['Cofidis — logo inchangé', await page.evaluate(function () {
      var card = Array.from(document.querySelectorAll('#view-product .actor-card')).find(function (c) {
        return c.textContent.indexOf('Cofidis') >= 0;
      });
      if (!card) return false;
      var img = card.querySelector('.actor-card-logo');
      var ph = card.querySelector('.actor-card-logo-fallback');
      return !!img && !!ph && getComputedStyle(ph).display === 'none' && parseFloat(getComputedStyle(img).width) >= 28;
    })]);

    checks.push(['domaines défaut JS', await page.evaluate(function () {
      var D = window.SofincoActorDomainDefaults;
      return D.resolve('Banque de France') === 'banque-france.fr' &&
        D.resolve('AXA Banque') === 'axabanque.fr';
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('BDF / AXA logos test (local, no DB):\n');
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
