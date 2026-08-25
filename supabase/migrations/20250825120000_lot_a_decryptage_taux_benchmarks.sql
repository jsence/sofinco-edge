-- Lot A : Décryptage (portée tendances) + texte libre Digital

ALTER TABLE tendances
  ADD COLUMN IF NOT EXISTS portee TEXT NOT NULL DEFAULT 'produit'
  CHECK (portee IN ('produit', 'benchmark'));

CREATE INDEX IF NOT EXISTS idx_tendances_portee ON tendances(produit_id, portee);

CREATE TABLE IF NOT EXISTS produits_texte_libre (
  produit_id  TEXT PRIMARY KEY REFERENCES produits(id) ON DELETE CASCADE,
  titre       TEXT NOT NULL DEFAULT '',
  contenu     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ
);

ALTER TABLE produits_texte_libre ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'produits_texte_libre' AND policyname = 'anon_select_produits_texte_libre') THEN
    CREATE POLICY "anon_select_produits_texte_libre" ON produits_texte_libre FOR SELECT TO anon USING (true);
    CREATE POLICY "anon_insert_produits_texte_libre" ON produits_texte_libre FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon_update_produits_texte_libre" ON produits_texte_libre FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY "anon_delete_produits_texte_libre" ON produits_texte_libre FOR DELETE TO anon USING (true);
  END IF;
END $$;
