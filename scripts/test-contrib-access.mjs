#!/usr/bin/env node
/**
 * Smoke test — accès contributeur protégé + session unlock
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

function visible (id) {
  return 'document.getElementById("' + id + '") && !document.getElementById("' + id + '").classList.contains("contrib-step-hidden")';
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('dialog', async function (d) { await d.accept(); });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  const checks = [];

  checks.push(['btn-import absent', await page.evaluate(function () {
    return document.getElementById('btn-import') === null;
  })]);

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.waitForSelector('#modal-contributeur.show');

  checks.push(['access step visible on open', await page.evaluate(function () {
    return !document.getElementById('contrib-step-access').classList.contains('contrib-step-hidden');
  })]);

  checks.push(['excel step hidden without code', await page.evaluate(function () {
    return document.getElementById('contrib-step-excel').classList.contains('contrib-step-hidden');
  })]);

  await page.type('#contrib-access-code', ACCESS_CODE);
  await page.click('#contrib-access-submit');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden');
  });

  checks.push(['hub visible after code', await page.evaluate(function () {
    return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden') &&
      document.getElementById('contrib-step-access').classList.contains('contrib-step-hidden');
  })]);

  await page.waitForFunction(function () {
    var hub = document.getElementById('contrib-step-hub');
    var box = document.getElementById('contrib-undo-box');
    return hub && box && hub.contains(box);
  }, { timeout: 15000 });

  checks.push(['undo box dans le hub contributeur', await page.evaluate(function () {
    var hub = document.getElementById('contrib-step-hub');
    var box = document.getElementById('contrib-undo-box');
    return hub && box && hub.contains(box);
  })]);

  checks.push(['undo rafraîchi sur le hub', await page.evaluate(function () {
    var box = document.getElementById('contrib-undo-box');
    var btn = document.getElementById('contrib-undo-import');
    if (!box || !btn) return false;
    if (box.style.display === 'none' && btn.disabled) return true;
    if (box.style.display !== 'none' && !btn.disabled) return true;
    return box.style.display !== 'none' && btn.disabled;
  })]);

  await page.click('#contrib-goto-excel');
  await page.waitForFunction(function () {
    return !document.getElementById('contrib-step-excel').classList.contains('contrib-step-hidden');
  }, { timeout: 15000 });
  checks.push(['excel step accessible', await page.evaluate(function () {
    return !document.getElementById('contrib-step-excel').classList.contains('contrib-step-hidden');
  })]);

  await page.click('#contrib-back-hub-from-excel');
  await page.click('#contrib-goto-json');
  checks.push(['json step without re-auth', await page.evaluate(function () {
    return !document.getElementById('contrib-step-import').classList.contains('contrib-step-hidden') &&
      document.getElementById('contrib-step-access').classList.contains('contrib-step-hidden');
  })]);

  await page.click('#contrib-close');
  await page.waitForFunction(function () {
    return !document.getElementById('modal-contributeur').classList.contains('show');
  });

  await page.evaluate(function () { document.getElementById('btn-contributeur').click(); });
  await page.waitForSelector('#modal-contributeur.show');
  checks.push(['hub on reopen (session unlock)', await page.evaluate(function () {
    return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden') &&
      document.getElementById('contrib-step-access').classList.contains('contrib-step-hidden');
  })]);

  checks.push(['gate mode off after unlock', await page.evaluate(function () {
    var panel = document.querySelector('#modal-contributeur > .modal');
    return panel && !panel.classList.contains('contrib-gate-mode');
  })]);

  await browser.close();
  server.close();

  console.log('Contributor access smoke test:\n');
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
