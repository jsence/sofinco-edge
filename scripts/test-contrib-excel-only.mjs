#!/usr/bin/env node
/**
 * Smoke test — espace contributeur : import Excel uniquement (parse workbook)
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
  const XLSX = require('xlsx');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('dialog', async function (d) { await d.accept(); });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Critère', 'Sofinco', 'Cofidis'],
    ['Montant min', '500 €', '300 €']
  ]), 'PB');
  const xlsxPath = path.join(root, '.tmp-contrib-test.xlsx');
  XLSX.writeFile(wb, xlsxPath);

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-step-excel').classList.contains('contrib-step-hidden');
  });

  const input = await page.$('#file-input');
  await input.uploadFile(xlsxPath);

  await page.waitForFunction(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  }, { timeout: 120000 });

  const checks = [];
  checks.push(['import result modal shown', await page.evaluate(function () {
    return document.getElementById('modal-import-result').classList.contains('show');
  })]);
  checks.push(['import result message present', await page.evaluate(function () {
    var msg = document.getElementById('import-result-msg');
    return msg && msg.textContent && msg.textContent.indexOf('Import terminé') >= 0;
  })]);

  fs.unlinkSync(xlsxPath);
  await browser.close();
  server.close();

  console.log('Contributor Excel-only smoke test:\n');
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
