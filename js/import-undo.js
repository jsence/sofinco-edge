/**
 * Annulation imports Excel — jusqu'à 5 instantanés FIFO (table import_undo_snapshot).
 * Chaque ligne = état des tables juste avant un import.
 */
(function (global) {
  var MAX_UNDO_SNAPSHOTS = 5;
  var LEGACY_SNAPSHOT_ID = 'last';

  function newSnapshotId () {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'undo-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function formatSnapshotLabel (row) {
    var d = new Date(row.created_at || row.createdAt || Date.now());
    if (isNaN(d.getTime()) && row.import_date) {
      d = new Date(row.import_date + 'T12:00:00');
    }
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return 'Import du ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

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

  async function deleteByIds (sb, table, ids) {
    if (!ids || !ids.length) return;
    var chunk = 80;
    for (var i = 0; i < ids.length; i += chunk) {
      var slice = ids.slice(i, i + chunk);
      var del = await sb.from(table).delete().in('id', slice);
      if (del.error) throw new Error('delete ' + table + ': ' + del.error.message);
    }
  }

  function isMigrationMissingError (msg) {
    return msg && msg.indexOf('import_undo_snapshot') >= 0;
  }

  function buildImportUndoScope (wb, data, opts) {
    opts = opts || {};
    var sheetNames = (wb && wb.SheetNames) ? wb.SheetNames : [];
    var hasPromosSheet = sheetNames.indexOf('PROMOS') >= 0;
    var hasDiffSheet = sheetNames.indexOf('DIFFERENCIATEURS') >= 0;
    var scope = {
      productIds: opts.importedProductIds || [],
      promoProductIds: hasPromosSheet ? Object.keys(data.promos || {}) : [],
      diffProductIds: hasDiffSheet ? Object.keys(data.differenciateurs || {}) : [],
      diffCategories: hasDiffSheet ? Object.keys(opts.diffsByCategorie || {}) : [],
      snapshotAllActualites: false,
      snapshotAllTendances: false,
      snapshotTauxCr: false
    };
    if (!sheetNames.length) return scope;
    if (sheetNames.indexOf('ACTUALITES') >= 0) scope.snapshotAllActualites = true;
    if (sheetNames.indexOf('DECRYPTAGE') >= 0) scope.snapshotAllTendances = true;
    if (opts.hasTauxImport) scope.snapshotTauxCr = true;
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

  async function listAvailableSnapshots (sb) {
    var res = await sb.from('import_undo_snapshot')
      .select('id, created_at, import_date, available')
      .eq('available', true)
      .order('created_at', { ascending: false });
    if (res.error) {
      if (isMigrationMissingError(res.error.message)) return { migrationRequired: true, items: [] };
      throw new Error('import_undo_snapshot: ' + res.error.message);
    }
    var items = (res.data || []).map(function (row) {
      return {
        id: row.id,
        createdAt: row.created_at,
        importDate: row.import_date,
        label: formatSnapshotLabel(row)
      };
    });
    return { migrationRequired: false, items: items };
  }

  async function pruneUndoSnapshots (sb) {
    var res = await sb.from('import_undo_snapshot')
      .select('id, created_at')
      .eq('available', true)
      .order('created_at', { ascending: true });
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    var rows = res.data || [];
    if (rows.length <= MAX_UNDO_SNAPSHOTS) return;
    var excess = rows.length - MAX_UNDO_SNAPSHOTS;
    var toDelete = rows.slice(0, excess).map(function (r) { return r.id; });
    await deleteByIds(sb, 'import_undo_snapshot', toDelete);
  }

  async function saveImportUndoSnapshot (sb, scope, payload, importDate) {
    var createdAt = new Date().toISOString();
    var row = {
      id: newSnapshotId(),
      created_at: createdAt,
      import_date: importDate || createdAt.slice(0, 10),
      scope: scope,
      payload: payload,
      available: true
    };
    var res = await sb.from('import_undo_snapshot').insert(row);
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    await pruneUndoSnapshots(sb);
    return row;
  }

  async function getImportUndoStatus (sb) {
    var listed = await listAvailableSnapshots(sb);
    if (listed.migrationRequired) {
      return { available: false, migrationRequired: true, items: [], maxLevels: MAX_UNDO_SNAPSHOTS };
    }
    var items = listed.items;
    var newest = items[0] || null;
    return {
      available: items.length > 0,
      items: items,
      maxLevels: MAX_UNDO_SNAPSHOTS,
      importDate: newest ? newest.importDate : null,
      createdAt: newest ? newest.createdAt : null
    };
  }

  async function loadImportUndoSnapshot (sb, snapshotId) {
    var res;
    if (snapshotId) {
      res = await sb.from('import_undo_snapshot').select('*').eq('id', snapshotId).eq('available', true).maybeSingle();
    } else {
      res = await sb.from('import_undo_snapshot')
        .select('*')
        .eq('available', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    }
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    if (!res.data) return null;
    return res.data;
  }

  async function removeSnapshotsFrom (sb, snapshotId) {
    var res = await sb.from('import_undo_snapshot')
      .select('id, created_at')
      .eq('available', true)
      .order('created_at', { ascending: true });
    if (res.error) throw new Error('import_undo_snapshot: ' + res.error.message);
    var rows = res.data || [];
    var idx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].id === snapshotId) { idx = i; break; }
    }
    if (idx < 0) throw new Error('Instantané introuvable.');
    var toDelete = rows.slice(idx).map(function (r) { return r.id; });
    await deleteByIds(sb, 'import_undo_snapshot', toDelete);
  }

  async function applySnapshotPayload (sb, snap) {
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
  }

  async function restoreImportUndoSnapshot (sb, snapshotId) {
    var snap;
    if (snapshotId) {
      snap = await loadImportUndoSnapshot(sb, snapshotId);
    } else {
      var listed = await listAvailableSnapshots(sb);
      if (!listed.items.length) throw new Error('Aucun import récent à annuler.');
      snap = await loadImportUndoSnapshot(sb, listed.items[0].id);
    }
    if (!snap) throw new Error('Aucun import récent à annuler.');
    await applySnapshotPayload(sb, snap);
    await removeSnapshotsFrom(sb, snap.id);
    return { restored: true, importDate: snap.import_date, snapshotId: snap.id };
  }

  global.SofincoImportUndo = {
    MAX_UNDO_SNAPSHOTS: MAX_UNDO_SNAPSHOTS,
    LEGACY_SNAPSHOT_ID: LEGACY_SNAPSHOT_ID,
    buildImportUndoScope: buildImportUndoScope,
    captureImportUndoPayload: captureImportUndoPayload,
    saveImportUndoSnapshot: saveImportUndoSnapshot,
    getImportUndoStatus: getImportUndoStatus,
    listImportUndoSnapshots: listAvailableSnapshots,
    restoreImportUndoSnapshot: restoreImportUndoSnapshot,
    formatSnapshotLabel: formatSnapshotLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
