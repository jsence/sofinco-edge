#!/usr/bin/env node
/**
 * Smoke test — import JSON groupé hétérogène (type par entrée)
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

  const sampleJson = JSON.stringify([
    {
      type: 'actualite',
      acteur: 'Cofidis',
      produit: 'pb',
      actualite_type: 'Produit',
      titre: 'Test actu',
      resume: 'Résumé',
      source: 'https://example.com'
    },
    {
      type: 'promo',
      produit_id: 'cr',
      acteur_id: 'cofidis',
      taux: '0 %',
      duree: '12 mois',
      date_fin: '31/12/2026'
    },
    {
      type: 'differenciateur',
      produit_id: 'cr',
      acteur_id: 'cofidis',
      difference: 'Diff test',
      pourquoi: 'Pourquoi',
      conclusion: 'Conclusion'
    }
  ]);

  await page.evaluate(function (json) {
    document.getElementById('contrib-bulk-json').value = json;
    document.getElementById('contrib-bulk-drop-zone').classList.add('contrib-json-editing');
  }, sampleJson);
  await page.click('#contrib-bulk-analyze');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-bulk-review').classList.contains('contrib-step-hidden');
  });

  checks.push(['three mixed rows parsed', await page.evaluate(function () {
    return document.querySelectorAll('#contrib-bulk-table-wrap tbody tr').length === 3;
  })]);

  checks.push(['type badges visible', await page.evaluate(function () {
    var text = document.getElementById('contrib-bulk-table-wrap').textContent;
    return text.indexOf('Actualité') >= 0 && text.indexOf('Promo') >= 0 &&
      text.indexOf('Différenciateur') >= 0;
  })]);

  checks.push(['taux type rejected', await page.evaluate(function () {
    document.getElementById('contrib-bulk-json').value = '[{"type":"taux","acteur_id":"cofidis"}]';
    document.getElementById('contrib-bulk-parse-error').style.display = 'none';
    document.getElementById('contrib-bulk-analyze').click();
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(
          document.getElementById('contrib-bulk-parse-error').style.display === 'block' &&
          document.getElementById('contrib-bulk-parse-error').textContent.indexOf('type manquant') >= 0
        );
      }, 50);
    });
  })]);

  await browser.close();
  server.close();

  console.log('Contributor mixed JSON import smoke test:\n');
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
