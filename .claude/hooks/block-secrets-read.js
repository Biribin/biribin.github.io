#!/usr/bin/env node
/**
 * block-secrets-read.js — garde-fou PreToolUse, versionné avec le dépôt
 * ---------------------------------------------------------------------
 * Empêche un assistant IA de faire entrer dans le contexte d'un modèle :
 *   1. des SECRETS   — .env, clés privées, jetons, identifiants ;
 *   2. des DONNÉES PERSONNELLES d'apprenants — les fichiers nominatifs que ce
 *      dépôt versionne encore (822 dossiers, cf. RGPD-08).
 *
 * Il couvre les outils fichier (Read/Edit/Write/…), l'outil de recherche Grep
 * (qui affiche le contenu des fichiers) ET les commandes Bash et PowerShell, y
 * compris celles qui passent par un INTERPRÉTEUR (`python -c`, `node -e`, …) —
 * c'était le contournement démontré lors de l'audit du 31/08/2026 (IA-02).
 * Grep et PowerShell ajoutés le 19/10/2026 : `Get-Content .env` par l'outil
 * PowerShell, ou une recherche de « . » dans .env par l'outil Grep, passaient.
 *
 * Pourquoi dans le dépôt et pas seulement sur le poste : un garde-fou installé
 * dans le profil d'un développeur protège une machine, pas un projet. Versionné,
 * il voyage avec le clone et s'applique à quiconque travaille ici.
 *
 * Contrat Claude Code :
 *   - lit un JSON sur stdin : { tool_name, tool_input, ... }
 *   - exit 0            -> autorise
 *   - exit 2 + stderr   -> BLOQUE (stderr renvoyé au modèle comme raison)
 *
 * Politique : BLOCAGE STRICT, et ÉCHEC FERMÉ si la charge utile est illisible.
 * Référence : docs/politique-ia.md — contrôles IA-01, IA-02, IA-03. Modèle diffusé par le socle AEF (hooks/).
 */

'use strict';

// ── 1. Chemins de SECRETS ────────────────────────────────────────────────────
const SECRET_PATH_PATTERNS = [
  // Deux motifs plutôt qu'un `(\.[^/\\]*)?` optionnel : un quantificateur
  // imbriqué dans un groupe optionnel est un motif à explosion exponentielle
  // (ReDoS), et l'analyse statique du projet le refuse à juste titre — un
  // garde-fou de sécurité est le dernier endroit où en laisser un.
  /(^|[/\\])\.env$/i,                        // .env
  /(^|[/\\])\.env\.[^/\\]+/i,                // .env.local, .env.production…
  /(^|[/\\])\.npmrc$/i,
  /(^|[/\\])\.pgpass$/i,
  /(^|[/\\])\.pypirc$/i,
  /(^|[/\\])\.netrc$/i,
  /(^|[/\\])\.git-credentials$/i,
  /(^|[/\\])id_(rsa|dsa|ecdsa|ed25519)$/i,
  /(^|[/\\])id_[a-z0-9_]+_coolify/i,
  /\.pem$/i,
  /\.key$/i,
  /\.pfx$/i, /\.p12$/i, /\.keystore$/i, /\.jks$/i,
  /(^|[/\\])secrets?\.(json|ya?ml|txt|env)$/i,
  /(^|[/\\])credentials?$/i,                 // credentials, credential
  /(^|[/\\])credentials?\.[^/\\]+$/i,        // credentials.json, credentials.yml…
  /(^|[/\\])serviceaccount.*\.json$/i,
  /(^|[/\\])(client_secret|clientsecret)[^/\\]*\.json$/i,
  /bitwarden.*\.(json|csv)$/i,
  /(^|[/\\])\.aws[/\\]credentials$/i,
  /(^|[/\\])\.ssh[/\\]/i,
  /(^|[/\\])kubeconfig$/i,
  /(^|[/\\])\.kube[/\\]config$/i,
];

// Autorisés même s'ils ressemblent à .env* : aucune valeur réelle dedans.
const ALLOWLIST_PATTERNS = [
  /\.env\.(example|sample|template|dist)$/i,
  /\.env\.(example|sample|template)\.[^/\\]+$/i,
];

// ── 2. Chemins de DONNÉES PERSONNELLES d'apprenants ──────────────────────────
// Ces fichiers se comptent, ils ne s'affichent pas (docs/politique-ia.md §1).
// Leur retrait du dépôt relève de RGPD-08 ; d'ici là, ils sont hors de portée.
const DONNEES_PERSONNELLES_PATTERNS = [
  /migration[/\\]scripts[/\\]normalized(_v2)?[/\\]/i,
  /migration[/\\]scripts[/\\]extracted[^/\\]*[/\\]/i,
  /(^|[/\\])apprenants\.json$/i,
  /(^|[/\\])inscriptions?\.json$/i,
  /(^|[/\\])alignement-client[^/\\]*\.json$/i,
  /(^|[/\\])00\d{2}_001\.pdf$/i,             // attestations scannées nominatives
  /(^|[/\\])csv_input[/\\]/i,                // sources d'import déposées localement
];

function estSecret(p) {
  if (!p) return false;
  const s = String(p);
  if (ALLOWLIST_PATTERNS.some((re) => re.test(s))) return false;
  return SECRET_PATH_PATTERNS.some((re) => re.test(s));
}

function estDonneePersonnelle(p) {
  if (!p) return false;
  return DONNEES_PERSONNELLES_PATTERNS.some((re) => re.test(String(p)));
}

// ── 3. Commandes qui font SORTIR le contenu d'un fichier ─────────────────────
const LECTEURS = [
  'cat', 'bat', 'less', 'more', 'head', 'tail', 'nl', 'tac',
  'type',
  'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
  'awk', 'sed', 'cut', 'sort', 'uniq', 'strings', 'xxd', 'od', 'hexdump',
  'base64', 'openssl', 'jq', 'yq',
  'source', '.',
  'gc', 'get-content', 'select-string',
  // Extracteurs de documents : un PDF nominatif se lit aussi par ce chemin.
  'pdftotext', 'pdfimages', 'pdftoppm', 'pdfplumber', 'tesseract',
  'libreoffice', 'soffice', 'antiword', 'unzip',
];

// Le trou historique : un interpréteur lit le fichier lui-même, aucun « lecteur »
// n'apparaît dans la commande, et le garde-fou laissait passer.
const INTERPRETEURS = [
  'python', 'python3', 'py', 'python.exe',
  'node', 'nodejs', 'deno', 'bun', 'tsx', 'ts-node',
  'perl', 'ruby', 'php', 'lua',
  'pwsh', 'powershell',
];

// Faire sortir le fichier de la machine compte autant que l'afficher.
const EXFILTRATEURS = [
  'curl', 'wget', 'scp', 'rsync', 'ftp', 'sftp', 'nc', 'ncat', 'netcat',
  'tar', 'zip', '7z', 'gzip', 'xz', 'invoke-webrequest', 'iwr',
];

const MOTIFS_VIDAGE_ENV = [
  /\bprintenv\b/i,
  /\benv\b\s*(\||$|>)/i,
  /\bset\b\s*(\||$)/i,
  /\bGet-ChildItem\s+Env:/i,
  /\bgci\s+env:/i,
  /docker\s+exec[^\n]*\bprintenv\b/i,
  /docker\s+inspect[^\n]*\bEnv\b/i,
  /\bcompose\b[^\n]*\bconfig\b/i,
];

function nomCommande(jeton) {
  // « /usr/bin/python3 » et « C:/…/python.exe » doivent compter comme python3.
  return String(jeton).split(/[/\\]/).pop().toLowerCase();
}

/**
 * Retire les préfixes qui déguisent un chemin sans le changer : `curl -d @.env`
 * passe un fichier, `file://` aussi. Sans cette normalisation, le chemin ne
 * ressemble plus à un chemin et le garde-fou le laisse filer.
 */
function normaliserChemin(jeton) {
  return String(jeton).replace(/^(@|=|file:\/\/|\.\/)+/i, '');
}

function raisonBash(cmd) {
  if (!cmd) return null;
  const c = String(cmd);

  for (const re of MOTIFS_VIDAGE_ENV) {
    if (re.test(c)) {
      return "commande qui exporte des variables d'environnement (secrets potentiels)";
    }
  }

  // Tokenisation grossière : on regarde chaque « mot » du pipeline, y compris
  // ceux extraits d'une chaîne de code (les guillemets sont des séparateurs).
  const jetons = c.split(/[\s;|&<>()"'`,[\]{}]+/).filter(Boolean);
  const noms = jetons.map(nomCommande);
  const chemins = jetons.map(normaliserChemin);

  const aLecteur = noms.some((t) => LECTEURS.includes(t));
  const aInterpreteur = noms.some((t) => INTERPRETEURS.includes(t));
  const aExfiltrateur = noms.some((t) => EXFILTRATEURS.includes(t));
  const aRedirection = /[<]\s*[^\s]*\.env/i.test(c);
  const sortie = aLecteur || aInterpreteur || aExfiltrateur || aRedirection;

  const jetonSecret = chemins.find(estSecret);
  if (jetonSecret && sortie) {
    return `lecture du fichier secret « ${jetonSecret} »`;
  }
  if (jetonSecret && /(^|\s)(cat|type|gc|get-content)\s/i.test(c)) {
    return `lecture du fichier secret « ${jetonSecret} »`;
  }

  const jetonPerso = chemins.find(estDonneePersonnelle);
  if (jetonPerso && sortie) {
    return `lecture de données personnelles d'apprenants « ${jetonPerso} »`;
  }

  return null;
}

// ── 4. Lecture stdin + verdict ───────────────────────────────────────────────
function refuser(raison, aide) {
  process.stderr.write(
    `BLOQUÉ PAR LE GARDE-FOU (block-secrets-read) : ${raison}.\n${aide}\n`,
  );
  process.exit(2);
}

const AIDE_SECRET =
  "Politique du projet (docs/politique-ia.md §1) : un assistant ne lit jamais " +
  "les secrets. Pour un besoin légitime (rotation par exemple), demande la " +
  'valeur expurgée à un humain, ou utilise `.env.example`.';

const AIDE_PERSO =
  "Politique du projet (docs/politique-ia.md §1) : les fichiers d'apprenants se " +
  'COMPTENT, ils ne s\'AFFICHENT pas. Nombre d\'enregistrements, noms de champs ' +
  'et distributions sont autorisés ; les valeurs ne le sont pas.';

let brut = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { brut += d; });
process.stdin.on('end', () => {
  let charge = {};
  if (brut.trim()) {
    try {
      charge = JSON.parse(brut);
    } catch {
      // Échec FERMÉ : une charge utile illisible ne doit pas valoir laissez-passer.
      refuser(
        'charge utile illisible (JSON invalide)',
        'Le garde-fou refuse par défaut plutôt que de laisser passer une ' +
        'commande qu\'il ne peut pas analyser.',
      );
    }
  }

  const outil = charge.tool_name || charge.toolName || '';
  const entree = charge.tool_input || charge.toolInput || {};

  if (/^(Read|Edit|Write|NotebookEdit|MultiEdit)$/i.test(outil)) {
    const chemin = entree.file_path || entree.path || entree.notebook_path || '';
    if (estSecret(chemin)) {
      refuser(`accès au fichier secret « ${chemin} »`, AIDE_SECRET);
    }
    if (estDonneePersonnelle(chemin)) {
      refuser(`accès à des données personnelles d'apprenants « ${chemin} »`, AIDE_PERSO);
    }
  }

  if (/^Grep$/i.test(outil)) {
    // Grep affiche des lignes du fichier : c'est une lecture. Son motif de
    // fichiers (glob) peut aussi viser un secret sans le nommer dans path.
    for (const cible of [entree.path, entree.glob]) {
      if (estSecret(cible)) refuser(`recherche dans le fichier secret « ${cible} »`, AIDE_SECRET);
      if (estDonneePersonnelle(cible)) {
        refuser(`recherche dans des données personnelles « ${cible} »`, AIDE_PERSO);
      }
    }
  }

  if (/^(Bash|PowerShell)$/i.test(outil)) {
    const raison = raisonBash(entree.command || '');
    if (raison) {
      refuser(raison, raison.includes('personnelles') ? AIDE_PERSO : AIDE_SECRET);
    }
  }

  process.exit(0);
});
