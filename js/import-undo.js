/**
 * Annulation du dernier import Excel — instantané unique (table import_undo_snapshot).
 *
 * Choix de stockage : une ligne JSONB `payload` dans `import_undo_snapshot` (id='last').
 * Plus simple qu'une table par entité : un seul niveau, remplacement atomique à chaque import.
 */
(function (global) {
  var SNAPSHOT_ID = 'last';

  async function fetchAllRows (sb, table, queryFn) {
    var rows = [];
    var from = 0;
    var pageSize = 500;
    while (true) {
      var q = sb.from(table).select('*');
      if (queryFn) q = queryFn(q);
      var res = await q.range(from, from + pageSize - 1);
      if (res.error) throw new Error(table + ': ' + res.error.message);
      if (!res.data || !res.data.length) break;
      rows = rows.concat(res.data);
      if (res.data.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  function buildImportUndoScope (wb, data, opts) {
    opts = opts || {};
    var scope = {
      productIds: opts.importedProductIds || [],
      promoProductIds: Object.keys(data.promos || {}),
      diffProductIds: Object.keys(data.differenciateurs || {}),
      diffCategories: Object.keys(opts.diffsByCategorie || {}),
      snapshotAllActualites: false,
      snapshotAllTendances: false,
      snapshotTauxCr: false
    };
    if (!wb || !wb.SheetNames) return scope;
    if (wb.SheetNames.indexOf('ACTUALITES') >= 0) scope.snapshotAllActualites = true;
    if (wb.SheetNames.indexOf('DECRYPTAGE') >= 0) scope.snapshotAllTendances = true;
    if (opts.hasTauxImport) scope.snapshotTauxCr = true;
    if (scope.productIds.length) scope.snapshotAllActualites = true;
    return scope;
  }

  async function captureImportUndoPayload (sb, scope) {
    var payload = {
      criteres: [],
      valeurs: [],
      historique: [],
      promos: [],
      differenciateurs: [],
      actualites: [],
      tendances: [],
      taux_cr: [],
      taux_cr_meta: null,
      app_meta: null,
      produits_updated_at: []
    };

    if (scope.productIds && scope.productIds.length) {
      payload.criteres = await fetchAllRows(sb, 'criteres', function (q) {
        return q.in('produit_id', scope.productIds);
      });
      var critIds = payload.criteres.map(function (c) { return c.id; });
      if (critIds.length) {
        payload.valeurs = await fetchAllRows(sb, 'valeurs', function (q) {
          return q.in('critere_id', critIds);
        });
      }
      payload.historique = await fetchAllRows(sb, 'historique', function (q) {
        return q.in('produit_id', scope.productIds);
      });
      var prodRes = await sb.from('produits').select('id, updated_at').in('id', scope.productIds);
      if (prodRes.error) throw new Error('produits: ' + prodRes.error.message);
      payload.produits_updated_at = prodRes.data || [];
    }

    if (scope.promoProductIds && scope.promoProductIds.length) {
      payload.promos = await fetchAllRows(sb, 'promos', function (q) {
        return q.in('produit_id', scope.promoProductIds);
      });
    }

    var diffRows = [];
    if (scope.diffProductIds && scope.diffProductIds.length) {
      var d1 = await fetchAllRows(sb, 'differenciateurs', function (q) {
        return q.in('produit_id', scope.diffProductIds).is('categorie', null);
      });
      diffRows = diffRows.concat(d1);
    }
    if (scope.diffCategories && scope.diffCategories.length) {
      var d2 = await fetchAllRows(sb, 'differenciateurs', function (q) {
        return q.in('categorie', scope.diffCategories).is('produit_id', null);
      });
      diffRows = diffRows.concat(d2);
    }
    payload.differenciateurs = diffRows;

    if (scope.snapshotAllActualites) {
      payload.actualites = await fetchAllRows(sb, 'actualites');
    }
    if (scope.snapshotAllTendances) {
      payload.tendances = await fetchAllRows(sb, 'tendances');
    }
    if (scope.snapshotTauxCr) {
      payload.taux_cr = await fetchAllRows(sb, 'taux_cr');
      var metaRes = await sb.from('taux_cr_meta').select('*').eq('id', 'cr').maybeSingle();
      if (metaRes.error) throw new Error('taux_cr_meta: ' + metaRes.error.message);
      payload.taux_cr_meta = metaRes.data || null;
    }

    var metaImport = await sb.from('app_meta').select('*').eq('id', 'global').maybeSingle();
    if (!metaImport.error) payload.app_meta = metaImport.data || null;

    return payload;
  }

  async function saveImportUndoSnapshot (sb, scope, payload, importDate) {
    var row = {
      id: SNAPSHOT_ID,
      created_at: new Date().toISOString(),
      import_date: importDate || new Date().toISOString().slice(0, 10),
      scope: scope,
      payload: payload,
      available: true
    };
    var res = await sb.from('import_undo_snapshot').upsert(row, { onConflict: 'id' });
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    return row;
  }

  async function getImportUndoStatus (sb) {
    var res = await sb.from('import_undo_snapshot').select('available, import_date, created_at').eq('id', SNAPSHOT_ID).maybeSingle();
    if (res.error) {
      if (res.error.message && res.error.message.indexOf('import_undo_snapshot') >= 0) {
        return { available: false, migrationRequired: true };
      }
      throw new Error('import_undo_snapshot: ' + res.error.message);
    }
    if (!res.data || !res.data.available) return { available: false };
    return {
      available: true,
      importDate: res.data.import_date,
      createdAt: res.data.created_at
    };
  }

  async function loadImportUndoSnapshot (sb) {
    var res = await sb.from('import_undo_snapshot').select('*').eq('id', SNAPSHOT_ID).maybeSingle();
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    if (!res.data || !res.data.available) return null;
    return res.data;
  }

  async function deleteByIds (sb, table, ids) {
    if (!ids || !ids.length) return;
    var chunk = 80;
    for (var i = 0; i < ids.length; i += chunk) {
      var slice = ids.slice(i, i + chunk);
      var del = await sb.from(table).delete().in('id', slice);
      if (del.error) throw new Error('delete ' + table + ': ' + del.error.message);
    }
  }

  async function replaceScopedRows (sb, table, deleteFilter, snapshotRows) {
    var existing = await fetchAllRows(sb, table, deleteFilter);
    if (existing.length) {
      await deleteByIds(sb, table, existing.map(function (r) { return r.id; }));
    }
    if (snapshotRows && snapshotRows.length) {
      var ins = await sb.from(table).insert(snapshotRows);
      if (ins.error) throw new Error('insert ' + table + ': ' + ins.error.message);
    }
  }

  async function restoreImportUndoSnapshot (sb) {
    var snap = await loadImportUndoSnapshot(sb);
    if (!snap) throw new Error('Aucun import récent à annuler.');
    var scope = snap.scope || {};
    var payload = snap.payload || {};

    if (scope.productIds && scope.productIds.length) {
      var critIds = (await fetchAllRows(sb, 'criteres', function (q) {
        return q.in('produit_id', scope.productIds);
      })).map(function (c) { return c.id; });
      if (critIds.length) {
        var valIds = (await fetchAllRows(sb, 'valeurs', function (q) {
          return q.in('critere_id', critIds);
        })).map(function (v) { return v.id; });
        await deleteByIds(sb, 'valeurs', valIds);
      }
      var histIds = (await fetchAllRows(sb, 'historique', function (q) {
        return q.in('produit_id', scope.productIds);
      })).map(function (h) { return h.id; });
      await deleteByIds(sb, 'historique', histIds);
      var curCritIds = (await fetchAllRows(sb, 'criteres', function (q) {
        return q.in('produit_id', scope.productIds);
      })).map(function (c) { return c.id; });
      await deleteByIds(sb, 'criteres', curCritIds);
      if (payload.criteres && payload.criteres.length) {
        var insC = await sb.from('criteres').insert(payload.criteres);
        if (insC.error) throw new Error('restore criteres: ' + insC.error.message);
      }
      if (payload.valeurs && payload.valeurs.length) {
        var insV = await sb.from('valeurs').insert(payload.valeurs);
        if (insV.error) throw new Error('restore valeurs: ' + insV.error.message);
      }
      if (payload.historique && payload.historique.length) {
        var insH = await sb.from('historique').insert(payload.historique);
        if (insH.error) throw new Error('restore historique: ' + insH.error.message);
      }
      if (payload.produits_updated_at && payload.produits_updated_at.length) {
        for (var pi = 0; pi < payload.produits_updated_at.length; pi++) {
          var pr = payload.produits_updated_at[pi];
          var upP = await sb.from('produits').update({ updated_at: pr.updated_at || null }).eq('id', pr.id);
          if (upP.error) throw new Error('restore produits.updated_at: ' + upP.error.message);
        }
      }
    }

    if (scope.promoProductIds && scope.promoProductIds.length) {
      var delPromos = await sb.from('promos').delete().in('produit_id', scope.promoProductIds);
      if (delPromos.error) throw new Error('restore promos delete: ' + delPromos.error.message);
      if (payload.promos && payload.promos.length) {
        var insP = await sb.from('promos').insert(payload.promos);
        if (insP.error) throw new Error('restore promos: ' + insP.error.message);
      }
    }

    if ((scope.diffProductIds && scope.diffProductIds.length) || (scope.diffCategories && scope.diffCategories.length)) {
      var toDelete = [];
      if (scope.diffProductIds && scope.diffProductIds.length) {
        var curD1 = await fetchAllRows(sb, 'differenciateurs', function (q) {
          return q.in('produit_id', scope.diffProductIds).is('categorie', null);
        });
        toDelete = toDelete.concat(curD1);
      }
      if (scope.diffCategories && scope.diffCategories.length) {
        var curD2 = await fetchAllRows(sb, 'differenciateurs', function (q) {
          return q.in('categorie', scope.diffCategories).is('produit_id', null);
        });
        toDelete = toDelete.concat(curD2);
      }
      await deleteByIds(sb, 'differenciateurs', toDelete.map(function (d) { return d.id; }));
      if (payload.differenciateurs && payload.differenciateurs.length) {
        var insD = await sb.from('differenciateurs').insert(payload.differenciateurs);
        if (insD.error) throw new Error('restore differenciateurs: ' + insD.error.message);
      }
    }

    if (scope.snapshotAllActualites) {
      var actuIds = (await fetchAllRows(sb, 'actualites')).map(function (a) { return a.id; });
      await deleteByIds(sb, 'actualites', actuIds);
      if (payload.actualites && payload.actualites.length) {
        var insA = await sb.from('actualites').insert(payload.actualites);
        if (insA.error) throw new Error('restore actualites: ' + insA.error.message);
      }
    }

    if (scope.snapshotAllTendances) {
      var tendIds = (await fetchAllRows(sb, 'tendances')).map(function (t) { return t.id; });
      await deleteByIds(sb, 'tendances', tendIds);
      if (payload.tendances && payload.tendances.length) {
        var insT = await sb.from('tendances').insert(payload.tendances);
        if (insT.error) throw new Error('restore tendances: ' + insT.error.message);
      }
    }

    if (scope.snapshotTauxCr) {
      var tauxIds = (await fetchAllRows(sb, 'taux_cr')).map(function (t) { return t.id; });
      await deleteByIds(sb, 'taux_cr', tauxIds);
      if (payload.taux_cr && payload.taux_cr.length) {
        var insTx = await sb.from('taux_cr').insert(payload.taux_cr);
        if (insTx.error) throw new Error('restore taux_cr: ' + insTx.error.message);
      }
      if (payload.taux_cr_meta) {
        var upMeta = await sb.from('taux_cr_meta').upsert(payload.taux_cr_meta, { onConflict: 'id' });
        if (upMeta.error) throw new Error('restore taux_cr_meta: ' + upMeta.error.message);
      }
    }

    if (payload.app_meta) {
      var upApp = await sb.from('app_meta').upsert(payload.app_meta, { onConflict: 'id' });
      if (upApp.error) throw new Error('restore app_meta: ' + upApp.error.message);
    }

    var mark = await sb.from('import_undo_snapshot').update({ available: false }).eq('id', SNAPSHOT_ID);
    if (mark.error) throw new Error('import_undo_snapshot: ' + mark.error.message);

    return { restored: true, importDate: snap.import_date };
  }

  global.SofincoImportUndo = {
    buildImportUndoScope: buildImportUndoScope,
    captureImportUndoPayload: captureImportUndoPayload,
    saveImportUndoSnapshot: saveImportUndoSnapshot,
    getImportUndoStatus: getImportUndoStatus,
    restoreImportUndoSnapshot: restoreImportUndoSnapshot
  };
})(typeof window !== 'undefined' ? window : globalThis);
