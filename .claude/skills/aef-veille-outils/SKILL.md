---
name: aef-veille-outils
description: Veille outillage des assistants — lit les notes de version de Claude Code et de VS Code depuis la dernière veille, classe chaque nouveauté (en vigueur, à évaluer, écartée) au regard du socle AEF, met à jour la fiche 11-outillage-assistants.md et les commandes du socle, puis aligne le projet ouvert sur les pratiques en vigueur. Use when the user says « veille outils », « quoi de neuf dans Claude Code », « nouvelle version de VS Code », « mets-nous à jour des nouveautés », when the session-start reminder « Veille outillage AEF » appears, or invokes /aef-veille-outils.
---

# Veille outillage : s'approprier chaque nouveauté

But : qu'une nouveauté de Claude Code ou de VS Code soit **lue, jugée et appliquée** en quelques minutes, et que chaque
nouveau projet parte des meilleures pratiques du moment. La règle de fond est dans
`.claude/aef-socle/knowledge/11-outillage-assistants.md` (ou `knowledge/` dans le dépôt `aef-socle`) : lis-la d'abord.

## 1. Relever

1. Versions installées : `claude --version`, `code --version`, et la version de l'extension
   (`code --list-extensions --show-versions`, ligne `anthropic.claude-code`).
2. Dernière veille : la ligne `<!-- veille: ... -->` de la fiche 11.
3. Si un outil est en retard sur la dernière version publiée, dis-le en premier et donne la commande de mise à jour
   (`claude update` ; dans VS Code, mettre à jour l'extension). Ne la lance pas sans accord.

## 2. Lire

Lis les notes de version **de la version de la dernière veille jusqu'à la dernière publiée**, aux sources de la fiche §6.
Pour VS Code, une page par version (`https://code.visualstudio.com/updates/v1_143`…). Ne t'appuie jamais sur ta
mémoire : une nouveauté qui n'est pas dans les notes de version n'existe pas pour cette veille. Ne relève que ce qui
change la façon de travailler : outils, commandes, garde-fous (hooks), réglages, permissions, sous-agents, mode plan,
worktrees, commandes (skills), MCP, intégration VS Code. Pas les correctifs.

## 3. Classer

Pour chaque nouveauté retenue, un classement de la fiche §2, avec une ligne d'intérêt pour AEF :

- **renforce** un garde-fou ou ne le touche pas, et sert à tous les projets → peut passer **en vigueur** ;
- **assouplit** un garde-fou (moins de confirmations, plus de droits, un nouveau service qui reçoit du code ou des
  données) → **à évaluer**, avec « décision de Lineo » ; jamais en vigueur sans sa décision écrite ;
- inutile ou contraire au socle → **écartée**, avec la raison.

Reprends aussi la section « À évaluer » existante : ce qui a été essayé ou décidé depuis change de colonne.

## 3 bis. Reprendre un skill d'un dépôt public

Un skill est du texte que l'assistant suit comme une consigne : il entre dans le socle avec les mêmes égards qu'une
dépendance. Dans cet ordre, et sans rien sauter :

1. **Licence** : MIT, Apache 2.0 ou équivalent. Sans licence, on ne reprend rien.
2. **Copie figée** : le fichier est copié à un commit précis, jamais installé comme extension qui se met à jour
   seule. Le commit est noté dans `THIRD_PARTY_NOTICES.md` et en tête du fichier (provenance et adaptations).
3. **Texte seul** : on ne reprend ni garde-fou d'ouverture de session, ni script lancé après chaque modification,
   ni exécutable téléchargé au premier appel. Un skill qui ne sait pas travailler sans eux n'entre pas.
4. **Consignes cachées** : `python outils/consignes-cachees.py <dossier du skill>` avant la relecture, puis relecture
   humaine. Un seul signalement non expliqué : on n'importe pas.
5. **Doublon** : si une commande intégrée (`/code-review`, `/security-review`, `/simplify`, le mode plan) ou une
   commande `aef-*` fait déjà le travail, on ne l'importe pas ; on écrit la raison dans la fiche §5.
6. **Adaptation** : ce que le socle exige n'est jamais présenté comme facultatif par un skill repris.

## 4. Écrire

Dans le dépôt `aef-socle` (si tu n'y es pas, prépare le texte et dis à l'utilisateur de l'appliquer là-bas) :

1. Fiche 11 : la ligne `<!-- veille: date=AAAA-MM-JJ claude-code=X vscode=Y -->`, le tableau §1, les sections 3 à 5,
   une ligne d'historique §7. La ligne de veille et le tableau §1 ne changent que si les notes de version de
   Claude Code et de VS Code ont bien été lues ce jour-là : sinon le rappel de veille se tairait à tort.
2. Une pratique qui passe en vigueur et change la façon de démarrer un projet : ajoute-la à
   `skills/aef-nouveau-projet/SKILL.md` ; si elle se contrôle, à `09-exigences.csv` (série `OUT-`), avec la preuve.
3. Montre le différentiel et propose un commit sur une branche. Pas de push sur `main` sans confirmation (IA-04).
4. Rappelle de relancer `python installer.py <projet>` dans chaque projet : c'est ce qui y propage la veille.

## 5. Appliquer au projet ouvert

Si la session est ouverte sur un projet (pas sur le dépôt du socle) : compare le projet aux pratiques en vigueur
(P1, P2…), liste ce qui manque, et propose de l'ajouter sur une branche. Une pratique « à évaluer » n'est jamais
appliquée d'office.

## À rendre

Un résumé court : versions lues, nouveautés par classement (une ligne chacune), ce qui a changé dans le socle, ce qui
attend Lineo, et ce qui reste à faire dans le projet.
