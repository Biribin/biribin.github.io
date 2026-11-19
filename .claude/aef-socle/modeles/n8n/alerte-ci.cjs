// Workflow « AEF · alerte CI » — contenu du nœud Code (mode « Run Once for All Items »).
// Socle AEF, fiche 12 : CTL-02 (objet normalisé), CTL-03 (aucune donnée personnelle ni secret), CTL-06 (anti-tempête).
// Reçoit ce que poste la chaîne d'intégration continue d'un projet et rend : { sujet, texte, gravite }.
// Le nœud suivant (Send Email) envoie ces champs ; son destinataire est réglé dans ce nœud, pas dans ce code.
// Testé par alerte-ci.test.mjs (node --test). Ne pas modifier dans n8n sans reporter la modification ici.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CE MODÈLE EXISTE — 12/11/2026
//
// Le socle décrivait UN seul workflow d'alerte : « AEF · alerte erreur », déclenché par un Error Trigger, c'est-à-dire
// quand un workflow n8n échoue. Rien ne recevait les alertes venues de L'EXTÉRIEUR — et la chaîne d'intégration
// continue en est une.
//
// Ce qu'a coûté ce trou, dans le CRM Terminal Academy : le secret qui porte l'adresse du webhook visait une ancienne
// instance, éteinte depuis. Le `curl` de la chaîne échouait sur « Could not resolve host », quatre tentatives
// comprises, et personne n'était prévenu. La chaîne est restée rouge du 5 au 11 novembre 2026 — avec, parmi les
// rouges, une exécution de code à distance non authentifiée dans Next.js, en production chez un client.
//
// ⚠️ LE PIÈGE À CONNAÎTRE : une adresse qui répond mais ne déclenche rien est PIRE qu'une adresse morte. La seconde
// fait échouer le `curl`, donc elle se voit ; la première rend le job vert et fait croire que quelqu'un veille.
// D'où l'essai obligatoire (CTL-05) décrit dans le README : tant qu'un courriel n'est pas ARRIVÉ, l'alerte n'existe pas.
// ─────────────────────────────────────────────────────────────────────────────

const REGLAGES = {
  delaiMinutes: 30, // une même chaîne en échec au plus une fois par demi-heure (CTL-06)
};

/** N'accepte une valeur que si elle a la forme attendue. Tout le reste est remplacé par un repli sûr. */
const SUR = (valeur, motif) =>
  (typeof valeur === 'string' || typeof valeur === 'number') && motif.test(String(valeur));

function heureDeParis(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(date);
}

/** « yyjalil/crm-terminal-academy » → « crm-terminal-academy », pour l'objet du courriel. */
function projetDe(depot) {
  const apres = String(depot).split('/').pop();
  return SUR(apres, /^[A-Za-z0-9._-]{1,60}$/) ? apres : 'projet';
}

/**
 * Construit l'alerte à partir de ce que poste la chaîne.
 *
 * ⚠️ LISTE BLANCHE, comme pour « alerte erreur » : chaque champ est vérifié avant d'entrer dans le courriel. Une
 * chaîne d'intégration peut mettre à peu près n'importe quoi dans un nom de branche ou un message, et ce courriel
 * part vers une boîte lue par plusieurs personnes. Ce qui ne correspond pas à la forme attendue est remplacé, jamais
 * recopié tel quel.
 */
function construire(entree, maintenant) {
  const depot = SUR(entree.depot, /^[A-Za-z0-9._-]{1,60}\/[A-Za-z0-9._-]{1,60}$/) ? entree.depot : 'dépôt inconnu';
  const chaine = SUR(entree.chaine, /^[A-Za-z0-9 ._·-]{1,60}$/) ? entree.chaine : 'chaîne';
  const branche = SUR(entree.branche, /^[A-Za-z0-9._\/-]{1,80}$/) ? entree.branche : 'branche inconnue';
  const commit = SUR(entree.commit, /^[0-9a-f]{7,40}$/) ? String(entree.commit).slice(0, 12) : null;
  const auteur = SUR(entree.auteur, /^[A-Za-z0-9._-]{1,40}$/) ? entree.auteur : null;
  const declencheur = SUR(entree.declencheur, /^[a-z_]{1,30}$/) ? entree.declencheur : null;
  // `resultats` est produit par la chaîne elle-même, sous la forme « lint: failure | unit: success | … ».
  const resultats = SUR(entree.resultats, /^[A-Za-z0-9 :|_-]{1,200}$/) ? entree.resultats : 'détail non lisible';
  // Seule une adresse du journal d'Actions est admise : un lien quelconque dans un courriel d'alerte est une porte.
  const url = SUR(entree.url, /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/actions\/runs\/\d+$/)
    ? entree.url
    : null;

  // Une chaîne rouge sur la branche principale bloque la mise en production : c'est plus grave qu'un rouge de branche.
  const surPrincipale = branche === 'main' || branche === 'master';
  const gravite = surPrincipale ? 'CRITIQUE' : 'ALERTE';
  const projet = projetDe(depot);

  return {
    cle: `${depot}|${chaine}|${branche}`, // même dépôt, même chaîne, même branche : une seule alerte par délai
    gravite,
    sujet: `[AEF][${projet}][${gravite}] Chaîne « ${chaine} » en échec sur ${branche}`,
    lignes: [
      `La chaîne « ${chaine} » du dépôt ${depot} a échoué le ${heureDeParis(maintenant)} (heure de Paris).`,
      `Branche : ${branche}${surPrincipale ? ' — la mise en production est bloquée tant que ce rouge dure.' : ''}`,
      `Résultats : ${resultats}`,
      ...(commit ? [`Commit : ${commit}`] : []),
      ...(auteur ? [`Auteur : ${auteur}`] : []),
      ...(declencheur ? [`Déclenché par : ${declencheur}`] : []),
      '',
      ...(url ? [`Journal : ${url}`, ''] : ['Journal : lien non transmis — voir l’onglet Actions du dépôt.', '']),
      'Ni le code ni les messages d’erreur ne sont recopiés ici : ils sont dans le journal, derrière l’accès au dépôt.',
      'Procédure : fiche 12 du socle AEF (contrôles et alertes), §7 — donner une suite dans le jour ouvré.',
    ],
  };
}

/**
 * Anti-tempête (CTL-06) : une même clé part au plus une fois par délai. Une chaîne qu'on relance cinq fois de suite
 * ne doit pas remplir la boîte — c'est ainsi qu'on apprend à ignorer les alertes.
 */
function filtrerTempete(alertes, memoire, maintenant, reglages = REGLAGES) {
  memoire.envois = memoire.envois || {};
  const delai = reglages.delaiMinutes * 60 * 1000;
  const aEnvoyer = [];
  for (const a of alertes) {
    const passe = memoire.envois[a.cle];
    if (passe && maintenant.getTime() - passe.date < delai) {
      passe.retenues = (passe.retenues || 0) + 1;
      continue;
    }
    const retenues = passe ? passe.retenues || 0 : 0;
    memoire.envois[a.cle] = { date: maintenant.getTime(), retenues: 0 };
    const lignes = retenues
      ? [...a.lignes, `Cette chaîne a aussi échoué ${retenues} fois depuis le dernier courriel.`]
      : a.lignes;
    aEnvoyer.push({ sujet: a.sujet, texte: lignes.join('\n'), gravite: a.gravite });
  }
  for (const [cle, valeur] of Object.entries(memoire.envois)) { // la mémoire ne grossit pas sans fin
    if (maintenant.getTime() - valeur.date > 7 * 24 * 3600 * 1000) delete memoire.envois[cle];
  }
  return aEnvoyer;
}

module.exports = { construire, filtrerTempete, projetDe, REGLAGES };

// ⚠️ `$input.all()` ET NON `items`. Relevé le 12/11/2026, au premier courriel reçu : il est bien arrivé, de la bonne
// adresse, à la bonne boîte — avec « undefined » pour tout contenu. `items` est la variable de l'ancien nœud
// *Function* ; le nœud *Code* ne l'expose pas. Le nœud n'a donc rien produit, et « Envoyer l'alerte » a reçu
// l'élément brut du webhook, sans `sujet` ni `texte`. C'est `alerte-erreur.cjs` qui avait raison depuis le début —
// il suffisait de le lire.

/* n8n — à recopier dans le nœud Code, à la place de ce commentaire et du module.exports ci-dessus :

const entrees = $input.all().map((element) => element.json.body || element.json);
const maintenant = new Date();
const alertes = entrees.map((e) => construire(e, maintenant));
return filtrerTempete(alertes, $getWorkflowStaticData('global'), maintenant).map((json) => ({ json }));

*/
