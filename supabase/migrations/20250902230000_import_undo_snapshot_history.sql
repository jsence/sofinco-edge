-- Historique d'annulation import Excel : jusqu'à 5 snapshots (FIFO côté application)

CREATE INDEX IF NOT EXISTS import_undo_snapshot_created_at_idx
  ON import_undo_snapshot (created_at ASC)
  WHERE available = true;

-- Ancienne ligne placeholder id='last' (niveau unique) : retirée si inactive
DELETE FROM import_undo_snapshot
WHERE id = 'last' AND available = false;
