#!/usr/bin/env node
/** Alignement bandeau sidebar / topbar — local, sans DB. */
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
      const types = { '.html': 'text/html', '.js': 'application/javascript' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server, port: server.address().port });
    });
  });
}

function measureAlign () {
  var logo = document.querySelector('.sb-logo');
  var topbar = document.getElementById('topbar');
  if (!logo || !topbar) return { ok: false, reason: 'missing nodes' };
  var l = logo.getBoundingClientRect();
  var t = topbar.getBoundingClientRect();
  var tol = 1.5;
  return {
    ok: Math.abs(l.top - t.top) <= tol &&
      Math.abs(l.height - t.height) <= tol &&
      Math.abs(l.bottom - t.bottom) <= tol,
    top: l.top,
    height: l.height,
    topbarHeight: t.height
  };
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    const pages = [
      { nav: 'home', label: 'Accueil' },
      { nav: 'produit_tarification', label: 'catégorie P&T' },
      { nav: 'commercial_communication', label: 'catégorie C&C' },
      { nav: 'pb', label: 'produit PB' },
      { nav: 'cr', label: 'produit CR' },
      { nav: 'innovation_securite', label: 'catégorie I&S' }
    ];

    for (const p of pages) {
      await page.evaluate(function (id) { window.navigate(id); }, p.nav);
      await new Promise(function (r) { setTimeout(r, 450); });
      checks.push(['align desktop — ' + p.label, await page.evaluate(measureAlign).then(function (m) { return m.ok; })]);
    }

    checks.push(['hauteur partagée 54px', await page.evaluate(function () {
      var logo = document.querySelector('.sb-logo');
      var topbar = document.getElementById('topbar');
      var h = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-bar-height'));
      if (!h) h = 54;
      return Math.abs(logo.getBoundingClientRect().height - h) < 1.5 &&
        Math.abs(topbar.getBoundingClientRect().height - h) < 1.5;
    })]);

    await page.setViewport({ width: 900, height: 700 });
    await page.evaluate(function () { window.navigate('home'); });
    await new Promise(function (r) { setTimeout(r, 400); });
    checks.push(['responsive 900px — topbar hauteur stable', await page.evaluate(function () {
      var topbar = document.getElementById('topbar');
      var burger = document.getElementById('burger');
      return topbar.getBoundingClientRect().height >= 52 &&
        topbar.getBoundingClientRect().height <= 56 &&
        window.getComputedStyle(burger).display !== 'none';
    })]);

    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-product').classList.contains('active') &&
        document.getElementById('topbar-title').textContent.trim().length > 0;
    }, { timeout: 15000 });
    await new Promise(function (r) { setTimeout(r, 400); });
    checks.push(['responsive 390px — layout mobile', await page.evaluate(function () {
      var main = document.getElementById('main');
      var topbar = document.getElementById('topbar');
      var burger = document.getElementById('burger');
      var mainRect = main.getBoundingClientRect();
      var topH = topbar.getBoundingClientRect().height;
      return mainRect.width > 280 &&
        topH >= 52 && topH <= 56 &&
        window.getComputedStyle(burger).display !== 'none' &&
        document.getElementById('topbar-title').textContent.trim().length > 0;
    })]);

    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(function () {
      document.getElementById('sidebar').classList.add('open');
      window.navigate('strategie_corporate');
    });
    await new Promise(function (r) { setTimeout(r, 400); });
    checks.push(['sidebar ouverte mobile overlay — align', await page.evaluate(measureAlign).then(function (m) { return m.ok; })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Header alignment test (local, no DB):\n');
  var failed = 0;
  checks.forEach(function (pair) {
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
    if (!pair[1]) failed++;
  });
  if (failed) {
    console.log('\n' + failed + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
