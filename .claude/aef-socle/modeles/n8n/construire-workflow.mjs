#!/usr/bin/env node
/**
 * Fabrique `alerte-ci.workflow.json` à partir de `alerte-ci.cjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN GÉNÉRATEUR, ET PAS UN JSON ÉCRIT À LA MAIN
 *
 * Le code de l'alerte vit dans `alerte-ci.cjs`, où il est lisible, relu et testé
 * (`node --test modeles/n8n/alerte-ci.test.mjs`). Le workflow importable a besoin
 * du même code, mais noyé dans une chaîne JSON — illisible, et impossible à
 * tester.
 *
 * Deux copies d'un même code finissent toujours par diverger. Ici, l'une est
 * FABRIQUÉE à partir de l'autre : le JSON ne se modifie jamais à la main, et un
 * test vérifie qu'il est à jour. Si quelqu'un corrige le `.cjs` sans régénérer,
 * la chaîne rougit — plutôt que de livrer un workflow périmé.
 *
 * Usage :
 *   node modeles/n8n/construire-workflow.mjs            → écrit le fichier
 *   node modeles/n8n/construire-workflow.mjs --verifier → sort en 1 s'il est périmé
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import process from 'node:process';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'alerte-ci.cjs');
const SORTIE = join(ICI, 'alerte-ci.workflow.json');

/**
 * Le contenu d'un fichier, fins de ligne ramenées à « \n ».
 *
 * Ce dossier est versionné en LF et son `.gitattributes` l'y maintient au
 * checkout. Cette normalisation couvre le reste : un fichier réenregistré par un
 * éditeur en CRLF, ou un clone fait par un git qui ignore les attributs. Sans
 * elle, les retours chariot du disque entrent dans la chaîne `jsCode` du workflow
 * importable — n8n reçoit un code parsemé de « \r » — et la comparaison ci-dessous
 * échoue pour une raison qui ne se voit pas dans un diff.
 */
const lire = (chemin) => readFileSync(chemin, 'utf8').replace(/\r\n/g, '\n');

/**
 * Le code tel que n8n le veut : sans `module.exports` (n8n n'est pas un module
 * CommonJS) et avec les quatre lignes d'appel, qui sont en commentaire dans le
 * `.cjs` pour ne pas gêner les tests.
 */
function codePourN8n(source) {
  const sansExport = source.replace(/^module\.exports = .*$/m, '').trimEnd();
  const appel = sansExport.match(/\/\* n8n —[^\n]*\n([\s\S]*?)\*\//);
  if (!appel) throw new Error('bloc d’appel n8n introuvable dans alerte-ci.cjs');
  const avantCommentaire = sansExport.slice(0, sansExport.indexOf('/* n8n —')).trimEnd();
  return `${avantCommentaire}\n\n${appel[1].trim()}\n`;
}

/**
 * Les trois nœuds, dans l'ordre du README §1 bis.
 *
 * ⚠️ AUCUN SECRET ICI, et c'est structurel : les identifiants SMTP et le jeton du
 * webhook se branchent dans n8n, sur l'instance. Ce fichier est versionné en clair
 * dans un dépôt — il ne doit jamais porter autre chose que de la forme.
 *
 * ⚠️ Les `typeVersion` sont volontairement conservatrices : n8n migre seul un nœud
 * vers une version plus récente à l'import, l'inverse n'est pas vrai.
 */
function workflow(code) {
  return {
    name: 'AEF · alerte CI',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'alerte-ci',
          authentication: 'headerAuth',
          responseMode: 'onReceived',
          options: {},
        },
        id: 'aef-alerte-ci-webhook',
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: 'aef-alerte-ci',
        // L'identifiant d'en-tête (« X-Jeton-Alerte ») se choisit dans n8n :
        // c'est un secret, il n'a rien à faire dans un fichier versionné.
        credentials: {},
      },
      {
        parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode: code },
        id: 'aef-alerte-ci-code',
        name: "Construire l'alerte",
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [220, 0],
      },
      {
        parameters: {
          fromEmail: 'noreply@mail.aef-solutions.fr',
          // ⚠️ À REMPLACER par la boîte d'exploitation, dans n8n : le destinataire
          // se règle sur l'instance et nulle part ailleurs (fiche 12).
          toEmail: 'À RÉGLER — boîte d’exploitation',
          subject: '={{ $json.sujet }}',
          emailFormat: 'text',
          text: '={{ $json.texte }}',
          options: {},
        },
        id: 'aef-alerte-ci-email',
        name: "Envoyer l'alerte",
        type: 'n8n-nodes-base.emailSend',
        typeVersion: 2.1,
        position: [440, 0],
        credentials: {},
      },
    ],
    connections: {
      Webhook: { main: [[{ node: "Construire l'alerte", type: 'main', index: 0 }]] },
      "Construire l'alerte": { main: [[{ node: "Envoyer l'alerte", type: 'main', index: 0 }]] },
    },
    settings: { timezone: 'Europe/Paris', executionOrder: 'v1' },
    tags: [{ name: 'aef' }],
  };
}

const attendu = `${JSON.stringify(workflow(codePourN8n(lire(SOURCE))), null, 2)}\n`;

if (process.argv.includes('--verifier')) {
  let actuel = '';
  try {
    actuel = lire(SORTIE);
  } catch {
    // Fichier absent : périmé par définition.
  }
  if (actuel !== attendu) {
    console.error(
      'alerte-ci.workflow.json est périmé : le code de alerte-ci.cjs a changé.\n' +
        'Régénérer avec : node modeles/n8n/construire-workflow.mjs',
    );
    process.exit(1);
  }
  console.log('alerte-ci.workflow.json est à jour.');
} else {
  writeFileSync(SORTIE, attendu, 'utf8');
  console.log(`écrit ${SORTIE}`);
}
