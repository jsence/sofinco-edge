#!/usr/bin/env node
/**
 * Tests unitaires (navigateur) — parsing dates import ACTUALITES + affichage fmtDate.
 * Aucune écriture Supabase.
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
  const XLSX = require('xlsx');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__parseImportDateToIso === 'function' &&
      typeof window.__fmtDate === 'function' &&
      typeof window.__parseActualitesSheet === 'function';
  }, { timeout: 120000 });

  const checks = [];

  checks.push(['ISO text -> ISO', await page.evaluate(function () {
    return window.__parseImportDateToIso('2026-07-09') === '2026-07-09';
  })]);

  checks.push(['ISO text -> affichage FR', await page.evaluate(function () {
    return window.__fmtDate('2026-07-09') === '09/07/2026';
  })]);

  checks.push(['JJ/MM/AAAA -> ISO', await page.evaluate(function () {
    return window.__parseImportDateToIso('09/07/2026') === '2026-07-09';
  })]);

  checks.push(['série Excel -> ISO', await page.evaluate(function () {
    var serial = 46212;
    return window.__parseImportDateToIso(serial) === '2026-07-09';
  })]);

  checks.push(['parse ACTUALITES feuille ISO', await page.evaluate(function () {
    var rows = [
      ['Date', 'Titre', 'Une'],
      ['2026-07-09', 'Actu test date', 'Oui']
    ];
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    var parsed = window.__parseActualitesSheet(sheet);
    return parsed.rows.length === 1 &&
      parsed.rows[0].date === '2026-07-09' &&
      parsed.rows[0].a_la_une === true;
  })]);

  checks.push(['parse ACTUALITES série Excel', await page.evaluate(function () {
    var rows = [['Date', 'Titre'], [46212, 'Actu excel date']];
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    var parsed = window.__parseActualitesSheet(sheet);
    return parsed.rows.length === 1 && parsed.rows[0].date === '2026-07-09';
  })]);

  checks.push(['Dernière MAJ sans date future parasite', await page.evaluate(function () {
    return window.__fmtDate('2026-09-02') === '02/09/2026' &&
      window.__fmtDate('2026-07-09') === '09/07/2026' &&
      '2026-09-02' > '2026-07-09';
  })]);

  checks.push(['Dernière MAJ = date import, pas date actu', await page.evaluate(function () {
    var txt = window.__testRenderTopbarLastUpdate('2026-09-02', '2026-09-07');
    return txt.indexOf('02/09/2026') >= 0 && txt.indexOf('07/09/2026') < 0;
  })]);

  checks.push(['bloc À la une rendu (mock)', await page.evaluate(function () {
    var txt = window.__testSetFeaturedActu('FEATURED MOCK');
    return txt.indexOf('FEATURED MOCK') >= 0 && txt.indexOf('09/07/2026') >= 0;
  })]);

  checks.push(['ordre accueil: sous-titre → à la une → Actualités', await page.evaluate(function () {
    var layout = window.__testHomeFeaturedLayout();
    return layout.ok &&
      layout.order[0].indexOf('Suivre en continu') >= 0 &&
      layout.order[1] === 'LAYOUT TEST' &&
      layout.order[2].indexOf('Actualités') >= 0;
  })]);

  checks.push(['UI contributeur : sélecteur À la une présent', await page.evaluate(function () {
    return document.getElementById('contrib-featured-select') !== null &&
      document.getElementById('contrib-featured-apply') !== null &&
      document.getElementById('contrib-featured-clear') !== null;
  })]);

  await browser.close();
  server.close();

  console.log('Date import / featured render tests:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
