/* global supabase */
(function (global) {
  'use strict';

  var EXCEL_SHEETS = { pb: 'PB', cr: 'CR', nxcb: 'NxCB', rac: 'RAC', carte: 'CARTE' };
  var PRODUCT_ORDER = ['pb', 'cr', 'nxcb', 'rac', 'carte'];

  function sortProducts (produits) {
    return produits.slice().sort(function (a, b) {
      var ia = PRODUCT_ORDER.indexOf(a.id);
      var ib = PRODUCT_ORDER.indexOf(b.id);
      if (ia < 0) ia = 999;
      if (ib < 0) ib = 999;
      return ia - ib;
    });
  }

  function toActorId(nom) {
    return String(nom)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s*\/\s*/g, '_')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function createClient() {
    var cfg = global.SOFINCO_EDGE_SUPABASE || {};
    if (!cfg.url || !cfg.anonKey) {
      throw new Error('Configuration Supabase manquante. Renseignez url et anonKey dans supabase-config.js (Dashboard Supabase → API).');
    }
    if (typeof supabase === 'undefined' || !supabase.createClient) {
      throw new Error('Client Supabase JS non chargé.');
    }
    return supabase.createClient(cfg.url, cfg.anonKey);
  }

  function buildInMemoryData(produits, acteurs, acteursProduits, criteres, valeurs, promos, diffs, tendances, actualites, tauxCr, tauxMeta) {
    produits = sortProducts(produits);
    var nomById = {};
    var idByNom = {};
    acteurs.forEach(function (a) {
      nomById[a.id] = a.nom;
      idByNom[a.nom] = a.id;
    });

    var groups = {};
    var domains = {};
    acteurs.forEach(function (a) {
      groups[a.nom] = a.groupe || '';
      domains[a.nom] = a.domaine || '';
    });

    var produitsData = produits.map(function (p) {
      var pActeurs = acteursProduits
        .filter(function (ap) { return ap.produit_id === p.id; })
        .sort(function (a, b) { return a.ordre - b.ordre; })
        .map(function (ap) { return nomById[ap.acteur_id]; });

      var pCrit = criteres
        .filter(function (c) { return c.produit_id === p.id; })
        .sort(function (a, b) { return a.ordre - b.ordre; });

      var sections = [];
      var cur = null;
      pCrit.forEach(function (c) {
        if (!cur || cur.title !== c.section) {
          cur = { title: c.section, rows: [] };
          sections.push(cur);
        }
        var values = {};
        valeurs.filter(function (v) { return v.critere_id === c.id; }).forEach(function (v) {
          values[nomById[v.acteur_id]] = v.valeur;
        });
        cur.rows.push({ critere: c.critere, values: values });
      });

      var updatedAt = p.updated_at;
      if (updatedAt && updatedAt.indexOf('T') >= 0) updatedAt = updatedAt.split('T')[0];

      return {
        id: p.id,
        label: p.label,
        shortLabel: p.short_label,
        excelSheet: EXCEL_SHEETS[p.id],
        acteurs: pActeurs,
        sections: sections,
        updatedAt: updatedAt || null
      };
    });

    var promosObj = {};
    promos.forEach(function (pr) {
      if (!promosObj[pr.produit_id]) promosObj[pr.produit_id] = [];
      promosObj[pr.produit_id].push({
        actor: nomById[pr.acteur_id],
        taux: pr.taux,
        duree: pr.duree,
        montant: pr.montant,
        dateFin: pr.date_fin,
        canal: pr.canal,
        lien: pr.lien
      });
    });

    var diffsObj = {};
    diffs.forEach(function (d) {
      if (!diffsObj[d.produit_id]) diffsObj[d.produit_id] = {};
      var nom = nomById[d.acteur_id];
      var entry = {
        tags: d.tags || [],
        status: d.status || undefined
      };
      if (d.difference) entry.difference = d.difference;
      if (d.pourquoi) entry.pourquoi = d.pourquoi;
      if (nom === 'Sofinco') {
        entry.positionnement = d.conclusion || '';
      } else {
        entry.conclusion = d.conclusion || '';
      }
      diffsObj[d.produit_id][nom] = entry;
    });

    var tendObj = {};
    tendances.forEach(function (t) {
      if (!tendObj[t.produit_id]) tendObj[t.produit_id] = [];
      tendObj[t.produit_id].push({
        titre: t.titre,
        description: t.description,
        acteurs: (t.acteurs_concernes || []).map(function (id) { return nomById[id]; }).filter(Boolean),
        status: t.status || undefined
      });
    });

    var IMPACT_REV = { a_surveiller: 'à surveiller', menace_directe: 'menace directe', neutre: 'neutre' };
    var actualitesData = actualites.map(function (a) {
      return {
        date: a.date,
        acteur: nomById[a.acteur_id],
        type: a.type,
        produit: a.produit_id,
        titre: a.titre,
        source: a.source,
        impact: IMPACT_REV[a.impact] || a.impact
      };
    });

    var tauxActors = tauxCr.map(function (t) {
      var actor = acteurs.find(function (a) { return a.id === t.acteur_id; });
      return {
        nom: actor ? actor.nom : t.acteur_id,
        produit: t.produit_nom,
        cat: t.categorie,
        rows: t.rows || [],
        comment: t.commentaire || '',
        isUs: actor ? !!actor.est_nous : false
      };
    });

    var taux = {
      cr: {
        updatedAt: tauxMeta ? tauxMeta.updated_at : null,
        prevDate: tauxMeta ? tauxMeta.prev_date : null,
        usure: tauxMeta && tauxMeta.usure ? tauxMeta.usure : [],
        actors: tauxActors
      }
    };

    return {
      data: {
        produits: produitsData,
        promos: promosObj,
        differenciateurs: diffsObj,
        tendances: tendObj,
        taux: taux,
        actualites: actualitesData
      },
      groups: groups,
      domains: domains,
      idByNom: idByNom,
      nomById: nomById
    };
  }

  async function loadAllData(sb) {
    var results = await Promise.all([
      sb.from('produits').select('*'),
      sb.from('acteurs').select('*').order('nom'),
      sb.from('acteurs_produits').select('*'),
      sb.from('criteres').select('*').order('ordre'),
      sb.from('valeurs').select('*'),
      sb.from('promos').select('*'),
      sb.from('differenciateurs').select('*'),
      sb.from('tendances').select('*').order('created_at'),
      sb.from('actualites').select('*').order('date', { ascending: false }),
      sb.from('taux_cr').select('*'),
      sb.from('taux_cr_meta').select('*').eq('id', 'cr').maybeSingle()
    ]);

    results.forEach(function (r, i) {
      if (r.error) throw new Error('Supabase (' + i + '): ' + r.error.message);
    });

    return buildInMemoryData(
      results[0].data || [],
      results[1].data || [],
      results[2].data || [],
      results[3].data || [],
      results[4].data || [],
      results[5].data || [],
      results[6].data || [],
      results[7].data || [],
      results[8].data || [],
      results[9].data || [],
      results[10].data || null
    );
  }

  async function ensureActors(sb, actorNames, groups, domains) {
    var rows = actorNames.map(function (nom) {
      return {
        id: toActorId(nom),
        nom: nom,
        groupe: (groups && groups[nom]) || null,
        domaine: (domains && domains[nom]) || null,
        est_nous: nom === 'Sofinco'
      };
    });
    var { error } = await sb.from('acteurs').upsert(rows, { onConflict: 'id' });
    if (error) throw new Error('acteurs: ' + error.message);
    return rows.reduce(function (acc, a) { acc[a.nom] = a.id; return acc; }, {});
  }

  async function syncProductToSupabase(sb, product, idByNom, groups, domains) {
    var map = Object.assign({}, idByNom);
    var merged = await ensureActors(sb, product.acteurs, groups, domains);
    Object.assign(map, merged);

    await sb.from('produits').upsert({
      id: product.id,
      label: product.label,
      short_label: product.shortLabel,
      a_onglet_taux: product.id === 'pb' || product.id === 'cr' || product.id === 'rac',
      updated_at: product.updatedAt || new Date().toISOString().split('T')[0]
    }, { onConflict: 'id' });

    await sb.from('acteurs_produits').delete().eq('produit_id', product.id);
    var links = product.acteurs.map(function (nom, idx) {
      return { acteur_id: map[nom] || toActorId(nom), produit_id: product.id, ordre: idx };
    });
    var { error: linkErr } = await sb.from('acteurs_produits').insert(links);
    if (linkErr) throw new Error('acteurs_produits: ' + linkErr.message);

    await sb.from('criteres').delete().eq('produit_id', product.id);

    var critRows = [];
    var ordre = 0;
    product.sections.forEach(function (sec) {
      sec.rows.forEach(function (row) {
        critRows.push({
          produit_id: product.id,
          section: sec.title || '',
          critere: row.critere,
          ordre: ordre++
        });
      });
    });

    if (!critRows.length) return map;

    var { data: inserted, error: critErr } = await sb.from('criteres').insert(critRows).select('id, ordre');
    if (critErr) throw new Error('criteres: ' + critErr.message);

    var valRows = [];
    var o = 0;
    product.sections.forEach(function (sec) {
      sec.rows.forEach(function (row) {
        var critId = inserted.find(function (c) { return c.ordre === o; }).id;
        o++;
        Object.keys(row.values || {}).forEach(function (nom) {
          valRows.push({
            critere_id: critId,
            acteur_id: map[nom] || toActorId(nom),
            valeur: row.values[nom] || ''
          });
        });
      });
    });

    if (valRows.length) {
      var { error: valErr } = await sb.from('valeurs').insert(valRows);
      if (valErr) throw new Error('valeurs: ' + valErr.message);
    }

    return map;
  }

  async function syncPromosToSupabase(sb, promosObj, idByNom, groups, domains) {
    var map = Object.assign({}, idByNom);
    var allNames = [];
    Object.values(promosObj).forEach(function (list) {
      list.forEach(function (p) { if (p.actor) allNames.push(p.actor); });
    });
    if (allNames.length) {
      var merged = await ensureActors(sb, allNames, groups, domains);
      Object.assign(map, merged);
    }

    for (var pid of Object.keys(promosObj)) {
      await sb.from('promos').delete().eq('produit_id', pid);
    }

    var rows = [];
    Object.entries(promosObj).forEach(function (entry) {
      var pid = entry[0];
      entry[1].forEach(function (p) {
        rows.push({
          produit_id: pid,
          acteur_id: map[p.actor] || toActorId(p.actor),
          taux: p.taux || null,
          duree: p.duree || null,
          montant: p.montant || null,
          date_fin: p.dateFin || null,
          canal: p.canal || null,
          lien: p.lien || null
        });
      });
    });

    if (rows.length) {
      var { error } = await sb.from('promos').insert(rows);
      if (error) throw new Error('promos: ' + error.message);
    }
    return map;
  }

  async function syncDifferenciateursToSupabase(sb, diffsObj, idByNom, groups, domains) {
    var map = Object.assign({}, idByNom);
    var allNames = [];
    Object.values(diffsObj).forEach(function (byActor) {
      Object.keys(byActor).forEach(function (n) { allNames.push(n); });
    });
    if (allNames.length) {
      var merged = await ensureActors(sb, allNames, groups, domains);
      Object.assign(map, merged);
    }

    var rows = [];
    Object.entries(diffsObj).forEach(function (entry) {
      var pid = entry[0];
      Object.entries(entry[1]).forEach(function (ae) {
        var nom = ae[0];
        var d = ae[1];
        rows.push({
          produit_id: pid,
          acteur_id: map[nom] || toActorId(nom),
          difference: d.difference || null,
          pourquoi: d.pourquoi || null,
          conclusion: d.positionnement || d.conclusion || '',
          tags: d.tags || [],
          status: d.status || null
        });
      });
    });

    if (rows.length) {
      var { error } = await sb.from('differenciateurs').upsert(rows, { onConflict: 'produit_id,acteur_id' });
      if (error) throw new Error('differenciateurs: ' + error.message);
    }
    return map;
  }

  async function syncAllFromImport(sb, data, idByNom, groups, domains) {
    var map = Object.assign({}, idByNom);
    for (var i = 0; i < data.produits.length; i++) {
      var m = await syncProductToSupabase(sb, data.produits[i], map, groups, domains);
      Object.assign(map, m);
    }
    var m2 = await syncPromosToSupabase(sb, data.promos, map, groups, domains);
    Object.assign(map, m2);
    var m3 = await syncDifferenciateursToSupabase(sb, data.differenciateurs, map, groups, domains);
    Object.assign(map, m3);
    return map;
  }

  global.SofincoSupabase = {
    toActorId: toActorId,
    createClient: createClient,
    loadAllData: loadAllData,
    syncProductToSupabase: syncProductToSupabase,
    syncPromosToSupabase: syncPromosToSupabase,
    syncDifferenciateursToSupabase: syncDifferenciateursToSupabase,
    syncAllFromImport: syncAllFromImport
  };
})(window);
