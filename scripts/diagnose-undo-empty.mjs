#!/usr/bin/env node
/**
 * Diagnostic import → snapshot (lecture prod + import test minimal, nettoyage immédiat)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCESS_CODE = 'SOFINCO2026';
const MARKER = 'TEST UNDO DIAG ' + Date.now();

function loadCfg () {
  const src = fs.readFileSync(path.join(root, 'supabase-config.js'), 'utf8');
  return {
    url: (src.match(/url:\s*['"]([^'"]+)['"]/) || [])[1],
    anonKey: (src.match(/anonKey:\s*['"]([^'"]+)['"]/) || [])[1]
  };
}

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

async function countSnapshots (sb) {
  const res = await sb.from('import_undo_snapshot').select('id, created_at, available').eq('available', true);
  return res.data || [];
}

async function run () {
  const cfg = loadCfg();
  const sb = createClient(cfg.url, cfg.anonKey);
  const before = await countSnapshots(sb);
  console.log('Snapshots before test:', before.length);

  const XLSX = require('xlsx');
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', function (m) {
    const t = m.text();
    logs.push('[' + m.type() + '] ' + t);
  });
  page.on('pageerror', function (e) { logs.push('[pageerror] ' + e.message); });
  page.on('dialog', async function (d) {
    logs.push('[dialog] ' + d.message());
    await d.accept();
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Date', 'Acteur', 'Type', 'Catégorie', 'Produit', 'Titre', 'Source'],
    ['2026-09-02', 'Cofidis', 'Corporate', '', 'pb', MARKER, 'https://example.com/undo-diag']
  ]), 'ACTUALITES');
  const xlsxPath = path.join(root, '.tmp-undo-diag.xlsx');
  XLSX.writeFile(wb, xlsxPath);

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      var loading = document.getElementById('data-loading');
      return loading && loading.style.display === 'none';
    }, { timeout: 120000 });

    await page.click('#btn-contributeur');
    await page.waitForSelector('#modal-contributeur.show');
    await page.type('#contrib-access-code', ACCESS_CODE);
    await page.click('#contrib-access-submit');
    await page.waitForFunction(function () {
      return !document.getElementById('contrib-step-hub').classList.contains('contrib-step-hidden');
    });
    await page.click('#contrib-goto-excel');
    await page.waitForFunction(function () {
      return !document.getElementById('contrib-step-excel').classList.contains('contrib-step-hidden');
    });

    const input = await page.$('#file-input');
    await input.uploadFile(xlsxPath);

    await page.waitForFunction(function () {
      return document.getElementById('modal-import-result').classList.contains('show');
    }, { timeout: 180000 });
    await new Promise(function (r) { setTimeout(r, 2000); });

    const importMsg = await page.evaluate(function () {
      return document.getElementById('import-result-msg') ? document.getElementById('import-result-msg').textContent : '';
    });
    console.log('Import summary:', importMsg.slice(0, 300));

    const afterImport = await countSnapshots(sb);
    console.log('Snapshots after import:', afterImport.length, afterImport.map(function (s) { return s.id; }));

    await page.evaluate(function () {
      document.getElementById('modal-import-result').classList.remove('show');
    });
    await page.click('#btn-contributeur');
    await page.waitForSelector('#modal-contributeur.show', { timeout: 10000 });
    await new Promise(function (r) { setTimeout(r, 1500); });

    const ui = await page.evaluate(function () {
      var box = document.getElementById('contrib-undo-box');
      var sel = document.getElementById('contrib-undo-select');
      return {
        boxDisplay: box ? box.style.display : null,
        optionCount: sel ? sel.options.length : 0,
        options: sel ? Array.from(sel.options).map(function (o) { return o.textContent; }) : [],
        btnDisabled: document.getElementById('contrib-undo-import') ? document.getElementById('contrib-undo-import').disabled : null
      };
    });
    console.log('UI hub after import:', JSON.stringify(ui, null, 2));

    const undoLogs = logs.filter(function (l) {
      return l.indexOf('Instantané') >= 0 || l.indexOf('undo') >= 0 || l.indexOf('import_undo') >= 0 || l.indexOf('dialog') >= 0;
    });
    console.log('Relevant console logs:', undoLogs.join('\n') || '(none)');

    const actus = await sb.from('actualites').select('id').ilike('titre', MARKER + '%');
    console.log('Test actus created:', actus.data?.length || 0);

    const newSnaps = afterImport.filter(function (s) { return before.every(function (b) { return b.id !== s.id; }); });
    if (actus.data) {
      for (const a of actus.data) await sb.from('actualites').delete().eq('id', a.id);
    }
    for (const s of newSnaps) await sb.from('import_undo_snapshot').delete().eq('id', s.id);
    console.log('Cleanup: actus', actus.data?.length || 0, 'snapshots', newSnaps.length);

    const afterCleanup = await countSnapshots(sb);
    console.log('Snapshots after cleanup:', afterCleanup.length);
  } finally {
    if (fs.existsSync(xlsxPath)) fs.unlinkSync(xlsxPath);
    await browser.close();
    server.close();
  }
}

run().catch(function (e) { console.error(e); process.exit(1); });
