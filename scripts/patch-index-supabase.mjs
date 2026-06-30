#!/usr/bin/env node
/** Patch index.html : Supabase integration, remove SEED/TAUX blocks */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// HTML header comment + Supabase scripts
if (!html.includes('SOFINCO_EDGE_SUPABASE')) {
  html = html.replace(
    '<!DOCTYPE html>',
    `<!DOCTYPE html>\n<!--\n  SofincoEdge — source de données Supabase\n  Configurer supabase-config.js : url + anonKey (Dashboard Supabase → Project Settings → API)\n  Migrations : supabase/migrations/  |  Seed : npm run build:seed && npm run seed:supabase\n-->`
  );
  html = html.replace(
    '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>',
    `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>\n  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>\n  <script src="supabase-config.js"></script>\n  <script src="js/supabase-data.js"></script>`
  );
}

// Loading overlay CSS
if (!html.includes('#data-loading')) {
  html = html.replace(
    'body { display: flex; min-height: 100vh; }',
    `body { display: flex; min-height: 100vh; }\n\n    #data-loading, #data-error {\n      position: fixed; inset: 0; z-index: 9999;\n      display: flex; align-items: center; justify-content: center;\n      background: rgba(247,249,250,0.92); backdrop-filter: blur(4px);\n    }\n    #data-error { display: none; flex-direction: column; gap: 12px; padding: 24px; text-align: center; }\n    .data-load-box {\n      background: var(--surface); border-radius: var(--r); padding: 28px 36px;\n      box-shadow: var(--sh-md); display: flex; align-items: center; gap: 12px;\n      font-size: 14px; font-weight: 500; color: var(--navy);\n    }\n    .data-load-box i { font-size: 22px; color: var(--tq-ink); animation: spin 1s linear infinite; }\n    @keyframes spin { to { transform: rotate(360deg); } }\n    .data-err-title { font-size: 18px; font-weight: 700; color: var(--navy); }\n    .data-err-msg { font-size: 13px; color: var(--muted); max-width: 480px; line-height: 1.5; }`
  );
  html = html.replace(
    '<div id="content">',
    `<div id="data-loading"><div class="data-load-box"><i class="ti ti-loader-2"></i> Chargement des données…</div></div>\n  <div id="data-error"><div class="data-err-title"><i class="ti ti-plug-connected-x"></i> Connexion Supabase impossible</div><div class="data-err-msg" id="data-error-msg"></div></div>\n\n  <div id="content">`
  );
}

// Replace GROUPS/DOMAINS with mutable empty maps
html = html.replace(
  /var GROUPS = \{[\s\S]*?\};\n\n  var DOMAINS = \{[\s\S]*?\};/,
  `var GROUPS = {};\n  var DOMAINS = {};\n  var actorIdByNom = {};\n  var sbClient = null;\n  var dataReady = false;`
);

// Simplify DATA.produits to empty (loaded from Supabase)
html = html.replace(
  /var DATA = \{\n    produits: \[[\s\S]*?\],\n    promos:/,
  `var DATA = {\n    produits: [],\n    promos:`
);

// Remove SEED + TAUX_CR_DATA block
const seedStart = html.indexOf('  /* ──────────────────────────────────────────\n     DONNÉES INITIALES (SEED)');
const stateStart = html.indexOf('  /* ──────────────────────────────────────────\n     STATE');
if (seedStart >= 0 && stateStart > seedStart) {
  html = html.slice(0, seedStart) + html.slice(stateStart);
}

// Insert bootstrap helpers before STATE if not present
if (!html.includes('function applyLoadedData')) {
  html = html.replace(
    '  /* ──────────────────────────────────────────\n     STATE',
    `  function applyLoadedData (result) {
    Object.keys(GROUPS).forEach(function (k) { delete GROUPS[k]; });
    Object.keys(DOMAINS).forEach(function (k) { delete DOMAINS[k]; });
    Object.assign(GROUPS, result.groups);
    Object.assign(DOMAINS, result.domains);
    actorIdByNom = result.idByNom;
    DATA.produits = result.data.produits;
    DATA.promos = result.data.promos;
    DATA.differenciateurs = result.data.differenciateurs;
    DATA.tendances = result.data.tendances;
    DATA.taux = result.data.taux;
    DATA.actualites = result.data.actualites;
    dataReady = true;
  }

  function showDataError (msg) {
    var loading = $('data-loading');
    var err = $('data-error');
    if (loading) loading.style.display = 'none';
    if (err) {
      err.style.display = 'flex';
      var el = $('data-error-msg');
      if (el) el.textContent = msg;
    }
  }

  async function bootstrapData () {
    try {
      sbClient = SofincoSupabase.createClient();
      var result = await SofincoSupabase.loadAllData(sbClient);
      applyLoadedData(result);
      var loading = $('data-loading');
      if (loading) loading.style.display = 'none';
      render();
    } catch (e) {
      showDataError(e.message || String(e));
    }
  }

  /* ──────────────────────────────────────────
     STATE`
  );
}

// Replace handleWorkbook
html = html.replace(
  `  function handleWorkbook (wb) {
    var oldSnap = makeSnapshot();
    var importDate = today();

    DATA.produits.forEach(function (def) {
      if (wb.SheetNames.indexOf(def.excelSheet) >= 0) {
        parseProductSheet(wb.Sheets[def.excelSheet], def);
      }
    });
    if (wb.SheetNames.indexOf('PROMOS') >= 0) {
      var p = parsePromosSheet(wb.Sheets['PROMOS']);
      if (p) DATA.promos = p;
    }
    if (wb.SheetNames.indexOf('DIFFERENCIATEURS') >= 0) {
      var d = parseDiffSheet(wb.Sheets['DIFFERENCIATEURS']);
      if (d) DATA.differenciateurs = d;
    }

    var newSnap = makeSnapshot();
    var entries = diffSnapshots(oldSnap, newSnap, importDate);
    if (entries.length) pushChangelog(entries);
    setBaseline(newSnap);

    $('modal-import').classList.remove('show');
    render();
  }`,
  `  async function handleWorkbook (wb) {
    if (!dataReady || !sbClient) {
      alert('Données non chargées — import impossible.');
      return;
    }
    var oldSnap = makeSnapshot();
    var importDate = today();

    DATA.produits.forEach(function (def) {
      if (wb.SheetNames.indexOf(def.excelSheet) >= 0) {
        parseProductSheet(wb.Sheets[def.excelSheet], def);
      }
    });
    if (wb.SheetNames.indexOf('PROMOS') >= 0) {
      var p = parsePromosSheet(wb.Sheets['PROMOS']);
      if (p) DATA.promos = p;
    }
    if (wb.SheetNames.indexOf('DIFFERENCIATEURS') >= 0) {
      var d = parseDiffSheet(wb.Sheets['DIFFERENCIATEURS']);
      if (d) DATA.differenciateurs = d;
    }

    try {
      var map = await SofincoSupabase.syncAllFromImport(sbClient, DATA, actorIdByNom, GROUPS, DOMAINS);
      Object.assign(actorIdByNom, map);
    } catch (e) {
      alert('Données importées localement mais erreur d\\'enregistrement Supabase : ' + (e.message || e));
    }

    var newSnap = makeSnapshot();
    var entries = diffSnapshots(oldSnap, newSnap, importDate);
    if (entries.length) pushChangelog(entries);
    setBaseline(newSnap);

    $('modal-import').classList.remove('show');
    render();
  }`
);

// Replace init SEED merge with bootstrapData
html = html.replace(
  `    /* Fusion données initiales (SEED) si produit vide */
    SEED.produits.forEach(function (sp) {
      var p = productById(sp.id);
      if (p && !p.sections.length) {
        p.acteurs   = sp.acteurs.slice();
        p.sections  = sp.sections;
        p.updatedAt = sp.updatedAt;
      }
    });
    if (!Object.keys(DATA.promos).length)          DATA.promos = SEED.promos;
    if (!Object.keys(DATA.differenciateurs).length) DATA.differenciateurs = SEED.differenciateurs;
    if (!Object.keys(DATA.tendances || {}).length)       DATA.tendances = SEED.tendances || {};
    if (!DATA.actualites.length)                    DATA.actualites = SEED.actualites;
    DATA.taux = { cr: TAUX_CR_DATA };

    render();
  }`,
  `    bootstrapData();
  }`
);

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html patched for Supabase');
