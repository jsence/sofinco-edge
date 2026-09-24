#!/usr/bin/env node
/**
 * Écran code d'accès — premier accès, rechargement, contexte isolé (local).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const GATE_TOKEN = 'ba2f4afe07f6ff7bb9d6ab3f66edb823a9fa2151a801de59d66372e0d9f091d6';
const VALID_CODE = 'EDGE-2026-SFC';

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
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const base = 'http://127.0.0.1:' + port + '/index.html?enforceAccessGate=1';
  const checks = [];

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

  try {
    // 1) Premier accès — gate visible
    const ctx1 = await browser.createBrowserContext();
    const page1 = await ctx1.newPage();
    await page1.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
    checks.push(['premier accès — écran code visible', await page1.evaluate(function () {
      var g = document.getElementById('access-gate');
      return g && !g.hidden && document.body.classList.contains('access-locked');
    })]);
    await page1.screenshot({ path: '/opt/cursor/artifacts/screenshots/access-gate-first-visit.png' });

    // Mauvais code
    await page1.type('#access-gate-input', 'WRONG-CODE');
    await page1.evaluate(function () { document.getElementById('access-gate-form').requestSubmit(); });
    await page1.waitForFunction(function () {
      var e = document.getElementById('access-gate-error');
      return e && !e.hidden && e.textContent.indexOf('incorrect') >= 0;
    });
    checks.push(['code incorrect — pas d\'accès app', await page1.evaluate(function () {
      var err = document.getElementById('access-gate-error');
      return err && err.textContent.indexOf('incorrect') >= 0 &&
        document.body.classList.contains('access-locked') &&
        !document.getElementById('access-gate').hidden;
    })]);

    await page1.evaluate(function () {
      document.getElementById('access-gate-input').value = '';
    });
    await page1.type('#access-gate-input', VALID_CODE);
    await page1.evaluate(function () { document.getElementById('access-gate-form').requestSubmit(); });
    await page1.waitForFunction(function () {
      return document.getElementById('access-gate').hidden &&
        !document.body.classList.contains('access-locked');
    }, { timeout: 60000 });
    await page1.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });
    checks.push(['code valide — application chargée', await page1.evaluate(function () {
      return document.querySelector('.sb-logo-text') !== null;
    })]);

    // 2) Rechargement — pas redemandé
    await page1.reload({ waitUntil: 'domcontentloaded' });
    await page1.waitForFunction(function () {
      return document.getElementById('access-gate').hidden;
    }, { timeout: 5000 });
    checks.push(['rechargement — pas de nouvel écran', await page1.evaluate(function () {
      return document.getElementById('access-gate').hidden &&
        document.querySelector('#view-home') !== null;
    })]);
    await ctx1.close();

    // 3) Contexte isolé (équivalent navigation privée)
    const ctx2 = await browser.createBrowserContext();
    const page2 = await ctx2.newPage();
    await page2.goto(base, { waitUntil: 'domcontentloaded' });
    checks.push(['contexte isolé — code redemandé', await page2.evaluate(function () {
      var g = document.getElementById('access-gate');
      return g && !g.hidden;
    })]);
    await ctx2.close();

    // Régression rapide avec token pré-enregistré (comme utilisateur connu)
    const page3 = await browser.newPage();
    await page3.evaluateOnNewDocument(function (token) {
      localStorage.setItem('sofinco_edge_gate_v1', token);
    }, GATE_TOKEN);
    await page3.goto(base, { waitUntil: 'networkidle2', timeout: 120000 });
    await page3.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none' &&
        typeof window.navigate === 'function';
    }, { timeout: 120000 });
    await page3.evaluate(function () { window.navigate('home'); });
    checks.push(['régression — navigation après déverrouillage', await page3.evaluate(function () {
      return document.getElementById('view-home').classList.contains('active');
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Access gate UI test (local):\n');
  var failed = 0;
  checks.forEach(function (pair) {
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
    if (!pair[1]) failed++;
  });
  if (failed) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
