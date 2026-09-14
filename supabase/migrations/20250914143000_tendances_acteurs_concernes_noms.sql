-- Conserver les libellés Excel des acteurs concernés (y compris non référencés en base).
ALTER TABLE tendances
  ADD COLUMN IF NOT EXISTS acteurs_concernes_noms TEXT[] NOT NULL DEFAULT '{}';

-- Rétro-remplissage depuis les IDs déjà résolus (noms connus en base).
UPDATE tendances t
SET acteurs_concernes_noms = sub.noms
FROM (
  SELECT
    t2.id,
    COALESCE(
      array_agg(a.nom ORDER BY u.ord) FILTER (WHERE a.nom IS NOT NULL),
      '{}'
    ) AS noms
  FROM tendances t2
  CROSS JOIN LATERAL unnest(t2.acteurs_concernes) WITH ORDINALITY AS u(acteur_id, ord)
  LEFT JOIN acteurs a ON a.id = u.acteur_id
  WHERE cardinality(t2.acteurs_concernes) > 0
    AND (t2.acteurs_concernes_noms IS NULL OR t2.acteurs_concernes_noms = '{}')
  GROUP BY t2.id
) sub
WHERE t.id = sub.id;
