#!/usr/bin/env node
/**
 * @deprecated Utiliser scripts/test-nav-categories.mjs
 * Conservé pour compatibilité : délègue au test de navigation catégories.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const res = spawnSync(process.execPath, [path.join(root, 'scripts/test-nav-categories.mjs')], {
  stdio: 'inherit'
});
process.exit(res.status ?? 1);
