#!/usr/bin/env node
/**
 * Vérifie le garde des données personnelles (`garde-donnees.cjs`, SEC-25).
 *
 *   node .claude/aef-socle/hooks/garde-donnees.test.mjs
 *
 * Toutes les données sont FICTIVES et fabriquées ici (NIR et IBAN calculés pour avoir une clé
 * valide). Les essais de bout en bout tournent dans des dépôts git temporaires.
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, deflateSync } from 'node:zlib';

const ici = dirname(fileURLToPath(import.meta.url));
const GARDE = join(ici, 'garde-donnees.cjs');
const { examiner, motifVersRegex } = createRequire(import.meta.url)(GARDE);

let echecs = 0;
const cas = (nom, ok) => { if (!ok) echecs += 1; console.log(`${ok ? '✔' : '✘'} ${nom}`); };
const refuse = (chemin, texte) => examiner(chemin, Buffer.from(texte)).length > 0;

const nir = (corps) => corps + String(97n - (BigInt(corps) % 97n)).padStart(2, '0');
const emails = (n, domaine) => Array.from({ length: n }, (_, i) => `personne${i}@${domaine}`).join('\n');
const tels = (n) => Array.from({ length: n }, (_, i) => `06 12 34 56 ${String(10 + i)}`).join('\n');

// ── Unitaires ────────────────────────────────────────────────────────────────────────────
cas('CSV refusé par son extension', refuse('export/apprenants.csv', 'a;b'));
cas('dump pg_dump refusé', refuse('sauvegarde.sql', 'COPY public.apprenant (id, nom) FROM stdin;\n1\tX\n\\.\n'));
cas('SQL en INSERT de masse refusé', refuse('seed.sql', 'INSERT INTO t VALUES (1);\n'.repeat(25)));
cas('migration SQL acceptée', !refuse('prisma/migrations/1_init/migration.sql', 'CREATE TABLE a (id int);\nINSERT INTO r VALUES (1);'));
cas('vidéo de 12 Mo acceptée', examiner('site/video.mp4', Buffer.alloc(12 * 1024 * 1024, 1)).length === 0);
cas('archive de 12 Mo refusée', examiner('export.zip', Buffer.alloc(12 * 1024 * 1024, 1)).length > 0);
cas('5 adresses réelles refusées', refuse('src/seed.ts', emails(5, 'orange.fr')));
cas('4 adresses réelles acceptées (sous le seuil)', !refuse('src/seed.ts', emails(4, 'orange.fr')));
cas('adresses d\'exemple acceptées', !refuse('src/fixtures.ts', emails(20, 'exemple.fr') + emails(20, 'example.com')));
cas('5 téléphones refusés', refuse('notes.md', tels(5)));
cas('NIR à clé valide refusé', refuse('src/a.ts', `const n = '${nir('1850578006084')}';`));
cas('horodatage de 15 chiffres accepté (clé fausse)', !refuse('src/a.ts', 'const t = 172959480000099;'));
cas('IBAN valide refusé', refuse('docs/rib.md', 'IBAN : FR76 3000 6000 0112 3456 7890 189'));
cas('IBAN à clé fausse accepté', !refuse('docs/rib.md', 'IBAN : FR76 3000 6000 0112 3456 7890 188'));
cas('code ordinaire accepté', !refuse('src/x.ts', 'export const a = 1; // contact@aef-solutions.fr'));
// Documents (revue du 23/10/2026 : leur contenu n'était pas lu).
function zip(entrees) { // archive zip minimale, fichiers compressés (deflate)
  const locaux = []; const central = []; let pos = 0;
  for (const [nom, texte] of entrees) {
    const n = Buffer.from(nom); const brut = Buffer.from(texte); const d = deflateRawSync(brut);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(d.length, 18); l.writeUInt32LE(brut.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(d.length, 20); c.writeUInt32LE(brut.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    locaux.push(l, n, d); central.push(c, n); pos += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central); const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entrees.length, 8); fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...locaux, cd, fin]);
}
const paragraphes = (texte) => texte.split('\n').map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('');
cas('Word avec 6 adresses refusé', examiner('docs/liste.docx', zip([['word/document.xml', paragraphes(emails(6, 'orange.fr'))]])).length > 0);
cas('Word ordinaire accepté', examiner('docs/guide.docx', zip([['word/document.xml', paragraphes('Bonjour')]])).length === 0);
const casse = zip([['word/document.xml', paragraphes('Bonjour')]]);
casse.fill(0xff, 30 + 'word/document.xml'.length, 30 + 'word/document.xml'.length + 4); // données compressées abîmées
cas('Word illisible refusé', examiner('docs/casse.docx', casse).length > 0);
const pdf = (flux) => Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nstream\n'), flux, Buffer.from('\nendstream\nendobj\n')]);
cas('PDF compressé avec IBAN refusé', examiner('docs/rib.pdf', pdf(deflateSync(Buffer.from('BT (IBAN FR76 3000 6000 0112 3456 7890 189) Tj ET')))).length > 0);
cas('PDF ordinaire accepté', examiner('docs/plaquette.pdf', pdf(deflateSync(Buffer.from('BT (Bienvenue) Tj ET')))).length === 0);
cas('texte UTF-16 avec 6 adresses refusé', examiner('export.txt', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(emails(6, 'orange.fr'), 'utf16le')])).length > 0);
cas('texte UTF-16 sans marque refusé', examiner('export.txt', Buffer.from(emails(6, 'orange.fr'), 'utf16le')).length > 0);
cas('motif .gitignore : dossier', motifVersRegex('donnees-essai/').test('donnees-essai/a/b.csv'));
cas('motif .gitignore : extension partout', motifVersRegex('*.csv').test('a/b/c.csv'));
cas('motif ancré', !motifVersRegex('/a.csv').test('x/a.csv'));

// ── Bout en bout : crochet git et crochet Claude ─────────────────────────────────────────
// Lancé depuis le crochet pre-commit, ce fichier hérite de GIT_DIR, GIT_INDEX_FILE et des autres
// variables que git pose pour ses crochets. Sans les retirer, chaque « git » ci-dessous s'applique
// au dépôt du socle et non au dépôt d'essai : le 03/11/2026, un essai a ainsi réinitialisé le dépôt.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([c]) => !c.startsWith('GIT_')));

function depot() {
  const d = mkdtempSync(join(tmpdir(), 'garde-'));
  const g = (...a) => execFileSync('git', a, { cwd: d, env: ENV });
  g('init', '-q'); g('config', 'user.email', 'essai@exemple.fr'); g('config', 'user.name', 'essai');
  return { d, g };
}
const lancer = (d, args, entree) => spawnSync(process.execPath, [GARDE, ...args], { cwd: d, input: entree ?? '', env: ENV }).status;

{
  const { d, g } = depot();
  writeFileSync(join(d, 'ok.ts'), 'export const a = 1;\n');
  g('add', '.');
  cas('crochet git : commit ordinaire accepté', lancer(d, []) === 0);
  writeFileSync(join(d, 'export.csv'), 'nom;prenom\n');
  g('add', 'export.csv');
  cas('crochet git : CSV indexé refusé (code 1)', lancer(d, []) === 1);
  writeFileSync(join(d, '.garde-donnees'), 'export.csv  # gabarit vide, aucune donnée\n');
  cas('crochet git : exception écrite respectée', lancer(d, []) === 0);
  rmSync(d, { recursive: true, force: true });
}
{
  const { d } = depot();
  writeFileSync(join(d, 'contacts.ts'), emails(6, 'gmail.com'));
  const charge = (cmd) => JSON.stringify({ tool_name: 'Bash', tool_input: { command: cmd } });
  cas('Claude : « git add . && git commit » avec données refusé (code 2)', lancer(d, ['--claude'], charge('git add . && git commit -m x')) === 2);
  cas('Claude : commande sans commit ignorée', lancer(d, ['--claude'], charge('git status')) === 0);
  cas('Claude : commit sans rien d\'indexé accepté', lancer(d, ['--claude'], charge('git commit -m x')) === 0);
  cas('Claude : --no-verify en fin de commande refusé', lancer(d, ['--claude'], charge('git commit -m x --no-verify')) === 2);
  cas('Claude : git commit -n refusé', lancer(d, ['--claude'], charge('git commit -nm x')) === 2);
  cas('Claude : core.hooksPath refusé', lancer(d, ['--claude'], charge('git -c core.hooksPath=/dev/null commit -m x')) === 2);
  cas('Claude : HUSKY=0 refusé', lancer(d, ['--claude'], charge('HUSKY=0 git commit -m x')) === 2);
  cas('Claude : « -n » dans le message accepté', lancer(d, ['--claude'], charge('git commit -m "option -n"')) === 0);
  cas('Claude : charge illisible refusée (échec fermé)', lancer(d, ['--claude'], '{pas du json') === 2);
  rmSync(d, { recursive: true, force: true });
}
{
  const { d, g } = depot();
  writeFileSync(join(d, 'contacts.ts'), 'export const a = 1;\n');
  g('add', '.'); g('commit', '-q', '--no-verify', '-m', 'init');
  writeFileSync(join(d, 'contacts.ts'), emails(6, 'gmail.com'));
  const charge = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -am x' } });
  cas('Claude : « git commit -am » d\'un fichier suivi avec données refusé', lancer(d, ['--claude'], charge) === 2);
  rmSync(d, { recursive: true, force: true });
}

{
  // Le dépôt d'essai ne doit atteindre aucun autre dépôt, même quand GIT_DIR en désigne un.
  const temoin = mkdtempSync(join(tmpdir(), 'temoin-'));
  execFileSync('git', ['init', '-q'], { cwd: temoin, env: ENV });
  const config = join(temoin, '.git', 'config');
  const avant = readFileSync(config, 'utf8');
  process.env.GIT_DIR = join(temoin, '.git');
  const { d } = depot();
  delete process.env.GIT_DIR;
  cas('dépôt d\'essai isolé : un GIT_DIR hérité n\'atteint pas le dépôt qu\'il désigne',
      readFileSync(config, 'utf8') === avant);
  rmSync(d, { recursive: true, force: true });
  rmSync(temoin, { recursive: true, force: true });
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les cas passent.');
process.exit(echecs ? 1 : 0);
