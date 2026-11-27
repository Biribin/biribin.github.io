---
name: aef-verifier-socle
description: Vérifie un logiciel d'AEF Solutions contre le socle — chaque exigence de 09-exigences.csv est contrôlée dans le code, la configuration et l'intégration continue, avec une preuve rejouable (fichier, test, commande), puis classée conforme, partielle, manquante ou sans objet ; écrit le rapport socle-conformite.md à la racine du projet. Use when the user says « vérifie le socle », « audit du projet », « est-ce qu'on est conforme », « contrôle sécurité RGPD », or invokes /aef-verifier-socle.
---

# Vérifier un projet contre le socle AEF

## Déroulé

0. **La copie du socle est-elle la bonne ?** Lis `.claude/aef-socle/VERSION` et `.claude/aef-socle/source.txt`. Si le
   dépôt `aef-socle` est accessible, lance `python <dépôt aef-socle>/installer.py <projet> --verifier` (lecture seule) :
   chaque écart (fiche ancienne, commande modifiée sur place, consigne du `CLAUDE.md` périmée) se signale en tête du
   rapport, et la correction est de réinstaller, jamais de retoucher la copie.
1. Lis `.claude/aef-socle/knowledge/09-exigences.csv` et `00-index.md`. Si un `socle-conformite.md` existe déjà,
   lis-le : on part du dernier contrôle.
2. Pour **chaque exigence**, cherche la preuve dans le projet : fichier, test, configuration, étape d'intégration
   continue, commande. Ouvre la fiche du domaine quand l'exigence demande de l'interpréter.
   - **Conforme** : preuve trouvée et citée (`chemin:ligne`, nom du test, nom de l'étape).
   - **Partielle** : en place mais incomplète ; dire ce qui manque.
   - **Manquante** : rien trouvé.
   - **Sans objet** : l'exigence ne concerne pas ce projet ; dire pourquoi.
   Pour les exigences `CTL-` (contrôles et alertes), lance le contrôle des workflows comme le fait `/aef-controles`
   (`controle-n8n.py`, lecture seule) et lis `docs/controles.md` : une alerte sans date d'essai reçu n'est pas conforme.
   Pour `DON-` et `MOD-`, la preuve est d'abord le document du projet (`docs/cartographie-donnees.md`,
   `docs/modes-de-fonctionnement.md`) **et** le test qui montre que le code fait ce qu'il dit.
   Pour les exigences `PERF-`, **la configuration ne prouve rien** : ce qui compte est ce que le serveur répond.
   - PERF-16, PERF-18 et PERF-30 se relèvent sur la production, sur une page **et** sur un fichier statique :
     `curl -sSI -H "Accept-Encoding: br, gzip" <url>` montre `Content-Encoding`, `Cache-Control` et, derrière un
     CDN, `cf-cache-status`. Un en-tête que personne n'a écrit vient souvent d'un réglage par défaut du CDN :
     le relever, c'est découvrir qui décide vraiment.
   - PERF-19, PERF-26 et PERF-32 se lisent sur le HTML servi : les lots de script chargés, leur poids, et les
     polices préchargées (`link: rel=preload`). Un préchargement qui ne sert pas à l'écran affiché est un manque.
   - PERF-33 se prouve en lançant la mesure du projet, sur une application **bâtie**. Une mesure prise sur un
     serveur de développement ne vaut rien : la dire conforme serait une erreur, pas une approximation.
   - PERF-34 se prouve par le test du double passage (zéro écriture au second), PERF-35 par la liste des tables qui
     grandissent, chacune avec sa durée et sa tâche de purge. Cherche les tables de journal ou d'historique du schéma
     qui n'y sont pas : c'est là que la base grossit sans bruit.
   - PERF-38 et PERF-41 se lisent sur la production, en chiffres seulement : `pg_stat_statements`,
     `pg_stat_user_tables`, taille des tables, et les heures des sauvegardes complètes dans le journal du serveur.
     Une sauvegarde complète en journée sans maintenance ni incident noté est un manque.
   Ne marque jamais « conforme » sans preuve. Ne lis aucun secret ni aucune donnée personnelle réelle pour prouver
   quoi que ce soit : la forme suffit (schéma, test, configuration).
3. Écris `socle-conformite.md` à la racine du projet :
   - la date, la version du socle installée (`.claude/aef-socle/VERSION`) et le résultat de `--verifier` ;
   - un résumé : nombre d'exigences par statut et par domaine ;
   - **d'abord les manques bloquants** : exigences « avant production » ou « avant première licence » manquantes ;
   - puis le tableau complet : identifiant, exigence, statut, preuve ou manque, correction proposée.
4. Rends le résumé et les trois corrections les plus urgentes. Propose de les faire sur une branche, avec une PR.

## Règles

- Le rapport est un document de travail interne : il peut nommer des fichiers, jamais des données.
- Une exigence qui paraît fausse ou inadaptée est signalée à Lineo, à corriger dans le dépôt `aef-socle`.
