#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = '/opt/cursor/artifacts/screenshots';
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
      const types = { '.html': 'text/html', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server, port: server.address().port });
    });
  });
}

async function openExcel (page) {
  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForSelector('#contrib-step-hub:not(.contrib-step-hidden)');
  await page.click('#contrib-goto-excel');
  await page.waitForSelector('#contrib-step-excel:not(.contrib-step-hidden)');
}

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 780 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const badPath = path.join(root, '.tmp-cap-bad.xlsx');
  fs.writeFileSync(badPath, 'not-a-valid-xlsx');
  await openExcel(page);
  await (await page.$('#file-input')).uploadFile(badPath);
  await page.waitForSelector('#contrib-import-progress[data-import-state="error"]');
  await page.screenshot({ path: path.join(outDir, 'import-progress-error.png') });

  await page.evaluate(function () {
    globalThis.__IMPORT_PROGRESS_THROTTLE_MS = 450;
    window.resetImportProgressUI();
    window.beginImportProgressUI('capture-demo.xlsx');
    window.advanceImportProgressStep('read', 'Lecture du fichier Excel…', 12);
    window.completeImportProgressStep('read');
    window.advanceImportProgressStep('parse', 'Analyse des onglets Excel…', 38);
  });
  await new Promise(function (r) { setTimeout(r, 500); });
  await page.screenshot({ path: path.join(outDir, 'import-progress-running.png') });

  await page.evaluate(function () { return window.__testImportProgressDemo(); });
  await page.waitForSelector('#modal-import-result.show');
  await page.screenshot({ path: path.join(outDir, 'import-progress-success-summary.png') });

  fs.unlinkSync(badPath);
  await browser.close();
  server.close();
  console.log('Screenshots saved to', outDir);
}

run().catch(function (e) { console.error(e); process.exit(1); });
