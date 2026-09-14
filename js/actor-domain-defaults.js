/**
 * Domaines web connus pour favicons acteur (alignés sur seed-data.json).
 * Utilisé quand acteurs.domaine est vide en base (imports Excel sans domaine).
 */
(function (global) {
  'use strict';

  var BY_NOM = {
    Sofinco: 'sofinco.fr',
    Cetelem: 'cetelem.fr',
    Cofidis: 'cofidis.fr',
    Oney: 'oney.fr',
    Franfinance: 'franfinance.fr',
    FLOA: 'floa.fr',
    'FLOA Bank': 'floa.fr',
    Younited: 'younited-credit.com',
    Boursobank: 'boursobank.com',
    BoursoBank: 'boursobank.com',
    Klarna: 'klarna.com',
    Alma: 'getalma.eu',
    'La Banque Postale': 'labanquepostale.fr',
    'Carrefour Banque': 'carrefour-banque.fr',
    Revolut: 'revolut.com',
    Algoan: 'algoan.com',
    'Banque de France': 'banque-france.fr',
    'AXA Banque': 'axabanque.fr'
  };

  function resolve (nom) {
    if (!nom) return '';
    var direct = BY_NOM[nom];
    if (direct) return direct;
    var key = String(nom).trim();
    if (BY_NOM[key]) return BY_NOM[key];
    return '';
  }

  function resolveWithDb (nom, domaineFromDb) {
    var fromDb = domaineFromDb != null ? String(domaineFromDb).trim() : '';
    if (fromDb) return fromDb;
    return resolve(nom);
  }

  global.SofincoActorDomainDefaults = {
    byNom: BY_NOM,
    resolve: resolve,
    resolveWithDb: resolveWithDb
  };
})(typeof window !== 'undefined' ? window : globalThis);
