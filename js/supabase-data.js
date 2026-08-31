/* global supabase */
(function (global) {
  'use strict';

  var EXCEL_SHEETS = { pb: 'PB', cr: 'CR', nxcb: 'NxCB', rac: 'RAC', carte: 'CARTE' };
  var PRODUCT_ORDER = ['pb', 'cr', 'nxcb', 'rac', 'carte', 'digital', 'sav', 'com', 'distribution'];

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

  function buildInMemoryData(produits, acteurs, acteursProduits, criteres, valeurs, promos, diffs, tendances, actualites, tauxCr, tauxMeta, indicateurs, texteLibreRows) {
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
        status: t.status || undefined,
        portee: t.portee || 'produit'
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
        resume: a.resume || null,
        fiabilite: a.fiabilite || null,
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

    var indicateursData = (indicateurs || []).slice().sort(function (a, b) {
      if (a.categorie !== b.categorie) return a.categorie.localeCompare(b.categorie, 'fr');
      if (a.ordre !== b.ordre) return a.ordre - b.ordre;
      return (a.libelle || '').localeCompare(b.libelle || '', 'fr');
    }).map(function (row) {
      return {
        id: row.id,
        categorie: row.categorie,
        libelle: row.libelle,
        periode: row.periode,
        valeur: row.valeur,
        evolution: row.evolution,
        note: row.note,
        ordre: row.ordre
      };
    });

    var texteLibreObj = {};
    (texteLibreRows || []).forEach(function (row) {
      texteLibreObj[row.produit_id] = {
        titre: row.titre || '',
        contenu: row.contenu || '',
        updatedAt: row.updated_at || null
      };
    });

    return {
      data: {
        produits: produitsData,
        promos: promosObj,
        differenciateurs: diffsObj,
        tendances: tendObj,
        taux: taux,
        actualites: actualitesData,
        indicateurs: indicateursData,
        texteLibre: texteLibreObj
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

    var indicateurs = [];
    var indicateursRes = await sb.from('indicateurs').select('*').order('ordre');
    if (indicateursRes.error) {
      console.warn('indicateurs:', indicateursRes.error.message);
    } else {
      indicateurs = indicateursRes.data || [];
    }

    var texteLibreRows = [];
    var texteRes = await sb.from('produits_texte_libre').select('*');
    if (texteRes.error) {
      console.warn('produits_texte_libre:', texteRes.error.message);
    } else {
      texteLibreRows = texteRes.data || [];
    }

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
      results[10].data || null,
      indicateurs,
      texteLibreRows
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
    var stats = { updated: 0, changes: 0, actualites: 0 };
    var map = Object.assign({}, idByNom);
    var merged = await ensureActors(sb, product.acteurs, groups, domains);
    Object.assign(map, merged);

    await sb.from('produits').upsert({
      id: product.id,
      label: product.label,
      short_label: product.shortLabel,
      a_onglet_taux: product.id === 'pb' || product.id === 'cr' || product.id === 'rac'
    }, { onConflict: 'id' });

    /* Acteurs produit : ajouter / mettre à jour sans supprimer les absents de l'Excel */
    for (var ai = 0; ai < product.acteurs.length; ai++) {
      var nom = product.acteurs[ai];
      var aid = map[nom] || toActorId(nom);
      var { error: apErr } = await sb.from('acteurs_produits').upsert({
        acteur_id: aid,
        produit_id: product.id,
        ordre: ai
      }, { onConflict: 'acteur_id,produit_id' });
      if (apErr) throw new Error('acteurs_produits: ' + apErr.message);
    }

    var { data: existingCrit, error: critFetchErr } = await sb
      .from('criteres')
      .select('id, section, critere, ordre')
      .eq('produit_id', product.id);
    if (critFetchErr) throw new Error('criteres: ' + critFetchErr.message);

    var critList = existingCrit || [];
    var critIds = critList.map(function (c) { return c.id; });
    var existingVals = [];
    if (critIds.length) {
      var { data: ev, error: valFetchErr } = await sb
        .from('valeurs')
        .select('id, critere_id, acteur_id, valeur')
        .in('critere_id', critIds);
      if (valFetchErr) throw new Error('valeurs: ' + valFetchErr.message);
      existingVals = ev || [];
    }

    function findCritere(section, critere) {
      var sec = section || '';
      for (var i = 0; i < critList.length; i++) {
        if (critList[i].section === sec && critList[i].critere === critere) return critList[i];
      }
      return null;
    }

    function findValeur(critereId, acteurId) {
      for (var i = 0; i < existingVals.length; i++) {
        var v = existingVals[i];
        if (v.critere_id === critereId && v.acteur_id === acteurId) return v;
      }
      return null;
    }

    var maxOrdre = -1;
    critList.forEach(function (c) { if (c.ordre > maxOrdre) maxOrdre = c.ordre; });

    var importDate = new Date().toISOString().split('T')[0];
    var historiqueRows = [];
    var actualiteRows = [];

    for (var si = 0; si < product.sections.length; si++) {
      var sec = product.sections[si];
      for (var ri = 0; ri < sec.rows.length; ri++) {
        var row = sec.rows[ri];
        var sectionTitle = sec.title || '';
        var crit = findCritere(sectionTitle, row.critere);

        if (!crit) {
          maxOrdre++;
          var { data: newCrit, error: newCritErr } = await sb
            .from('criteres')
            .insert({
              produit_id: product.id,
              section: sectionTitle,
              critere: row.critere,
              ordre: maxOrdre
            })
            .select('id, section, critere, ordre')
            .single();
          if (newCritErr) throw new Error('criteres insert: ' + newCritErr.message);
          crit = newCrit;
          critList.push(crit);
        }

        var actorNames = Object.keys(row.values || {});
        for (var vi = 0; vi < actorNames.length; vi++) {
          var actorNom = actorNames[vi];
          var newVal = String(row.values[actorNom] == null ? '' : row.values[actorNom]).trim();
          var acteurId = map[actorNom] || toActorId(actorNom);
          var existing = findValeur(crit.id, acteurId);
          var oldVal = existing ? String(existing.valeur || '').trim() : null;

          if (oldVal !== null && oldVal === newVal) continue;

          if (existing) {
            var { error: upErr } = await sb.from('valeurs')
              .update({ valeur: newVal })
              .eq('id', existing.id);
            if (upErr) throw new Error('valeurs update: ' + upErr.message);
            existing.valeur = newVal;
          } else {
            var { data: insVal, error: insErr } = await sb.from('valeurs')
              .insert({ critere_id: crit.id, acteur_id: acteurId, valeur: newVal })
              .select('id, critere_id, acteur_id, valeur')
              .single();
            if (insErr) throw new Error('valeurs insert: ' + insErr.message);
            existingVals.push(insVal);
          }

          stats.updated++;
          stats.changes++;

          historiqueRows.push({
            critere_id: crit.id,
            acteur_id: acteurId,
            produit_id: product.id,
            ancienne_valeur: oldVal != null ? oldVal : '',
            nouvelle_valeur: newVal,
            source: 'import'
          });

          var oldDisp = oldVal != null && oldVal !== '' ? oldVal : '(vide)';
          var newDisp = newVal !== '' ? newVal : '(vide)';
          actualiteRows.push({
            date: importDate,
            acteur_id: acteurId,
            type: 'Produit',
            produit_id: product.id,
            titre: 'Changement détecté : ' + row.critere + ' — ' + oldDisp + ' → ' + newDisp,
            source: 'Détecté via import',
            impact: null
          });
        }
      }
    }

    if (historiqueRows.length) {
      var { error: histErr } = await sb.from('historique').insert(historiqueRows);
      if (histErr) throw new Error('historique: ' + histErr.message);
    }

    if (actualiteRows.length) {
      var { error: actErr } = await sb.from('actualites').insert(actualiteRows);
      if (actErr) throw new Error('actualites: ' + actErr.message);
      stats.actualites = actualiteRows.length;
    }

    if (stats.changes > 0) {
      await touchProduitUpdatedAt(sb, [product.id]);
    }

    return { map: map, stats: stats };
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
    if (Object.keys(promosObj).length) {
      await touchProduitUpdatedAt(sb, Object.keys(promosObj));
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

  async function syncAllFromImport(sb, data, idByNom, groups, domains, importedProductIds) {
    var map = Object.assign({}, idByNom);
    var totals = { updated: 0, changes: 0, actualites: 0 };
    var idSet = {};
    if (importedProductIds && importedProductIds.length) {
      importedProductIds.forEach(function (id) { idSet[id] = true; });
    }

    for (var i = 0; i < data.produits.length; i++) {
      var p = data.produits[i];
      if (importedProductIds && importedProductIds.length && !idSet[p.id]) continue;
      if (!p.sections || !p.sections.length) continue;
      var res = await syncProductToSupabase(sb, p, map, groups, domains);
      Object.assign(map, res.map);
      totals.updated += res.stats.updated;
      totals.changes += res.stats.changes;
      totals.actualites += res.stats.actualites;
    }

    var m2 = await syncPromosToSupabase(sb, data.promos, map, groups, domains);
    Object.assign(map, m2);
    var m3 = await syncDifferenciateursToSupabase(sb, data.differenciateurs, map, groups, domains);
    Object.assign(map, m3);

    return { map: map, stats: totals };
  }

  async function touchProduitUpdatedAt(sb, produitIds) {
    var seen = {};
    (produitIds || []).forEach(function (id) { if (id) seen[id] = true; });
    var ids = Object.keys(seen);
    if (!ids.length) return;
    var now = new Date().toISOString();
    for (var i = 0; i < ids.length; i++) {
      var { error } = await sb.from('produits').update({ updated_at: now }).eq('id', ids[i]);
      if (error) throw new Error('produits.updated_at: ' + error.message);
    }
  }

  async function syncTauxCrFromImport(sb, entries, idByNom, groups, domains) {
    if (!entries || !entries.length) return { map: idByNom || {}, count: 0 };
    var map = Object.assign({}, idByNom || {});
    var actorNames = entries.map(function (e) { return e.actor; }).filter(Boolean);
    var unique = actorNames.filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (unique.length) {
      var merged = await ensureActors(sb, unique, groups, domains);
      Object.assign(map, merged);
    }

    var rows = [];
    entries.forEach(function (entry) {
      var acteurId = map[entry.actor] || toActorId(entry.actor);
      if (!acteurId) return;
      rows.push({
        acteur_id: acteurId,
        produit_nom: String(entry.produit_nom || '').trim(),
        categorie: entry.categorie === 'bancaire' ? 'bancaire' : 'financiere',
        rows: entry.rows || [],
        commentaire: entry.commentaire || null
      });
    });

    if (!rows.length) return { map: map, count: 0 };

    var { error } = await sb.from('taux_cr').upsert(rows, { onConflict: 'acteur_id,produit_nom' });
    if (error) throw new Error('taux_cr: ' + error.message);

    await touchProduitUpdatedAt(sb, ['pb', 'cr', 'rac']);
    return { map: map, count: rows.length };
  }

  global.SofincoSupabase = {
    toActorId: toActorId,
    createClient: createClient,
    loadAllData: loadAllData,
    syncProductToSupabase: syncProductToSupabase,
    syncPromosToSupabase: syncPromosToSupabase,
    syncDifferenciateursToSupabase: syncDifferenciateursToSupabase,
    syncAllFromImport: syncAllFromImport,
    syncTauxCrFromImport: syncTauxCrFromImport,
    touchProduitUpdatedAt: touchProduitUpdatedAt
  };
})(window);
