// Workflow « AEF · alerte erreur » — contenu du nœud Code (mode « Run Once for All Items »).
// Socle AEF, fiche 12 : CTL-02 (objet normalisé), CTL-03 (aucune donnée personnelle ni secret), CTL-06 (anti-tempête).
// Reçoit ce que donne le nœud Error Trigger et rend, pour chaque alerte à envoyer : { sujet, texte, gravite }.
// Le nœud suivant (Send Email) envoie ces champs ; son destinataire est réglé dans ce nœud, pas dans ce code.
// Testé par alerte-erreur.test.mjs (node --test). Ne pas modifier dans n8n sans reporter la modification ici.
//
// Le message d'erreur n'est JAMAIS recopié : un nœud HTTP ou base de données y met souvent le corps de la réponse ou
// la ligne refusée, donc des données personnelles ou des secrets. Le courriel donne seulement des éléments sûrs par
// construction (liste blanche) : le workflow, l'étape, le type d'erreur, le code HTTP, le lien vers l'exécution.

const REGLAGES = {
  n8nUrl: 'https://n8n.aef-solutions.fr', // pour le lien vers l'exécution ; à ajuster à l'instance
  workflowsCritiques: [], // identifiants des workflows dont l'échec est CRITIQUE (sinon : ALERTE)
  delaiMinutes: 60, // une même alerte au plus une fois par heure (CTL-06)
};

const SUR = (valeur, motif) => (typeof valeur === 'string' || typeof valeur === 'number') && motif.test(String(valeur));

function heureDeParis(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function projetDe(nom) {
  const avant = String(nom || '').split(' · ')[0].trim();
  return avant && avant !== nom ? avant : 'n8n';
}

// Construit une alerte à partir d'un élément de l'Error Trigger (échec d'exécution ou de déclencheur).
function construireAlerte(evenement, maintenant, reglages = REGLAGES) {
  const workflow = evenement.workflow || {};
  const execution = evenement.execution || {};
  const declencheur = evenement.trigger || {};
  const erreur = execution.error || declencheur.error || {};
  const id = SUR(workflow.id, /^[A-Za-z0-9_-]{1,40}$/) ? String(workflow.id) : '?';
  const nom = typeof workflow.name === 'string' && workflow.name ? workflow.name.slice(0, 120) : 'workflow inconnu';
  const gravite = reglages.workflowsCritiques.includes(id) ? 'CRITIQUE' : 'ALERTE';
  const etape = String(execution.lastNodeExecuted || (erreur.node && erreur.node.name) || 'inconnue').slice(0, 80);
  const type = SUR(erreur.name, /^[A-Za-z][A-Za-z0-9]{2,40}$/) ? erreur.name : 'erreur';
  const codeHttp = SUR(erreur.httpCode, /^\d{3}$/) ? String(erreur.httpCode) : null;
  const numero = SUR(execution.id, /^[0-9]{1,15}$/) ? String(execution.id) : null;
  const lien = numero ? `${reglages.n8nUrl}/workflow/${id}/executions/${numero}` : `${reglages.n8nUrl}/workflow/${id}`;
  const quoi = numero ? 'Échec' : 'Déclencheur en échec';
  return {
    cle: `${id}|${etape}|${type}|${codeHttp || ''}`, // même source, même cause, sans le texte du message
    gravite,
    sujet: `[AEF][${projetDe(nom)}][${gravite}] ${quoi} de « ${nom} »`,
    lignes: [
      `${quoi} du workflow « ${nom} » (${id}) le ${heureDeParis(maintenant)} (heure de Paris).`,
      `Étape : ${etape}`,
      `Type d'erreur : ${type}${codeHttp ? ` (HTTP ${codeHttp})` : ''}`,
      `Exécution : ${lien}`,
      '',
      'Le message d\'erreur et les données de l\'exécution ne sont pas recopiés ici : ils sont dans n8n, derrière son accès protégé.',
      'Procédure : fiche 12 du socle AEF (contrôles et alertes), §7 — donner une suite dans le jour ouvré.',
    ],
  };
}

// Anti-tempête : une même clé part au plus une fois par délai ; les suivantes sont comptées et annoncées au prochain envoi.
// Limite : n8n lance une exécution du workflow d'erreur par échec, et chacune lit la mémoire au début. Des échecs
// simultanés peuvent donc chacun envoyer leur courriel ; le regroupement vaut pour des échecs qui se suivent.
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
    const lignes = retenues ? [...a.lignes, `Cette alerte s'est aussi produite ${retenues} fois depuis le dernier courriel.`] : a.lignes;
    aEnvoyer.push({ sujet: a.sujet, texte: lignes.join('\n'), gravite: a.gravite });
  }
  for (const [cle, valeur] of Object.entries(memoire.envois)) { // la mémoire ne grossit pas sans fin
    if (maintenant.getTime() - valeur.date > 7 * 24 * 3600 * 1000) delete memoire.envois[cle];
  }
  return aEnvoyer;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { construireAlerte, filtrerTempete, REGLAGES };
}

// Dans n8n : $input et $getWorkflowStaticData existent. La mémoire anti-tempête n'est enregistrée par n8n que si
// l'exécution réussit : à vérifier sur l'instance lors de l'essai de l'alerte (CTL-05).
if (typeof $input !== 'undefined') {
  const maintenant = new Date();
  const alertes = $input.all().map((element) => construireAlerte(element.json, maintenant));
  return filtrerTempete(alertes, $getWorkflowStaticData('global'), maintenant).map((json) => ({ json }));
}
