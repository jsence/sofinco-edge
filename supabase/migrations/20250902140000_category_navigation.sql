-- Navigation par catégories d'actualités : champ categorie sur actualites, differenciateurs, tendances

ALTER TABLE actualites
  ADD COLUMN IF NOT EXISTS categorie TEXT
  CHECK (categorie IS NULL OR categorie IN (
    'produit_tarification',
    'commercial_communication',
    'strategie_corporate',
    'rse_juridique',
    'innovation_securite'
  ));

CREATE INDEX IF NOT EXISTS idx_actualites_categorie ON actualites(categorie);

ALTER TABLE differenciateurs
  ADD COLUMN IF NOT EXISTS categorie TEXT
  CHECK (categorie IS NULL OR categorie IN (
    'produit_tarification',
    'commercial_communication',
    'strategie_corporate',
    'rse_juridique',
    'innovation_securite'
  ));

ALTER TABLE differenciateurs
  ALTER COLUMN produit_id DROP NOT NULL;

ALTER TABLE differenciateurs
  DROP CONSTRAINT IF EXISTS differenciateurs_produit_id_acteur_id_key;

ALTER TABLE differenciateurs
  ADD CONSTRAINT differenciateurs_scope_check CHECK (
    (produit_id IS NOT NULL AND categorie IS NULL) OR
    (produit_id IS NULL AND categorie IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS differenciateurs_produit_acteur_uidx
  ON differenciateurs(produit_id, acteur_id) WHERE produit_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS differenciateurs_categorie_acteur_uidx
  ON differenciateurs(categorie, acteur_id) WHERE categorie IS NOT NULL;

ALTER TABLE tendances
  ADD COLUMN IF NOT EXISTS categorie TEXT
  CHECK (categorie IS NULL OR categorie IN (
    'produit_tarification',
    'commercial_communication',
    'strategie_corporate',
    'rse_juridique',
    'innovation_securite'
  ));

ALTER TABLE tendances
  ALTER COLUMN produit_id DROP NOT NULL;

ALTER TABLE tendances
  ADD CONSTRAINT tendances_scope_check CHECK (
    (produit_id IS NOT NULL AND categorie IS NULL) OR
    (produit_id IS NULL AND categorie IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tendances_categorie ON tendances(categorie);
