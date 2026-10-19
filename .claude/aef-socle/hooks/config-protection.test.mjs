// Cas de test du garde-fou config-protection. Lancer : node config-protection.test.mjs
// Code de sortie 1 si un cas échoue (utilisable en intégration continue).
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { analyser } = require(join(dirname(fileURLToPath(import.meta.url)), 'config-protection.cjs'));

const dossier = mkdtempSync(join(tmpdir(), 'config-protection-'));
const existant = (nom) => { const p = join(dossier, nom); writeFileSync(p, '{}'); return p; };
const entree = (chemin) => JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: chemin } });

const cas = [
  ['eslint.config.mjs existant : bloqué', entree(existant('eslint.config.mjs')), 2],
  ['.prettierrc existant : bloqué', entree(existant('.prettierrc')), 2],
  ['.eslintignore existant : bloqué', entree(existant('.eslintignore')), 2],
  ['ESLINT.CONFIG.MJS (casse) existant : bloqué', entree(existant('ESLINT.CONFIG.MJS')), 2],
  ['eslint.config.base.mjs existant : bloqué', entree(existant('eslint.config.base.mjs')), 2],
  ['prettier.config.mjs absent (création) : permis', entree(join(dossier, 'prettier.config.mjs')), 0],
  ['src/app/page.tsx : permis', entree(existant('page.tsx')), 0],
  ['vitest.config.ts : permis (outil de test, pas de lint)', entree(existant('vitest.config.ts')), 0],
  ['tsconfig.json : permis', entree(existant('tsconfig.json')), 0],
  ['entrée vide : permis', '', 0],
  ['JSON invalide : permis', '{pas du json', 0],
];

let echecs = 0;
for (const [nom, brut, attendu] of cas) {
  const { code } = analyser(brut, false);
  const ok = code === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? 'ok  ' : 'ÉCHEC'} ${nom} (attendu ${attendu}, obtenu ${code})`);
}
const tronque = analyser('{}', true).code;
if (tronque !== 2) echecs++;
console.log(`${tronque === 2 ? 'ok  ' : 'ÉCHEC'} entrée tronquée : bloqué`);
rmSync(dossier, { recursive: true, force: true });
console.log(echecs ? `${echecs} cas en échec` : 'tous les cas passent');
process.exit(echecs ? 1 : 0);
