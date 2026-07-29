#!/usr/bin/env node
/**
 * Smoke test — toggle import Taux & Promos + parsing JSON
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCESS_CODE = 'SOFINCO2026';

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
      const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' };
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

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const checks = [];

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.waitForSelector('#modal-contributeur.show');
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden');
  });
  await page.click('#contrib-goto-json');

  checks.push(['import mode tabs present', await page.evaluate(function () {
    return !!document.getElementById('contrib-import-mode-actu') &&
      !!document.getElementById('contrib-import-mode-taux');
  })]);

  await page.click('#contrib-import-mode-taux');
  checks.push(['taux mode active', await page.evaluate(function () {
    return document.getElementById('contrib-import-mode-taux').classList.contains('active');
  })]);

  const sampleJson = JSON.stringify({
    promos: [{
      produit_id: 'cr',
      acteur_id: 'cofidis',
      taux: '0 %',
      duree: '12 mois',
      montant: '3 000 €',
      date_fin: '31/12/2026',
      canal: 'web',
      lien: 'https://example.com'
    }],
    taux: [{
      acteur_id: 'cofidis',
      produit_nom: 'Test produit',
      categorie: 'financiere',
      rows: [{ tranche: '', b1: 0.1, b1v: 0, b2: null, b2v: null, b3: null, b3v: null }],
      commentaire: ''
    }]
  });

  await page.evaluate(function (json) {
    document.getElementById('contrib-bulk-json').value = json;
    document.getElementById('contrib-bulk-drop-zone').classList.add('contrib-json-editing');
  }, sampleJson);
  await page.click('#contrib-bulk-analyze');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-bulk-review').classList.contains('contrib-step-hidden');
  });

  checks.push(['subtabs visible after analyze', await page.evaluate(function () {
    var el = document.getElementById('contrib-bulk-subtabs');
    return el && !el.classList.contains('contrib-step-hidden');
  })]);

  checks.push(['promo row parsed', await page.evaluate(function () {
    return document.querySelector('#contrib-bulk-table-wrap tbody tr') !== null;
  })]);

  await page.click('#contrib-bulk-tab-taux');
  await page.waitForFunction(function () {
    var ths = document.querySelectorAll('#contrib-bulk-table-wrap th');
    for (var i = 0; i < ths.length; i++) {
      if (ths[i].textContent.indexOf('Produit nom') >= 0) return true;
    }
    return false;
  }, { timeout: 5000 });

  checks.push(['taux tab renders', await page.evaluate(function () {
    var ths = document.querySelectorAll('#contrib-bulk-table-wrap th');
    for (var i = 0; i < ths.length; i++) {
      if (ths[i].textContent.indexOf('Produit nom') >= 0) return true;
    }
    return false;
  })]);

  await browser.close();
  server.close();

  console.log('Contributor Taux & Promos smoke test:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    var ok = pair[1];
    if (!ok) allOk = false;
    console.log('  [' + (ok ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
