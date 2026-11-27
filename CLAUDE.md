<!-- socle AEF : début -->

## Socle AEF

Ce projet applique le **socle AEF** : les règles obligatoires de tous les logiciels d'AEF Solutions (architecture,
sécurité, RGPD, obligations des contrats, règles produit, performance, continuité, assistants IA, contrôles et
alertes, gestion des données, modes de fonctionnement). Elles sont copiées dans `.claude/aef-socle/` par
l'installateur du dépôt `aef-socle` : **ne pas les modifier ici**. Une règle propre au projet va dans `docs/` ; une
règle qui vaut pour tous se change dans le dépôt `aef-socle`, puis on réinstalle dans chaque projet.

Avant tout travail de conception, lis `.claude/aef-socle/knowledge/00-index.md`. Pour une règle, ouvre sa fiche et
cite son identifiant (`09-exigences.csv`). Ce que tout assistant applique ici, à chaque tâche :

- **Données** (fiche 13) : chaque donnée a une classe (publique, interne, personnelle, sensible, secrète). Jamais de
  donnée personnelle réelle ni de secret dans une demande, un journal, un courriel d'alerte, un test ou un workflow.
  Pour diagnostiquer : compter, pas afficher. Écrire en production = script relu, sauvegarde avant des seules tables
  touchées (jamais un dump complet de la production en journée, PERF-41), validation humaine.
- **Contrôles et alertes** (fiche 12) : tout ce qui tourne seul (tâche planifiée, workflow n8n, import, sauvegarde)
  prévient quand il échoue **et** quand il se tait. Les alertes partent de `noreply@mail.aef-solutions.fr` vers la
  boîte d'exploitation, sans donnée personnelle. Une alerte jamais reçue en essai ne compte pas.
- **Modes de fonctionnement** (fiche 14) : normal, développement, essai, maintenance, dégradé, lecture seule,
  incident, reprise. Hors production, rien ne part pour de vrai. En production, une personne décide d'un changement
  de mode.
- **Performance** (fiche 6) : une page lente est un défaut, pas un détail. Chaque écran qui attend des données a son
  squelette (PERF-09) ; chaque requête est indexée, paginée, en colonnes utiles, jamais dans une boucle (PERF-06) ;
  chaque appel sortant a un délai maximum (PERF-20) ; ce qui est long part en arrière-plan (PERF-17). Ce qu'on
  ajoute au navigateur se pèse avant (PERF-19), et se mesure sur téléphone lent, sur une application bâtie
  (PERF-33). Dans la durée (fiche 6 §12) : on n'écrit que ce qui a changé (PERF-34) ; toute table qui grandit a sa
  purge dès sa création (PERF-35) ; le menu et ses compteurs viennent d'un cache court par établissement (PERF-36) ;
  un geste, un rechargement (PERF-37). Une configuration ne prouve rien : la preuve est ce que le serveur répond.
- **Production** : aucune mise en production sans `/aef-avant-production`. L'assistant ne pousse pas sur la branche
  principale, n'écrit pas en base de production, ne publie ni n'active un workflow, ne crée ni ne change un secret
  sans validation humaine (IA-04).
- **Ce qui change** dans le projet (nouveau champ, nouveau flux, nouvel automatisme, nouvel envoi) met à jour dans la
  même pull request `docs/cartographie-donnees.md`, `docs/controles.md` ou `docs/modes-de-fonctionnement.md`. Un
  workflow n8n tourne sur l'instance commune `n8n.aef-solutions.fr` et s'inscrit dans l'inventaire unique
  (`docs/automatisations.md` du dépôt du CRM), avec son export.

Commandes : `/aef-socle` (questions sur une règle), `/aef-verifier-socle` (contrôle du projet), `/aef-controles`
(contrôles automatiques, alertes et workflows n8n), `/aef-avant-production`, `/aef-veille-outils`. Version du socle
installée : `.claude/aef-socle/VERSION`.

<!-- socle AEF : fin -->
