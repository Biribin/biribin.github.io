<!-- socle AEF : début -->

## Outillage de l'assistant (socle AEF)

Ce projet reçoit l'outillage commun de l'assistant, maintenu dans le dépôt `aef-socle` : garde-fous
(`.claude/settings.json`, `.claude/hooks/`), relecture de sécurité pendant l'écriture (plugin `security-guidance`,
règles dans `.claude/claude-security-guidance.md`), skills (`tdd`, `diagnosing-bugs`, `grilling`,
`doubt-driven-development`, `source-driven-development`…) et rappel de veille (`/aef-veille-outils`). Les règles
d'AEF Solutions (contrats, registre) ne s'appliquent pas ici. Mise à jour : `python installer.py <projet> --outillage-seul`.

<!-- socle AEF : fin -->
