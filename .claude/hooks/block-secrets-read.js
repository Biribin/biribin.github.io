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
 * Revue du 23/10/2026 : une liste de commandes « qui lisent » ne se termine
 * jamais (`cp .env x`, `diff`, `ln -s`, `[IO.File]::ReadAllText`, `cat .en?`,
 * `cat .e""nv`, `f=.env; cat $f`…). La règle est donc inversée : une commande qui
 * NOMME un fichier secret est refusée, sauf si elle n'est faite que de commandes
 * qui n'en affichent pas le contenu (ls, test, git status…). Les jokers sont
 * confrontés à des noms de secrets connus, les guillemets et échappements sont
 * retirés, et les chemins Windows sont normalisés (espaces et points finaux,
 * flux alternatifs `::$DATA`, noms courts `ENV~1`).
 *
 * Pourquoi dans le dépôt et pas seulement sur le poste : un garde-fou installé
 * dans le profil d'un développeur protège une machine, pas un projet. Versionné,
 * il voyage avec le clone et s'applique à quiconque travaille ici.
 *
 * Motifs de données personnelles propres à un projet : un par ligne (expression
 * régulière, `#` pour un commentaire) dans `donnees-personnelles.txt`, à côté de
 * ce fichier. Ce fichier-ci reste identique au modèle du socle.
 *
 * Contrat Claude Code :
 *   - lit un JSON sur stdin : { tool_name, tool_input, ... }
 *   - exit 0            -> autorise
 *   - exit 2 + stderr   -> BLOQUE (stderr renvoyé au modèle comme raison)
 *
 * Politique : BLOCAGE STRICT, et ÉCHEC FERMÉ si la charge utile est vide ou illisible.
 * Référence : docs/politique-ia.md — contrôles IA-01, IA-02, IA-03. Modèle diffusé par le socle AEF (hooks/).
 */

'use strict';

// Version du modèle : l'installateur du socle remplace une copie plus ancienne.
const VERSION_GARDE = '2026-10-23';

const fs = require('fs');
const path = require('path');

// ── 1. Chemins de SECRETS ────────────────────────────────────────────────────
const SECRET_PATH_PATTERNS = [
  // Deux motifs plutôt qu'un `(\.[^/\\]*)?` optionnel : un quantificateur
  // imbriqué dans un groupe optionnel est un motif à explosion exponentielle
  // (ReDoS), et l'analyse statique du projet le refuse à juste titre — un
  // garde-fou de sécurité est le dernier endroit où en laisser un.
  /(^|[/\\])\.env$/i,                        // .env
  /(^|[/\\])\.env\.[^/\\]+/i,                // .env.local, .env.production…
  /(^|[/\\])env~\d/i,                        // nom court Windows de .env (ENV~1)
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
  /\/proc\/[^/\s]+\/environ$/i,
];

// Autorisés même s'ils ressemblent à .env* : aucune valeur réelle dedans.
const ALLOWLIST_PATTERNS = [
  /\.env\.(example|sample|template|dist)$/i,
  /\.env\.(example|sample|template)\.[^/\\]+$/i,
];

// Noms auxquels on confronte un joker (`cat .en?`, glob `*.env` de Grep).
const NOMS_SECRETS_TYPES = [
  '.env', '.env.local', '.env.production', '.env.development', '.npmrc', '.pgpass', '.pypirc',
  '.netrc', '.git-credentials', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials', 'credentials.json',
  'secrets.json', 'secrets.yml', 'secret.yaml', 'server.pem', 'server.key', 'cert.p12', 'cert.pfx',
  'kubeconfig',
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
  ...motifsDuProjet(),
];

/** Motifs propres au projet (donnees-personnelles.txt). Un motif invalide est une erreur : on refuse tout. */
function motifsDuProjet() {
  const fichier = path.join(__dirname, 'donnees-personnelles.txt');
  let texte = '';
  try {
    texte = fs.readFileSync(fichier, 'utf8');
  } catch {
    return [];
  }
  return texte.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      try {
        return new RegExp(l, 'i');
      } catch {
        return /./; // motif illisible : tout devient « donnée personnelle », échec fermé
      }
    });
}

/**
 * Formes d'un même chemin que Windows ouvre comme le fichier lui-même :
 * `.env ` et `.env.` (espaces et points finaux retirés), `.env::$DATA` ou
 * `.env:flux` (flux alternatif NTFS).
 */
function variantes(p) {
  const brut = String(p);
  const formes = new Set([brut]);
  let s = brut.trim().replace(/[. ]+$/, '');
  formes.add(s);
  const i = s.lastIndexOf(':');
  if (i > 1 && !/[/\\]/.test(s.slice(i))) {
    s = s.slice(0, i).replace(/[. ]+$/, '');
    if (s.endsWith(':')) s = s.slice(0, -1); // `::$DATA`
    formes.add(s);
  }
  return [...formes].filter(Boolean);
}

function globVersRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') re += '[^/\\\\]*';
    else if (c === '?') re += '[^/\\\\]';
    else if (c === '[') {
      const fin = glob.indexOf(']', i + 1);
      if (fin === -1) { re += '\\['; continue; }
      re += '[' + glob.slice(i + 1, fin).replace(/^!/, '^').replace(/\\/g, '\\\\') + ']';
      i = fin;
    } else if (c === '{') {
      const fin = glob.indexOf('}', i + 1);
      if (fin === -1) { re += '\\{'; continue; }
      re += '(' + glob.slice(i + 1, fin).split(',').map((x) => x.replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '.*')).join('|') + ')';
      i = fin;
    } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', 'i');
}

/** Un joker (dernier élément du chemin) qui peut désigner un secret connu. */
function jokerSecret(p) {
  const nom = String(p).split(/[/\\]/).pop();
  if (!/[*?[{]/.test(nom)) return false;
  // `*` seul ou `*.*` ne visent rien de précis : on exige un peu de texte littéral.
  if (nom.replace(/[*?[\]{},!]/g, '').length < 2) return false;
  let re;
  try {
    re = globVersRegex(nom);
  } catch {
    return true; // joker illisible : refus
  }
  return NOMS_SECRETS_TYPES.some((n) => re.test(n));
}

function estSecret(p) {
  if (!p) return false;
  return variantes(p).some((s) => {
    if (ALLOWLIST_PATTERNS.some((re) => re.test(s))) return false;
    return SECRET_PATH_PATTERNS.some((re) => re.test(s)) || jokerSecret(s);
  });
}

function estDonneePersonnelle(p) {
  if (!p) return false;
  return variantes(p).some((s) => DONNEES_PERSONNELLES_PATTERNS.some((re) => re.test(s)));
}

// ── 3. Commandes Bash et PowerShell ──────────────────────────────────────────
// Commandes qui peuvent NOMMER un fichier secret sans en sortir le contenu.
// Tout le reste (cp, diff, ln, dd, interpréteurs, .NET…) est refusé dès qu'un
// fichier secret est nommé : c'est la liste blanche qui se tient à jour, pas
// la liste des façons de lire un fichier.
const INOFFENSIFS = new Set([
  'ls', 'dir', 'test', '[', '[[', 'stat', 'wc', 'cd', 'pwd', 'true', 'echo', 'printf',
  'test-path', 'write-output', 'write-host',
  'git check-ignore', 'git status', 'git ls-files', 'git rm --cached',
]);

// Commandes qui affichent ou envoient une valeur (pour les variables d'environnement).
const AFFICHEURS = [
  'echo', 'printf', 'print', 'cat', 'tee', 'write-output', 'write-host', 'write-error', 'write-verbose',
  'out-host', 'out-file', 'set-content', 'add-content', 'logger',
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'invoke-webrequest', 'iwr', 'invoke-restmethod', 'irm',
];

const INTERPRETEURS = [
  'python', 'python3', 'py', 'python.exe',
  'node', 'nodejs', 'deno', 'bun', 'tsx', 'ts-node',
  'perl', 'ruby', 'php', 'lua',
  'pwsh', 'powershell',
];

const MOTIFS_VIDAGE_ENV = [
  /\bprintenv\b/i,
  /(^|[\s;|&(])env\b\s*(\||$|>)/i,          // la commande `env` seule, pas le nom « .env »
  /(^|[\s;|&(])set\b\s*(\||$)/i,
  /\bexport\s*(-p\s*)?($|[;|&>])/i,
  /\b(declare|typeset)\s+-[a-z]*[xp]/i,
  /\/proc\/[^\s]*\/environ/i,
  /\bGet-ChildItem\s+Env:/i,
  /\bgci\s+env:/i,
  /(^|[\s(,'"])env:/i,                        // lecteur PowerShell Env: (gi env:X, dir env:, gc env:X)
  /\[(System\.)?Environment\]::GetEnvironmentVariables?\b/i,
  /docker\s+exec[^\n]*\bprintenv\b/i,
  /docker\s+inspect[^\n]*\bEnv\b/i,
  /\bcompose\b[^\n]*\bconfig\b/i,
];

// Variable dont le nom annonce un secret : $DATABASE_URL, ${API_KEY}, $env:SMTP_PASSWORD.
const VARIABLE_SECRETE =
  /\$\{?(env:)?\w*(SECRET|TOKEN|PASSW|API_?KEY|PRIVATE|CREDENTIAL|DATABASE_URL|_DSN|AUTH|ACCESS_KEY|ENCRYPTION_KEY)\w*/i;
// Code passé à un interpréteur qui lit l'environnement.
const CODE_ENV = /(process\.env|os\.environ|os\.getenv|getenv\s*\(|\bENV\[|System\.getenv|Deno\.env|Bun\.env)/i;

function nomCommande(jeton) {
  // « /usr/bin/python3 » et « C:/…/python.exe » doivent compter comme python3.
  return String(jeton).split(/[/\\]/).pop().toLowerCase();
}

/**
 * Retire les préfixes qui déguisent un chemin sans le changer : `curl -d @.env`
 * passe un fichier, `file://` aussi.
 */
function normaliserChemin(jeton) {
  return String(jeton).replace(/^(@|=|file:\/\/|\.\/)+/i, '');
}

/** Retire guillemets et échappements qui découpent un nom (`.e""nv`, `.e\nv`, `.e^nv`, `` .e`nv ``). */
function sansGuillemets(c) {
  return c.replace(/["'`^]/g, '').replace(/\\(?=[^\\/\s])/g, '');
}

/** Le message d'un commit ne lit rien : `git commit -m "ignorer .env"` ne doit pas être refusé. */
function sansMessagesDeCommit(c) {
  return c.replace(/(\s-[a-zA-Z]*m|\s--message)(\s+|=)("[^"]*"|'[^']*')/g, '$1 MESSAGE');
}

function jetonsDe(c) {
  const brut = c.split(/[\s;|&<>()"'`,[\]{}]+/);        // mots, y compris ceux d'une chaîne de code
  const nu = sansGuillemets(c);
  const entiers = nu.split(/[\s;|&<>()]+/);                // jokers et crochets gardés : `.[e]nv`
  const coupes = nu.split(/[\s;|&<>()=:,]+/);              // `f=.env`, `if=.env`, `HEAD:.env`
  return [...brut, ...entiers, ...coupes].filter(Boolean).map(normaliserChemin);
}

/** Nom de chaque commande de la ligne (`git status` pour git), variables posées en tête ignorées. */
function commandesDe(c) {
  return sansGuillemets(c).split(/\|\||&&|[;|&\n]/).map((seg) => {
    const mots = seg.trim().split(/\s+/).filter(Boolean);
    while (mots.length && /^\w+=/.test(mots[0])) mots.shift();
    if (!mots.length) return null;
    const nom = nomCommande(mots[0]);
    if (nom === 'git') {
      const sous = mots.slice(1).filter((m) => !m.startsWith('-'));
      if (sous[0] === 'rm' && mots.includes('--cached')) return 'git rm --cached';
      return `git ${sous[0] || ''}`.trim();
    }
    return nom;
  }).filter(Boolean);
}

function toutInoffensif(c) {
  if (/\$\(|<\(|`/.test(c)) return false;                 // substitution : une commande cachée dans une autre
  if (/<\s*\S/.test(c.replace(/<</g, ''))) return false;  // lecture par redirection
  const redirections = [...sansGuillemets(c).matchAll(/>>?\s*(\S+)/g)].map((m) => m[1]);
  if (redirections.some((r) => estSecret(r) || estDonneePersonnelle(r))) return false; // écrase un secret
  const commandes = commandesDe(c);
  return commandes.length > 0 && commandes.every((n) => INOFFENSIFS.has(n));
}

function raisonBash(cmd) {
  if (!cmd) return null;
  const c = sansMessagesDeCommit(String(cmd));

  for (const re of MOTIFS_VIDAGE_ENV) {
    if (re.test(c)) {
      return "commande qui exporte des variables d'environnement (secrets potentiels)";
    }
  }

  const noms = c.split(/[\s;|&<>()"'`,[\]{}]+/).filter(Boolean).map(nomCommande);
  const aInterpreteur = noms.some((t) => INTERPRETEURS.includes(t));
  if (aInterpreteur && CODE_ENV.test(c)) {
    return "code qui lit les variables d'environnement (secrets potentiels)";
  }
  if (VARIABLE_SECRETE.test(c)) {
    const affiche = aInterpreteur || noms.some((t) => AFFICHEURS.includes(t)) ||
      commandesDe(c).some((n) => n.startsWith('$')); // `$env:X` seul : PowerShell l'affiche
    if (affiche) return "affichage d'une variable d'environnement secrète";
  }

  const jetons = jetonsDe(c);
  const inoffensif = toutInoffensif(c);
  const jetonSecret = jetons.find(estSecret);
  if (jetonSecret && !inoffensif) {
    return `lecture du fichier secret « ${jetonSecret} »`;
  }
  const jetonPerso = jetons.find(estDonneePersonnelle);
  if (jetonPerso && !inoffensif) {
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
  "les secrets, ni directement, ni par une copie, un lien ou une variable. Pour un " +
  "besoin légitime (rotation par exemple), demande la valeur expurgée à un humain, " +
  'ou utilise `.env.example`.';

const AIDE_PERSO =
  "Politique du projet (docs/politique-ia.md §1) : les fichiers d'apprenants se " +
  'COMPTENT, ils ne s\'AFFICHENT pas. Nombre d\'enregistrements, noms de champs ' +
  'et distributions sont autorisés ; les valeurs ne le sont pas.';

module.exports = { estSecret, estDonneePersonnelle, raisonBash, VERSION_GARDE };

if (require.main === module) {
  let brut = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { brut += d; });
  process.stdin.on('end', () => {
    let charge = {};
    try {
      charge = JSON.parse(brut);
    } catch {
      // Échec FERMÉ : une charge utile vide ou illisible ne vaut pas laissez-passer.
      refuser(
        'charge utile vide ou illisible (JSON invalide)',
        'Le garde-fou refuse par défaut plutôt que de laisser passer une ' +
        'commande qu\'il ne peut pas analyser.',
      );
    }

    const outil = (charge && (charge.tool_name || charge.toolName)) || '';
    const entree = (charge && (charge.tool_input || charge.toolInput)) || {};

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
}
