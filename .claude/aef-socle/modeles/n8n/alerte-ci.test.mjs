import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { construire, filtrerTempete, projetDe } = require('./alerte-ci.cjs');

const LE_12_NOVEMBRE = new Date('2026-11-12T11:43:00Z');

/** Ce que poste réellement la chaîne d'intégration continue (relevé sur un run du CRM). */
function entreeType(surcharges = {}) {
  return {
    chaine: 'Test Pipeline',
    depot: 'yyjalil/crm-terminal-academy',
    branche: 'main',
    commit: 'a471286381dab07a409e38f300f09b9d4e1562a5',
    auteur: 'Biribin',
    declencheur: 'pull_request',
    resultats: 'lint: failure | unit: failure | e2e: skipped | burn-in: skipped',
    url: 'https://github.com/yyjalil/crm-terminal-academy/actions/runs/43211306534',
    ...surcharges,
  };
}

test("l'objet suit la forme du socle et nomme le projet", () => {
  const a = construire(entreeType(), LE_12_NOVEMBRE);
  assert.equal(a.sujet, '[AEF][crm-terminal-academy][CRITIQUE] Chaîne « Test Pipeline » en échec sur main');
});

test('un rouge sur la branche principale est CRITIQUE, ailleurs ALERTE', () => {
  assert.equal(construire(entreeType({ branche: 'main' }), LE_12_NOVEMBRE).gravite, 'CRITIQUE');
  assert.equal(construire(entreeType({ branche: 'master' }), LE_12_NOVEMBRE).gravite, 'CRITIQUE');
  assert.equal(construire(entreeType({ branche: '68/merge' }), LE_12_NOVEMBRE).gravite, 'ALERTE');
});

test('le courriel dit ce qui a échoué, et où le lire', () => {
  const texte = construire(entreeType(), LE_12_NOVEMBRE).lignes.join('\n');
  assert.match(texte, /lint: failure \| unit: failure/);
  assert.match(texte, /actions\/runs\/43211306534/);
  assert.match(texte, /12\/11\/2026/);
  assert.match(texte, /mise en production est bloquée/);
});

test("un lien qui n'est pas un journal d'Actions ne passe pas", () => {
  // Un courriel d'alerte qui porte un lien quelconque est une porte ouverte.
  for (const url of [
    'https://exemple.test/piege',
    'http://github.com/a/b/actions/runs/1',
    'https://github.com/a/b/issues/1',
    'javascript:alert(1)',
  ]) {
    const texte = construire(entreeType({ url }), LE_12_NOVEMBRE).lignes.join('\n');
    assert.doesNotMatch(texte, /piege|javascript:|issues/);
    assert.match(texte, /lien non transmis/);
  }
});

test('un champ mal formé est remplacé, jamais recopié', () => {
  const texte = construire(
    entreeType({
      branche: '"><script>alert(1)</script>',
      auteur: 'jean.dupont@exemple.fr',
      resultats: 'ligne refusée : Marie Martin, 12 rue des Lilas',
      depot: '../../etc/passwd',
    }),
    LE_12_NOVEMBRE,
  ).lignes.join('\n');

  assert.doesNotMatch(texte, /script|exemple\.fr|Marie Martin|Lilas|passwd/);
  assert.match(texte, /branche inconnue/);
  assert.match(texte, /détail non lisible/);
});

test("le commit est raccourci et l'auteur n'apparaît que s'il est net", () => {
  const avec = construire(entreeType(), LE_12_NOVEMBRE).lignes.join('\n');
  assert.match(avec, /Commit : a47128638 1dab|Commit : a471286381da/);
  assert.match(avec, /Auteur : Biribin/);

  const sans = construire(entreeType({ commit: 'pas-un-commit', auteur: '' }), LE_12_NOVEMBRE).lignes.join('\n');
  assert.doesNotMatch(sans, /Commit :|Auteur :/);
});

test('une même chaîne en échec ne part qu’une fois par délai', () => {
  const memoire = {};
  const alerte = () => construire(entreeType(), LE_12_NOVEMBRE);

  assert.equal(filtrerTempete([alerte()], memoire, LE_12_NOVEMBRE).length, 1);
  // Relancée dans la foulée : retenue.
  assert.equal(filtrerTempete([alerte()], memoire, new Date('2026-11-12T11:50:00Z')).length, 0);
  assert.equal(filtrerTempete([alerte()], memoire, new Date('2026-11-12T12:05:00Z')).length, 0);

  // Plus de 30 minutes après : repart, en annonçant les deux retenues.
  const apres = filtrerTempete([alerte()], memoire, new Date('2026-11-12T12:20:00Z'));
  assert.equal(apres.length, 1);
  assert.match(apres[0].texte, /aussi échoué 2 fois/);
});

test('deux dépôts différents ne se masquent pas l’un l’autre', () => {
  const memoire = {};
  const a = construire(entreeType(), LE_12_NOVEMBRE);
  const b = construire(entreeType({ depot: 'Aef-solutions-project/aef-web' }), LE_12_NOVEMBRE);

  assert.equal(filtrerTempete([a, b], memoire, LE_12_NOVEMBRE).length, 2);
});

test('la mémoire ne grossit pas sans fin', () => {
  const memoire = { envois: { vieux: { date: new Date('2026-10-01').getTime(), retenues: 3 } } };
  filtrerTempete([construire(entreeType(), LE_12_NOVEMBRE)], memoire, LE_12_NOVEMBRE);
  assert.equal(memoire.envois.vieux, undefined);
});

test('le nom du projet se lit même sur un dépôt inattendu', () => {
  assert.equal(projetDe('yyjalil/crm-terminal-academy'), 'crm-terminal-academy');
  assert.equal(projetDe('sans-barre-oblique'), 'sans-barre-oblique');
  // Le dernier segment est retenu s'il a la forme d'un nom de dépôt : « a/b/../../etc »
  // donne donc « etc », et c'est très bien — c'est un nom, pas un chemin.
  assert.equal(projetDe('a/b/../../etc'), 'etc');
  // Ce qui n'a pas cette forme est remplacé, jamais recopié dans l'objet du courriel.
  assert.equal(projetDe('a/<script>alert(1)</script>'), 'projet');
  assert.equal(projetDe('a/nom avec espaces'), 'projet');
  assert.equal(projetDe(''), 'projet');
});

// ── Le workflow importable porte-t-il VRAIMENT ce code ? ─────────────────────
// Vérifier que le JSON contient les bons mots ne prouve rien : on l'exécute.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));

test('le code embarqué dans le workflow importable produit la bonne alerte', () => {
  const wf = JSON.parse(readFileSync(join(ICI, 'alerte-ci.workflow.json'), 'utf8'));
  const code = wf.nodes.find((n) => n.type.endsWith('.code')).parameters.jsCode;

  // ⚠️ LE CONTEXTE DOIT ÊTRE CELUI DE n8n, PAS CELUI QUI ARRANGE LE TEST.
  //
  // La première version de ce test fournissait `items` — et le code l'utilisait.
  // Tout était vert, et le premier courriel reçu en vrai portait « undefined »
  // pour tout contenu : le nœud *Code* de n8n n'expose pas `items` (c'était la
  // variable de l'ancien nœud *Function*). Le test validait un contrat qui
  // n'existe pas.
  //
  // Il ne donne donc QUE ce que n8n donne : `$input` et `$getWorkflowStaticData`.
  // Si le code touche à autre chose, il échoue ici — pas en production.
  const memoire = {};
  const entree = { json: { body: entreeType() } };
  const $input = { all: () => [entree] };
  const lancer = new Function('$input', '$getWorkflowStaticData', code);
  const sortie = lancer($input, () => memoire);

  assert.equal(sortie.length, 1);
  assert.match(sortie[0].json.sujet, /^\[AEF\]\[crm-terminal-academy\]\[CRITIQUE\]/);
  assert.match(sortie[0].json.texte, /lint: failure/);
  // La mémoire anti-tempête est bien celle que n8n fournit, pas une locale perdue.
  assert.ok(Object.keys(memoire.envois).length === 1);
});

test('le workflow importable ne porte aucun secret', () => {
  const brut = readFileSync(join(ICI, 'alerte-ci.workflow.json'), 'utf8');
  // Un fichier versionné en clair : ni jeton, ni mot de passe, ni identifiant SMTP.
  assert.doesNotMatch(brut, /"password"|"token"|"apiKey"|"user"\s*:\s*"[^"]+"/i);
  // L'expéditeur imposé par le socle, et un destinataire laissé à régler.
  assert.match(brut, /noreply@mail\.aef-solutions\.fr/);
  assert.match(brut, /À RÉGLER/);
});
