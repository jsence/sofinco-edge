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
    var diffsByCategorie = {};
    diffs.forEach(function (d) {
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
      if (d.categorie) {
        if (!diffsByCategorie[d.categorie]) diffsByCategorie[d.categorie] = {};
        diffsByCategorie[d.categorie][nom] = entry;
      } else if (d.produit_id) {
        if (!diffsObj[d.produit_id]) diffsObj[d.produit_id] = {};
        diffsObj[d.produit_id][nom] = entry;
      }
    });

    var tendObj = {};
    var tendByCategorie = {};
    tendances.forEach(function (t) {
      var item = {
        titre: t.titre,
        description: t.description,
        acteurs: (t.acteurs_concernes || []).map(function (id) { return nomById[id]; }).filter(Boolean),
        status: t.status || undefined,
        portee: t.portee || 'produit',
        produit: t.produit_id || null
      };
      if (t.categorie) {
        if (!tendByCategorie[t.categorie]) tendByCategorie[t.categorie] = [];
        tendByCategorie[t.categorie].push(item);
      } else if (t.produit_id) {
        if (!tendObj[t.produit_id]) tendObj[t.produit_id] = [];
        tendObj[t.produit_id].push(item);
      }
    });

    var IMPACT_REV = { a_surveiller: 'à surveiller', menace_directe: 'menace directe', neutre: 'neutre' };
    var actualitesData = actualites.map(function (a) {
      return {
        id: a.id,
        date: a.date,
        acteur: a.acteur_id ? nomById[a.acteur_id] : null,
        type: a.type,
        produit: a.produit_id,
        categorie: a.categorie || null,
        titre: a.titre,
        resume: a.resume || null,
        fiabilite: a.fiabilite || null,
        source: a.source,
        impact: IMPACT_REV[a.impact] || a.impact,
        a_la_une: !!a.a_la_une
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
        differenciateursByCategorie: diffsByCategorie,
        tendances: tendObj,
        tendancesByCategorie: tendByCategorie,
        taux: taux,
        actualites: actualitesData,
        indicateurs: indicateursData,
        texteLibre: texteLibreObj,
        lastImportAt: null
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

    var lastImportAt = await loadLastImportAt(sb);

    var built = buildInMemoryData(
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
    built.data.lastImportAt = lastImportAt;
    return built;
  }

  async function loadLastImportAt (sb) {
    var res = await sb.from('app_meta').select('last_import_at').eq('id', 'global').maybeSingle();
    if (res.error) {
      console.warn('app_meta:', res.error.message);
      return null;
    }
    var d = res.data && res.data.last_import_at;
    if (!d) return null;
    if (String(d).indexOf('T') >= 0) d = String(d).split('T')[0];
    return String(d).slice(0, 10);
  }

  async function recordLastImportAt (sb, dateIso) {
    dateIso = dateIso || new Date().toISOString().slice(0, 10);
    var res = await sb.from('app_meta').upsert({ id: 'global', last_import_at: dateIso }, { onConflict: 'id' });
    if (res.error) {
      console.warn('app_meta last_import_at:', res.error.message);
    }
    return dateIso;
  }

  async function ensureActors(sb, actorNames, groups, domains) {
    var seenIds = {};
    var rows = [];
    actorNames.forEach(function (nom) {
      if (!nom) return;
      var id = toActorId(nom);
      if (seenIds[id]) return;
      seenIds[id] = 1;
      rows.push({
        id: id,
        nom: nom,
        groupe: (groups && groups[nom]) || null,
        domaine: (domains && domains[nom]) || null,
        est_nous: nom === 'Sofinco'
      });
    });
    if (!rows.length) return {};
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

  async function upsertDifferenciateurRow (sb, row, opts) {
    var selectSingle = opts && opts.selectSingle;
    var isCategory = row.categorie != null && row.categorie !== '';
    var sel = sb.from('differenciateurs').select(selectSingle ? '*' : 'id');
    if (isCategory) {
      sel = sel.eq('categorie', row.categorie).eq('acteur_id', row.acteur_id).is('produit_id', null);
    } else {
      sel = sel.eq('produit_id', row.produit_id).eq('acteur_id', row.acteur_id).is('categorie', null);
    }
    var existingRes = await sel.maybeSingle();
    if (existingRes.error) throw new Error('differenciateurs: ' + existingRes.error.message);
    if (existingRes.data && existingRes.data.id) {
      var upd = await sb.from('differenciateurs').update(row).eq('id', existingRes.data.id);
      if (upd.error) throw new Error('differenciateurs: ' + upd.error.message);
      if (selectSingle) {
        var refreshed = await sb.from('differenciateurs').select('*').eq('id', existingRes.data.id).single();
        if (refreshed.error) throw new Error('differenciateurs: ' + refreshed.error.message);
        return refreshed.data;
      }
      return existingRes.data;
    }
    if (selectSingle) {
      var ins = await sb.from('differenciateurs').insert(row).select('*').single();
      if (ins.error) throw new Error('differenciateurs: ' + ins.error.message);
      return ins.data;
    }
    var insPlain = await sb.from('differenciateurs').insert(row);
    if (insPlain.error) throw new Error('differenciateurs: ' + insPlain.error.message);
    return null;
  }

  async function syncDifferenciateursByCategorieFromImport (sb, diffsObj, idByNom, groups, domains) {
    if (!diffsObj || !Object.keys(diffsObj).length) return { map: idByNom || {} };
    return syncDifferenciateursScopeToSupabase(sb, diffsObj, idByNom, groups, domains, 'categorie');
  }

  async function syncDifferenciateursScopeToSupabase (sb, diffsObj, idByNom, groups, domains, scope) {
    var isCategory = scope === 'categorie';
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
      var scopeId = entry[0];
      Object.entries(entry[1]).forEach(function (ae) {
        var nom = ae[0];
        var d = ae[1];
        var row = {
          acteur_id: map[nom] || toActorId(nom),
          difference: d.difference || null,
          pourquoi: d.pourquoi || null,
          conclusion: d.positionnement || d.conclusion || '',
          tags: d.tags || [],
          status: d.status || null
        };
        if (isCategory) {
          row.produit_id = null;
          row.categorie = scopeId;
        } else {
          row.produit_id = scopeId;
          row.categorie = null;
        }
        rows.push(row);
      });
    });

    if (rows.length) {
      for (var ri = 0; ri < rows.length; ri++) {
        await upsertDifferenciateurRow(sb, rows[ri]);
      }
    }
    return { map: map };
  }

  async function syncDifferenciateursToSupabase(sb, diffsObj, idByNom, groups, domains) {
    var res = await syncDifferenciateursScopeToSupabase(sb, diffsObj, idByNom, groups, domains, 'produit');
    return res.map;
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

  var IMPACT_TO_DB = {
    'à surveiller': 'a_surveiller',
    'a_surveiller': 'a_surveiller',
    'menace directe': 'menace_directe',
    'menace_directe': 'menace_directe',
    'neutre': 'neutre'
  };

  function normalizeFiabiliteImport (raw) {
    if (!raw) return null;
    var s = String(raw).trim().toLowerCase();
    if (s.indexOf('verif') >= 0) return 'a_verifier';
    if (s.indexOf('confirm') >= 0) return 'confirmee';
    return null;
  }

  function normalizeImportDateIso (value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
      return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
    }
    if (typeof value === 'number' && value > 20000 && value < 120000) {
      var utc = (value - 25569) * 86400 * 1000;
      var d = new Date(utc);
      if (!isNaN(d.getTime())) {
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
    }
    var s = String(value).trim();
    if (!s) return null;
    var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
    var fr = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (fr) return fr[3] + '-' + fr[2].padStart(2, '0') + '-' + fr[1].padStart(2, '0');
    if (/^\d{5,6}$/.test(s)) {
      var n = Number(s);
      var utc2 = (n - 25569) * 86400 * 1000;
      var d2 = new Date(utc2);
      if (!isNaN(d2.getTime())) {
        return d2.getUTCFullYear() + '-' + String(d2.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d2.getUTCDate()).padStart(2, '0');
      }
    }
    return null;
  }

  var actualitesALaUneColumnOk = null;
  var ACTUALITES_A_LA_UNE_MIGRATION = 'supabase/migrations/20250902160000_actualites_a_la_une.sql';

  async function probeActualitesALaUneColumn (sb, options) {
    options = options || {};
    if (!options.forceRecheck && actualitesALaUneColumnOk === true) return true;
    var res = await sb.from('actualites').select('a_la_une').limit(1);
    if (res.error) {
      actualitesALaUneColumnOk = false;
      return false;
    }
    actualitesALaUneColumnOk = true;
    return true;
  }

  function actualitesALaUneMigrationHint () {
    return 'Colonne actualites.a_la_une absente — appliquez la migration ' + ACTUALITES_A_LA_UNE_MIGRATION;
  }

  async function setActualiteALaUne(sb, actualiteId) {
    if (!actualiteId) throw new Error('Identifiant actualité requis.');
    if (!(await probeActualitesALaUneColumn(sb))) {
      throw new Error(actualitesALaUneMigrationHint());
    }
    var { error: clearErr } = await sb.from('actualites').update({ a_la_une: false }).eq('a_la_une', true);
    if (clearErr) throw new Error('actualites: ' + clearErr.message);
    var { data, error } = await sb.from('actualites').update({ a_la_une: true }).eq('id', actualiteId).select('*').single();
    if (error) throw new Error('actualites: ' + error.message);
    return data;
  }

  async function clearActualiteALaUne(sb) {
    if (!(await probeActualitesALaUneColumn(sb))) {
      throw new Error(actualitesALaUneMigrationHint());
    }
    var { error } = await sb.from('actualites').update({ a_la_une: false }).eq('a_la_une', true);
    if (error) throw new Error('actualites: ' + error.message);
  }

  async function deleteActualiteById(sb, actualiteId) {
    if (!actualiteId) throw new Error('Identifiant actualité requis.');
    var { error } = await sb.from('actualites').delete().eq('id', actualiteId);
    if (error) throw new Error('actualites: ' + error.message);
  }

  async function syncActualitesFromImport(sb, rows, idByNom, groups, domains) {
    if (!rows || !rows.length) return { map: idByNom || {}, count: 0, warnings: [] };
    var map = Object.assign({}, idByNom || {});
    var warnings = [];
    var needsFeatured = rows.some(function (r) { return !!r.a_la_une; });
    var supportsFeatured = await probeActualitesALaUneColumn(sb, { forceRecheck: needsFeatured });
    var actorNames = rows.map(function (r) { return r.acteur; }).filter(Boolean);
    var uniqueNames = actorNames.filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (uniqueNames.length) {
      var merged = await ensureActors(sb, uniqueNames, groups, domains);
      Object.assign(map, merged);
    }

    var count = 0;
    var lastFeaturedId = null;
    var wantsFeatured = false;
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var titre = String(row.titre || '').trim();
      if (!titre) continue;
      if (row.a_la_une) wantsFeatured = true;
      var acteurId = null;
      if (row.acteur) {
        acteurId = map[row.acteur] || toActorId(row.acteur);
      }
      var impactKey = IMPACT_TO_DB[String(row.impact || '').toLowerCase()] || null;
      var dbRow = {
        date: normalizeImportDateIso(row.date) || new Date().toISOString().slice(0, 10),
        acteur_id: acteurId,
        type: String(row.type || 'Corporate').trim() || 'Corporate',
        produit_id: row.produit_id || null,
        categorie: row.categorie || null,
        titre: titre,
        resume: row.resume ? String(row.resume).trim() : null,
        fiabilite: normalizeFiabiliteImport(row.fiabilite),
        source: row.source ? String(row.source).trim() : null,
        impact: impactKey
      };
      var ins = await sb.from('actualites').insert(dbRow).select('id').single();
      if (ins.error) throw new Error('actualites: ' + ins.error.message);
      count++;
      if (row.a_la_une) lastFeaturedId = ins.data.id;
    }

    if (!count) return { map: map, count: 0, warnings: warnings };

    if (lastFeaturedId) {
      if (supportsFeatured) {
        await setActualiteALaUne(sb, lastFeaturedId);
      } else {
        warnings.push({
          sheet: 'ACTUALITES',
          row: 0,
          reason: 'Colonne a_la_une absente — « À la une » non appliqué (migration ' + ACTUALITES_A_LA_UNE_MIGRATION + ')'
        });
      }
    } else if (wantsFeatured && !supportsFeatured) {
      warnings.push({
        sheet: 'ACTUALITES',
        row: 0,
        reason: 'Colonne a_la_une absente — colonne Une ignorée (migration requise)'
      });
    }

    return { map: map, count: count, warnings: warnings };
  }

  function resolveActorIdFromMap (nom, idByNom) {
    if (!nom) return null;
    var s = String(nom).trim();
    if (!s) return null;
    if (idByNom[s]) return idByNom[s];
    var keys = Object.keys(idByNom);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === s.toLowerCase()) return idByNom[keys[i]];
    }
    var cid = toActorId(s);
    for (var j = 0; j < keys.length; j++) {
      if (idByNom[keys[j]] === cid) return cid;
    }
    return null;
  }

  async function syncTendancesFromImport (sb, rows, idByNom) {
    if (!rows || !rows.length) return { map: idByNom || {}, count: 0 };
    var map = Object.assign({}, idByNom || {});
    var dbRows = [];
    rows.forEach(function (row) {
      var titre = String(row.titre || '').trim();
      if (!titre) return;
      var categorie = row.categorie || null;
      var produitId = categorie ? null : row.produit_id;
      if (!categorie && !produitId) return;
      var acteurIds = [];
      (row.acteurs_concernes || []).forEach(function (nom) {
        var id = resolveActorIdFromMap(nom, map);
        if (id) acteurIds.push(id);
      });
      dbRows.push({
        produit_id: produitId,
        categorie: categorie,
        titre: titre,
        description: row.description ? String(row.description).trim() : '',
        acteurs_concernes: acteurIds,
        portee: row.portee === 'benchmark' ? 'benchmark' : 'produit',
        status: null
      });
    });
    if (!dbRows.length) return { map: map, count: 0 };
    var { error } = await sb.from('tendances').insert(dbRows);
    if (error) throw new Error('tendances: ' + error.message);
    return { map: map, count: dbRows.length };
  }

  async function ensureActorByName(sb, nom, idByNom) {
    var map = Object.assign({}, idByNom || {});
    if (!nom) throw new Error('Acteur requis.');
    if (map[nom]) return map;
    var merged = await ensureActors(sb, [nom], {}, {});
    Object.assign(map, merged);
    return map;
  }

  async function insertContributionActualite(sb, payload, idByNom) {
    var map = await ensureActorByName(sb, payload.acteur, idByNom);
    var acteurId = map[payload.acteur];
    var titre = String(payload.titre || '').trim();
    var resume = payload.resume ? String(payload.resume).trim() : null;
    var fiabilite = payload.fiabilite === 'a_verifier' ? 'a_verifier' : (payload.fiabilite === 'confirmee' ? 'confirmee' : null);
    var impactKey = IMPACT_TO_DB[String(payload.impact || '').toLowerCase()] || null;
    var row = {
      date: normalizeImportDateIso(payload.date) || new Date().toISOString().slice(0, 10),
      acteur_id: acteurId,
      type: payload.type,
      produit_id: payload.produit_id || null,
      titre: titre,
      resume: resume || null,
      fiabilite: fiabilite,
      source: payload.source,
      impact: impactKey
    };
    var { data, error } = await sb.from('actualites').insert(row).select('*').single();
    if (error) throw new Error('actualites: ' + error.message);
    var supportsFeatured = await probeActualitesALaUneColumn(sb);
    if (payload.a_la_une && supportsFeatured) {
      await setActualiteALaUne(sb, data.id);
      data.a_la_une = true;
    }
    return { row: data, map: map, featuredSkipped: !!(payload.a_la_une && !supportsFeatured) };
  }

  async function upsertContributionDifferenciateur(sb, payload, idByNom) {
    if (!payload.produit_id && !payload.categorie) throw new Error('Produit ou catégorie requis pour un différenciateur.');
    var map = Object.assign({}, idByNom || {});
    var acteurId = payload.acteur_id || null;
    var acteurNom = payload.acteur ? String(payload.acteur).trim() : '';
    if (acteurNom) {
      map = await ensureActorByName(sb, acteurNom, map);
      acteurId = map[acteurNom];
    }
    if (!acteurId) throw new Error('Acteur requis pour un différenciateur.');

    var tags = (payload.tags || []).filter(Boolean);
    var periode = payload.periode ? String(payload.periode).trim() : '';
    var detail = payload.difference != null ? String(payload.difference).trim() : String(payload.detail || '').trim();
    var conclusion = String(payload.conclusion || '').trim();
    var pourquoi = payload.pourquoi != null && String(payload.pourquoi).trim()
      ? String(payload.pourquoi).trim()
      : (periode ? ('Période : ' + periode + (detail ? '\n' + detail : '')) : detail);
    var status = payload.status === 'genere' ? 'genere' : (payload.status === 'valide' ? 'valide' : 'valide');
    var row = {
      produit_id: payload.produit_id,
      categorie: payload.categorie || null,
      acteur_id: acteurId,
      difference: detail || null,
      pourquoi: pourquoi || null,
      conclusion: conclusion || null,
      tags: tags,
      status: status
    };
    if (!row.produit_id && !row.categorie) throw new Error('Produit ou catégorie requis pour un différenciateur.');
    var data = await upsertDifferenciateurRow(sb, row, { selectSingle: true });
    return { row: data, map: map };
  }

  async function insertContributionTendance(sb, payload, idByNom) {
    if (!payload.produit_id) throw new Error('Produit requis pour une tendance.');
    var map = Object.assign({}, idByNom || {});
    var acteurIds = [];
    if (payload.acteur) {
      map = await ensureActorByName(sb, payload.acteur, map);
      acteurIds.push(map[payload.acteur]);
    }
    var titre = String(payload.conclusion || payload.titre || '').trim();
    var periode = payload.periode ? String(payload.periode).trim() : '';
    if (payload.syntheseType === 'synthese_mensuelle' && periode) {
      titre = 'Synthèse mensuelle — ' + periode + (titre ? ' : ' + titre : '');
    } else if (periode && titre.indexOf(periode) < 0) {
      titre = titre ? (titre + ' (' + periode + ')') : periode;
    }
    if (!titre) throw new Error('Titre requis pour une tendance.');
    var description = String(payload.detail || '').trim();
    var row = {
      produit_id: payload.produit_id,
      titre: titre,
      description: description,
      acteurs_concernes: acteurIds,
      status: 'valide',
      portee: payload.portee === 'benchmark' ? 'benchmark' : 'produit'
    };
    var { data, error } = await sb.from('tendances').insert(row).select('*').single();
    if (error) throw new Error('tendances: ' + error.message);
    return { row: data, map: map };
  }

  function buildActualiteDbRow(payload, acteurId) {
    var titre = String(payload.titre || '').trim();
    var resume = payload.resume ? String(payload.resume).trim() : null;
    var fiabilite = payload.fiabilite === 'a_verifier' ? 'a_verifier' : (payload.fiabilite === 'confirmee' ? 'confirmee' : null);
    var impactKey = IMPACT_TO_DB[String(payload.impact || '').toLowerCase()] || null;
    return {
      date: payload.date || new Date().toISOString().slice(0, 10),
      acteur_id: acteurId,
      type: payload.type,
      produit_id: payload.produit_id || null,
      titre: titre,
      resume: resume || null,
      fiabilite: fiabilite,
      source: payload.source,
      impact: impactKey
    };
  }

  async function publishContributionEntriesBulk(sb, entries, idByNom) {
    var map = Object.assign({}, idByNom || {});
    var results = [];
    var actuEntries = entries.filter(function (e) { return e.mode === 'actu'; });
    var synthEntries = entries.filter(function (e) { return e.mode === 'synth'; });

    if (actuEntries.length) {
      var acteurNames = [];
      actuEntries.forEach(function (e) { if (e.payload.acteur) acteurNames.push(e.payload.acteur); });
      var uniqueNames = acteurNames.filter(function (n, i, a) { return a.indexOf(n) === i; });
      if (uniqueNames.length) {
        var merged = await ensureActors(sb, uniqueNames, {}, {});
        Object.assign(map, merged);
      }
      var actuRows = actuEntries.map(function (e) {
        return buildActualiteDbRow(e.payload, map[e.payload.acteur]);
      });
      var batchRes = await sb.from('actualites').insert(actuRows).select('*');
      if (batchRes.error) {
        for (var ai = 0; ai < actuEntries.length; ai++) {
          try {
            var one = await insertContributionActualite(sb, actuEntries[ai].payload, map);
            Object.assign(map, one.map);
            results.push({ bulkIndex: actuEntries[ai].bulkIndex, ok: true });
          } catch (e) {
            results.push({ bulkIndex: actuEntries[ai].bulkIndex, ok: false, error: e.message || String(e) });
          }
        }
      } else {
        actuEntries.forEach(function (e) {
          results.push({ bulkIndex: e.bulkIndex, ok: true });
        });
      }
    }

    for (var si = 0; si < synthEntries.length; si++) {
      var entry = synthEntries[si];
      var payload = entry.payload;
      var synthType = payload.syntheseType;
      try {
        var res;
        if (synthType === 'nouveau_diff' || synthType === 'maj_diff') {
          res = await upsertContributionDifferenciateur(sb, payload, map);
        } else {
          res = await insertContributionTendance(sb, payload, map);
        }
        Object.assign(map, res.map);
        results.push({ bulkIndex: entry.bulkIndex, ok: true });
      } catch (e) {
        results.push({ bulkIndex: entry.bulkIndex, ok: false, error: e.message || String(e) });
      }
    }

    return { map: map, results: results };
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

  function resolveActeurId(entry, map) {
    if (entry.acteur_id) return entry.acteur_id;
    if (entry.acteur && map[entry.acteur]) return map[entry.acteur];
    if (entry.acteur) return toActorId(entry.acteur);
    return null;
  }

  function promoKey(produitId, acteurId) {
    return produitId + '\0' + acteurId;
  }

  async function findExistingPromos(sb, promoEntries, idByNom) {
    var map = Object.assign({}, idByNom || {});
    var actorNames = [];
    promoEntries.forEach(function (e) {
      if (e.acteur) actorNames.push(e.acteur);
    });
    var uniqueNames = actorNames.filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (uniqueNames.length) {
      var merged = await ensureActors(sb, uniqueNames, {}, {});
      Object.assign(map, merged);
    }
    var pairs = [];
    promoEntries.forEach(function (e) {
      var pid = e.produit_id;
      var aid = resolveActeurId(e, map);
      if (pid && aid) pairs.push({ produit_id: pid, acteur_id: aid, bulkIndex: e.bulkIndex });
    });
    if (!pairs.length) return [];

    var produitIds = pairs.map(function (p) { return p.produit_id; });
    var { data, error } = await sb.from('promos').select('*').in('produit_id', produitIds);
    if (error) throw new Error('promos: ' + error.message);

    var existingByKey = {};
    (data || []).forEach(function (row) {
      existingByKey[promoKey(row.produit_id, row.acteur_id)] = row;
    });

    var duplicates = [];
    pairs.forEach(function (p) {
      var key = promoKey(p.produit_id, p.acteur_id);
      if (existingByKey[key]) {
        duplicates.push({
          bulkIndex: p.bulkIndex,
          produit_id: p.produit_id,
          acteur_id: p.acteur_id,
          existing: existingByKey[key]
        });
      }
    });
    return duplicates;
  }

  async function publishContributionPromosBulk(sb, payload, idByNom) {
    var map = Object.assign({}, idByNom || {});
    var promos = payload.promos || [];
    var replacePromoKeys = payload.replacePromoKeys || {};
    var results = [];
    var touchedProduits = {};
    var importDate = new Date().toISOString().slice(0, 10);

    var actorNames = [];
    promos.forEach(function (e) {
      if (e.acteur) actorNames.push(e.acteur);
    });
    var uniqueNames = actorNames.filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (uniqueNames.length) {
      var merged = await ensureActors(sb, uniqueNames, {}, {});
      Object.assign(map, merged);
    }

    for (var pi = 0; pi < promos.length; pi++) {
      var promo = promos[pi];
      var bulkIndex = promo.bulkIndex;
      try {
        var produitId = promo.produit_id;
        var acteurId = resolveActeurId(promo, map);
        if (!produitId) throw new Error('produit_id requis.');
        if (!acteurId) throw new Error('acteur_id requis.');

        var pKey = promoKey(produitId, acteurId);
        var shouldReplace = !!replacePromoKeys[pKey];

        var { data: existingPromos, error: promoFetchErr } = await sb.from('promos')
          .select('id')
          .eq('produit_id', produitId)
          .eq('acteur_id', acteurId);
        if (promoFetchErr) throw new Error('promos: ' + promoFetchErr.message);

        if (existingPromos && existingPromos.length && !shouldReplace) {
          throw new Error('Promo existante — confirmez le remplacement avant publication.');
        }

        var oldPromo = existingPromos && existingPromos.length ? existingPromos[0] : null;
        if (oldPromo) {
          var { error: delErr } = await sb.from('promos').delete().eq('id', oldPromo.id);
          if (delErr) throw new Error('promos: ' + delErr.message);
        }

        var promoRow = {
          produit_id: produitId,
          acteur_id: acteurId,
          taux: promo.taux || null,
          duree: promo.duree || null,
          montant: promo.montant || null,
          date_fin: promo.date_fin || null,
          canal: promo.canal || null,
          lien: promo.lien || null
        };
        var { error: insPromoErr } = await sb.from('promos').insert(promoRow);
        if (insPromoErr) throw new Error('promos: ' + insPromoErr.message);

        touchedProduits[produitId] = true;

        var acteurNom = promo.acteur || null;
        for (var nk in map) { if (map[nk] === acteurId) { acteurNom = nk; break; } }
        var titrePromo = oldPromo
          ? ('Mise à jour promo — ' + (acteurNom || acteurId))
          : ('Nouvelle promo — ' + (acteurNom || acteurId));
        var { error: actuPromoErr } = await sb.from('actualites').insert({
          date: importDate,
          acteur_id: acteurId,
          type: 'Produit',
          produit_id: produitId,
          titre: titrePromo,
          source: 'Import contributeur — Promos',
          impact: null
        });
        if (actuPromoErr) throw new Error('actualites: ' + actuPromoErr.message);

        results.push({ bulkIndex: bulkIndex, ok: true, kind: 'promo' });
      } catch (e) {
        results.push({ bulkIndex: bulkIndex, ok: false, kind: 'promo', error: e.message || String(e) });
      }
    }

    await touchProduitUpdatedAt(sb, Object.keys(touchedProduits));
    return { map: map, results: results };
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
    syncDifferenciateursByCategorieFromImport: syncDifferenciateursByCategorieFromImport,
    syncAllFromImport: syncAllFromImport,
    syncTauxCrFromImport: syncTauxCrFromImport,
    syncActualitesFromImport: syncActualitesFromImport,
    setActualiteALaUne: setActualiteALaUne,
    clearActualiteALaUne: clearActualiteALaUne,
    deleteActualiteById: deleteActualiteById,
    probeActualitesALaUneColumn: probeActualitesALaUneColumn,
    syncTendancesFromImport: syncTendancesFromImport,
    insertContributionActualite: insertContributionActualite,
    upsertContributionDifferenciateur: upsertContributionDifferenciateur,
    insertContributionTendance: insertContributionTendance,
    publishContributionEntriesBulk: publishContributionEntriesBulk,
    touchProduitUpdatedAt: touchProduitUpdatedAt,
    recordLastImportAt: recordLastImportAt,
    loadLastImportAt: loadLastImportAt,
    findExistingPromos: findExistingPromos,
    publishContributionPromosBulk: publishContributionPromosBulk
  };
})(window);
