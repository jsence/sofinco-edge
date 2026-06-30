#!/usr/bin/env node
/**
 * Extrait SEED depuis index.html (legacy) ou valide seed-data.json existant.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'seed-data.json');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('var SEED =')) {
  if (fs.existsSync(outPath)) {
    const seed = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    console.log('SEED absent de index.html — seed-data.json conservé (canonical).');
    console.log(JSON.stringify(seed.meta.counts, null, 2));
    process.exit(0);
  }
  console.error('Aucun SEED dans index.html et seed-data.json manquant.');
  process.exit(1);
}

function extractBlock(name) {
  const re = new RegExp(`var ${name} = ([\\s\\S]*?);\\n\\n  (?:var |/\\*)`);
  const m = html.match(re);
  if (!m) throw new Error('Block not found: ' + name);
  return m[1];
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`
  var GROUPS = ${extractBlock('GROUPS')};
  var DOMAINS = ${extractBlock('DOMAINS')};
  var PROD_URLS = ${extractBlock('PROD_URLS')};
  var SEED = ${extractBlock('SEED')};
  var TAUX_CR_DATA = ${extractBlock('TAUX_CR_DATA')};
`, sandbox);

const EXCEL_SHEETS = { pb: 'PB', cr: 'CR', nxcb: 'NxCB', rac: 'RAC', carte: 'CARTE' };
const PRODUCT_META = {
  pb:   { label: 'Prêt Personnel',      short_label: 'PP',    a_onglet_taux: true },
  cr:   { label: 'Crédit Renouvelable', short_label: 'CR',    a_onglet_taux: true },
  nxcb: { label: 'Paiement Fractionné', short_label: 'Nx',    a_onglet_taux: false },
  rac:  { label: 'Rachat de Crédit',    short_label: 'RAC',   a_onglet_taux: true },
  carte:{ label: 'Carte',               short_label: 'Carte', a_onglet_taux: false }
};

function toActorId(nom) {
  return String(nom)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\/\s*/g, '_')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const { GROUPS, DOMAINS, PROD_URLS, SEED, TAUX_CR_DATA } = sandbox;
const actorNomToId = {};

function registerActor(nom, extra) {
  if (!nom) return null;
  const id = toActorId(nom);
  if (!actorNomToId[nom]) {
    actorNomToId[nom] = {
      id,
      nom,
      groupe: GROUPS[nom] || extra?.groupe || null,
      domaine: DOMAINS[nom] || extra?.domaine || null,
      est_nous: nom === 'Sofinco'
    };
  }
  return id;
}

// Acteurs benchmark
Object.keys(GROUPS).forEach(function (nom) { registerActor(nom); });

// Acteurs TAUX CR
(TAUX_CR_DATA.actors || []).forEach(function (a) {
  registerActor(a.nom, { groupe: null, domaine: null });
});

// Acteurs depuis promos / diffs / actus
Object.values(SEED.promos || {}).flat().forEach(function (p) { registerActor(p.actor); });
Object.values(SEED.differenciateurs || {}).forEach(function (byActor) {
  Object.keys(byActor).forEach(registerActor);
});
Object.values(SEED.tendances || {}).flat().forEach(function (t) {
  (t.acteurs || []).forEach(registerActor);
});
(SEED.actualites || []).forEach(function (a) { registerActor(a.acteur); });

const acteurs = Object.values(actorNomToId);

const produits = Object.entries(PRODUCT_META).map(function ([id, meta]) {
  const sp = (SEED.produits || []).find(function (p) { return p.id === id; });
  return {
    id,
    label: meta.label,
    short_label: meta.short_label,
    a_onglet_taux: meta.a_onglet_taux,
    updated_at: sp?.updatedAt || null,
    excel_sheet: EXCEL_SHEETS[id]
  };
});

const acteurs_produits = [];
(SEED.produits || []).forEach(function (sp) {
  (sp.acteurs || []).forEach(function (nom, idx) {
    const aid = registerActor(nom);
    acteurs_produits.push({ acteur_id: aid, produit_id: sp.id, ordre: idx });
  });
});

const criteres = [];
const valeurs = [];
(SEED.produits || []).forEach(function (sp) {
  let ordre = 0;
  (sp.sections || []).forEach(function (sec) {
    (sec.rows || []).forEach(function (row) {
      const critereId = `${sp.id}__${ordre}`;
      criteres.push({
        _id: critereId,
        produit_id: sp.id,
        section: sec.title || '',
        critere: row.critere,
        ordre: ordre
      });
      Object.entries(row.values || {}).forEach(function ([nom, val]) {
        valeurs.push({
          critere_ref: critereId,
          acteur_id: registerActor(nom),
          valeur: val || ''
        });
      });
      ordre++;
    });
  });
});

const promos = [];
Object.entries(SEED.promos || {}).forEach(function ([pid, list]) {
  (list || []).forEach(function (pr) {
    promos.push({
      produit_id: pid,
      acteur_id: registerActor(pr.actor),
      taux: pr.taux || null,
      duree: pr.duree || null,
      montant: pr.montant || null,
      date_fin: pr.dateFin || null,
      canal: pr.canal || null,
      lien: pr.lien || null
    });
  });
});

const differenciateurs = [];
Object.entries(SEED.differenciateurs || {}).forEach(function ([pid, byActor]) {
  Object.entries(byActor).forEach(function ([nom, d]) {
    differenciateurs.push({
      produit_id: pid,
      acteur_id: registerActor(nom),
      difference: d.difference || null,
      pourquoi: d.pourquoi || null,
      conclusion: d.conclusion || d.positionnement || '',
      tags: d.tags || [],
      status: d.status || null
    });
  });
});

const tendances = [];
Object.entries(SEED.tendances || {}).forEach(function ([pid, list]) {
  (list || []).forEach(function (t) {
    tendances.push({
      produit_id: pid,
      titre: t.titre,
      description: t.description || '',
      acteurs_concernes: (t.acteurs || []).map(function (n) { return registerActor(n); }),
      status: t.status || null
    });
  });
});

const IMPACT_MAP = {
  'à surveiller': 'a_surveiller',
  'menace directe': 'menace_directe',
  'neutre': 'neutre'
};

const actualites = (SEED.actualites || []).map(function (a) {
  return {
    date: a.date,
    acteur_id: registerActor(a.acteur),
    type: a.type,
    produit_id: a.produit || null,
    titre: a.titre,
    source: a.source || null,
    impact: IMPACT_MAP[a.impact] || null
  };
});

const taux_cr = (TAUX_CR_DATA.actors || []).map(function (a) {
  return {
    acteur_id: registerActor(a.nom),
    produit_nom: a.produit || '',
    categorie: a.cat || 'financiere',
    rows: a.rows || [],
    commentaire: a.comment || null,
    is_us: !!a.isUs
  };
});

const taux_cr_meta = {
  id: 'cr',
  updated_at: TAUX_CR_DATA.updatedAt || null,
  prev_date: TAUX_CR_DATA.prevDate || null,
  usure: TAUX_CR_DATA.usure || []
};

const out = {
  meta: {
    generated_at: new Date().toISOString(),
    source: 'index.html SEED + TAUX_CR_DATA',
    counts: {
      acteurs: acteurs.length,
      produits: produits.length,
      acteurs_produits: acteurs_produits.length,
      criteres: criteres.length,
      valeurs: valeurs.length,
      promos: promos.length,
      differenciateurs: differenciateurs.length,
      tendances: tendances.length,
      actualites: actualites.length,
      taux_cr: taux_cr.length
    }
  },
  acteurs,
  produits,
  acteurs_produits,
  criteres,
  valeurs,
  promos,
  differenciateurs,
  tendances,
  actualites,
  taux_cr,
  taux_cr_meta,
  prod_urls: PROD_URLS
};

const outPath = path.join(root, 'seed-data.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Written', outPath);
console.log(JSON.stringify(out.meta.counts, null, 2));
