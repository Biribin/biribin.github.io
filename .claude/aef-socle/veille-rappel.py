"""Rappel de veille outillage, lancé à l'ouverture d'une session Claude Code (garde-fou SessionStart).

Compare les versions installées de Claude Code et de VS Code avec la dernière veille écrite dans
knowledge/11-outillage-assistants.md, et dans un projet, la fiche installée avec celle du dépôt aef-socle.
Ce qu'il écrit est ajouté au contexte de la session : l'assistant propose alors /aef-veille-outils
ou la réinstallation du socle. Une fois par jour au plus ; ne bloque jamais la session.
"""
import datetime
import re
import shutil
import subprocess
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
FICHE = "11-outillage-assistants.md"
DELAI_JOURS = 30
TAMPON = Path.home() / ".claude" / "aef-veille-rappel.txt"


def lire_veille(fiche):
    if not fiche.exists():
        return None
    m = re.search(r"<!-- veille: (.*?) -->", fiche.read_text(encoding="utf-8"))
    return dict(p.split("=", 1) for p in m.group(1).split()) if m else None


def version(commande):
    exe = shutil.which(commande)
    if not exe:
        return None
    try:
        sortie = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    m = re.search(r"\d+\.\d+\.\d+", sortie)
    return m.group(0) if m else None


def tuple_version(v):
    return tuple(int(x) for x in v.split("."))


def main():
    aujourdhui = datetime.date.today()
    try:
        if TAMPON.read_text(encoding="utf-8").strip() == aujourdhui.isoformat():
            return
    except OSError:
        pass

    # dans un projet : .claude/aef-socle/{veille-rappel.py, knowledge/} ; dans le dépôt du socle : outils/ et knowledge/
    knowledge = ICI / "knowledge" if (ICI / "knowledge").is_dir() else ICI.parent / "knowledge"
    veille = lire_veille(knowledge / FICHE)
    if not veille:
        return
    messages = []

    date = datetime.date.fromisoformat(veille["date"])
    if (aujourdhui - date).days > DELAI_JOURS:
        messages.append(f"la dernière veille outillage date du {date:%d/%m/%Y}, plus de {DELAI_JOURS} jours")

    for outil, commande in (("Claude Code", "claude"), ("VS Code", "code")):
        cle = "claude-code" if commande == "claude" else "vscode"
        installee, lue = version(commande), veille.get(cle)
        if not installee or not lue:
            continue
        if tuple_version(installee) > tuple_version(lue):
            messages.append(f"{outil} {installee} est installé, la veille s'est arrêtée à {lue} : nouveautés à lire")
        elif tuple_version(installee) < tuple_version(lue):
            messages.append(f"{outil} {installee} est en retard sur la version lue à la dernière veille ({lue}) : "
                            f"mettre l'outil à jour (pratique P1)")

    source = ICI / "source.txt"  # écrit par l'installateur : chemin du dépôt aef-socle
    if source.exists():
        socle = lire_veille(Path(source.read_text(encoding="utf-8").strip()) / "knowledge" / FICHE)
        if socle and socle["date"] > veille["date"]:
            messages.append(f"le dépôt aef-socle a une veille plus récente ({socle['date']}) que celle installée "
                            f"ici : relancer « python installer.py » pour ce projet")

    try:
        TAMPON.write_text(aujourdhui.isoformat(), encoding="utf-8")
    except OSError:
        pass
    if messages:
        sys.stdout.reconfigure(encoding="utf-8")  # Windows écrit sinon en cp1252
        print("Veille outillage AEF — " + " ; ".join(messages) + ". "
              "Propose à l'utilisateur de lancer /aef-veille-outils (ou la réinstallation du socle) avant de commencer.")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # un rappel ne doit jamais empêcher de travailler
        pass
    sys.exit(0)
