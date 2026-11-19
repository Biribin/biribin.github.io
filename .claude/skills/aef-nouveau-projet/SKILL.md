---
name: aef-nouveau-projet
description: Démarre un nouveau logiciel d'AEF Solutions en appliquant le socle dès le premier commit — pile et hébergement de référence, multi-établissement et rôles, garde-fous des assistants IA, chaîne de sécurité en intégration continue, chiffrement des données sensibles, journal d'audit, export des données du client, règles produit et performance, classement des données, courriels d'alerte, modes de fonctionnement (essai sans envoi réel). Use when the user says « nouveau projet », « on démarre un logiciel », « crée le projet X », « initialise le dépôt », or invokes /aef-nouveau-projet.
---

# Nouveau projet selon le socle AEF

## Avant d'écrire du code

1. Lis `.claude/aef-socle/knowledge/00-index.md`, `01-architecture-de-reference.md` et
   `11-outillage-assistants.md`. Si la dernière veille a plus de 30 jours, ou si `claude --version` donne une version
   plus récente que celle de la fiche, propose d'abord `/aef-veille-outils` : un projet démarre sur les pratiques du
   moment, pas sur celles du mois dernier.
2. Demande, en une fois :
   - le nom du projet et ce qu'il fait, en deux phrases ;
   - qui l'utilise (rôles), et s'il sert plusieurs établissements ;
   - les données personnelles qu'il traitera (catégories seulement, jamais de vraies valeurs) et s'il y a des données
     sensibles ;
   - s'il sera vendu sous licence (alors les obligations des contrats, `04-obligations-contractuelles.md`, s'appliquent) ;
   - ce qui tournera seul (tâches planifiées, workflows n8n, imports, envois) et les services externes qu'il appelle.
3. Écris `docs/socle.md` dans le projet : les réponses, et pour chaque exigence de `09-exigences.csv` dont le moment
   est « premier commit », comment le projet la remplit. Une exigence qui ne s'applique pas est marquée
   « sans objet », avec la raison.

## Au premier commit (exigences « premier commit »)

Mettre en place, en s'inspirant du CRM (logiciel de référence, cité dans chaque fiche) :
- les garde-fous des assistants IA (`AGENTS.md`, `.claude/settings.json`, refus de lecture des secrets et des données
  personnelles, push sur `main` soumis à confirmation) — `08-ia-et-assistants.md` ;
- la chaîne de sécurité en intégration continue (secrets, analyse du code, dépendances, image, inventaire) —
  `02-securite.md` ;
- le cloisonnement par établissement et son test, si le projet sert plusieurs établissements ;
- le modèle de rôles (Administrateur = AEF seulement ; Opérateur = le client ; Assistant ; état Suspendu) ;
- le chiffrement des colonnes sensibles et des fichiers au repos, le journal d'audit sans donnée personnelle —
  `03-rgpd.md` ;
- les règles produit (suppression avec « Annuler », confirmation pour le sensible ; anti double envoi) —
  `05-regles-produit.md` ;
- la **performance** — `06-performance.md`. Ce qui se pose au premier commit, parce que le rattraper coûte dix fois
  plus cher ensuite : le squelette de chargement de chaque page (PERF-09) ; les requêtes indexées, paginées,
  en colonnes utiles, jamais dans une boucle (PERF-06) ; un délai maximum sur chaque appel sortant (PERF-20) ;
  les traitements longs en arrière-plan (PERF-17) ; **deux graisses de police au maximum**, servies par nous, et
  rien de préchargé qui ne soit à l'écran (PERF-32) ; les images en WebP ou AVIF, chargées quand on y arrive
  (PERF-14, PERF-22) ; les scripts tiers après la page (PERF-25) ; le pool de connexions (PERF-28) ; et surtout
  **la mesure sur téléphone lent avec son budget de poids** (PERF-33), posée tant que l'application est petite —
  c'est elle qui empêchera l'embonpoint, pas la bonne volonté ;
- chaque **pratique en vigueur** de `11-outillage-assistants.md` §3 (P1, P2…), et le rappel de veille au démarrage des
  sessions (posé par l'installateur du socle). Les nouveautés « à évaluer » ne sont pas appliquées d'office ;
- le **classement des données** et la cartographie de départ (`docs/cartographie-donnees.md`), des environnements
  séparés (clés différentes, données inventées hors production) — `13-gestion-des-donnees.md` ;
- le **point d'envoi unique des alertes** (expéditeur `noreply@mail.aef-solutions.fr`, destinataire en variable, gabarit
  sans donnée personnelle et son test, alerte qui ne casse rien) et `docs/controles.md` — `12-controles-et-alertes.md`.
  Si le projet utilise n8n : ses workflows tournent sur l'instance commune `n8n.aef-solutions.fr` et s'inscrivent,
  avec leur export, dans l'inventaire unique du dépôt du CRM (CTL-13, CTL-14) ;
- les **modes de fonctionnement** : `docs/modes-de-fonctionnement.md`, l'interrupteur d'envoi réel coupé par défaut
  hors production avec son test, le journal et le bandeau des changements de mode — `14-modes-de-fonctionnement.md`.

Inscrire le traitement au registre des traitements d'AEF (nouvelle ligne, à faire valider par Lineo, référent).

## À la fin

Rends la liste de ce qui est en place (avec les fichiers), ce qui reste à faire avant production, et propose
`/aef-verifier-socle` pour un premier contrôle. Vérifie que l'installation du socle est complète :
`python <dépôt aef-socle>/installer.py <projet> --verifier` doit répondre « Copie identique au socle ».
