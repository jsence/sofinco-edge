#!/usr/bin/env node
/** Garde-fou import ACTUALITES — parse uniquement, sans Supabase. */
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
      res.writeHead(200, { 'Content-Type': 'text/html' });
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
  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.__parseActualitesSheet === 'function';
    });
    const ok = await page.evaluate(function () {
      var rows = [
        ['Titre', 'Produit', 'Categorie', 'Source'],
        ['Sans routage', '', '', 'https://example.com/x']
      ];
      var parsed = window.__parseActualitesSheet(XLSX.utils.aoa_to_sheet(rows));
      return parsed.rows.length === 0 && parsed.skipped.length === 1 &&
        parsed.skipped[0].reason.indexOf('Catégorie et Produit vides') >= 0;
    });
    if (!ok) {
      console.error('FAIL');
      process.exit(1);
    }
    console.log('OK: ligne ACTUALITES sans catégorie ni produit rejetée avec message explicite.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
