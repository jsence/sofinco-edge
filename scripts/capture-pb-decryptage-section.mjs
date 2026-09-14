#!/usr/bin/env node
/**
 * Capture section Décryptage PB (onglet Différenciateurs).
 * before : fixture miroir des 3 tendances seed supprimées
 * after  : chargement Supabase live (post-suppression)
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const suffix = process.argv[2] || 'after';
const outDir = process.argv[3] || '/opt/cursor/artifacts/screenshots';

const SEED_PB_TENDANCES = [
  {
    titre: 'Mouvement sur les taux promo',
    description: '3 concurrents ont ajusté leurs taux promotionnels sur le prêt personnel ce mois-ci, avec une baisse moyenne de 0,2 point de TAEG.',
    acteurs: ['Cetelem', 'Cofidis', 'Oney'],
    acteursLabels: ['Cetelem', 'Cofidis', 'Oney'],
    status: 'genere',
    portee: 'produit',
    produit: 'pb'
  },
  {
    titre: 'Accélération du 100 % digital',
    description: 'Deux acteurs renforcent leur parcours entièrement en ligne, sans passage en agence obligatoire.',
    acteurs: ['Younited', 'Cofidis'],
    acteursLabels: ['Younited', 'Cofidis'],
    status: 'genere',
    portee: 'produit',
    produit: 'pb'
  },
  {
    titre: 'Guerre des durées maximales',
    description: 'Plusieurs acteurs mettent en avant leur durée de remboursement maximale dans leurs campagnes marketing print et digital.',
    acteurs: ['Oney', 'Franfinance', 'Cetelem'],
    acteursLabels: ['Oney', 'Franfinance', 'Cetelem'],
    status: 'genere',
    portee: 'produit',
    produit: 'pb'
  }
];

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

function minimalFixture (pbTendances) {
  return {
    data: {
      produits: [{
        id: 'pb', label: 'Prêt personnel', shortLabel: 'PP', excelSheet: 'PB',
        acteurs: ['Sofinco', 'Cofidis', 'Cetelem'],
        sections: [{ title: 'Test', rows: [{ critere: 'X', values: { Sofinco: '1' } }] }]
      }],
      promos: {}, differenciateurs: { pb: {} }, differenciateursByCategorie: {},
      tendances: { pb: pbTendances },
      tendancesByCategorie: {},
      taux: {}, actualites: [], indicateurs: [], texteLibre: {}, lastImportAt: null
    },
    groups: { Cofidis: 'Groupe', Cetelem: 'Groupe', Oney: 'Groupe', Younited: 'Groupe', Franfinance: 'Groupe' },
    domains: {},
    idByNom: {}, nomById: {}
  };
}

async function run () {
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const { server, port } = await startServer();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'networkidle2', timeout: 120000 });
  await page.waitForFunction(function () {
    return typeof window.__testApplyLoadedData === 'function' &&
      document.getElementById('data-loading').style.display === 'none';
  }, { timeout: 120000 });

  if (suffix === 'before') {
    await page.evaluate(function (f) {
      window.__testApplyLoadedData(f);
      window.__render();
    }, minimalFixture(SEED_PB_TENDANCES));
  } else {
    await page.evaluate(function () { window.__render(); });
  }

  await page.evaluate(function () {
    window.navigate('pb');
  });
  await page.waitForFunction(function () {
    return document.getElementById('view-product').classList.contains('active');
  }, { timeout: 20000 });
  await page.evaluate(function () { window.switchTab('differenciateurs'); });
  await new Promise(function (r) { setTimeout(r, 500); });
  if (suffix === 'before') {
    await page.waitForFunction(function () {
      return document.querySelectorAll('#view-product .tendance-card').length === 3;
    }, { timeout: 20000 });
  } else {
    await page.waitForFunction(function () {
      return document.getElementById('view-product').classList.contains('active');
    }, { timeout: 20000 });
  }

  const cardCount = await page.evaluate(function () {
    return document.querySelectorAll('#view-product .tendance-card').length;
  });
  console.log('  tendance-card count:', cardCount);

  const section = await page.$('#view-product .tendances-section');
  const out = path.join(outDir, 'pb-decryptage-section-' + suffix + '.png');
  if (section) {
    await section.screenshot({ path: out });
  } else {
    const block = await page.$('#view-product #tab-content');
    if (block) await block.screenshot({ path: out });
    else await page.screenshot({ path: out });
  }
  console.log('Wrote', out);

  await browser.close();
  server.close();
}

run().catch(function (e) { console.error(e); process.exit(1); });
