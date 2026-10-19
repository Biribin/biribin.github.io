#!/usr/bin/env node
/**
 * Garde-fou config-protection (socle AEF, exigence OUT-01).
 *
 * Empêche l'assistant de MODIFIER la configuration du lint ou du formatage
 * (ESLint, Prettier, Stylelint, markdownlint, Biome…) ou leurs fichiers
 * d'ignore pour faire passer un contrôle. Il doit corriger le code.
 * La création d'un fichier qui n'existe pas encore reste permise.
 * Une personne, elle, n'est pas bloquée : seul l'outil d'édition de
 * l'assistant passe par ce garde-fou.
 *
 * Provenance : affaan-m/ECC@76aaa77, scripts/hooks/config-protection.js,
 * licence MIT (c) 2026 Affaan Mustafa (voir THIRD_PARTY_NOTICES.md du socle).
 * Adapté le 19/10/2026 : messages en français, variables ECC_* retirées,
 * pas de recopie de l'entrée sur la sortie standard.
 *
 * Codes de sortie : 0 = permis ; 2 = bloqué (le message part à l'assistant).
 *
 *     node .claude/aef-socle/hooks/config-protection.test.mjs   (cas de test)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_STDIN = 1024 * 1024;

const PROTECTED_FILES = new Set([
  // ESLint (legacy + v9 flat config, JS/TS/MJS/CJS)
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'eslint.config.mts',
  'eslint.config.cts',
  // Prettier (all config variants including ESM)
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.json',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  // Biome's discovered filenames. Custom --config-path/extends targets need
  // reference context; an arbitrary biome.* basename is not sufficient.
  'biome.json',
  'biome.jsonc',
  '.biome.json',
  '.biome.jsonc',
  // Ruff (Python)
  '.ruff.toml',
  'ruff.toml',
  // Note: pyproject.toml is intentionally NOT included here because it
  // contains project metadata alongside linter config. Blocking all edits
  // to pyproject.toml would prevent legitimate dependency changes.
  // Shell / Style / Markdown
  '.shellcheckrc',
  '.stylelintrc',
  '.stylelintrc.json',
  '.stylelintrc.yml',
  '.stylelintrc.yaml',
  '.stylelintrc.js',
  '.stylelintrc.cjs',
  '.stylelintrc.mjs',
  // Stylelint's current spelling; only the legacy `.stylelintrc*` forms were
  // listed, so a project using the documented `stylelint.config.js` had no
  // protection at all.
  'stylelint.config.js',
  'stylelint.config.cjs',
  'stylelint.config.mjs',
  'stylelint.config.ts',
  'stylelint.config.mts',
  'stylelint.config.cts',
  '.markdownlint.json',
  '.markdownlint.jsonc',
  '.markdownlint.yaml',
  '.markdownlint.yml',
  '.markdownlint.cjs',
  '.markdownlint.mjs',
  '.markdownlintrc',
  // markdownlint-cli2 reads its own config names, not `.markdownlint.*`.
  '.markdownlint-cli2.jsonc',
  '.markdownlint-cli2.yaml',
  '.markdownlint-cli2.cjs',
  '.markdownlint-cli2.mjs',
  // Ignore files are the cheapest way to make a check pass without touching
  // the code OR the config: adding one path to .eslintignore silences the
  // failing file outright. Blocking the config while leaving its ignore list
  // open left the hook's whole purpose one line away from being defeated.
  // First-time creation stays allowed by the same existence check below.
  '.eslintignore',
  '.prettierignore',
  '.stylelintignore',
  '.markdownlintignore'
]);

/**
 * Exact basenames only catch a tool's canonical entry point. Real repos split
 * flat config across files: a shared `eslint.config.base.mjs` holding the
 * ignore list and rule severities, imported by per-workspace
 * `eslint.config.mjs` files. That is the common monorepo shape, and matching
 * basenames alone protected the leaves while leaving the trunk -- the file that
 * actually carries the rules -- freely editable.
 *
 * These patterns cover `<tool>.config.<qualifier>.<ext>` and
 * `.<tool>rc.<qualifier>.<ext>` for the linters and formatters listed above.
 * They are case-insensitive for the same reason the Set lookup above is.
 *
 * Deliberately NOT matched: build and test tooling -- `vite.config.ts`,
 * `vitest.config.ts`, `jest.config.js`, `playwright.config.ts`,
 * `tsconfig.json`. This hook exists to stop a LINTER config being weakened in
 * place of fixing the code; editing a bundler or test-runner config is
 * ordinary work, and sweeping those in would make the hook obstructive.
 */
// Socle AEF, 19/10/2026 : découpage par « . » au lieu des expressions régulières
// d'origine (quantificateur imbriqué signalé par security/detect-unsafe-regex).
const OUTILS_CONFIG = new Set(['eslint', 'prettier', 'stylelint', 'commitlint', 'oxlint']);
const EXT_CONFIG = new Set(['js', 'mjs', 'cjs', 'ts', 'mts', 'cts']);
const OUTILS_RC = new Set(['eslintrc', 'prettierrc', 'stylelintrc', 'markdownlintrc']);
const EXT_RC = new Set(['js', 'cjs', 'mjs', 'json', 'jsonc', 'yml', 'yaml', 'toml']);

function isProtectedName(basename) {
  const lower = basename.toLowerCase();
  if (PROTECTED_FILES.has(lower)) return true;
  const parties = lower.split('.');
  const ext = parties[parties.length - 1];
  // eslint.config.base.mjs, prettier.config.shared.cjs, stylelint.config.local.js ...
  if (parties.length >= 3 && OUTILS_CONFIG.has(parties[0]) && parties[1] === 'config' && EXT_CONFIG.has(ext)) {
    return true;
  }
  // .eslintrc.base.json, .prettierrc.shared.yml ...
  return parties.length >= 3 && parties[0] === '' && OUTILS_RC.has(parties[1]) && EXT_RC.has(ext);
}

function analyser(brut, tronque) {
  if (tronque) {
    return {
      code: 2,
      message: 'BLOQUÉ : entrée du garde-fou trop longue, refus par prudence (config-protection).',
    };
  }
  let entree = {};
  try {
    entree = brut.trim() ? JSON.parse(brut) : {};
  } catch {
    entree = {};
  }
  const chemin = (entree.tool_input && (entree.tool_input.file_path || entree.tool_input.file)) || '';
  if (!chemin) return { code: 0 };
  const nom = path.basename(chemin);
  if (!isProtectedName(nom)) return { code: 0 };

  // Création d'une configuration absente : permise. Toute autre erreur que
  // « introuvable » est traitée comme « présent » (on ne s'affaiblit jamais).
  let existe = true;
  try {
    fs.lstatSync(chemin);
  } catch (err) {
    if (err && err.code === 'ENOENT') existe = false;
  }
  if (!existe) return { code: 0 };

  return {
    code: 2,
    message:
      `BLOQUÉ : ${nom} règle le lint ou le formatage. Corrige le code pour qu'il passe ` +
      'les contrôles, plutôt que d’affaiblir leur configuration (socle AEF, OUT-01). ' +
      'Si un changement de configuration est vraiment voulu, explique-le à l’utilisateur : ' +
      'c’est à lui de le faire ou de le valider, et la décision va au registre du projet.',
  };
}

module.exports = { analyser, isProtectedName };

if (require.main === module) {
  let brut = '';
  let tronque = false;
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (morceau) => {
    if (brut.length + morceau.length > MAX_STDIN) {
      tronque = true;
      brut += morceau.substring(0, Math.max(0, MAX_STDIN - brut.length));
    } else {
      brut += morceau;
    }
  });
  process.stdin.on('end', () => {
    const r = analyser(brut, tronque);
    if (r.message) process.stderr.write(`${r.message}\n`);
    process.exit(r.code);
  });
}
