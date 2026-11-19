"""Contrôle d'une instance n8n d'AEF, en lecture seule (fiche 12 du socle : CTL-08 à CTL-16, DON-06).

    python controle-n8n.py                                   rapport à l'écran (instance lue par son API)
    python controle-n8n.py --courriel                        rapport envoyé par courriel, même vide (CTL-16)
    python controle-n8n.py --inventaire docs/automatisations.md [--inventaire …]
    python controle-n8n.py --fichiers n8n/ [--strict]        exports du dépôt, sans accès à l'instance (CI)

Variables d'environnement (posées dans le fichier de la tâche planifiée, lisible par root seul, copié dans le coffre ;
jamais sur un poste ni dans une session d'assistant) :
  N8N_URL, N8N_API_KEY      instance, et clé d'API d'un compte qui voit TOUS les projets de l'instance
                            (propriétaire ou administrateur). Dans l'édition communautaire, cette clé peut aussi écrire :
                            le script ne fait que des lectures, mais c'est sa promesse, pas une limite de la clé.
  SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASSWORD     SMTP d'OVH (ARC-07)
  ALERTES_EXPEDITEUR, ALERTES_DESTINATAIRE                 obligatoires avec --courriel, sans valeur par défaut (CTL-02)
  ALERTES_PROJET            défaut n8n (objet : [AEF][<projet>][<gravité>])
  KUMA_PUSH_URL             sonde Push « contrôle n8n » : « up » si rien de grave, « down » sur un CRITIQUE ou un
                            contrôle impossible (le téléphone sonne, CTL-07)

Le script ne fait que des lectures (GET), ne suit aucune redirection, et n'affiche jamais une valeur secrète ni le
contenu d'une exécution.
Codes de sortie : 0 rien à signaler, 1 alertes, 2 critique, 3 contrôle impossible.
Avec --fichiers : 0, ou 1 avec --strict dès une alerte ou un critique (pour faire échouer la chaîne d'intégration) ;
3 si aucun export n'est lisible.
"""
import argparse
import datetime as dt
import json
import os
import re
import smtplib
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage
from pathlib import Path

CRITIQUE, ALERTE, INFO = "CRITIQUE", "ALERTE", "INFO"
ORDRE = (CRITIQUE, ALERTE, INFO)
TITRES = {CRITIQUE: "CRITIQUE", ALERTE: "ALERTE", INFO: "INFO (à revoir)"}
FICHE = "fiche 12 du socle AEF (.claude/aef-socle/knowledge/12-controles-et-alertes.md)"
PAGES_MAX = 200

PLANIFIES = {"n8n-nodes-base.scheduleTrigger", "n8n-nodes-base.cron", "n8n-nodes-base.interval"}
WEBHOOK = "n8n-nodes-base.webhook"
ERREUR = "n8n-nodes-base.errorTrigger"
COURRIEL = "n8n-nodes-base.emailSend"
HTTP = "n8n-nodes-base.httpRequest"
CODE = {"n8n-nodes-base.code", "n8n-nodes-base.function", "n8n-nodes-base.functionItem"}
AUTH_STATIQUE = {"basicAuth", "headerAuth", "jwtAuth"}
SORTIES = {"n8n-nodes-base.if": 2}  # nombre de sorties normales ; 1 par défaut ; Switch : variable

# Motifs de secrets écrits en dur. Le rapport nomme le type, jamais la valeur.
SECRETS = [
    ("clé privée", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("jeton Bearer", re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{20,}")),
    ("identifiants Basic", re.compile(r"\bBasic\s+[A-Za-z0-9+/]{16,}={0,2}")),
    ("clé Stripe", re.compile(r"\b[srp]k_(?:live|test)_[A-Za-z0-9]{16,}")),
    ("clé d'API d'IA", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}")),
    ("clé d'API Google", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("jeton GitHub", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}")),
    ("clé d'accès S3", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("jeton Slack", re.compile(r"\bxox[abpr]-[A-Za-z0-9-]{10,}")),
    ("mot de passe dans une URL", re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/:@{}]+:[^\s/@{}]{3,}@")),
]
AFFECTATION = re.compile(
    r"(?i)\b(?:const|let|var)\s+(\w*(?:token|secret|password|passwd|apikey|api_key|motdepasse)\w*)\s*=\s*['\"`]([^'\"`{}$]+)['\"`]")
NOMS_SENSIBLES = re.compile(r"(?i)(authorization|auth|token|secret|password|passwd|api[-_]?key|apikey|mot.?de.?passe|access[-_]?key)")
NOMS_ANODINS = re.compile(r"(?i)(url|uri|endpoint|expir|type|mode|name|nom|header|field|method)")
PARAMETRE_SENSIBLE = re.compile(r"(?i)^(api[-_]?key|apikey|key|token|access[-_]?token|secret|password|passwd|sig|signature)$")


def ecart(gravite, regle, workflow, message):
    return {"gravite": gravite, "regle": regle, "workflow": workflow, "message": message}


def nom_de(wf):
    return str(wf.get("name") or "")


def nom_wf(wf):
    return f"« {nom_de(wf) or '?'} » ({wf.get('id', '?')})"


def etiquettes(wf):
    sortie = set()
    for t in wf.get("tags") or []:
        sortie.add(str((t.get("name") if isinstance(t, dict) else t) or "").lower())
    return sortie - {""}


def est_actif(wf):
    return bool(wf.get("active")) or bool(wf.get("activeVersionId"))


def est_litteral(valeur):
    return isinstance(valeur, str) and "{{" not in valeur and not valeur.startswith("=")


def ressemble_secret(valeur):
    """Une valeur littérale qui a la forme d'un secret (pas une URL, une date, une phrase ou un nombre)."""
    if not est_litteral(valeur) or len(valeur) < 12 or re.search(r"\s", valeur):
        return False
    if re.match(r"(?i)^(https?://|/)", valeur) or re.fullmatch(r"[\d\-:.TZ+]+", valeur):
        return False
    return (bool(re.search(r"[A-Za-z]", valeur)) and bool(re.search(r"\d", valeur))) or len(valeur) >= 24


def chaines(obj):
    if isinstance(obj, dict):
        for v in obj.values():
            yield from chaines(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from chaines(v)
    elif isinstance(obj, str):
        yield obj


def secrets_du_noeud(noeud):
    """Types de secrets trouvés dans les paramètres d'un nœud (jamais les valeurs)."""
    trouves = set()
    params = noeud.get("parameters") or {}
    for texte in chaines(params):
        for nom, motif in SECRETS:
            if motif.search(texte):
                trouves.add(nom)
        for nom, valeur in AFFECTATION.findall(texte):
            if ressemble_secret(valeur) and not NOMS_ANODINS.search(nom):
                trouves.add("secret affecté dans le code")
        for url in re.findall(r"https?://[^\s'\"`]+", texte):
            for cle, valeur in urllib.parse.parse_qsl(urllib.parse.urlsplit(url).query):
                if PARAMETRE_SENSIBLE.match(cle) and len(valeur) >= 8 and "{{" not in valeur:
                    trouves.add(f"secret dans l'URL (paramètre « {cle} »)")

    def paires(obj):
        if isinstance(obj, dict):
            nom, valeur = obj.get("name"), obj.get("value")
            if isinstance(nom, str) and NOMS_SENSIBLES.search(nom) and not NOMS_ANODINS.search(nom) and ressemble_secret(valeur):
                trouves.add(f"valeur écrite en dur pour « {nom} »")
            for k, v in obj.items():
                if NOMS_SENSIBLES.fullmatch(k) and ressemble_secret(v):
                    trouves.add(f"valeur écrite en dur pour « {k} »")
                paires(v)
        elif isinstance(obj, list):
            for v in obj:
                paires(v)

    paires(params)
    return sorted(trouves)


def code_du_noeud(noeud):
    p = noeud.get("parameters") or {}
    return str(p.get("jsCode") or p.get("functionCode") or p.get("code") or "")


def catchs_qui_avalent(code):
    """Blocs catch vides (commentaires seulement) ou qui rendent un résultat vide."""
    trouves = 0
    for m in re.finditer(r"\bcatch\s*(?:\([^)]*\))?\s*\{", code):
        profondeur, i = 1, m.end()
        while i < len(code) and profondeur:
            profondeur += {"{": 1, "}": -1}.get(code[i], 0)
            i += 1
        corps = re.sub(r"//[^\n]*|/\*.*?\*/", "", code[m.end(): i - 1], flags=re.S).strip()
        if not corps or re.fullmatch(r"return\s*(\[\s*\]|null|undefined|\{\s*\}|false)?\s*;?", corps):
            trouves += 1
    return trouves


# --- période attendue d'un workflow planifié --------------------------------------------------------------------

JOURS = {"sun": 0, "mon": 1, "tue": 2, "wed": 3, "thu": 4, "fri": 5, "sat": 6}


def jours_cron(champ):
    """Jours de la semaine (0 = dimanche) d'un champ cron, ou None si tous."""
    if champ in ("*", "?"):
        return None
    jours = set()
    for morceau in champ.lower().split(","):
        pas = 1
        if "/" in morceau:
            morceau, p = morceau.split("/", 1)
            pas = int(p)
        if morceau == "*":
            bornes = [0, 6]
        else:
            bornes = [int(x) % 7 if x.isdigit() else JOURS.get(x) for x in morceau.split("-")]
        if None in bornes:
            return None
        debut, fin = bornes[0], bornes[-1]
        if fin < debut:
            fin += 7
        jours.update(j % 7 for j in range(debut, fin + 1, pas))
    return jours or None


def periode_cron(expr):
    """Écart maximal entre deux lancements d'une expression cron simple, en minutes ; None si on ne sait pas."""
    champs = str(expr).split()
    if len(champs) == 6:  # n8n accepte une colonne des secondes en tête
        champs = champs[1:]
    if len(champs) != 5:
        return None
    minute, heure, jour_mois, mois, jour_sem = champs
    if jour_mois != "*" or mois != "*":
        return None  # mensuel ou annuel : la sonde Kuma s'en charge
    jours = jours_cron(jour_sem)
    trou_jours = 1  # plus grand écart entre deux jours où la tâche tourne
    if jours is not None:
        ordonnes = sorted(jours)
        trou_jours = max(((ordonnes[(i + 1) % len(ordonnes)] - j) % 7 or 7) for i, j in enumerate(ordonnes))
    m = re.fullmatch(r"\*/(\d+)", minute)
    if m and heure == "*":
        dans_le_jour = int(m.group(1))
    elif minute == "*" and heure == "*":
        dans_le_jour = 1
    elif heure == "*" or re.fullmatch(r"\*/\d+", heure):
        dans_le_jour = 60 * (int(heure[2:]) if heure.startswith("*/") else 1)
    else:
        return trou_jours * 24 * 60  # une ou plusieurs heures fixes par jour
    # plusieurs lancements par jour : le plus grand trou est la nuit avant un jour sans lancement
    return dans_le_jour if trou_jours == 1 else (trou_jours - 1) * 24 * 60 + dans_le_jour


def _periode(noeud):
    p = noeud.get("parameters") or {}
    t = noeud.get("type")
    if t == "n8n-nodes-base.scheduleTrigger":
        regles = (p.get("rule") or {}).get("interval") or [{}]
        periodes = []
        unites = {"seconds": 1 / 60, "minutes": 1, "hours": 60, "days": 1440, "weeks": 10080, "months": 44640}
        defauts = {"seconds": 30, "minutes": 5, "hours": 1, "days": 1, "weeks": 1, "months": 1}
        for r in regles:
            champ = r.get("field", "days")
            if champ == "cronExpression":
                periodes.append(periode_cron(r.get("expression", "")))
            elif champ in unites:
                periodes.append(float(r.get(f"{champ}Interval", defauts[champ])) * unites[champ])
            else:
                periodes.append(None)
        return min(periodes) if periodes and None not in periodes else None
    if t == "n8n-nodes-base.cron":
        modes = {"everyMinute": 1, "everyHour": 60, "everyDay": 1440, "everyWeek": 10080}
        periodes = []
        for item in (p.get("triggerTimes") or {}).get("item") or [{}]:
            mode = item.get("mode", "everyDay")
            if mode in modes:
                periodes.append(modes[mode])
            elif mode == "everyX":
                periodes.append(float(item.get("value", 1)) * (60 if item.get("unit") == "hours" else 1))
            elif mode == "custom":
                periodes.append(periode_cron(item.get("cronExpression", "")))
            else:
                periodes.append(None)
        return min(periodes) if periodes and None not in periodes else None
    if t == "n8n-nodes-base.interval":
        unite = {"seconds": 1 / 60, "minutes": 1, "hours": 60}.get(p.get("unit", "seconds"), 1)
        return float(p.get("interval", 1)) * unite
    return None


def periode_minutes(noeud):
    """Période attendue d'un déclencheur planifié, en minutes ; None si on ne sait pas la déduire."""
    try:
        return _periode(noeud)
    except (ValueError, TypeError, AttributeError):  # expression n8n ou forme inattendue : la sonde Kuma s'en charge
        return None


def est_battement(noeud):
    """Un nœud HTTP vers une sonde Push d'Uptime Kuma, ou un nœud nommé « battement »."""
    if "battement" in str(noeud.get("name", "")).lower():
        return True
    if noeud.get("type") != HTTP:
        return False
    texte = json.dumps(noeud.get("parameters") or {}, ensure_ascii=False).lower()
    return "/api/push/" in texte or "kuma" in texte


def successeurs(wf, nom):
    sortie = (wf.get("connections") or {}).get(nom) or {}
    for branches in sortie.values():
        for branche in branches or []:
            for lien in branche or []:
                yield lien.get("node")


# --- analyse d'un ensemble de workflows -------------------------------------------------------------------------

def analyser(workflows, erreurs_24h=None, dernieres=None, inventaire=None, maintenant=None, retention_jours=30,
             instance_complete=True):
    """Rend la liste des écarts. Fonction pure : aucune lecture réseau, aucun secret en sortie.

    erreurs_24h : {workflowId: [exécutions en erreur des 24 dernières heures]} (None : non contrôlé, mode fichiers)
    dernieres   : {workflowId: date de la dernière exécution (datetime) ou None}
    inventaire  : {identifiant: True si inventorié actif, False si inventorié « inactif »} (None : non contrôlé)
    instance_complete : False pour des exports partiels (le workflow d'erreur commun peut ne pas y être)
    """
    maintenant = maintenant or dt.datetime.now(dt.timezone.utc)
    ecarts = []
    par_id = {w.get("id"): w for w in workflows}

    for wf in workflows:
        noeuds = [n for n in wf.get("nodes") or [] if isinstance(n, dict)]
        types = {n.get("type") for n in noeuds}
        tags = etiquettes(wf)
        actif = est_actif(wf)
        reglages = wf.get("settings") or {}
        nom = nom_wf(wf)
        est_alerte = ERREUR in types

        # CTL-08 : workflow d'erreur
        if actif and not est_alerte:
            cible = reglages.get("errorWorkflow")
            if not cible:
                ecarts.append(ecart(ALERTE, "CTL-08", nom, "aucun workflow d'erreur : un échec ne préviendra personne"))
            elif instance_complete and cible not in par_id:
                ecarts.append(ecart(ALERTE, "CTL-08", nom, f"le workflow d'erreur {cible} est introuvable"))
            elif cible in par_id and COURRIEL not in {n.get("type") for n in par_id[cible].get("nodes") or []}:
                ecarts.append(ecart(ALERTE, "CTL-08", nom, f"le workflow d'erreur {nom_wf(par_id[cible])} n'envoie aucun courriel"))
        if est_alerte and COURRIEL not in types:
            ecarts.append(ecart(ALERTE, "CTL-08", nom, "workflow d'erreur sans envoi de courriel"))

        # CTL-11 : webhooks authentifiés, signature vérifiée (SEC-15)
        for n in noeuds:
            if n.get("type") == WEBHOOK:
                auth = (n.get("parameters") or {}).get("authentication", "none")
                if "signature-hmac" in tags:
                    noms_suivants = set(successeurs(wf, n.get("name")))
                    suivants = [s for s in noeuds if s.get("name") in noms_suivants]
                    verifie = any(s.get("type") == "n8n-nodes-base.crypto" or re.search(r"(?i)hmac", code_du_noeud(s))
                                  for s in suivants)
                    if not verifie:
                        ecarts.append(ecart(ALERTE, "CTL-11", nom, f"webhook « {n.get('name')} » étiqueté signature-hmac "
                                                                  "sans vérification de signature dans le nœud qui suit"))
                elif auth in AUTH_STATIQUE:
                    ecarts.append(ecart(INFO, "CTL-11", nom, f"webhook « {n.get('name')} » protégé par un jeton statique "
                                                             "seul : SEC-15 demande une signature horodatée, ou une décision écrite"))
                else:
                    g = CRITIQUE if actif else INFO
                    ecarts.append(ecart(g, "CTL-11", nom, f"webhook « {n.get('name')} » sans authentification"))
            if n.get("type") == "n8n-nodes-base.formTrigger" and actif:
                ecarts.append(ecart(INFO, "CTL-11", nom, f"formulaire public « {n.get('name')} » : plafond et anti-robot ?"))

        # CTL-12 : secrets écrits en dur, données épinglées
        for n in noeuds:
            for type_secret in secrets_du_noeud(n):
                ecarts.append(ecart(CRITIQUE, "CTL-12", nom, f"nœud « {n.get('name')} » : {type_secret}"))
        if wf.get("pinData"):
            g = ALERTE if actif or not instance_complete else INFO
            ecarts.append(ecart(g, "CTL-12", nom, f"{len(wf['pinData'])} nœud(s) avec données épinglées : à retirer"))

        # CTL-10 : erreurs avalées
        for n in noeuds:
            sur_erreur = n.get("onError")
            if sur_erreur == "continueErrorOutput":
                if n.get("type") == "n8n-nodes-base.switch":
                    ecarts.append(ecart(INFO, "CTL-10", nom, f"nœud « {n.get('name')} » : vérifier que sa sortie d'erreur est branchée"))
                else:
                    rang = SORTIES.get(n.get("type"), 1)
                    branches = ((wf.get("connections") or {}).get(n.get("name")) or {}).get("main") or []
                    if len(branches) <= rang or not branches[rang]:
                        ecarts.append(ecart(ALERTE, "CTL-10", nom, f"nœud « {n.get('name')} » : sortie d'erreur non branchée"))
            elif sur_erreur == "continueRegularOutput" or n.get("continueOnFail"):
                ecarts.append(ecart(ALERTE, "CTL-10", nom, f"nœud « {n.get('name')} » continue en cas d'erreur : "
                                                           "brancher une sortie d'erreur à la place"))
            if n.get("type") in CODE and catchs_qui_avalent(code_du_noeud(n)):
                ecarts.append(ecart(ALERTE, "CTL-10", nom, f"nœud Code « {n.get('name')} » : catch vide ou qui rend un "
                                                           "résultat vide, erreur avalée"))

        # CTL-09 et CTL-15 : workflows planifiés
        declencheurs = [n for n in noeuds if n.get("type") in PLANIFIES and not n.get("disabled")]
        if declencheurs and actif:
            battements = [n for n in noeuds if est_battement(n)]
            if not battements:
                ecarts.append(ecart(ALERTE, "CTL-09", nom, "workflow planifié sans battement : son silence passerait inaperçu"))
            premiers = {s for d in declencheurs for s in successeurs(wf, d.get("name"))}
            for b in battements:
                if b.get("name") in premiers:
                    ecarts.append(ecart(ALERTE, "CTL-09", nom, f"battement « {b.get('name')} » en début de chaîne : "
                                                               "il faut le mettre à la fin"))
                if b.get("type") == HTTP and not b.get("executeOnce"):
                    ecarts.append(ecart(INFO, "CTL-09", nom, f"battement « {b.get('name')} » sans « Execute Once » : "
                                                             "un appel par élément"))
            fuseau = reglages.get("timezone")
            if not fuseau or fuseau == "DEFAULT":
                ecarts.append(ecart(ALERTE, "CTL-15", nom, "fuseau non réglé : il faut Europe/Paris dans les réglages du workflow"))
            elif fuseau != "Europe/Paris":
                ecarts.append(ecart(ALERTE, "CTL-15", nom, f"fuseau {fuseau} au lieu de Europe/Paris"))

            # silence : aucune exécution depuis plus de deux périodes, si n8n garde ses exécutions assez longtemps
            garde_reussites = reglages.get("saveDataSuccessExecution") != "none"
            if dernieres is not None and garde_reussites:
                periode = min((p for p in map(periode_minutes, declencheurs) if p), default=None)
                limite = dt.timedelta(minutes=2 * periode + 30) if periode else None
                if limite and limite < dt.timedelta(days=retention_jours):
                    derniere = dernieres.get(wf.get("id"))
                    if derniere is None:
                        ecarts.append(ecart(ALERTE, "CTL-09", nom, "aucune exécution conservée : le workflow ne tourne pas ?"))
                    elif maintenant - derniere > limite:
                        heures = (maintenant - derniere).total_seconds() / 3600
                        ecarts.append(ecart(ALERTE, "CTL-09", nom, f"silencieux depuis {heures:.0f} h "
                                                                   f"(période attendue : {periode:.0f} min)"))

        # DON-06 : données personnelles
        if "donnees-personnelles" in tags and reglages.get("saveDataSuccessExecution") != "none":
            ecarts.append(ecart(ALERTE, "DON-06", nom, "traite des données personnelles et garde ses exécutions réussies"))

        # CTL-13 : nom, étiquette, inventaire
        if actif:
            if " · " not in nom_de(wf):
                ecarts.append(ecart(INFO, "CTL-13", nom, "nom hors convention « projet · verbe objet »"))
            if not tags:
                ecarts.append(ecart(INFO, "CTL-13", nom, "aucune étiquette de projet"))
            if inventaire is not None and wf.get("id") not in inventaire:
                ecarts.append(ecart(ALERTE, "CTL-13", nom, "actif mais absent de l'inventaire docs/automatisations.md"))
        elif inventaire is not None and inventaire.get(wf.get("id")) and not est_alerte:
            ecarts.append(ecart(ALERTE, "CTL-13", nom, "inventorié comme actif mais désactivé"))

        # CTL-14 : brouillon différent de la version publiée
        if wf.get("activeVersionId") and wf.get("versionId") and wf["activeVersionId"] != wf["versionId"]:
            ecarts.append(ecart(INFO, "CTL-14", nom, "brouillon différent de la version publiée : le contrôle lit le brouillon"))

        # exécutions en erreur sur 24 h
        if erreurs_24h is not None and erreurs_24h.get(wf.get("id")):
            ex = erreurs_24h[wf["id"]]
            numeros = ", ".join(str(e["id"]) for e in ex[:3])
            ecarts.append(ecart(ALERTE, "CTL-08", nom, f"{len(ex)} exécution(s) en erreur sur 24 h, dernière le "
                                                      f"{heure_paris(ex[0]['date'])} (n° {numeros})"))

    if inventaire is not None:
        for ident in sorted(set(inventaire) - set(par_id)):
            ecarts.append(ecart(INFO, "CTL-13", ident, "inventorié mais absent de l'instance"))
    return sorted(ecarts, key=lambda e: (ORDRE.index(e["gravite"]), e["regle"], e["workflow"]))


# --- lecture : API de l'instance, fichiers du dépôt, inventaire -------------------------------------------------

class ControleImpossible(Exception):
    pass


class SansRedirection(urllib.request.HTTPRedirectHandler):
    """La clé d'API ne suit jamais une redirection (autre hôte, page de connexion, http)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ControleImpossible(f"l'instance répond par une redirection (HTTP {code}) : clé non envoyée plus loin")


OUVREUR = urllib.request.build_opener(SansRedirection)


def appel_api(base, cle, chemin, params=None):
    url = f"{base.rstrip('/')}/api/v1/{chemin}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    requete = urllib.request.Request(url, headers={"X-N8N-API-KEY": cle, "Accept": "application/json"})
    try:
        with OUVREUR.open(requete, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise ControleImpossible(f"l'API n8n répond HTTP {e.code} sur /{chemin}") from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ControleImpossible(f"l'API n8n ne répond pas en JSON sur /{chemin} (proxy ou page de connexion ?)") from None
    except (urllib.error.URLError, OSError) as e:
        raise ControleImpossible(f"l'API n8n ne répond pas ({type(e).__name__})") from None


def tout_lire(base, cle, chemin, params, arret=None):
    elements, curseur, vus = [], None, set()
    for _ in range(PAGES_MAX):
        p = dict(params, limit=250, **({"cursor": curseur} if curseur else {}))
        page = appel_api(base, cle, chemin, p)
        lot = page.get("data") or []
        elements.extend(lot)
        curseur = page.get("nextCursor")
        if not curseur or not lot or (arret and arret(lot[-1])):
            return elements
        if curseur in vus:
            raise ControleImpossible(f"pagination en boucle sur /{chemin}")
        vus.add(curseur)
    raise ControleImpossible(f"plus de {PAGES_MAX} pages sur /{chemin}")


def date_iso(texte):
    try:
        return dt.datetime.fromisoformat(str(texte).replace("Z", "+00:00")) if texte else None
    except ValueError:
        return None


def url_sure(url):
    """https, ou http vers la machine elle-même. Le nom d'hôte est comparé en entier : « http://localhost.exemple »
    commence par « http://localhost » mais part sur le réseau, en clair, avec la clé."""
    try:
        morceaux = urllib.parse.urlsplit(url)
        hote = morceaux.hostname
    except ValueError:
        return False
    if not hote:
        return False
    return morceaux.scheme == "https" or (morceaux.scheme == "http" and hote in ("localhost", "127.0.0.1", "::1"))


def lire_instance(base, cle, maintenant):
    if not url_sure(base):
        raise ControleImpossible("N8N_URL doit être en https")
    workflows = tout_lire(base, cle, "workflows", {})
    if not workflows:
        raise ControleImpossible("l'API ne rend aucun workflow : la clé ne voit sans doute pas les projets "
                                 "(il faut un compte propriétaire ou administrateur de l'instance)")
    depuis = maintenant - dt.timedelta(hours=24)
    erreurs = tout_lire(base, cle, "executions", {"status": "error"},
                        arret=lambda e: (date_iso(e.get("startedAt")) or maintenant) < depuis)
    erreurs_24h = {}
    for e in erreurs:
        debut = date_iso(e.get("startedAt"))
        if debut and debut >= depuis:
            erreurs_24h.setdefault(e.get("workflowId"), []).append({"id": e.get("id"), "date": debut})
    dernieres = {}
    for wf in workflows:
        if est_actif(wf) and any(n.get("type") in PLANIFIES for n in wf.get("nodes") or []):
            lot = appel_api(base, cle, "executions", {"workflowId": wf["id"], "limit": 1}).get("data") or []
            dernieres[wf["id"]] = date_iso(lot[0].get("startedAt")) if lot else None
    return workflows, erreurs_24h, dernieres


def lire_fichiers(chemins):
    workflows = []
    for chemin in chemins:
        p = Path(chemin)
        if not p.exists():
            raise ControleImpossible(f"{chemin} n'existe pas")
        for f in sorted(p.rglob("*.json")) if p.is_dir() else [p]:
            try:
                contenu = json.loads(f.read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, json.JSONDecodeError):
                raise ControleImpossible(f"export illisible : {f.as_posix()}") from None
            for wf in contenu if isinstance(contenu, list) else [contenu]:
                if isinstance(wf, dict) and "nodes" in wf:
                    wf.setdefault("id", f.stem)
                    wf.setdefault("active", True)  # un export sans état est contrôlé comme s'il était actif
                    workflows.append(wf)
    if not workflows:
        raise ControleImpossible("aucun workflow trouvé dans les exports")
    return workflows


def lire_inventaire(chemins):
    """{identifiant: True} pour chaque ligne d'inventaire ; False si la ligne dit « inactif »."""
    ids = {}
    for chemin in chemins:
        try:
            texte = Path(chemin).read_text(encoding="utf-8")
        except OSError:
            raise ControleImpossible(f"inventaire illisible : {chemin}") from None
        for ligne in texte.splitlines():
            m = re.match(r"^\|\s*`?([A-Za-z0-9]{16})`?\s*\|", ligne)
            if m:
                ids[m.group(1)] = "inactif" not in ligne.lower()
    return ids


# --- rapport, courriel, battement -------------------------------------------------------------------------------

def heure_paris(date):
    try:
        from zoneinfo import ZoneInfo
        return date.astimezone(ZoneInfo("Europe/Paris")).strftime("%d/%m/%Y %H h %M")
    except Exception:  # base des fuseaux absente (Windows sans tzdata) : heure universelle, dite comme telle
        return date.astimezone(dt.timezone.utc).strftime("%d/%m/%Y %H h %M (UTC)")


def pluriel(n, mot):
    return f"{n} {mot}{'s' if n > 1 else ''}"


def rapport(ecarts, source, maintenant, nb_actifs=None, nb_total=None, impossible=None):
    projet = os.environ.get("ALERTES_PROJET", "n8n")
    jour = heure_paris(maintenant)[:10]
    compte = {g: sum(1 for e in ecarts if e["gravite"] == g) for g in ORDRE}
    if impossible:
        sujet = f"[AEF][{projet}][CRITIQUE] Contrôle impossible — {jour}"
    elif compte[CRITIQUE] or compte[ALERTE]:
        gravite = CRITIQUE if compte[CRITIQUE] else ALERTE
        morceaux = [pluriel(compte[g], g.lower()) for g in (CRITIQUE, ALERTE) if compte[g]]
        sujet = f"[AEF][{projet}][{gravite}] {', '.join(morceaux)} — contrôle du {jour}"
    elif compte[INFO]:
        sujet = f"[AEF][{projet}][INFO] {pluriel(compte[INFO], 'point')} à revoir, rien d'urgent — contrôle du {jour}"
    else:
        sujet = f"[AEF][{projet}][OK] Contrôle du {jour} : rien à signaler"
    lignes = [f"Contrôle n8n du {heure_paris(maintenant)} (heure de Paris)", f"Source : {source}"]
    if nb_total is not None:
        lignes.append(f"Workflows actifs : {nb_actifs} sur {nb_total}")
    lignes.append("")
    if impossible:
        lignes += [f"CONTRÔLE IMPOSSIBLE : {impossible}.", "Vérifier l'instance, sa clé d'API et le réseau.", ""]
    for g in ORDRE:
        liste = [e for e in ecarts if e["gravite"] == g]
        if liste:
            lignes.append(f"{TITRES[g]} ({len(liste)})")
            lignes += [f"- [{e['regle']}] {e['workflow']} : {e['message']}" for e in liste]
            lignes.append("")
    if not ecarts and not impossible:
        lignes += ["Rien à signaler.", ""]
    lignes.append(f"Procédure : {FICHE}.")
    return sujet, "\n".join(lignes) + "\n"


def envoyer(sujet, corps):
    manque = [v for v in ("SMTP_HOST", "ALERTES_EXPEDITEUR", "ALERTES_DESTINATAIRE") if not os.environ.get(v)]
    if manque:
        raise ControleImpossible(f"{', '.join(manque)} absent : le rapport ne peut pas partir")
    message = EmailMessage()
    message["From"] = os.environ["ALERTES_EXPEDITEUR"]
    message["To"] = os.environ["ALERTES_DESTINATAIRE"]
    message["Subject"] = sujet
    message.set_content(corps)
    hote, port = os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "465"))
    contexte = ssl.create_default_context()
    if port == 465:
        serveur = smtplib.SMTP_SSL(hote, port, context=contexte, timeout=30)
    else:
        serveur = smtplib.SMTP(hote, port, timeout=30)
        serveur.starttls(context=contexte)
    with serveur:
        if os.environ.get("SMTP_USER"):
            serveur.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASSWORD", ""))
        serveur.send_message(message)


def battement(etat, resume):
    """Sonde Push « contrôle n8n » : up si rien de grave, down sur un critique ou un contrôle impossible (CTL-07)."""
    url = os.environ.get("KUMA_PUSH_URL")
    if not url:
        return
    if not url_sure(url):  # l'URL de la sonde porte son jeton : jamais en clair sur le réseau
        print("battement non envoyé : KUMA_PUSH_URL doit être en https", file=sys.stderr)
        return
    separateur = "&" if "?" in url else "?"
    try:
        OUVREUR.open(f"{url}{separateur}status={etat}&msg={urllib.parse.quote(resume)}", timeout=15).close()
    except (OSError, ControleImpossible):
        print("battement non envoyé à la sonde", file=sys.stderr)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")  # console Windows en cp1252 sinon
    a = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    a.add_argument("--courriel", action="store_true", help="envoyer le rapport par courriel (même vide)")
    a.add_argument("--inventaire", action="append", default=[], help="fichier d'inventaire (docs/automatisations.md)")
    a.add_argument("--fichiers", action="append", default=[], help="exports de workflows (dossier ou fichier .json)")
    a.add_argument("--strict", action="store_true", help="avec --fichiers : sortie 1 dès une alerte")
    a.add_argument("--retention-jours", type=int, default=30,
                   help="durée de conservation des exécutions de l'instance (EXECUTIONS_DATA_MAX_AGE), défaut 30")
    args = a.parse_args()
    maintenant = dt.datetime.now(dt.timezone.utc)

    impossible, ecarts, nb_actifs, nb_total = None, [], None, None
    source = ("exports du dépôt (" + ", ".join(args.fichiers) + ")") if args.fichiers else (os.environ.get("N8N_URL") or "N8N_URL absent")
    try:
        inventaire = lire_inventaire(args.inventaire) if args.inventaire else None
        if args.fichiers:
            workflows = lire_fichiers(args.fichiers)
            ecarts = analyser(workflows, inventaire=inventaire, maintenant=maintenant, instance_complete=False)
        else:
            base, cle = os.environ.get("N8N_URL", ""), os.environ.get("N8N_API_KEY", "")
            if not base or not cle:
                raise ControleImpossible("N8N_URL ou N8N_API_KEY absent de l'environnement")
            workflows, erreurs_24h, dernieres = lire_instance(base, cle, maintenant)
            if inventaire and not set(inventaire) & {w.get("id") for w in workflows}:
                raise ControleImpossible("aucun workflow inventorié n'est visible : la clé ne voit pas les bons projets")
            ecarts = analyser(workflows, erreurs_24h, dernieres, inventaire, maintenant, args.retention_jours)
        nb_total, nb_actifs = len(workflows), sum(1 for w in workflows if est_actif(w))
    except ControleImpossible as e:
        impossible = str(e)
    except Exception as e:  # un contrôle qui plante doit le dire, pas se taire
        impossible = f"erreur inattendue du contrôle ({type(e).__name__})"

    sujet, corps = rapport(ecarts, source, maintenant, nb_actifs, nb_total, impossible)
    print(sujet)
    print(corps)
    gravites = {e["gravite"] for e in ecarts}
    if args.courriel:
        try:
            envoyer(sujet, corps)
            print("rapport envoyé par courriel")
        except (ControleImpossible, OSError, smtplib.SMTPException) as e:
            print(f"ÉCHEC DE L'ENVOI DU RAPPORT : {e if isinstance(e, ControleImpossible) else type(e).__name__}",
                  file=sys.stderr)
            if not args.fichiers:
                battement("down", "rapport non envoyé")
            sys.exit(3)
    if args.fichiers:  # contrôle des exports : bloquant seulement avec --strict
        if impossible:
            sys.exit(3)
        sys.exit(1 if args.strict and gravites & {CRITIQUE, ALERTE} else 0)
    grave = impossible or CRITIQUE in gravites
    battement("down" if grave else "up", sujet.split("] ", 2)[-1][:120])
    if impossible:
        sys.exit(3)
    sys.exit(2 if CRITIQUE in gravites else 1 if ALERTE in gravites else 0)


if __name__ == "__main__":
    main()
