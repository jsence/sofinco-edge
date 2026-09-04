#!/usr/bin/env node
/**
 * Test cartes actualités enrichies + modal détail — fixture locale, sans Supabase.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CAT = 'produit_tarification';

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
  var longResume = 'Résumé complet de test qui doit être tronqué dans la vue liste mais visible en entier dans la modal de détail. '.repeat(4);
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB', acteurs: ['Sofinco', 'Cofidis'], sections: [] },
        { id: 'cr', label: 'Crédit renouvelable', shortLabel: 'CR', excelSheet: 'CR', acteurs: ['Sofinco'], sections: [] }
      ],
      promos: {}, differenciateurs: {}, differenciateursByCategorie: {}, tendances: {}, tendancesByCategorie: {},
      taux: { cr: { actors: [] } },
      actualites: [{
        id: 'actu-1', date: '2026-09-02', acteur: 'Cofidis', type: 'Produit', produit: 'pb',
        categorie: CAT, titre: 'Actu test cartes enrichies', resume: longResume, source: 'https://example.com/actu-card-test',
        impact: 'à surveiller', fiabilite: 'a_verifier'
      }],
      indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe' },
    domains: { Cofidis: 'cofidis.fr' },
    idByNom: { Cofidis: 'cofidis' },
    nomById: { cofidis: 'Cofidis' }
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
      return document.getElementById('data-loading').style.display === 'none' &&
        typeof window.__testApplyLoadedData === 'function';
    }, { timeout: 120000 });
    await page.evaluate(function (f) { window.__testApplyLoadedData(f); }, buildFixture());
    await page.evaluate(function () { window.navigate('home'); });
    await page.waitForFunction(function () {
      return document.body.textContent.indexOf('Actu test cartes enrichies') >= 0;
    });

    checks.push(['accueil — carte avec badges', await page.evaluate(function () {
      var cards = Array.from(document.querySelectorAll('.home-feed-wide .actu-card'));
      var card = cards.filter(function (c) { return c.textContent.indexOf('Actu test cartes enrichies') >= 0; })[0];
      if (!card) return false;
      return card.querySelectorAll('.actu-badge').length >= 5 &&
        card.querySelector('.actu-card-side .impact-badge') !== null;
    })]);

    checks.push(['accueil — résumé tronqué', await page.evaluate(function () {
      var cards = Array.from(document.querySelectorAll('.home-feed-wide .actu-card'));
      var card = cards.filter(function (c) { return c.textContent.indexOf('Actu test cartes enrichies') >= 0; })[0];
      var r = card && card.querySelector('.actu-card-resume');
      return r && r.textContent.indexOf('…') >= 0;
    })]);

    await page.evaluate(function () {
      var cards = Array.from(document.querySelectorAll('.home-feed-wide .actu-card'));
      var card = cards.filter(function (c) { return c.textContent.indexOf('Actu test cartes enrichies') >= 0; })[0];
      if (card) card.click();
    });
    await page.waitForSelector('#modal-detail.show');
    checks.push(['modal — résumé complet', await page.evaluate(function () {
      var body = document.getElementById('detail-body').textContent;
      return body.indexOf('Résumé complet de test') >= 0 && body.split('…').length === 1;
    })]);
    checks.push(['modal — titre repositionné et agrandi', await page.evaluate(function () {
      var modal = document.getElementById('modal-detail');
      var body = document.getElementById('detail-body');
      var titleInHeader = document.getElementById('detail-title').textContent.trim();
      var titleEl = body.querySelector('.actu-detail-title');
      var meta = body.querySelector('.actu-detail-meta');
      var badges = body.querySelector('.actu-detail-badges');
      var resume = body.querySelector('.actu-detail-resume');
      var grid = body.querySelector('.detail-grid');
      var source = body.querySelector('.actu-detail-source-block');
      if (!modal.classList.contains('modal-actu-detail') || titleInHeader) return false;
      if (!titleEl || titleEl.textContent.indexOf('Actu test cartes enrichies') < 0) return false;
      var titleSize = parseFloat(window.getComputedStyle(titleEl).fontSize);
      if (titleSize < 20) return false;
      var nodes = Array.from(body.children);
      var iMeta = nodes.indexOf(meta);
      var iBadges = nodes.indexOf(badges);
      var iTitle = nodes.indexOf(titleEl);
      var iResume = nodes.indexOf(resume);
      var iGrid = nodes.indexOf(grid);
      var iSource = nodes.indexOf(source);
      return iMeta < iBadges && iBadges < iTitle && iTitle < iResume && iResume < iGrid && iGrid < iSource;
    })]);
    checks.push(['modal — lien source', await page.evaluate(function () {
      return !!document.querySelector('#detail-body .actu-detail-source a[href*="example.com"]');
    })]);
    await page.click('#detail-close');

    // Page catégorie
    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    });
    checks.push(['catégorie — carte cliquable', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .actu-card').length === 1;
    })]);

    // Page produit
    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-product').classList.contains('active');
    });
    await page.evaluate(function () { window.switchTab('actualites'); });
    checks.push(['produit — onglet actualités avec badges', await page.evaluate(function () {
      var card = document.querySelector('#view-product .actu-card');
      return card && card.querySelectorAll('.actu-badge-prod').length === 1;
    })]);

    // Filtres catégorie toujours présents
    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForSelector('#view-category .category-filter-bar');
    checks.push(['catégorie — filtres inchangés', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .category-filter-bar .home-cat-tag').length >= 2;
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Actu cards UI test (local, no DB):\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
