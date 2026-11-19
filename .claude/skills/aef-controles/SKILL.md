---
name: aef-controles
description: Vérifie les contrôles automatiques d'un logiciel d'AEF Solutions et de l'instance n8n — chaque workflow a son workflow d'erreur, son battement en fin de chaîne, aucun webhook ouvert ni secret écrit en dur, l'inventaire est à jour, chaque courriel d'alerte part de noreply@mail.aef-solutions.fr sans donnée personnelle et a été reçu en essai, le calendrier des contrôles est tenu. Lance le contrôle en lecture seule (controle-n8n.py), lit docs/controles.md et docs/automatisations.md, et propose les corrections. Use when the user says « contrôle des workflows », « les alertes marchent ? », « vérifie n8n », « rapport de contrôle », « on a reçu une alerte », « revue mensuelle des contrôles », or invokes /aef-controles.
---

# Contrôles automatiques et alertes

Référence : `.claude/aef-socle/knowledge/12-controles-et-alertes.md` (règles `CTL-`), avec les règles sur les données
de n8n de la fiche 13 (`DON-06`, `DON-07`) et les modes de la fiche 14. Cite l'identifiant de chaque règle.

## Déroulé

1. **Lis** la fiche 12, puis dans le projet `docs/controles.md` (la carte des alertes). Les workflows tournent tous
   sur l'instance commune `n8n.aef-solutions.fr` : leur inventaire unique (`docs/automatisations.md`) et leurs
   exports (`n8n/`) sont dans le dépôt du CRM. S'ils manquent, c'est le premier écart (CTL-01, CTL-13, CTL-14) :
   propose de les créer à partir des modèles de la fiche (§3.5 et §5).
2. **Contrôle les workflows**, en lecture seule, **sur les exports du dépôt du CRM** (depuis ce dépôt, ou en donnant
   les chemins) : `python .claude/aef-socle/controle-n8n.py --fichiers n8n/ --inventaire docs/automatisations.md`.
   L'état réel de l'instance (exécutions en erreur, silences) est dans **le dernier rapport quotidien** reçu dans la
   boîte d'exploitation : demande à l'utilisateur de le coller (il ne contient ni secret ni donnée personnelle).
   **La clé d'API de l'instance ne vient jamais dans la session** (elle peut écrire, et ne vit que sur le serveur et
   dans le coffre, fiche 12 §4) : ne la demande pas, ne la lis pas, ne lance pas le contrôle en mode API. Si les
   exports manquent, c'est un écart (CTL-14) : dis-le.
3. **Contrôle la carte des alertes** (`docs/controles.md`) : chaque ligne a un destinataire, une gravité, une
   procédure et une **date du dernier essai reçu**. Une ligne sans essai, ou dont l'essai a plus de 3 mois, est un
   contrôle non prouvé (CTL-05). Vérifie aussi, dans le code du projet, que l'envoi des alertes passe par un point
   unique (CTL-02), que le gabarit ne peut pas contenir de donnée personnelle (CTL-03, cherche le test) et qu'une
   alerte ne fait pas échouer l'action surveillée (CTL-04).
4. **Contrôle le calendrier** (CTL-18) : le fichier de trace a une ligne pour chaque passage dû (quotidien,
   hebdomadaire, mensuel, trimestriel). Signale les trous, sans les inventer : un passage non noté n'a pas eu lieu.
5. **Rends** un compte rendu court, le plus grave d'abord :
   - les écarts CRITIQUE et ALERTE, chacun avec sa règle, le workflow ou le fichier, et la correction ;
   - les alertes non prouvées et la date de l'exercice « alerte débranchée » à prévoir ;
   - les « À REVOIR ».
   Si l'utilisateur le demande, écris-le dans `docs/controles/AAAA-MM-JJ.md` (document interne : des noms de
   workflows et de fichiers, jamais de données).
6. **Propose les corrections** : dans le dépôt, sur une branche, avec une pull request (inventaire, exports `n8n/`,
   code d'envoi des alertes, tests). Dans n8n, **tu prépares, une personne applique** : régler le workflow d'erreur,
   ajouter un battement, publier ou activer un workflow, changer un identifiant restent des gestes humains (IA-04).

## Après une alerte reçue

Quand l'utilisateur colle ou décrit une alerte : identifie la règle et le workflow, cherche la cause dans le code et
les exports (jamais dans les données de l'exécution : demande la forme, pas le contenu), propose la correction et la
ligne de suite à noter (CTL-17). Une alerte qui revient sans action utile fait revoir son seuil.

## Règles

- Lecture seule sur l'instance n8n et sur la production. Aucun envoi de courriel depuis la session.
- Aucune donnée d'exécution, aucun secret, aucune donnée personnelle dans la conversation ni dans le compte rendu.
- Une règle qui paraît fausse ou inadaptée se signale à Lineo, pour être corrigée dans le dépôt `aef-socle`.
