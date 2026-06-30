-- SofincoEdge — schéma initial
-- Déployé via l'intégration Supabase ↔ GitHub

-- ── Produits ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produits (
  id            TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  short_label   TEXT NOT NULL,
  a_onglet_taux BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ
);

-- ── Acteurs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS acteurs (
  id        TEXT PRIMARY KEY,
  nom       TEXT NOT NULL UNIQUE,
  groupe    TEXT,
  domaine   TEXT,
  est_nous  BOOLEAN NOT NULL DEFAULT false
);

-- ── Liaison acteurs ↔ produits ────────────────────────────
CREATE TABLE IF NOT EXISTS acteurs_produits (
  acteur_id  TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  produit_id TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  ordre      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (acteur_id, produit_id)
);

-- ── Critères (tableau comparatif) ─────────────────────────
CREATE TABLE IF NOT EXISTS criteres (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  section    TEXT NOT NULL DEFAULT '',
  critere    TEXT NOT NULL,
  ordre      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_criteres_produit_ordre ON criteres(produit_id, ordre);

-- ── Valeurs par acteur / critère ──────────────────────────
CREATE TABLE IF NOT EXISTS valeurs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  critere_id UUID NOT NULL REFERENCES criteres(id) ON DELETE CASCADE,
  acteur_id  TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  valeur     TEXT NOT NULL DEFAULT '',
  UNIQUE (critere_id, acteur_id)
);

CREATE INDEX IF NOT EXISTS idx_valeurs_critere ON valeurs(critere_id);

-- ── Promos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  acteur_id  TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  taux       TEXT,
  duree      TEXT,
  montant    TEXT,
  date_fin   TEXT,
  canal      TEXT,
  lien       TEXT
);

CREATE INDEX IF NOT EXISTS idx_promos_produit ON promos(produit_id);

-- ── Différenciateurs ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS differenciateurs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id  TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  acteur_id   TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  difference  TEXT,
  pourquoi    TEXT,
  conclusion  TEXT,
  tags        TEXT[] NOT NULL DEFAULT '{}',
  status      TEXT CHECK (status IN ('genere', 'valide')),
  UNIQUE (produit_id, acteur_id)
);

-- ── Tendances ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tendances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id         TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  titre              TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  acteurs_concernes  TEXT[] NOT NULL DEFAULT '{}',
  status             TEXT CHECK (status IN ('genere', 'valide')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tendances_produit ON tendances(produit_id);

-- ── Actualités ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actualites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date       DATE NOT NULL,
  acteur_id  TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  produit_id TEXT REFERENCES produits(id) ON DELETE SET NULL,
  titre      TEXT NOT NULL,
  source     TEXT,
  impact     TEXT CHECK (impact IN ('a_surveiller', 'menace_directe', 'neutre'))
);

CREATE INDEX IF NOT EXISTS idx_actualites_date ON actualites(date DESC);

-- ── Taux CR (JSON par acteur) ─────────────────────────────
CREATE TABLE IF NOT EXISTS taux_cr (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acteur_id    TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  produit_nom  TEXT NOT NULL DEFAULT '',
  categorie    TEXT NOT NULL CHECK (categorie IN ('bancaire', 'financiere')),
  rows         JSONB NOT NULL DEFAULT '[]'::jsonb,
  commentaire  TEXT,
  UNIQUE (acteur_id, produit_nom)
);

-- ── Métadonnées taux CR (taux d'usure) ────────────────────
CREATE TABLE IF NOT EXISTS taux_cr_meta (
  id         TEXT PRIMARY KEY DEFAULT 'cr',
  updated_at DATE,
  prev_date  DATE,
  usure      JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- ── RLS : lecture/écriture anon (app statique + import Excel) ─
ALTER TABLE produits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acteurs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE acteurs_produits  ENABLE ROW LEVEL SECURITY;
ALTER TABLE criteres          ENABLE ROW LEVEL SECURITY;
ALTER TABLE valeurs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE promos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE differenciateurs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tendances         ENABLE ROW LEVEL SECURITY;
ALTER TABLE actualites        ENABLE ROW LEVEL SECURITY;
ALTER TABLE taux_cr           ENABLE ROW LEVEL SECURITY;
ALTER TABLE taux_cr_meta      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'produits','acteurs','acteurs_produits','criteres','valeurs',
    'promos','differenciateurs','tendances','actualites','taux_cr','taux_cr_meta'
  ] LOOP
    EXECUTE format('CREATE POLICY "anon_select_%s" ON %I FOR SELECT TO anon USING (true)', t, t);
    EXECUTE format('CREATE POLICY "anon_insert_%s" ON %I FOR INSERT TO anon WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "anon_update_%s" ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "anon_delete_%s" ON %I FOR DELETE TO anon USING (true)', t, t);
  END LOOP;
END $$;
