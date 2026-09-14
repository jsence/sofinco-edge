#!/usr/bin/env node
/** Libellés catégorie complets sur badges actualités (local, sans DB). */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CATEGORIES = [
  { id: 'produit_tarification', label: 'Produit & Tarification' },
  { id: 'commercial_communication', label: 'Commercial & Communication' },
  { id: 'strategie_corporate', label: 'Stratégie & Corporate' },
  { id: 'rse_juridique', label: 'RSE & Juridique' },
  { id: 'innovation_securite', label: 'Innovation & Sécurité' }
];

const FORBIDDEN = ['P&T', 'C&C', 'S&C', 'I&S'];

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

function buildFixture () {
  const actualites = CATEGORIES.map(function (cat, i) {
    return {
      id: 'actu-' + cat.id,
      date: '2026-09-0' + (i + 1),
      acteur: 'Cofidis',
      type: 'Corporate',
      produit: 'pb',
      categorie: cat.id,
      titre: 'Actu ' + cat.id,
      resume: 'Résumé test',
      source: 'https://example.com/' + cat.id
    };
  });
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Cofidis'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: {}, actualites, indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
    domains: {},
    idByNom: {},
    nomById: {}
  };
}

async function run () {
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const checks = [];

  try {
    await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction(function () {
      return typeof window.__testApplyLoadedData === 'function' &&
        document.getElementById('data-loading').style.display === 'none';
    }, { timeout: 120000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());

    for (const cat of CATEGORIES) {
      await page.evaluate(function (id) { window.navigate(id); window.switchCategoryTab('actualites'); }, cat.id);
      await page.waitForFunction(function (label) {
        var badge = document.querySelector('#view-category .actu-badge-cat');
        return badge && badge.textContent.indexOf(label) >= 0;
      }, { timeout: 15000 }, cat.label);
      checks.push(['carte — ' + cat.label, await page.evaluate(function (label, forbidden) {
        var badge = document.querySelector('#view-category .actu-badge-cat');
        if (!badge || badge.textContent.trim() !== label) return false;
        var nav = document.getElementById('sidebar');
        var navText = nav ? nav.textContent : '';
        for (var i = 0; i < forbidden.length; i++) {
          if (navText.indexOf(forbidden[i]) >= 0) return false;
        }
        return true;
      }, cat.label, FORBIDDEN)]);
    }

    await page.evaluate(function () { window.navigate('home'); window.setHomeActuCategory('all'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-home').classList.contains('active') &&
        document.querySelectorAll('.home-feed-wide .news-item').length >= 5;
    }, { timeout: 20000 });
    checks.push(['accueil — libellés complets', await page.evaluate(function (labels, forbidden) {
      var badges = Array.from(document.querySelectorAll('.home-feed-wide .actu-badge-cat'));
      if (badges.length < labels.length) return false;
      for (var i = 0; i < labels.length; i++) {
        var found = badges.some(function (b) { return b.textContent.trim() === labels[i]; });
        if (!found) return false;
      }
      for (var j = 0; j < badges.length; j++) {
        if (forbidden.indexOf(badges[j].textContent.trim()) >= 0) return false;
      }
      return true;
    }, CATEGORIES.map(function (c) { return c.label; }), FORBIDDEN)]);

    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active') &&
        document.querySelector('#view-category .actu-card') !== null;
    }, { timeout: 20000 });
    await page.evaluate(function () {
      document.querySelector('#view-category .actu-card').click();
    });
    await page.waitForSelector('#modal-detail.show #detail-body .actu-badge-cat', { timeout: 15000 });
    checks.push(['modal — badge catégorie complet', await page.evaluate(function () {
      var badge = document.querySelector('#detail-body .actu-badge-cat');
      return badge && badge.textContent.trim() === 'Produit & Tarification';
    })]);
    await page.click('#detail-close');

    await page.evaluate(function () {
      window.navigate('produit_tarification');
      window.toggleCategoryActor('produit_tarification', 'Cofidis');
    });
    checks.push(['filtrage acteur inchangé', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .news-item').length === 1;
    })]);

    checks.push(['routage slug catégorie', await page.evaluate(function () {
      window.navigate('rse_juridique');
      return document.querySelector('#view-category .prod-title') &&
        document.getElementById('view-category').classList.contains('active');
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Actu category labels test (local, no DB):\n');
  var failed = 0;
  checks.forEach(function (pair) {
    var ok = pair[1];
    console.log('  [' + (ok ? 'OK' : 'FAIL') + '] ' + pair[0]);
    if (!ok) failed++;
  });
  if (failed) {
    console.log('\n' + failed + ' check(s) failed.');
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
