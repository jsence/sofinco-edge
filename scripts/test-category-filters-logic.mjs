#!/usr/bin/env node
/**
 * Tests unitaires logique filtres catégorie — sans Supabase.
 */
function defaultCategoryFilters () {
  return { actors: [], produits: [] };
}

function matchesCategoryActors (actorName, filters) {
  if (!filters.actors || !filters.actors.length) return true;
  if (!actorName) return false;
  return filters.actors.indexOf(actorName) >= 0;
}

function matchesCategoryProduct (produit, filters) {
  if (!filters.produits || !filters.produits.length) return true;
  if (!produit) return false;
  return filters.produits.indexOf(produit) >= 0;
}

function run () {
  var checks = [];
  var f = defaultCategoryFilters();

  checks.push(['sans filtre → acteur ok', matchesCategoryActors('Cofidis', f)]);
  checks.push(['sans filtre → produit null ok', matchesCategoryProduct(null, f)]);

  f.actors = ['Cofidis'];
  checks.push(['acteur Cofidis seul', matchesCategoryActors('Cofidis', f) && !matchesCategoryActors('Cetelem', f)]);

  f.produits = ['pb'];
  checks.push(['produit PB', matchesCategoryProduct('pb', f) && !matchesCategoryProduct(null, f) && !matchesCategoryProduct('cr', f)]);

  f = defaultCategoryFilters();
  f.actors = ['Cofidis', 'Cetelem'];
  checks.push(['multi acteurs', matchesCategoryActors('Cofidis', f) && matchesCategoryActors('Cetelem', f)]);

  f.produits = ['pb', 'cr'];
  checks.push(['multi produits', matchesCategoryProduct('pb', f) && matchesCategoryProduct('cr', f) && !matchesCategoryProduct('nxcb', f)]);

  f.actors = ['Cofidis'];
  checks.push(['acteur + multi produits combinés', matchesCategoryActors('Cofidis', f) && matchesCategoryProduct('pb', f) && matchesCategoryProduct('cr', f)]);

  console.log('Category filter logic:\n');
  var allOk = true;
  checks.forEach(function (pair) {
    if (!pair[1]) allOk = false;
    console.log('  [' + (pair[1] ? 'OK' : 'FAIL') + '] ' + pair[0]);
  });
  if (!allOk) process.exit(1);
  console.log('\nAll checks passed.');
}

run();
