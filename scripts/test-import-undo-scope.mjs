#!/usr/bin/env node
/**
 * Tests unitaires buildImportUndoScope — sans Supabase.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, 'js/import-undo.js'), 'utf8');
const sandbox = { globalThis: {}, window: {} };
sandbox.globalThis = sandbox.window;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const api = sandbox.window.SofincoImportUndo;

function run () {
  var checks = [];
  var emptyData = { promos: {}, differenciateurs: {} };
  var baseOpts = { importedProductIds: [], diffsByCategorie: {}, hasTauxImport: false };

  var actuScope = api.buildImportUndoScope({ SheetNames: ['ACTUALITES'] }, emptyData, baseOpts);
  checks.push(['ACTUALITES → snapshot actualites', actuScope.snapshotAllActualites === true]);
  checks.push(['ACTUALITES seul → pas tendances', actuScope.snapshotAllTendances === false]);

  var decScope = api.buildImportUndoScope({ SheetNames: ['DECRYPTAGE'] }, emptyData, baseOpts);
  checks.push(['DECRYPTAGE → snapshot tendances', decScope.snapshotAllTendances === true]);

  var tauxScope = api.buildImportUndoScope({ SheetNames: ['TAUX_CR'] }, emptyData, Object.assign({}, baseOpts, { hasTauxImport: true }));
  checks.push(['TAUX → snapshot taux_cr', tauxScope.snapshotTauxCr === true]);

  var pbScope = api.buildImportUndoScope(
    { SheetNames: ['PB'] },
    emptyData,
    Object.assign({}, baseOpts, { importedProductIds: ['pb'] })
  );
  checks.push(['PB → snapshot actualites (changements)', pbScope.snapshotAllActualites === true]);
  checks.push(['PB → productIds', pbScope.productIds.length === 1 && pbScope.productIds[0] === 'pb']);

  var promoScope = api.buildImportUndoScope(
    { SheetNames: ['PROMOS'] },
    { promos: { pb: [] }, differenciateurs: {} },
    baseOpts
  );
  checks.push(['PROMOS → promoProductIds', promoScope.promoProductIds.indexOf('pb') >= 0]);

  checks.push(['MAX_UNDO_SNAPSHOTS = 5', api.MAX_UNDO_SNAPSHOTS === 5]);

  console.log('Import undo scope tests:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run();
