#!/usr/bin/env node
/**
 * Test E2E filtres catégorie via Puppeteer + fixture injectée (sans écriture Supabase).
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
  return {
    data: {
      produits: [
        { id: 'pb', label: 'Prêt personnel', excelSheet: 'PB', acteurs: ['Sofinco', 'Cofidis'], sections: [] },
        { id: 'cr', label: 'Crédit renouvelable', excelSheet: 'CR', acteurs: ['Sofinco'], sections: [] },
        { id: 'nxcb', label: 'NxCB', excelSheet: 'NxCB', acteurs: ['Sofinco'], sections: [] },
        { id: 'rac', label: 'RAC', excelSheet: 'RAC', acteurs: ['Sofinco'], sections: [] },
        { id: 'carte', label: 'Carte', excelSheet: 'CARTE', acteurs: ['Sofinco'], sections: [] }
      ],
      promos: {},
      differenciateurs: {},
      differenciateursByCategorie: {},
      tendances: {},
      tendancesByCategorie: {},
      taux: { cr: { actors: [] } },
      actualites: [
        { id: '1', date: '2026-09-02', acteur: 'Cofidis', type: 'Produit', produit: 'pb', categorie: CAT, titre: 'Actu Cofidis PB', resume: '', source: '' },
        { id: '2', date: '2026-09-02', acteur: 'Cetelem', type: 'Produit', produit: 'cr', categorie: CAT, titre: 'Actu Cetelem CR', resume: '', source: '' },
        { id: '3', date: '2026-09-02', acteur: 'Cofidis', type: 'Corporate', produit: null, categorie: CAT, titre: 'Actu transverse', resume: '', source: '' }
      ],
      indicateurs: [],
      texteLibre: {},
      lastImportAt: null
    },
    groups: { Cofidis: 'Groupe', Cetelem: 'Groupe' },
    domains: {},
    idByNom: { Cofidis: 'cofidis', Cetelem: 'cetelem' },
    nomById: { cofidis: 'Cofidis', cetelem: 'Cetelem' }
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

    const fixture = buildFixture();
    fixture.data.differenciateursByCategorie[CAT] = {
      Cofidis: { difference: 'Diff test', conclusion: 'ok', tags: [] }
    };
    fixture.data.tendancesByCategorie[CAT] = [
      { titre: 'Tendance PB', description: 'desc', acteurs: ['Cofidis'], produit: 'pb', portee: 'produit' }
    ];

    await page.evaluate(function (result) {
      window.__testApplyLoadedData(result);
    }, fixture);

    await page.evaluate(function () { window.navigate('produit_tarification'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    });

    checks.push(['3 actualités sans filtre', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .news-item').length === 3;
    })]);

    await page.evaluate(function () { window.toggleCategoryActor('produit_tarification', 'Cofidis'); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-category .news-item').length === 2;
    });
    checks.push(['2 actualités filtre Cofidis', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .news-item').length === 2;
    })]);

    await page.evaluate(function () { window.setCategoryProduct('produit_tarification', 'pb'); });
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-category .news-item').length === 1;
    });
    checks.push(['1 actualité Cofidis+PB', await page.evaluate(function () {
      var texts = Array.from(document.querySelectorAll('#view-category .actu-card-title')).map(function (el) { return el.textContent; });
      return texts.length === 1 && texts[0].indexOf('Cofidis PB') >= 0;
    })]);

    await page.evaluate(function () { window.switchCategoryTab('differenciateurs'); });
    checks.push(['diff masqué si filtre produit PB actif', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .diff-card').length === 0;
    })]);

    await page.evaluate(function () {
      window.setCategoryProduct('produit_tarification', 'all');
      window.switchCategoryTab('decryptage');
    });
    checks.push(['décryptage visible produit tous', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .tendance-card').length === 1;
    })]);

    await page.evaluate(function () { window.setCategoryProduct('produit_tarification', 'cr'); });
    checks.push(['décryptage masqué filtre CR', await page.evaluate(function () {
      return document.querySelectorAll('#view-category .tendance-card').length === 0;
    })]);

    await page.evaluate(function () { window.navigate('pb'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-product').classList.contains('active');
    });
    checks.push(['page produit charge', await page.evaluate(function () {
      return document.getElementById('view-product').classList.contains('active') &&
        document.querySelector('#view-product .prod-title') !== null;
    })]);

    await page.evaluate(function () { window.navigate('commercial_communication'); });
    await page.waitForFunction(function () {
      return document.getElementById('view-category').classList.contains('active');
    });
    checks.push(['changement catégorie réinitialise filtres', await page.evaluate(function () {
      var actorBtn = document.querySelector('#view-category .home-cat-tag[onclick*="clearCategoryActors"]');
      var prodBtn = document.querySelector('#view-category .home-cat-tag[onclick*="setCategoryProduct"][onclick*="all"]');
      return actorBtn && actorBtn.classList.contains('active') &&
        prodBtn && prodBtn.classList.contains('active');
    })]);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('Category filters UI test (local, no DB):\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run().catch(function (e) { console.error(e); process.exit(1); });
