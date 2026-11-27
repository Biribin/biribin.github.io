"""Contrôle des chaînes d'intégration continue d'AEF, depuis l'extérieur (fiche 12 du socle : CTL-20).

    python controle-chaines.py --depots org/projet org/autre      rapport à l'écran
    python controle-chaines.py --depots org/projet --courriel      rapport envoyé, même vide
    python controle-chaines.py --depots org/projet --heures 48     seuil sans exécution réussie

Pourquoi un contrôle de plus, et surtout pourquoi dehors : l'alerte d'une chaîne rouge (CTL-08) est un job
DE cette chaîne. Quand la chaîne entière cesse de démarrer — facturation suspendue, quota épuisé, runner
absent —, ce job ne démarre pas non plus, et personne n'est prévenu. C'est arrivé au CRM du 16 au
19/11/2026 : 21 exécutions en échec en trois jours, aucune ligne de journal, aucune alerte. Un surveillant
qui vit dans ce qu'il surveille ne surveille rien.

Variables d'environnement (posées dans le fichier de la tâche planifiée, lisible par root seul, copié dans
le coffre ; jamais sur un poste ni dans une session d'assistant) :
  GITHUB_TOKEN              jeton de lecture seule (portée « repo » en lecture) des dépôts surveillés
  SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASSWORD     SMTP d'OVH (ARC-07)
  ALERTES_EXPEDITEUR, ALERTES_DESTINATAIRE                 obligatoires avec --courriel (CTL-02)
  ALERTES_PROJET            défaut chaines (objet : [AEF][<projet>][<gravité>])
  KUMA_PUSH_URL             sonde Push « contrôle des chaînes »

Le script ne fait que des lectures (GET) et n'affiche jamais une valeur secrète. Il duplique volontairement
les quelques lignes d'envoi de courriel de controle-n8n.py : chaque outil se copie seul dans un projet.
Codes de sortie : 0 rien à signaler, 1 alertes, 2 critique, 3 contrôle impossible.
"""
import argparse
import datetime as dt
import json
import os
import smtplib
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

CRITIQUE, ALERTE, INFO = "CRITIQUE", "ALERTE", "INFO"
ORDRE = (CRITIQUE, ALERTE, INFO)
TITRES = {CRITIQUE: "CRITIQUE", ALERTE: "ALERTE", INFO: "INFO (à revoir)"}
FICHE = "fiche 12 du socle AEF (.claude/aef-socle/knowledge/12-controles-et-alertes.md)"

# Une exécution qui échoue en quelques secondes n'a pas tourné : elle n'a jamais démarré. Au-delà de deux
# coups de suite, ce n'est plus un test qui casse, c'est la chaîne qui ne part pas.
SECONDES_SANS_DEMARRER = 15
ECHECS_IMMEDIATS_SUSPECTS = 3


def ecart(gravite, regle, depot, message):
    return {"gravite": gravite, "regle": regle, "depot": depot, "message": message}


def _date(valeur):
    try:
        return dt.datetime.fromisoformat(str(valeur).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def duree_secondes(run):
    debut, fin = _date(run.get("created_at")), _date(run.get("updated_at"))
    return (fin - debut).total_seconds() if debut and fin else None


def heure_paris(date):
    return date.astimezone(dt.timezone(dt.timedelta(hours=1))).strftime("%d/%m/%Y %H h %M")


def analyser(par_depot, maintenant, heures_max=48):
    """Rend la liste des écarts. Fonction pure : aucune lecture réseau, aucun secret en sortie.

    par_depot : {dépôt: [exécutions, de la plus récente à la plus ancienne]}
    """
    ecarts = []
    for depot in sorted(par_depot):
        runs = [r for r in (par_depot[depot] or []) if r.get("status") == "completed"]
        if not runs:
            ecarts.append(ecart(CRITIQUE, "CTL-20", depot, "aucune exécution connue : chaîne absente, "
                                                           "jamais lancée, ou dépôt illisible"))
            continue

        reussis = [r for r in runs if r.get("conclusion") == "success"]
        dernier_vert = _date(reussis[0].get("updated_at")) if reussis else None
        if dernier_vert is None:
            ecarts.append(ecart(CRITIQUE, "CTL-20", depot,
                                f"aucune exécution réussie parmi les {len(runs)} dernières"))
        else:
            heures = (maintenant - dernier_vert).total_seconds() / 3600
            if heures > heures_max:
                ecarts.append(ecart(CRITIQUE, "CTL-20", depot,
                                    f"plus aucune exécution réussie depuis {heures:.0f} h "
                                    f"(dernière le {heure_paris(dernier_vert)}, seuil {heures_max} h)"))

        # La chaîne ne démarre plus : échecs immédiats à la chaîne, sans rien exécuter.
        immediats = 0
        for r in runs:
            duree = duree_secondes(r)
            if r.get("conclusion") == "failure" and duree is not None and duree < SECONDES_SANS_DEMARRER:
                immediats += 1
            else:
                break
        if immediats >= ECHECS_IMMEDIATS_SUSPECTS:
            ecarts.append(ecart(CRITIQUE, "CTL-20", depot,
                                f"{immediats} exécutions de suite en échec en moins de "
                                f"{SECONDES_SANS_DEMARRER} s : elles ne démarrent pas (facturation suspendue, "
                                "quota épuisé ou runner absent). L'alerte de la chaîne ne part pas non plus"))
        elif runs[0].get("conclusion") == "failure":
            ecarts.append(ecart(ALERTE, "CTL-20", depot,
                                f"dernière exécution en échec, branche {runs[0].get('head_branch') or '?'} "
                                f"({runs[0].get('name') or 'chaîne'})"))
    return sorted(ecarts, key=lambda e: (ORDRE.index(e["gravite"]), e["depot"]))


def rapport(ecarts, maintenant, depots, heures_max):
    pire = min((e["gravite"] for e in ecarts), key=ORDRE.index, default=None)
    nb = {g: sum(1 for e in ecarts if e["gravite"] == g) for g in ORDRE}
    if pire is None:
        sujet_etat = "OK] rien à signaler"
    else:
        morceaux = [f"{nb[g]} {TITRES[g].split(' ')[0].lower()}" for g in ORDRE if nb[g]]
        sujet_etat = f"{pire}] " + ", ".join(morceaux)
    sujet = f"[AEF][{os.environ.get('ALERTES_PROJET', 'chaines')}][{sujet_etat} — "
    sujet += f"contrôle du {maintenant.astimezone(dt.timezone(dt.timedelta(hours=1))).strftime('%d/%m/%Y')}"

    lignes = [f"Contrôle des chaînes d'intégration du {heure_paris(maintenant)} (heure de Paris).",
              f"Dépôts suivis : {', '.join(depots)} — seuil sans exécution réussie : {heures_max} h.", ""]
    for gravite in ORDRE:
        groupe = [e for e in ecarts if e["gravite"] == gravite]
        if groupe:
            lignes.append(f"{TITRES[gravite]} ({len(groupe)})")
            lignes += [f"- [{e['regle']}] {e['depot']} : {e['message']}" for e in groupe]
            lignes.append("")
    if not ecarts:
        lignes.append("Toutes les chaînes ont une exécution réussie récente.")
        lignes.append("")
    lignes.append(f"Procédure : {FICHE}.")
    return sujet, "\n".join(lignes)


# --- lecture de l'API GitHub ------------------------------------------------------------------------------

class ControleImpossible(Exception):
    pass


class SansRedirection(urllib.request.HTTPRedirectHandler):
    """Le jeton ne suit jamais une redirection (autre hôte, page de connexion, http)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ControleImpossible(f"GitHub répond par une redirection (HTTP {code}) : jeton non envoyé plus loin")


OUVREUR = urllib.request.build_opener(SansRedirection)


def runs_du_depot(depot, jeton, combien=20):
    url = (f"https://api.github.com/repos/{urllib.parse.quote(depot)}/actions/runs"
           f"?per_page={combien}&exclude_pull_requests=true")
    requete = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {jeton}", "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "aef-controle-chaines",
    })
    try:
        with OUVREUR.open(requete, timeout=30) as r:
            return json.loads(r.read().decode("utf-8")).get("workflow_runs", [])
    except urllib.error.HTTPError as e:
        raise ControleImpossible(f"GitHub répond HTTP {e.code} sur {depot}") from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ControleImpossible(f"GitHub ne répond pas en JSON sur {depot}") from None
    except (urllib.error.URLError, OSError) as e:
        raise ControleImpossible(f"GitHub ne répond pas ({type(e).__name__})") from None


def envoyer(sujet, texte):
    destinataire = os.environ.get("ALERTES_DESTINATAIRE")
    expediteur = os.environ.get("ALERTES_EXPEDITEUR")
    if not destinataire or not expediteur:
        raise ControleImpossible("ALERTES_EXPEDITEUR ou ALERTES_DESTINATAIRE absent : le courriel n'est pas envoyé")
    message = EmailMessage()
    message["Subject"], message["From"], message["To"] = sujet, expediteur, destinataire
    message.set_content(texte)
    with smtplib.SMTP_SSL(os.environ.get("SMTP_HOST", ""), int(os.environ.get("SMTP_PORT", 465)),
                          context=ssl.create_default_context(), timeout=30) as serveur:
        serveur.login(os.environ.get("SMTP_USER", ""), os.environ.get("SMTP_PASSWORD", ""))
        serveur.send_message(message)


def battement(etat):
    url = os.environ.get("KUMA_PUSH_URL")
    if not url:
        return
    try:
        OUVREUR.open(f"{url}{'&' if '?' in url else '?'}status={etat}", timeout=15).close()
    except (urllib.error.URLError, OSError):
        pass  # la sonde expirera d'elle-même : c'est précisément son rôle


def main(argv=None):
    a = argparse.ArgumentParser(description="Contrôle des chaînes d'intégration d'AEF (CTL-20)")
    a.add_argument("--depots", nargs="+", help="dépôts org/nom ; à défaut, la variable DEPOTS_SURVEILLES")
    a.add_argument("--heures", type=int, default=48, help="seuil sans exécution réussie, défaut 48")
    a.add_argument("--courriel", action="store_true", help="envoyer le rapport, même vide (CTL-16)")
    args = a.parse_args(argv)

    depots = args.depots or [d for d in os.environ.get("DEPOTS_SURVEILLES", "").replace(",", " ").split() if d]
    maintenant = dt.datetime.now(dt.timezone.utc)
    try:
        if not depots:
            raise ControleImpossible("aucun dépôt à surveiller (--depots ou DEPOTS_SURVEILLES)")
        jeton = os.environ.get("GITHUB_TOKEN", "")
        if not jeton:
            raise ControleImpossible("GITHUB_TOKEN absent de l'environnement")
        par_depot = {d: runs_du_depot(d, jeton) for d in depots}
        ecarts = analyser(par_depot, maintenant, args.heures)
        sujet, texte = rapport(ecarts, maintenant, depots, args.heures)
    except ControleImpossible as e:
        sujet = f"[AEF][{os.environ.get('ALERTES_PROJET', 'chaines')}][CRITIQUE] Contrôle impossible"
        texte = (f"Contrôle des chaînes du {heure_paris(maintenant)} (heure de Paris).\n\n"
                 f"CONTRÔLE IMPOSSIBLE : {e}.\n\nProcédure : {FICHE}.")
        print(sujet, texte, sep="\n")
        if args.courriel:
            try:
                envoyer(sujet, texte)
            except Exception:  # le rapport est déjà à l'écran et la sonde va tomber
                pass
        battement("down")
        return 3

    print(sujet, texte, sep="\n")
    if args.courriel:
        envoyer(sujet, texte)
    pire = min((e["gravite"] for e in ecarts), key=ORDRE.index, default=None)
    battement("down" if pire == CRITIQUE else "up")
    return {None: 0, INFO: 0, ALERTE: 1, CRITIQUE: 2}[pire]


if __name__ == "__main__":
    sys.exit(main())
