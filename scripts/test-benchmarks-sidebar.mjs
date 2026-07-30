#!/usr/bin/env node
/**
 * Smoke test — benchmarks sidebar + onglets + indicateurs
 * Usage: node scripts/test-benchmarks-sidebar.mjs
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
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (_) {
    console.error('Install puppeteer first: npm install --no-save puppeteer');
    process.exit(1);
  }

  const { server, port } = await startServer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const base = 'http://127.0.0.1:' + port;

  await page.goto(base + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none' &&
      !document.getElementById('data-error').style.display.includes('flex');
  }, { timeout: 120000 });

  const checks = [];

  checks.push(['sidebar digital', await page.$('[data-nav="digital"]') !== null]);
  checks.push(['sidebar sav', await page.$('[data-nav="sav"]') !== null]);
  checks.push(['sidebar com', await page.$('[data-nav="com"]') !== null]);
  checks.push(['sidebar distribution', await page.$('[data-nav="distribution"]') !== null]);
  checks.push(['sidebar indicateurs', await page.$('[data-nav="indicateurs"]') !== null]);
  checks.push(['benchmarks label', await page.evaluate(function () {
    return Array.from(document.querySelectorAll('.sb-nav-label')).some(function (el) {
      return el.textContent.trim() === 'Benchmarks';
    });
  })]);

  checks.push(['digital tableau only', await page.evaluate(async function () {
    var hasProduct = window.DATA && window.DATA.produits &&
      window.DATA.produits.some(function (p) { return p.id === 'digital'; });
    if (!hasProduct) return true;
    window.navigate('digital');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.length === 1 && tabs[0] === 'Tableau';
  })]);

  checks.push(['digital no fiche button', await page.evaluate(async function () {
    window.navigate('digital');
    await new Promise(function (r) { setTimeout(r, 400); });
    return document.querySelectorAll('.ac-voir').length === 0;
  })]);

  checks.push(['indicateurs view', await page.evaluate(async function () {
    window.navigate('indicateurs');
    await new Promise(function (r) { setTimeout(r, 400); });
    return document.getElementById('view-indicateurs').classList.contains('active') &&
      document.querySelector('#view-indicateurs .section-hd') !== null;
  })]);

  checks.push(['cr tabs unchanged', await page.evaluate(async function () {
    window.navigate('cr');
    await new Promise(function (r) { setTimeout(r, 400); });
    var tabs = Array.from(document.querySelectorAll('.tab-btn')).map(function (b) { return b.textContent.trim(); });
    return tabs.indexOf('Différenciateurs') >= 0 && tabs.indexOf('Promos') >= 0 && tabs.indexOf('Actualités') >= 0;
  })]);

  await browser.close();
  server.close();

  console.log('Benchmarks sidebar smoke test:\n');
  let allOk = true;
  checks.forEach(function (c) {
    const status = c[1] ? 'OK' : 'FAIL';
    if (!c[1]) allOk = false;
    console.log('  [' + status + '] ' + c[0]);
  });

  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (err) {
  console.error(err);
  process.exit(1);
});
