#!/usr/bin/env node
/** Capture alignement headers sidebar / topbar (local). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = process.argv[2] || '/opt/cursor/artifacts/screenshots';

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

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const shots = [
    { nav: 'home', file: 'header-align-home.png' },
    { nav: 'produit_tarification', file: 'header-align-category.png' },
    { nav: 'pb', file: 'header-align-product.png' }
  ];

  await page.setViewport({ width: 1280, height: 520 });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  for (const s of shots) {
    await page.evaluate(function (id) { window.navigate(id); }, s.nav);
    await new Promise(function (r) { setTimeout(r, 500); });
    const clip = { x: 0, y: 0, width: 1280, height: 120 };
    await page.screenshot({ path: path.join(outDir, s.file), clip });
    console.log('  wrote', s.file);
  }

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
