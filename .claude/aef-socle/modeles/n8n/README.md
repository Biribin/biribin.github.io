# Modèles n8n du socle AEF

Fiche de référence : `knowledge/12-controles-et-alertes.md`. Ces modèles se montent **une fois par instance n8n**
d'AEF, par une personne (IA-04 : l'assistant prépare, il ne publie pas un workflow actif).

## 1. Le workflow « AEF · alerte erreur » (CTL-08)

Trois nœuds, dans cet ordre :

| # | Nœud | Réglages |
|---|---|---|
| 1 | **Error Trigger** | aucun |
| 2 | **Code** — « Construire l'alerte » | *Mode* : Run Once for All Items · *Language* : JavaScript · contenu : `alerte-erreur.cjs` recopié tel quel, puis `REGLAGES` ajusté (adresse de l'instance, workflows critiques) |
| 3 | **Send Email** — « Envoyer l'alerte » | *Credential* : identifiant SMTP d'OVH de l'instance (compte de service d'envoi, IAM-07) · *From Email* : `noreply@mail.aef-solutions.fr` · *To Email* : la boîte d'exploitation (`informatique@aef-solutions.fr`), réglée ici et nulle part ailleurs · *Subject* : `{{ $json.sujet }}` · *Email Format* : Text · *Text* : `{{ $json.texte }}` |

Réglages du workflow : nom `AEF · alerte erreur`, étiquette `aef`, fuseau `Europe/Paris`. **Il n'a pas de workflow
d'erreur lui-même** (une alerte sur l'alerte tournerait en boucle) : son propre échec se voit par l'exercice
« alerte débranchée » (CTL-05) et par le rapport quotidien.

Ensuite, pour **chaque** workflow actif : *Settings* → *Error workflow* → `AEF · alerte erreur`.

Le courriel ne recopie **jamais** le message d'erreur (CTL-03) : il donne l'étape, le type d'erreur, le code HTTP et le
lien vers l'exécution. Le code est testé hors de n8n : `node --test modeles/n8n/alerte-erreur.test.mjs`. Une
modification se fait dans `alerte-erreur.cjs` et son test, puis se recopie dans n8n — jamais l'inverse.

### L'essai obligatoire (CTL-05)

n8n **ne lance pas le workflow d'erreur quand on exécute un workflow à la main**. L'essai se fait donc avec un
workflow d'essai **publié** :

1. Créer `AEF · essai alerte` (étiquette `essai`) : *Schedule Trigger* toutes les 2 minutes → *Stop and Error*
   (message « essai »). Workflow d'erreur : `AEF · alerte erreur`.
2. L'activer 7 minutes (trois lancements), puis le désactiver.
3. Attendu : **un seul** courriel `[AEF][AEF][ALERTE] Échec de « AEF · essai alerte »`, sans message d'erreur ni
   donnée. Les deux suivants sont retenus par l'anti-tempête.
4. Plus d'une heure après le premier courriel, le réactiver pour un lancement : un courriel qui annonce les 2 alertes
   retenues.
5. Si l'étape 3 donne trois courriels, la mémoire anti-tempête n'est pas gardée par l'instance : le noter dans
   `docs/controles.md`. Dans tous les cas, noter la date de l'essai réussi.

## 1 bis. Le workflow « AEF · alerte CI » (CTL-08)

Le workflow du §1 se déclenche quand **un workflow n8n** échoue. Rien ne recevait les alertes venues de
**l'extérieur** — et la chaîne d'intégration continue d'un projet en est une. D'où ce second workflow.

> **Ce que ce trou a coûté, et pourquoi l'essai n'est pas une formalité.** Dans le CRM Terminal Academy, le secret qui
> porte l'adresse du webhook visait une ancienne instance, éteinte. Le `curl` de la chaîne échouait sur
> « Could not resolve host », quatre tentatives comprises, et personne n'était prévenu. La chaîne est restée rouge du
> 5 au 11 novembre 2026 — avec, parmi les rouges, une exécution de code à distance non authentifiée dans Next.js, en
> production chez un client.
>
> ⚠️ **Une adresse qui répond mais ne déclenche rien est pire qu'une adresse morte.** La seconde fait échouer le
> `curl`, donc elle se voit. La première rend le job vert et fait croire que quelqu'un veille.

### Le monter : un import, puis trois réglages

**`alerte-ci.workflow.json` s'importe tel quel** — pas de nœuds à poser un par un. Dans n8n : *Workflows* →
*Import from File*, ou ouvrir un workflow vide et coller le contenu du fichier (*⋯ → Import from clipboard*).

Arrivent alors trois nœuds déjà reliés et réglés : **Webhook** (`POST`, chemin `alerte-ci`, authentification par
en-tête) → **Construire l'alerte** (le code, déjà dedans) → **Envoyer l'alerte**.

Restent **trois choses à régler sur place**, et elles seules — ce sont les trois qui n'ont rien à faire dans un
fichier versionné :

| Où | Quoi |
|---|---|
| nœud **Webhook** | l'identifiant « Header Auth » : en-tête `X-Jeton-Alerte`, valeur = le jeton rangé dans les secrets du dépôt |
| nœud **Envoyer l'alerte** | l'identifiant SMTP d'OVH de l'instance (compte de service d'envoi, IAM-07) |
| nœud **Envoyer l'alerte** | *To Email* : la boîte d'exploitation, à la place de « À RÉGLER » |

Puis : *Settings* → *Error workflow* → `AEF · alerte erreur`, et activer.

> Le fichier est **fabriqué** à partir de `alerte-ci.cjs` par `construire-workflow.mjs` : on ne le modifie jamais à la
> main. Une correction se fait dans le `.cjs`, puis `node modeles/n8n/construire-workflow.mjs` régénère le JSON. La
> chaîne refuse de valider si les deux ont divergé.

**Côté projet**, le secret du dépôt (`ALERTE_WEBHOOK_URL` dans le CRM) prend l'adresse **complète** du webhook :

```
https://n8n.aef-solutions.fr/webhook/alerte-ci
```

⛔ **Pas l'adresse de l'instance seule.** Une URL sans chemin ne déclenche aucun workflow, et selon ce que répond le
serveur, la chaîne peut très bien afficher « Alerte transmise. » sans que rien ne soit parti.

⛔ **Pas la « Test URL » non plus.** Le nœud Webhook en affiche deux, et celle qui s'ouvre par défaut est la mauvaise :

| Onglet dans n8n | Adresse | Quand elle répond |
|---|---|---|
| *Test URL* | `…/webhook-test/alerte-ci` | seulement pendant les secondes qui suivent un clic sur « Listen for test event » |
| **Production URL** | `…/webhook/alerte-ci` | en permanence, **si le workflow est activé** |

C'est la seconde qui va dans le secret, et le workflow doit être **activé** : sans cela, elle répond 404.

**L'identifiant « Header Auth »** vérifie ce que la chaîne envoie : un en-tête nommé **exactement** `X-Jeton-Alerte`,
dont la valeur est le jeton rangé dans les secrets du dépôt (`ALERTE_WEBHOOK_TOKEN` dans le CRM). Un seul webhook
partagé entre plusieurs projets suppose donc **un jeton commun** : n8n ne vérifie qu'un couple nom/valeur par
identifiant. Un projet qui doit avoir son propre jeton a son propre workflow, avec un autre chemin.

Le courriel ne recopie **jamais** le détail d'un échec (CTL-03) : chaque champ reçu est vérifié contre une forme
attendue avant d'entrer dans le message, et le lien n'est admis que s'il pointe vers un journal d'Actions. Le code est
testé hors de n8n : `node --test modeles/n8n/alerte-ci.test.mjs`.

### L'essai obligatoire (CTL-05)

1. Dans le projet, une branche jetable avec un test qui échoue **seulement sur le runner** — en se fiant à la variable
   d'environnement `CI`, posée là et pas sur un poste de travail. Le dépôt local reste vert, et l'échec vise la chaîne.
2. Ouvrir la pull request, laisser la chaîne rougir.
3. Attendu, dans cet ordre : **le job d'alerte réussit** (son `curl` ne proteste pas), **une exécution apparaît dans
   n8n**, et **le courriel arrive** dans la boîte d'exploitation. Les deux premiers points ne prouvent que la moitié
   du chemin — c'est le troisième qui compte.
4. Fermer la pull request, supprimer la branche, et noter la date de l'essai réussi dans `docs/controles.md`.

## 2. Le battement d'un workflow planifié (CTL-09)

1. Dans Uptime Kuma : *Add New Monitor* → type **Push**, nom = nom du workflow, *Heartbeat Interval* = période du
   workflow **plus une marge** (par exemple 15 minutes pour une tâche quotidienne), *Retries* = **0**, notifications
   téléphone (Pushover ou SMS) et courriel. Kuma donne une URL `…/api/push/<jeton>`.
2. À la **fin** du chemin utile, un nœud **HTTP Request** nommé « Battement », réglé sur **Execute Once** (sinon il
   envoie un battement par élément) : `GET` sur l'URL avec `?status=up&msg={{ $('Étape qui compte').all().length }}`.
   Le jeton de la sonde est admis en clair dans ce nœud (exception de CTL-12, fiche 12 §3.2).
3. Si zéro élément est anormal pour ce workflow, une branche *IF* envoie `status=down&msg=0` : Kuma ne lit pas le
   message, seulement l'état, et passe en panne tout de suite.
4. Si le workflow a plusieurs fins normales (rien à faire, travail fait), chacune envoie son battement.

## 3. Les sondes de l'exploitation

| Sonde Uptime Kuma | Type | Réglage | Pourquoi |
|---|---|---|---|
| Route de santé de chaque logiciel | HTTP | 60 s, route qui vérifie aussi la base | CONT-13 |
| SMTP d'OVH | TCP, port 465 | 5 min | Quand l'envoi tombe, les courriels d'alerte tombent aussi (MOD-04) |
| Contrôle n8n | Push | 24 h + 30 min, *Retries* 0 | Le contrôle quotidien la met « en vie », ou « en panne » sur un CRITIQUE ou un contrôle impossible ; s'il ne tourne pas, elle expire |
| Un workflow planifié | Push | sa période + une marge, *Retries* 0 | CTL-09 |

## 4. Le contrôle quotidien de l'instance (CTL-16)

`outils/controle-n8n.py`, lancé **hors de n8n** chaque jour à 7 h 30. Exemple de minuterie systemd sur le serveur :

```ini
# /etc/systemd/system/aef-controle-n8n.service
[Service]
Type=oneshot
EnvironmentFile=/etc/aef/controle-n8n.env
ExecStart=/usr/bin/python3 /opt/aef/controle-n8n.py --courriel --retention-jours 30

# /etc/systemd/system/aef-controle-n8n.timer
[Timer]
OnCalendar=*-*-* 07:30:00 Europe/Paris
Persistent=true
[Install]
WantedBy=timers.target
```

`/etc/aef/controle-n8n.env` (propriétaire root, droits 600, copie dans le coffre, CONT-10) contient `N8N_URL`,
`N8N_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `ALERTES_EXPEDITEUR`
(`noreply@mail.aef-solutions.fr`), `ALERTES_DESTINATAIRE` (la boîte d'exploitation) et `KUMA_PUSH_URL` (sonde
« contrôle n8n »). `--retention-jours` reprend la durée de conservation des exécutions de l'instance
(`EXECUTIONS_DATA_MAX_AGE`).

**La clé d'API** est celle d'un compte n8n dédié au contrôle qui **voit tous les projets** (propriétaire ou
administrateur de l'instance) : sinon l'API ne rend qu'une partie des workflows, et le contrôle le signale comme
« contrôle impossible » quand il ne voit rien. Dans l'édition communautaire, cette clé peut aussi écrire : elle ne
quitte jamais ce fichier et le coffre.

Dans la chaîne d'intégration du dépôt qui porte l'inventaire et les exports de l'instance (aujourd'hui celui du
CRM) :

```yaml
- name: Contrôle des workflows n8n exportés (socle AEF, fiche 12)
  run: python .claude/aef-socle/controle-n8n.py --fichiers n8n/ --inventaire docs/automatisations.md --strict
```
