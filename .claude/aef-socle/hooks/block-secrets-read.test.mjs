#!/usr/bin/env node
/**
 * Vérifie la couverture du garde-fou `block-secrets-read.js`.
 *
 * Le hook est appelé HORS de l'assistant, sur des charges utiles fabriquées :
 * aucun fichier n'est lu, aucune commande testée n'est exécutée. Seul le code de
 * sortie est évalué (0 = laisse passer, 2 = bloque).
 *
 *   node .claude/hooks/block-secrets-read.test.mjs
 *
 * Les cas vivent dans `cas-de-test.json` : une seule liste à tenir à jour. Un projet
 * peut la faire tourner aussi dans sa chaîne d'intégration (le CRM le fait).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const HOOK = join(ici, 'block-secrets-read.js');
const { cas } = JSON.parse(readFileSync(join(ici, 'cas-de-test.json'), 'utf8'));

let echecs = 0;
for (const { nom, outil, entree, attendu } of cas) {
  const charge = JSON.stringify({ tool_name: outil, tool_input: entree });
  const { status } = spawnSync(process.execPath, [HOOK], { input: charge });
  const ok = status === attendu;
  if (!ok) echecs += 1;
  console.log(
    `${ok ? 'OK ' : 'KO '} ${nom.padEnd(52)} attendu=${attendu} obtenu=${status}`,
  );
}

console.log(`\n${cas.length - echecs} OK / ${echecs} KO`);

// Cas particulier, hors liste : une charge utile illisible doit être REFUSÉE.
// C'est le comportement « échec fermé » — un garde-fou qui ne comprend pas ce
// qu'on lui donne ne doit pas conclure que c'est inoffensif.
const illisible = spawnSync(process.execPath, [HOOK], { input: '{ceci n\'est pas du JSON' });
const echecFerme = illisible.status === 2;
console.log(
  `${echecFerme ? 'OK ' : 'KO '} charge utile illisible → refus (échec fermé)`,
);
if (!echecFerme) echecs += 1;

process.exit(echecs === 0 ? 0 : 1);
