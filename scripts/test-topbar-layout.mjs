#!/usr/bin/env node
/**
 * Smoke test — topbar contributeur + sidebar export simplifiée
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
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  var checks = [];

  checks.push(['btn-contributeur in topbar', await page.evaluate(function () {
    return !!document.querySelector('#topbar #btn-contributeur');
  })]);

  checks.push(['btn-contributeur not in sidebar', await page.evaluate(function () {
    return !document.querySelector('#sidebar #btn-contributeur');
  })]);

  checks.push(['sidebar has only export button', await page.evaluate(function () {
    return document.querySelectorAll('.sb-footer .btn').length === 1 &&
      !!document.getElementById('btn-export-general');
  })]);

  checks.push(['no sidebar section labels', await page.evaluate(function () {
    return document.querySelectorAll('.sb-footer-label').length === 0;
  })]);

  checks.push(['last update indicator present', await page.evaluate(function () {
    var el = document.getElementById('topbar-last-update');
    return el && el.textContent.indexOf('Dernière mise à jour') === 0;
  })]);

  await page.evaluate(function () { navigate('pb'); });
  await page.waitForFunction(function () {
    return document.getElementById('topbar-title').textContent.length > 0;
  });

  checks.push(['topbar meta on product page', await page.evaluate(function () {
    return !!document.querySelector('#topbar #btn-contributeur') &&
      document.getElementById('topbar-last-update').textContent.indexOf('Dernière mise à jour') === 0;
  })]);

  await browser.close();
  server.close();

  console.log('Topbar layout smoke test:\n');
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
