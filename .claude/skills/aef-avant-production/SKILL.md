---
name: aef-avant-production
description: Prépare une mise en production d'un logiciel d'AEF Solutions — remplit la grille obligatoire du socle (10-avant-production.md) case par case avec les preuves, vérifie que l'intégration continue est verte, que les sauvegardes et la restauration sont prouvées, que le registre des traitements et les obligations des contrats sont à jour, et dit clairement si la mise en production peut avoir lieu. Use when the user says « on met en prod », « avant la mise en production », « on déploie », « go live », or invokes /aef-avant-production.
---

# Avant une mise en production

## Déroulé

1. Lis `.claude/aef-socle/knowledge/10-avant-production.md` et le dernier `socle-conformite.md` du projet (sinon,
   propose d'abord `/aef-verifier-socle`).
1 bis. Lance l'analyse de sécurité complète (fiche 11, P10) : `/claude-security`, sur le dépôt entier. Si le plugin
   n'est pas installé, propose `/plugin install claude-security@claude-plugins-official`. Chaque faille critique ou
   élevée est corrigée, ou acceptée par écrit au registre des décisions, avant de conclure ; le rapport SARIF est la
   preuve de la case sécurité. Fais vérifier les migrations de la version par l'agent `database-reviewer` et la
   gestion des erreurs par `silent-failure-hunter`.
1 ter. Vérifie la copie du socle (`python <dépôt aef-socle>/installer.py <projet> --verifier`) et lance `/aef-controles` :
   aucun workflow du projet en CRITIQUE ou en ALERTE, chaque alerte de `docs/controles.md` reçue en essai (CTL-05),
   les modes essai, dégradé et reprise prouvés par leurs tests ou leurs essais (MOD-02, MOD-04, MOD-07).
1 quater. Relève la performance **sur ce qui est servi**, pas dans la configuration (fiche 06, §7 à §11) : la mesure
   sur téléphone lent du projet, sur une application bâtie (PERF-33) ; puis, sur la version en ligne,
   `curl -sSI -H "Accept-Encoding: br, gzip"` d'une page et d'un fichier statique — `Content-Encoding` (PERF-18),
   `Cache-Control` (PERF-30) et la mise en cache par le CDN (PERF-16). Compare les chiffres à ceux de la mise en
   production précédente : une page qui s'est alourdie est une régression à expliquer (PERF-13).
   Relève aussi la santé de la base et du serveur (fiche 06 §12), en ne lisant que des chiffres : `pg_stat_statements`
   (requêtes les plus fréquentes et les plus coûteuses), `pg_stat_user_tables` (tables lues en entier, lignes mortes)
   et la taille des tables (PERF-38) ; la source de l'application dans Coolify, qui doit être une image bâtie par la
   chaîne d'intégration (PERF-39) ; la sonde de marge du serveur et son alerte d'essai reçue (PERF-40). Une table qui
   grandit sans purge planifiée (PERF-35) bloque autant qu'une requête sans index.
2. Recopie la grille dans `docs/mise-en-production-AAAA-MM-JJ.md` et remplis chaque case avec sa preuve : lien vers la
   PR et l'exécution d'intégration continue verte, fichier, test, capture, date du dernier exercice de restauration,
   ligne du registre des traitements, relevé de performance. Une case sans preuve reste vide.
3. Conclus en une ligne : **« Mise en production possible »** si toutes les cases obligatoires sont remplies, sinon
   **« Mise en production bloquée »** avec la liste des cases vides et ce qu'il faut faire pour chacune.
4. La mise en production elle-même (fusion sur `main`, variables, migration de base) reste faite ou validée par un
   humain ; propose la commande ou le lien, ne la lance pas seul.

## Règles

- Pas de « on verra après » pour une case obligatoire : soit elle est remplie, soit la mise en production attend, soit
  Lineo accorde par écrit une dérogation datée, notée dans le document avec sa raison et sa date de fin.
- Après la mise en production : noter la date, la version et le résultat de la vérification en vrai dans le même
  document.
