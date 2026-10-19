# 11. L'outillage des assistants : se tenir à jour

VS Code et Claude Code sortent des nouveautés chaque semaine. Cette fiche dit **ce que nous utilisons aujourd'hui** et
**comment une nouveauté entre dans nos pratiques** : on la lit, on la classe, on l'applique à tous les projets. Elle est
tenue à jour par la commande `/aef-veille-outils`, et chaque nouveau projet part de ses « pratiques en vigueur ».

La fiche `08-ia-et-assistants.md` passe avant celle-ci : **une nouveauté ne desserre jamais un garde-fou** sans
décision écrite de Lineo (IA-02, IA-04).

<!-- veille: date=2026-10-19 claude-code=2.1.303 vscode=1.142.0 -->

## 1. État de la veille

| | |
|---|---|
| Dernière veille | 19/10/2026 |
| Claude Code (notes de version lues jusqu'à) | 2.1.303 |
| VS Code (notes de version lues jusqu'à) | 1.142 (14/10/2026) |
| Prochaine veille due | à la sortie d'une nouvelle version, et au plus tard 30 jours après la dernière |

Le rappel est automatique : à l'ouverture d'une session, le garde-fou `veille-rappel` compare les versions installées
avec celles du tableau et propose `/aef-veille-outils` quand il y a du nouveau (OUT-02).

## 2. Comment une nouveauté entre dans nos pratiques

Chaque nouveauté lue dans les notes de version reçoit **un** classement :

| Classement | Ce que ça veut dire | Qui décide |
|---|---|---|
| **En vigueur** | Utile, sans risque : appliquée dans chaque nouveau projet, proposée aux projets existants. | La veille, si elle **renforce** ou ne touche pas les garde-fous |
| **À évaluer** | Utile peut-être, à essayer sur un projet avant de la généraliser, ou en attente d'une décision. | Lineo, si elle **assouplit** un garde-fou (permissions, confirmations, accès à un nouveau service) |
| **Écartée** | Inutile pour nous, ou contraire au socle. La raison est écrite, pour ne pas la rediscuter à chaque veille. | La veille ; Lineo si c'est un garde-fou |

Ce qui ne nous concerne pas du tout (correctifs, offres que nous n'avons pas, interface d'un autre outil) n'est pas noté.

Un nouveau service relié à l'assistant (serveur MCP, connecteur, extension qui envoie du code ailleurs) est un
**fournisseur** : il suit la politique IA et l'annexe 3 avant d'être branché sur un dépôt (IA-01, IA-08).

## 3. Pratiques en vigueur

Appliquées dans chaque nouveau projet par `/aef-nouveau-projet`, contrôlées par `/aef-verifier-socle` (OUT-01).

| # | Pratique | Comment |
|---|---|---|
| P1 | **Outils à jour** | Claude Code en ligne de commande et l'extension VS Code à la dernière version publiée, la même des deux côtés : `claude update`, mise à jour automatique des extensions dans VS Code. Une veille se fait sur des outils à jour. |
| P2 | **Consignes du projet dans le dépôt** | `CLAUDE.md` (ou `AGENTS.md`) court : ce que fait le projet, les commandes (tests, lint, construction), les règles du socle. Ce qui doit *toujours* arriver ne va pas dans une consigne mais dans un garde-fou (P3). |
| P3 | **Garde-fous dans `.claude/settings.json` versionné** | Refus sur les secrets, `ask` sur `git push`, garde-fou `block-secrets-read`, rappel de veille : voir `08-ia-et-assistants.md` §3. Des règles qui se déclenchent sans que l'assistant ait à s'en souvenir. |
| P4 | **Planifier avant de toucher** | Mode plan pour tout changement qui touche plusieurs fichiers ou une règle du socle : le plan est relu avant la première modification. |
| P5 | **Les gestes répétés deviennent des commandes** | Une procédure qu'on refait (déployer, vérifier, préparer une version) devient une commande dans `.claude/skills/<nom>/SKILL.md`, versionnée, comme les commandes du socle. |
| P6 | **Relire avant de proposer une fusion** | `/code-review` sur la branche, `/security-review` dès que le changement touche l'authentification, les rôles, les données personnelles ou un secret. |
| P7 | **Travail en parallèle isolé** | Deux chantiers en même temps : un *worktree* git par chantier (une branche, un dossier), jamais deux assistants sur le même dossier. |
| P8 | **Déléguer la recherche** | Les recherches larges dans le code passent par un sous-agent (exploration) : la conversation principale garde la conclusion, pas les fichiers. |
| P9 | **Relecture de sécurité pendant l'écriture** | Plugin officiel `security-guidance` activé dans le `.claude/settings.json` de chaque projet (posé par l'installateur) : contrôle à chaque modification, relecture de sécurité à chaque fin de tour et à chaque commit, correction dans la même session. Consignes du socle dans `.claude/claude-security-guidance.md`. Il ne bloque rien : il fait corriger. Python 3.10 ou plus sur le poste. |
| P10 | **Analyse de sécurité complète** | Plugin officiel Claude Security (`/plugin install claude-security@claude-plugins-official`, puis `/claude-security`) chaque mois et avant chaque mise en production : rapport et correctifs proposés, appliqués un par un, chacun dans sa branche. Le rapport SARIF va au registre de preuves. |
| P11 | **Les skills du socle** | Importés après relecture, figés à un commit, adaptés à nos règles (`THIRD_PARTY_NOTICES.md`) : `grilling` (s'aligner avant un chantier), `tdd`, `diagnosing-bugs`, `doubt-driven-development` (contre-relecture, Claude seul), `source-driven-development` (doc officielle d'abord), `prisma-postgres`, `domain-modeling`, `handoff`, `writing-for-agents`, `mcp-dependency-review` ; agents `silent-failure-hunter` et `database-reviewer`. |
| P12 | **Garde-fous du socle** | `block-secrets-read` (lectures de secrets par tout outil, PowerShell et Grep compris), `config-protection` (l'assistant n'affaiblit pas le lint pour passer), confirmation avant `git reset --hard`, `git clean -f`, `git branch -D`, refus de `--no-verify`. Ajoutés par l'installateur sans rien retirer à un projet. |

## 4. À évaluer

| Nouveauté | Où | Intérêt pour nous | Ce qui bloque |
|---|---|---|---|
| `onFailure: "block"` sur les garde-fous (hooks) | Claude Code 2.1.29x | Si le garde-fou `block-secrets-read` plante, l'action est **bloquée** au lieu de passer. Renforce IA-02. | Rien, à adopter dès que tous les postes sont à jour (P1) : essai sur le CRM, puis en vigueur. Recommandé. |
| Mode automatique (`CLAUDE_CODE_AUTO_MODE_MODEL`) | Claude Code 2.1.29x | Moins de demandes de confirmation. | **Assouplit** les confirmations : décision de Lineo. Les règles `ask` d'IA-04 doivent continuer à demander. |
| Sous-agents « fork » activés par défaut, sous-agents en arrière-plan dans VS Code (`CLAUDE_CODE_FORK_SUBAGENT`) | Claude Code 2.1.292 | Recherches et vérifications en parallèle sans attendre. | Vérifier que les garde-fous du dépôt s'appliquent aussi aux sous-agents (test du garde-fou lancé depuis un sous-agent). |
| Compaction des longues conversations laissées inactives (`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`, ligne « Idle compaction » de `/config`) | Claude Code 2.1.291 | Reprendre une longue session sans tout recharger. | Réglage personnel, rien à imposer. |
| `claudeCode.attachSelection` | Extension VS Code 2.1.295 | Choisir si la sélection de l'éditeur part avec la demande. | À régler à `false` sur un poste où l'on ouvre des fichiers de données personnelles (IA-01). |
| Canevas d'agent (`chat.canvases.enabled`, aperçu) | VS Code 1.142 | Tableaux de suivi à côté de la conversation. | Fonction en aperçu, liée au harnais Copilot que nous n'utilisons pas. |
| `permissions.disableBypassPermissionsMode` | VS Code 1.142 | Interdit le mode sans confirmation dans le chat de VS Code. | Renforce IA-04 si quelqu'un utilise le chat de VS Code : à poser dans les réglages du poste. |
| Code Review (relecture multi-agents des pull requests) | Claude Code, offres Team et Enterprise | Relecture de chaque PR, sécurité comprise, avec commentaires en ligne. | Disponible au passage à Team (IA-08). Réglage « une fois à la création de la PR » et plafond mensuel. |
| `anthropics/claude-code-action` (`@claude fix…` dans GitHub) | GitHub Actions | Faire corriger depuis une PR. | Donne à l'application GitHub de Claude l'écriture sur le dépôt : décision de Lineo, inscription au registre. |
| « Council » en sous-agents Claude seulement | idée de `karpathy/llm-council` | Plusieurs avis indépendants sur une décision d'architecture. | Couvert en partie par `doubt-driven-development`. Utile seulement pour les grandes décisions. |
| Osmani `/build auto` | `addyosmani/agent-skills` | Enchaîne les tâches d'un plan, un commit par tâche, après une seule validation. | **Assouplit** P4 : décision de Lineo. |
| Chrome DevTools MCP | Osmani, ECC | Faire tester le site dans un vrai navigateur par l'assistant. | Serveur MCP chargé en `@latest` : épingler la version, passer par la règle « un MCP est un fournisseur ». |

## 5. Écartées

| Nouveauté | Pourquoi |
|---|---|
| Extension complète ECC (`affaan-m/ECC`, « everything-claude-code ») | Branche 27 automatismes par défaut : journal de tous les appels d'outils sur le disque (secrets filtrés par simples motifs), mémoire réinjectée d'une session à l'autre, exécution de `npx` après chaque modification, contenu commercial. Contraire à IA-01 et IA-05. On en a repris 5 pièces, relues et adaptées (P11, P12). |
| Installer les extensions Matt Pocock ou ECC telles quelles | Elles se mettent à jour seules : leur contenu peut changer sans relecture. On copie à un commit figé (P11). |
| Pocock `wizard` | Écrit des secrets dans `.env` et dans GitHub : contraire à IA-06 (secrets dans le coffre). |
| « Council » multi-fournisseurs (`karpathy/llm-council`, OpenRouter, Gemini, Codex) | Envoie le code à d'autres fournisseurs d'IA : seul Anthropic est autorisé (IA-01, IA-08). |
| Action `anthropics/claude-code-security-review` | Exige une clé d'API, n'est pas protégée contre l'injection de consignes, remplacée par P9, P10 et Code Review. |
| Claude Security géré (service en ligne) | Offre Enterprise seulement à ce jour. Le plugin local (P10) fait l'essentiel. |
| `cloudflare/security-audit-skill` (essayé le 19/10/2026 sur aef-web : 12 min, ~720 000 jetons, 3 pistes à vérifier, rien de confirmé) | Doublon presque total de P10 (Claude Security) ; validateurs inutilisables sous Windows ; demande un bac à sable pour confirmer quoi que ce soit ; sa liste de départ fait chercher les `.env` et clés, contraire à IA-02. Gardé comme **référence ponctuelle** (catalogues d'attaques), pas dans le socle. |
| Doublons des commandes intégrées (code-reviewer, security-reviewer, tdd-workflow, plan… des trois dépôts) | `/code-review`, `/security-review`, `/simplify`, le mode plan et nos commandes `aef-*` les couvrent déjà. |

## 6. Où lire les nouveautés

| Outil | Source |
|---|---|
| Claude Code (CLI et extension) | `https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md` |
| Claude Code, documentation | `https://docs.claude.com/en/docs/claude-code/overview` |
| VS Code | `https://code.visualstudio.com/updates` (une page par version : `/updates/v1_142`) |

## 7. Historique des veilles

| Date | Versions lues | Ce qui a changé | Par |
|---|---|---|---|
| 19/10/2026 | Claude Code 2.1.281 → 2.1.303, VS Code 1.142 | Création de la fiche, pratiques P1 à P8, sept nouveautés à évaluer. Constat : CLI installé en 2.1.280, extension en 2.1.283, dernière publiée 2.1.303 (P1 non tenue). | Lineo BIRIBIN (fiche validée le 19/10/2026) |
| 19/10/2026 | ECC, Matt Pocock, Addy Osmani, outils de sécurité d'Anthropic et de Cloudflare | P9 à P12 ajoutées ; 12 éléments importés et adaptés ; 7 écartés, 6 à évaluer. | Claude, à relire par Lineo |
