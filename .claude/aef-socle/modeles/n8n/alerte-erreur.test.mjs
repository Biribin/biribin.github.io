// Tests du nœud Code du workflow « AEF · alerte erreur » : node --test modeles/n8n/alerte-erreur.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { construireAlerte, filtrerTempete, REGLAGES } = require('./alerte-erreur.cjs');

const MAINTENANT = new Date('2026-10-22T05:30:00Z');
// Données inventées, assemblées pour ne pas ressembler à un vrai secret dans le dépôt.
const IBAN = ['fr76', '3000', '6000', '0112', '3456', '7890', '189'].join(' ');
const NIR = ['2', '84', '05', '2A', '123', '456', '78'].join(' ');
const MOT_DE_PASSE = 'S3cr3t' + '!pw';
const MESSAGES_QUI_FUIENT = [
  'Key (nom, prenom, date_naissance)=(Martin, Jeanne, 1990-05-12) already exists.',
  '400 - {"apprenant":{"nom":"Martin","adresse":"12 rue des Lilas","naissance":"12/05/1990"}}',
  `Refus pour jeanne.martin@exemple.fr, tél 06 12 34 56 78, IBAN ${IBAN}, NIR ${NIR}, France Travail 1234567A`,
  `connect ECONNREFUSED postgres://app:${MOT_DE_PASSE}@db:5432 ?token=abc123def456`,
];

const echec = (message, autres = {}) => ({
  execution: { id: '812', lastNodeExecuted: 'Envoyer', error: { message, name: 'NodeApiError', httpCode: '400', ...autres } },
  workflow: { id: 'Ab12Cd34Ef56Gh78', name: 'CRM · envoyer les convocations' },
});

test('le message d\'erreur n\'est jamais recopié, quel qu\'il soit', () => {
  for (const message of MESSAGES_QUI_FUIENT) {
    const alerte = construireAlerte(echec(message), MAINTENANT);
    const texte = alerte.sujet + alerte.lignes.join('\n') + alerte.cle;
    for (const fuite of ['Martin', 'Jeanne', '1990', 'Lilas', 'jeanne.martin', '06 12 34 56 78', IBAN, NIR, '1234567A', MOT_DE_PASSE, 'abc123def456']) {
      assert.ok(!texte.includes(fuite), `fuite de « ${fuite} » pour le message : ${message}`);
    }
  }
});

test('seuls des éléments sûrs passent : type d\'erreur et code HTTP filtrés', () => {
  const alerte = construireAlerte(echec('x'), MAINTENANT);
  assert.ok(alerte.lignes.includes('Type d\'erreur : NodeApiError (HTTP 400)'));
  const douteux = construireAlerte(echec('x', { name: 'Jeanne Martin <j@x.fr>', httpCode: 'abc' }), MAINTENANT);
  assert.ok(douteux.lignes.includes('Type d\'erreur : erreur'));
});

test('objet normalisé avec le projet et la gravité', () => {
  const alerte = construireAlerte(echec('délai dépassé'), MAINTENANT);
  assert.equal(alerte.sujet, '[AEF][CRM][ALERTE] Échec de « CRM · envoyer les convocations »');
  const critique = construireAlerte(echec('x'), MAINTENANT, { ...REGLAGES, workflowsCritiques: ['Ab12Cd34Ef56Gh78'] });
  assert.match(critique.sujet, /\[CRITIQUE\]/);
});

test('heure de Paris et lien vers l\'exécution', () => {
  const texte = construireAlerte(echec('x'), MAINTENANT).lignes.join('\n');
  assert.match(texte, /22\/10\/2026.*07:30/);
  assert.match(texte, /\/workflow\/Ab12Cd34Ef56Gh78\/executions\/812/);
});

test('échec du déclencheur (sans exécution)', () => {
  const evt = { trigger: { error: { message: 'connexion refusée' } }, workflow: { id: 'W1', name: 'AEF · sauvegarder n8n' } };
  assert.match(construireAlerte(evt, MAINTENANT).sujet, /^\[AEF\]\[AEF\]\[ALERTE\] Déclencheur en échec/);
});

test('anti-tempête : la clé ne dépend pas du texte du message', () => {
  const memoire = {};
  const alertes = ['timeout after 30012ms', 'timeout after 30015ms', 'timeout after 30020ms']
    .map((m) => construireAlerte(echec(m), MAINTENANT));
  assert.equal(filtrerTempete(alertes, memoire, MAINTENANT).length, 1);
});

test('anti-tempête : une fois par heure, puis le compte des alertes retenues', () => {
  const memoire = {};
  const alerte = construireAlerte(echec('délai dépassé'), MAINTENANT);
  assert.equal(filtrerTempete([alerte], memoire, MAINTENANT).length, 1);
  const dans = (minutes) => new Date(MAINTENANT.getTime() + minutes * 60 * 1000);
  assert.equal(filtrerTempete([alerte], memoire, dans(10)).length, 0);
  assert.equal(filtrerTempete([alerte], memoire, dans(20)).length, 0);
  const [suivante] = filtrerTempete([alerte], memoire, dans(61));
  assert.match(suivante.texte, /produite 2 fois depuis le dernier courriel/);
});

test('deux étapes différentes partent toutes les deux', () => {
  const a = construireAlerte(echec('x'), MAINTENANT);
  const b = construireAlerte({ ...echec('x'), execution: { id: '813', lastNodeExecuted: 'Lire', error: {} } }, MAINTENANT);
  assert.equal(filtrerTempete([a, b], {}, MAINTENANT).length, 2);
});
