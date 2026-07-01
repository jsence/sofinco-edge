-- Historique des changements de valeurs (import Excel intelligent)

CREATE TABLE IF NOT EXISTS historique (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  critere_id      UUID NOT NULL REFERENCES criteres(id) ON DELETE CASCADE,
  acteur_id       TEXT NOT NULL REFERENCES acteurs(id) ON DELETE CASCADE,
  produit_id      TEXT NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  ancienne_valeur TEXT NOT NULL DEFAULT '',
  nouvelle_valeur TEXT NOT NULL DEFAULT '',
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  source          TEXT NOT NULL DEFAULT 'import'
);

CREATE INDEX IF NOT EXISTS idx_historique_produit ON historique(produit_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_historique_critere ON historique(critere_id);

ALTER TABLE historique ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'historique' AND policyname = 'anon_select_historique') THEN
    CREATE POLICY "anon_select_historique" ON historique FOR SELECT TO anon USING (true);
    CREATE POLICY "anon_insert_historique" ON historique FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon_update_historique" ON historique FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY "anon_delete_historique" ON historique FOR DELETE TO anon USING (true);
  END IF;
END $$;
