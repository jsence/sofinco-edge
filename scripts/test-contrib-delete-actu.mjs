#!/usr/bin/env node
/**
 * Test suppression actualité contributeur — nécessite supabase-config.test.js
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { assertSafeTestTarget, cleanupTestData } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ACCESS_CODE = 'SOFINCO2026';
const MARKER = 'TEST DELETE ACTU ';
const MARKER_FEATURED = 'TEST DELETE FEATURED ';

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

async function insertTestActu (sb, titre, opts) {
  opts = opts || {};
  var row = {
    date: '2026-09-02',
    acteur_id: 'cofidis',
    type: 'Corporate',
    titre: titre,
    source: 'https://example.com/delete-test'
  };
  if (opts.a_la_une) row.a_la_une = true;
  var res = await sb.from('actualites').insert(row).select('id, titre, a_la_une').single();
  if (res.error) throw new Error('insert actu: ' + res.error.message);
  return res.data;
}

async function run () {
  var cfg;
  try {
    cfg = assertSafeTestTarget();
  } catch (e) {
    console.log('SKIP: ' + e.message.split('\n')[0]);
    process.exit(0);
  }

  var sb = createClient(cfg.url, cfg.anonKey);
  var migrationOk = !(await sb.from('actualites').select('a_la_une').limit(0)).error;
  var puppeteer = require('puppeteer');
  var { server, port } = await startServer();
  var browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  var page = await browser.newPage();
  page.on('dialog', async function (d) { await d.accept(); });

  var checks = [];
  var rowNormal = null;
  var rowFeatured = null;
  var titreNormal = MARKER + Date.now();
  var titreFeatured = MARKER_FEATURED + Date.now();

  try {
    rowNormal = await insertTestActu(sb, titreNormal);
    if (migrationOk) {
      await sb.from('actualites').update({ a_la_une: false }).eq('a_la_une', true);
      rowFeatured = await insertTestActu(sb, titreFeatured, { a_la_une: true });
    }

    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });

    checks.push(['UI hub: sélecteur suppression présent', await page.evaluate(function () {
      return document.getElementById('contrib-delete-actu-select') !== null &&
        document.getElementById('contrib-delete-actu-btn') !== null;
    })]);

    await page.evaluate(async function (id) {
      await window.__testDeleteActuById(id);
    }, rowNormal.id);

    var afterDelete = await sb.from('actualites').select('id').eq('id', rowNormal.id).maybeSingle();
    checks.push(['suppression actu normale en base', !afterDelete.data]);

    checks.push(['actu absente du fil après suppression', await page.evaluate(function (titre) {
      return !(window.DATA.actualites || []).some(function (a) { return a.titre === titre; });
    }, titreNormal)]);

    if (migrationOk && rowFeatured) {
      await page.evaluate(async function () {
        await window.__testReloadDataAndRender();
      });

      checks.push(['bloc à la une visible avant suppression featured', await page.evaluate(function (titre) {
        var el = document.querySelector('.home-featured');
        return el && el.textContent.indexOf(titre) >= 0;
      }, titreFeatured)]);

      await page.evaluate(async function (id) {
        await window.__testDeleteActuById(id);
      }, rowFeatured.id);

      checks.push(['bloc à la une absent après suppression featured', await page.evaluate(function () {
        return document.querySelector('.home-featured') === null;
      })]);

      var featuredGone = await sb.from('actualites').select('id').eq('id', rowFeatured.id).maybeSingle();
      checks.push(['suppression actu à la une en base', !featuredGone.data]);
    } else {
      checks.push(['suppression actu à la une (skipped: migration a_la_une)', true]);
    }

    checks.push(['filtre catégorie: bloc à la une stable', await page.evaluate(function () {
      if (typeof window.__testHomeFeaturedFilterStable !== 'function') return false;
      var stable = window.__testHomeFeaturedFilterStable();
      return stable.ok && stable.sameNode;
    })]);
  } finally {
    if (rowNormal && rowNormal.id) await sb.from('actualites').delete().eq('id', rowNormal.id);
    if (rowFeatured && rowFeatured.id) await sb.from('actualites').delete().eq('id', rowFeatured.id);
    await cleanupTestData(sb);
    await browser.close();
    server.close();
  }

  console.log('Contrib delete actu test:\n');
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
