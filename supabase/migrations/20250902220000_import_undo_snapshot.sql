-- Instantané unique pour annuler le dernier import Excel contributeur

CREATE TABLE IF NOT EXISTS import_undo_snapshot (
  id          TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  import_date DATE,
  scope       JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  available   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO import_undo_snapshot (id, available, scope, payload)
VALUES ('last', false, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE import_undo_snapshot ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'import_undo_snapshot' AND policyname = 'anon_select_import_undo_snapshot'
  ) THEN
    CREATE POLICY "anon_select_import_undo_snapshot" ON import_undo_snapshot FOR SELECT TO anon USING (true);
    CREATE POLICY "anon_insert_import_undo_snapshot" ON import_undo_snapshot FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "anon_update_import_undo_snapshot" ON import_undo_snapshot FOR UPDATE TO anon USING (true) WITH CHECK (true);
    CREATE POLICY "anon_delete_import_undo_snapshot" ON import_undo_snapshot FOR DELETE TO anon USING (true);
  END IF;
END $$;
