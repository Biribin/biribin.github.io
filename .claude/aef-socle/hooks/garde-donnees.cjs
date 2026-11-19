#!/usr/bin/env node
/**
 * Garde des données personnelles — aucun fichier de données réelles n'entre dans git (socle AEF SEC-25).
 *
 * Pourquoi : une donnée personnelle poussée sur GitHub ne s'efface plus soi-même. Réécrire
 * l'historique ne suffit pas, GitHub garde les anciens commits et les références des pull
 * requests ; seul son support peut les purger (CRM, juin 2026 : 822 apprenants, ticket
 * #4717296 et sa suite). Le seul bon moment pour arrêter une fuite est AVANT le commit.
 *
 * Bloque un commit qui ajoute ou modifie :
 *   - un fichier de données par son extension (.csv, .xlsx, .sql, .dump, .sqlite, .vcf, .eml…) ;
 *   - un fichier texte qui contient au moins 5 adresses électroniques réelles distinctes, ou
 *     5 numéros de téléphone français distincts, ou un numéro de sécurité sociale ou un IBAN
 *     français valides (clé de contrôle vérifiée : pas de faux positif sur un horodatage) ;
 *   - un fichier de plus de 10 Mo.
 * Le texte est lu aussi en UTF-16, dans les documents Word, PowerPoint et OpenDocument (XML de l'archive), et au
 * mieux dans les PDF (flux décompressés) ; un document illisible est refusé plutôt que supposé sans risque.
 * Avec --claude, il refuse aussi ce qui fait sauter les crochets git (--no-verify, -n, core.hooksPath, HUSKY=0…),
 * contrôle les fichiers suivis modifiés d'un « git commit -a », et refuse si sa charge ou son contrôle échoue.
 * Exceptions écrites, une par ligne, dans `.garde-donnees` à la racine du dépôt (motif de chemin
 * façon .gitignore, suivi d'un commentaire qui dit pourquoi) : jeux d'essai fictifs, gabarits.
 *
 * Trois usages :
 *   node garde-donnees.cjs              crochet git pre-commit (fichiers indexés)        → 1 si refus
 *   node garde-donnees.cjs --claude     crochet PreToolUse de Claude Code (lit stdin)    → 2 si refus
 *   node garde-donnees.cjs --tout       tous les fichiers suivis (audit, intégration)    → 1 si refus
 * Rien n'est affiché du contenu : seulement le chemin, le motif et le nombre (compter, pas afficher).
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EXTENSIONS = new Set([
  '.csv', '.tsv', '.xlsx', '.xlsm', '.xls', '.ods', '.dump', '.bak', '.sqlite', '.sqlite3',
  '.db', '.parquet', '.vcf', '.mbox', '.eml', '.msg', '.pst',
]);
// .sql n'est PAS dans la liste : une migration ou une requête décrit une structure. Un .sql est
// refusé quand il CONTIENT des données (COPY … FROM stdin d'un pg_dump, ou des INSERT en série).
const RE_SQL_DONNEES = /^COPY\s.+\sFROM\s+stdin/im;
const RE_INSERT = /\bINSERT\s+INTO\b/gi;
// La règle de taille vise les exports et les dumps, pas les médias du site.
const MEDIAS = new Set(['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.glb', '.gltf']);
const SEUIL = 5;
const TAILLE_MAX = 10 * 1024 * 1024;
const FICTIF = /(^|\.)(exemple|example|test|invalid|localhost|domain|acme|foo|bar)\.[a-z]{2,}$|\.(test|invalid|example|local|localhost)$/i;
const RE_EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})/g;
const RE_TEL = /(?<![\d+])(?:\+33[\s.]?|0033[\s.]?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\d)/g;
const RE_NIR = /(?<!\d)([12]\d{12})(\d{2})(?!\d)/g;
const RE_IBAN = /\bFR\d{2}(?:\s?[0-9A-Z]{4}){5}\s?[0-9A-Z]{3}\b/g;

function git(args, options = {}) {
  return execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024, ...options });
}

function motifVersRegex(motif) {
  const ancre = motif.startsWith('/');
  let m = motif.replace(/^\//, '').replace(/\/$/, '/**');
  let re = '';
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '*' && m[i + 1] === '*') { re += '.*'; i++; if (m[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp((ancre || m.includes('/') ? '^' : '(^|/)') + re + '$');
}

// Exceptions communes : copie du socle (son référentiel d'exigences est un CSV), configuration
// et bibliothèques de méthodes de BMAD (CSV de skills, aucune personne dedans).
// Pas _bmad-output/ : c'est là qu'a eu lieu la fuite de juin 2026.
const EXCEPTIONS_SOCLE = [
  '.claude/aef-socle/**', 'knowledge/09-exigences.csv', '_bmad/**/*.csv',
  '.claude/skills/**/*.csv', '.claude/skills-disabled/**/*.csv',
];

function exceptions(racine) {
  const f = path.join(racine, '.garde-donnees');
  const lignes = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(/\r?\n/) : [];
  return EXCEPTIONS_SOCLE.map(motifVersRegex).concat(lignes
    .map((l) => l.replace(/\s+#.*$/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .map(motifVersRegex));
}

function nirValide(corps, cle) {
  return 97n - (BigInt(corps) % 97n) === BigInt(cle);
}

function ibanValide(iban) {
  const s = iban.replace(/\s/g, '');
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const ch of r) reste = (reste * 10 + Number(ch)) % 97;
  return reste === 1;
}

// Documents dont le texte est dans une archive zip (XML) : Word, PowerPoint, OpenDocument.
const DOCUMENTS_ZIP = new Set(['.docx', '.docm', '.dotx', '.pptx', '.pptm', '.odt', '.odp', '.ott']);
const DECOMPRESSE_MAX = 50 * 1024 * 1024; // une bombe zip ne doit pas faire tomber le crochet

/** Texte des fichiers XML d'une archive zip (sans bibliothèque : répertoire central lu à la main). */
function texteZip(octets) {
  const fin = octets.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) return null;
  let n = octets.readUInt16LE(fin + 10);
  let p = octets.readUInt32LE(fin + 16);
  const morceaux = [];
  let total = 0;
  while (n-- > 0 && p + 46 <= octets.length && octets.readUInt32LE(p) === 0x02014b50) {
    const methode = octets.readUInt16LE(p + 10);
    const taille = octets.readUInt32LE(p + 20);
    const lgNom = octets.readUInt16LE(p + 28);
    const lgExtra = octets.readUInt16LE(p + 30);
    const lgCom = octets.readUInt16LE(p + 32);
    const local = octets.readUInt32LE(p + 42);
    const nom = octets.toString('utf8', p + 46, p + 46 + lgNom);
    p += 46 + lgNom + lgExtra + lgCom;
    if (!/\.xml$/i.test(nom) || local + 30 > octets.length) continue;
    const debut = local + 30 + octets.readUInt16LE(local + 26) + octets.readUInt16LE(local + 28);
    const donnees = octets.subarray(debut, debut + taille);
    let xml;
    if (methode === 0) xml = donnees;
    else if (methode === 8) xml = zlib.inflateRawSync(donnees, { maxOutputLength: DECOMPRESSE_MAX - total });
    else continue;
    total += xml.length;
    // Une balise de paragraphe vaut un saut de ligne : sinon deux adresses voisines se collent.
    morceaux.push(xml.toString('utf8').replace(/<\/(w:p|text:p|a:p)>/g, '\n').replace(/<[^>]+>/g, ''));
  }
  return morceaux.join('\n');
}

/** Texte lisible d'un PDF, au mieux : flux décompressés et chaînes entre parenthèses. */
function textePdf(octets) {
  const brut = octets.toString('latin1');
  const morceaux = [brut];
  let total = 0;
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(brut)) && total < DECOMPRESSE_MAX) {
    const fin = brut.indexOf('endstream', m.index);
    if (fin < 0) break;
    try {
      const flux = zlib.inflateSync(octets.subarray(m.index + m[0].length, fin), { maxOutputLength: DECOMPRESSE_MAX - total });
      total += flux.length;
      morceaux.push(flux.toString('latin1'));
    } catch { /* flux non compressé par zlib (image, police) : ignoré */ }
    re.lastIndex = fin;
  }
  const tout = morceaux.join('\n');
  const chaines = [...tout.matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map((x) => x[1]).join('');
  return `${tout}\n${chaines}`;
}

/** Texte d'un fichier : UTF-8, UTF-16 (avec ou sans marque d'ordre), document Office ou PDF. null si binaire. */
function texteDe(ext, octets) {
  if (DOCUMENTS_ZIP.has(ext)) return texteZip(octets);
  if (ext === '.pdf') return textePdf(octets);
  const tete = octets.subarray(0, 8000);
  if (tete[0] === 0xff && tete[1] === 0xfe) return octets.subarray(2).toString('utf16le');
  if (tete[0] === 0xfe && tete[1] === 0xff) return Buffer.from(octets.subarray(2)).swap16().toString('utf16le');
  if (!tete.includes(0)) return octets.toString('utf8');
  // UTF-16 sans marque : un octet sur deux est nul (texte latin). Sinon, vrai binaire.
  let nulsImpairs = 0;
  for (let i = 1; i < tete.length; i += 2) if (tete[i] === 0) nulsImpairs += 1;
  if (nulsImpairs > tete.length / 2 * 0.6) return octets.toString('utf16le');
  return null;
}

/** Motifs de refus pour un fichier : liste de phrases sans aucune valeur trouvée. */
function examiner(chemin, octets) {
  const motifs = [];
  const ext = path.extname(chemin).toLowerCase();
  if (EXTENSIONS.has(ext)) motifs.push(`fichier de données (${ext})`);
  if (octets.length > TAILLE_MAX && !MEDIAS.has(ext)) motifs.push(`fichier de ${Math.round(octets.length / 1048576)} Mo`);
  let texte;
  try {
    texte = texteDe(ext, octets);
  } catch {
    // Document illisible ou trop gros une fois décompressé : on ne conclut pas qu'il est sans risque.
    motifs.push(`document ${ext} illisible par la garde`);
    return motifs;
  }
  if (texte === null) return motifs; // binaire : extension et taille seulement
  if (ext === '.sql') {
    const inserts = (texte.match(RE_INSERT) || []).length;
    if (RE_SQL_DONNEES.test(texte) || inserts >= 20) motifs.push(`SQL contenant des données (${inserts} INSERT)`);
  }
  const emails = new Set();
  for (const m of texte.matchAll(RE_EMAIL)) if (!FICTIF.test(m[1])) emails.add(m[0].toLowerCase());
  if (emails.size >= SEUIL) motifs.push(`${emails.size} adresses électroniques distinctes`);
  const tels = new Set([...texte.matchAll(RE_TEL)].map((m) => m[0].replace(/\D/g, '').slice(-9)));
  if (tels.size >= SEUIL) motifs.push(`${tels.size} numéros de téléphone distincts`);
  const nir = [...texte.matchAll(RE_NIR)].filter((m) => nirValide(m[1], m[2])).length;
  if (nir > 0) motifs.push(`${nir} numéro(s) de sécurité sociale`);
  const iban = [...texte.matchAll(RE_IBAN)].filter((m) => ibanValide(m[0])).length;
  if (iban > 0) motifs.push(`${iban} IBAN`);
  return motifs;
}

function liste(sortie) {
  return sortie.toString('utf8').split('\0').filter(Boolean);
}

function controler({ indexes, travail, suivis, tout }) {
  const racine = git(['rev-parse', '--show-toplevel']).toString().trim();
  const exclus = exceptions(racine);
  const fichiers = new Map(); // chemin -> lecteur d'octets
  if (indexes) {
    for (const f of liste(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'], { cwd: racine }))) {
      fichiers.set(f, () => git(['show', `:${f}`], { cwd: racine }));
    }
  }
  if (travail) { // modifiés ou nouveaux, non ignorés : ce qu'un « git add » va indexer
    for (const f of liste(git(['ls-files', '-z', '--modified', '--others', '--exclude-standard'], { cwd: racine }))) {
      fichiers.set(f, () => fs.readFileSync(path.join(racine, f)));
    }
  }
  if (suivis) { // « git commit -a » : les fichiers suivis modifiés partent sans « git add »
    for (const f of liste(git(['ls-files', '-z', '--modified'], { cwd: racine }))) {
      fichiers.set(f, () => fs.readFileSync(path.join(racine, f)));
    }
  }
  if (tout) {
    for (const f of liste(git(['ls-files', '-z'], { cwd: racine }))) {
      fichiers.set(f, () => fs.readFileSync(path.join(racine, f)));
    }
  }
  const refus = [];
  for (const [f, lire] of fichiers) {
    if (exclus.some((re) => re.test(f))) continue;
    let octets;
    try { octets = lire(); } catch { continue; } // fichier supprimé entre-temps
    const motifs = examiner(f, octets);
    if (motifs.length) refus.push(`  ${f} : ${motifs.join(', ')}`);
  }
  return refus;
}

function message(refus) {
  return [
    'Garde des données personnelles (socle AEF SEC-25) : commit refusé.',
    ...refus,
    'Une donnée personnelle poussée sur GitHub ne s\'efface plus sans le support de GitHub.',
    'Données réelles : hors du dépôt (dossier ignoré, stockage chiffré). Jeu d\'essai fictif ou gabarit :',
    'ajouter son chemin dans .garde-donnees avec la raison (# …), puis recommencer.',
  ].join('\n');
}

// Ce qui fait sauter les crochets git : refusé à l'assistant, quelle que soit la place de l'option.
const CONTOURNEMENTS = [
  [/--no-verify\b/, '--no-verify'],
  [/\bgit\b[^\n]*\bcommit\b[^\n]*\s-[a-zA-Z]*n[a-zA-Z]*\b/, 'git commit -n (= --no-verify)'],
  [/core\.hooks[Pp]ath/, 'core.hooksPath'],
  [/\b(HUSKY|LEFTHOOK)\s*=\s*0\b|\$env:(HUSKY|LEFTHOOK)\s*=/i, 'HUSKY=0 / LEFTHOOK=0'],
  [/\bSKIP\s*=\s*\S*garde/i, 'SKIP=garde-donnees'],
];

function sansMessages(commande) {
  // Le texte d'un message (-m "…") ne compte pas : « -m "corrige -n" » n'est pas un contournement.
  return commande.replace(/(\s-[a-zA-Z]*m|\s--message|\s-F)(\s+|=)("[^"]*"|'[^']*'|\S+)/g, '$1 MESSAGE');
}

function refuserClaude(texte) {
  process.stderr.write(texte + '\n');
  return 2;
}

function principal() {
  const args = process.argv.slice(2);
  if (args.includes('--claude')) {
    let charge;
    try { charge = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {
      // Échec fermé : une charge illisible ne vaut pas laissez-passer.
      return refuserClaude('Garde des données personnelles (socle AEF SEC-25) : charge illisible, refus par prudence.');
    }
    const commande = sansMessages(String(((charge && charge.tool_input) || {}).command || ''));
    if (!/\bgit\b/.test(commande)) return 0;
    const contournement = CONTOURNEMENTS.find(([re]) => re.test(commande));
    if (contournement) {
      return refuserClaude(`Garde des données personnelles (socle AEF SEC-25) : « ${contournement[1]} » désactive les ` +
        'crochets git, refusé à l\'assistant. Corriger ce que le crochet signale ; une exception se décide par une personne.');
    }
    if (!/\bgit\b[^\n]*\bcommit\b/.test(commande)) return 0;
    try { git(['rev-parse', '--show-toplevel'], { stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return 0; } // hors d'un dépôt git : rien à garder
    let refus;
    try {
      refus = controler({
        indexes: true,
        travail: /\bgit\b[^\n]*\badd\b/.test(commande),
        suivis: /\bcommit\b[^\n]*(\s-[a-zA-Z]*a[a-zA-Z]*\b|\s--all\b)/.test(commande),
      });
    } catch {
      return refuserClaude('Garde des données personnelles (socle AEF SEC-25) : contrôle impossible, commit refusé par prudence.');
    }
    if (!refus.length) return 0;
    return refuserClaude(message(refus));
  }
  const refus = controler(args.includes('--tout') ? { tout: true } : { indexes: true });
  if (!refus.length) return 0;
  process.stderr.write(message(refus) + '\n');
  return 1;
}

if (require.main === module) process.exit(principal());
module.exports = { examiner, motifVersRegex, nirValide, ibanValide };
