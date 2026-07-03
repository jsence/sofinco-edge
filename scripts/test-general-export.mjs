#!/usr/bin/env node
/**
 * Smoke test — export généraliste (Excel / Word / PowerPoint)
 * Usage: node scripts/test-general-export.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const downloadDir = path.join(root, '.export-test-out');

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
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    console.error('Install puppeteer first: npm install --no-save puppeteer');
    process.exit(1);
  }

  fs.rmSync(downloadDir, { recursive: true, force: true });
  fs.mkdirSync(downloadDir, { recursive: true });

  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const client = await page.createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadDir
  });

  page.on('dialog', async function (dialog) {
    await dialog.accept();
  });

  const base = 'http://127.0.0.1:' + port;
  await page.goto(base + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });

  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none' &&
      !document.getElementById('data-error').style.display.includes('flex');
  }, { timeout: 120000 });

  const formats = ['xlsx', 'docx', 'pptx'];
  const results = [];

  for (const format of formats) {
    fs.readdirSync(downloadDir).forEach(function (f) { fs.unlinkSync(path.join(downloadDir, f)); });

    await page.evaluate(function () { window.openGeneralExportModal(); });
    await page.waitForSelector('#modal-export-general.show');

    await page.click('.export-format-card[data-format="' + format + '"]');

    await page.evaluate(function () {
      function setChecked(cb, val) {
        cb.checked = val;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.querySelectorAll('#export-general-products input[data-product]').forEach(function (cb) {
        setChecked(cb, cb.getAttribute('data-product') === 'cr');
      });
      document.querySelectorAll('#export-general-sections input[data-section]').forEach(function (cb) {
        setChecked(cb, cb.getAttribute('data-section') === 'tableau' || cb.getAttribute('data-section') === 'promos');
      });
    });

    await page.click('#export-general-confirm');

    await page.waitForFunction(function () {
      return !document.getElementById('export-general-confirm').classList.contains('is-loading');
    }, { timeout: 60000 });

    await new Promise(function (r) { setTimeout(r, 2500); });
    const files = fs.readdirSync(downloadDir).filter(function (f) { return f.endsWith('.' + format); });
    results.push({ format, ok: files.length > 0, files });
  }

  await browser.close();
  server.close();

  console.log('Export smoke test (1 produit CR, sections Tableau + Promos):\n');
  let allOk = true;
  results.forEach(function (r) {
    const status = r.ok ? 'OK' : 'FAIL';
    if (!r.ok) allOk = false;
    console.log('  [' + status + '] ' + r.format + (r.files.length ? ' → ' + r.files.join(', ') : ''));
  });

  if (!allOk) process.exit(1);
  console.log('\nAll export formats generated successfully.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
