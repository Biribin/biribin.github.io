/* ============================================================
   La cagnotte dodo de Linéo
   ------------------------------------------------------------
   RÉGLAGES : remplis ces valeurs, le reste suit tout seul.
   Un moyen laissé vide ('') n'apparaît pas sur la page.
   ============================================================ */
const CONFIG = {
  paypalMe: 'leanesthaut',        // ex. 'lineobiribin'  → https://paypal.me/lineobiribin/20EUR
  lydiaLien: '',       // lien de cagnotte ou de paiement Lydia (https://…), sinon ''
  lydiaNumero: '06 50 55 91 84',     // ex. '06 12 34 56 78' (si pas de lien Lydia)
  weroNumero: '06 50 55 91 84',      // numéro ou e-mail associé à Wero
  n8n: 'https://n8n.aef-solutions.fr/webhook', // workflow « Cagnotte dodo » : compteur + mail Gmail
  notifEmail: 'lineobiribin@gmail.com', // secours si n8n ne répond pas // reçoit « Julie a mis 20 € via Lydia »
  objectif: 550,
  paliers: [           // cumulés, dans l'ordre de priorité
    { ico: '🛏️', nom: 'Le matelas', montant: 450, prio: true },
    { ico: '☁️', nom: 'La couette', montant: 550 },
    { ico: '🪶', nom: 'Bonus : un oreiller tout neuf', montant: 580 },
  ],
  matelas: 450,        // sert au « tu as financé X % de mon matelas »
};

/* ---------- Blocage maman ---------- */
const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[0300-036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// [mot, fautes tolérées]
const MAMAN = [['maman', 1], ['mamounette', 2], ['mamounet', 2],
  ['mama', 0], ['mom', 0], ['mum', 0], ['mere', 0], ['mother', 1], ['mutti', 0], ['mamie', 0]];
function estMaman(prenom) {
  const n = norm(prenom);
  if (!n) return false;
  const collé = n.replace(/ /g, '');
  if (/silbana ?birbin|silvana ?biri?bin/.test(n) || /silbanabirbin|silvanabiri?bin/.test(collé)) return true;
  const mots = n.split(' ').concat([collé]);
  // Famille « Silvana » : 2 fautes tolérées, mais commence par s et finit en -ana/-anna/-ane
  // (évite Sylvain, Silvia, Liliana…).
  const silvana = w => /^s/.test(w) && /an+[ae]$/.test(w) && ['silvana', 'silbana', 'sylvana'].some(r => lev(w, r) <= 2);
  return mots.some(w => silvana(w) || MAMAN.some(([ref, tol]) => lev(w, ref) <= tol));
}

/* ---------- Phrases fun ---------- */
const PHRASES = [
  [0, ['Merci ! Avec ça je m\'offre… une taie d\'oreiller. C\'est un début 😴',
       'Chaque centime compte : tu viens de financer {p} % de mon matelas !']],
  [5, ['Merci, tu as contribué à {p} % de mon matelas ! 🛏️',
       'En vrai, cet argent je vais plutôt le cacher sous le lit. Il y sera bien.',
       '{p} % de matelas, c\'est au moins un ressort. Un ressort important.']],
  [15, ['Super, avec ce montant je vais pouvoir m\'acheter un coussin en plus ! 🪶',
        'Tu viens de financer {p} % de mon matelas. Mon dos t\'envoie un bisou.',
        'Avec ça, je vais pouvoir dormir sur au moins une oreille.']],
  [30, ['Avec ce montant, je vais dormir sur mes deux oreilles 😌',
        'En vrai, cet argent je vais plutôt le cacher sous le lit… dès que j\'aurai un lit.',
        '{p} % du matelas d\'un coup ! Tu es officiellement marraine/parrain de mes nuits.']],
  [60, ['Ça, c\'est quasiment une couette entière : tu viens de sauver mes hivers ❄️☁️',
        'Super, avec ce montant je vais pouvoir m\'acheter une couette en plus !',
        '{p} % de mon matelas. Je vais faire des rêves en 4K.']],
  [100, ['Tu viens de financer {p} % du matelas. Je grave ton prénom sous le sommier 🫡',
         'Avec ça, je dors comme un bébé… un bébé très bien financé.',
         'Couette ET coussin ET dignité retrouvée. Merci, vraiment 🥹']],
];
function phrase(montant) {
  const p = Math.max(1, Math.round(montant / CONFIG.matelas * 100));
  let liste = PHRASES[0][1];
  for (const [min, l] of PHRASES) if (montant >= min) liste = l;
  return liste[Math.floor(Math.random() * liste.length)].replace('{p}', p);
}

/* ---------- Jauge ---------- */
const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
function afficherJauge(total) {
  const t = Math.max(0, Number(total) || 0);
  $('total').textContent = fmt(t);
  $('goal').textContent = fmt(CONFIG.objectif);
  const bar = $('bar');
  bar.setAttribute('aria-valuemax', CONFIG.objectif);
  bar.setAttribute('aria-valuenow', t);
  requestAnimationFrame(() => { $('fill').style.width = Math.min(100, t / CONFIG.objectif * 100) + '%'; });
  const ol = $('paliers'); ol.textContent = '';
  CONFIG.paliers.forEach(pl => {
    const li = document.createElement('li');
    if (t >= pl.montant) li.classList.add('done');
    if (pl.prio) li.classList.add('prio');
    li.innerHTML = '<span class="ico"></span><span class="nom"></span><span class="amt"></span>';
    li.querySelector('.ico').textContent = pl.ico;
    li.querySelector('.nom').textContent = pl.nom + ' ';
    if (pl.prio) { const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = 'priorité'; li.querySelector('.nom').append(tag); }
    li.querySelector('.amt').textContent = fmt(pl.montant) + ' €';
    ol.append(li);
  });
}
let totalConnu = 0;
async function totalN8n() {
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(CONFIG.n8n + '/cagnotte-total', { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.total === 'number' ? d : null;
  } catch { return null; } finally { clearTimeout(to); }
}
async function chargerTotal() {
  const n = await totalN8n();
  if (n) {
    totalConnu = n.total;
    if (n.maj) $('maj').textContent = 'Mis à jour le ' + new Date(n.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    return afficherJauge(totalConnu);
  }
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('total.json?t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(to);
    const d = await r.json();
    totalConnu = Number(d.total) || 0;
    if (d.maj) $('maj').textContent = 'Mis à jour le ' + new Date(d.maj).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  } catch { totalConnu = 0; }
  afficherJauge(totalConnu);
}

/* ---------- Parcours ---------- */
const etat = { prenom: '', montant: 0, moyen: '', notifie: false };
function aller(id) {
  ['s1', 's2', 's3', 's4'].forEach(s => { $(s).hidden = s !== id; });
  const idx = { s1: 0, s2: 1, s3: 2, s4: 3 }[id];
  document.querySelectorAll('.dots li').forEach((li, i) => {
    li.classList.toggle('on', i === idx); li.classList.toggle('ok', i < idx);
  });
  const f = $(id).querySelector('input, .chip, .pay__btn, .btn');
  if (f && id !== 's4') f.focus({ preventScroll: true });
}

$('s1').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('prenom').value.trim();
  $('err1').hidden = true; $('mom').hidden = true;
  if (!v) { $('err1').textContent = 'Il me faut ton prénom pour savoir qui remercier 😇'; $('err1').hidden = false; return; }
  if (estMaman(v)) { $('mom').hidden = false; $('mom').style.animation = 'none'; void $('mom').offsetWidth; $('mom').style.animation = ''; return; }
  etat.prenom = v.slice(0, 40);
  aller('s2');
});

function majMontant(v) {
  const n = Math.round(Number(String(v).replace(',', '.')) * 100) / 100;
  etat.montant = n;
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', Number(c.dataset.v) === n));
  const fun = $('fun');
  if (n >= 1 && n <= 500) {
    fun.textContent = phrase(n);
    fun.classList.remove('bump'); void fun.offsetWidth; fun.classList.add('bump');
  } else if (n > 500) fun.textContent = 'Wow. Au-delà de 500 €, appelle-moi directement, on en parle autour d\'un café ☕';
  else fun.textContent = 'Choisis un montant, je te dis ce qu\'il devient 👀';
}
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  $('montant').value = c.dataset.v; majMontant(c.dataset.v);
}));
$('montant').addEventListener('input', e => majMontant(e.target.value));
$('s2').addEventListener('submit', e => {
  e.preventDefault();
  $('err2').hidden = true;
  if (!(etat.montant >= 1 && etat.montant <= 500)) {
    $('err2').textContent = 'Un montant entre 1 et 500 €, s\'il te plaît.'; $('err2').hidden = false; return;
  }
  $('recap').innerHTML = '';
  $('recap').append(document.createTextNode('Tu envoies '), Object.assign(document.createElement('b'), { textContent: fmt(etat.montant) + ' €' }),
    document.createTextNode(' de la part de '), Object.assign(document.createElement('b'), { textContent: etat.prenom }), document.createTextNode('.'));
  preparerPaiements();
  aller('s3');
});
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => aller(b.dataset.back)));

/* ---------- Paiements ---------- */
function preparerPaiements() {
  const dispo = {
    paypal: !!CONFIG.paypalMe,
    lydia: !!(CONFIG.lydiaLien || CONFIG.lydiaNumero),
    wero: !!CONFIG.weroNumero,
  };
  document.querySelectorAll('.pay__btn').forEach(b => { b.hidden = !dispo[b.dataset.pay]; });
  const info = $('payinfo');
  info.hidden = true; info.textContent = '';
  if (!Object.values(dispo).some(Boolean)) {
    info.hidden = false;
    info.textContent = 'Les moyens de paiement arrivent très vite : Linéo est en train de les brancher (entre deux siestes). Reviens un peu plus tard 🙏';
  }
}

let totalServeur = null;
function notifier() {
  if (estMaman(etat.prenom)) return Promise.resolve();
  if (!etat.notifie) { etat.notifie = true; etat.envoi = envoyer(); }
  return etat.envoi;
}
async function envoyer() {
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(CONFIG.n8n + '/cagnotte-don', {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain' }, // requête simple : pas de pré-vol CORS
      body: JSON.stringify({ prenom: etat.prenom, montant: etat.montant, moyen: etat.moyen }),
    });
    clearTimeout(to);
    if (r.ok) { const d = await r.json(); if (typeof d.total === 'number') totalServeur = d.total; return; }
  } catch {}
  notifierSecours();
}
function notifierSecours() {
  const corps = {
    prenom: etat.prenom,
    montant: fmt(etat.montant) + ' €',
    moyen: etat.moyen,
    _subject: `💤 Cagnotte : ${etat.prenom} a mis ${fmt(etat.montant)} € via ${etat.moyen}`,
    _template: 'table',
    _captcha: 'false',
  };
  try {
    fetch('https://formsubmit.co/ajax/' + encodeURIComponent(CONFIG.notifEmail), {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corps),
    }).catch(() => {});
  } catch {}
}

function ligne(texte, cls) { const p = document.createElement('p'); if (cls) p.className = cls; p.textContent = texte; return p; }
function bouton(texte, ghost, onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (ghost ? ' btn--ghost' : '');
  b.textContent = texte; b.addEventListener('click', onClick); return b;
}
function copier(txt, btn) {
  const ok = () => { btn.textContent = 'Copié ✓'; setTimeout(() => (btn.textContent = 'Copier'), 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok, () => {});
}

document.querySelectorAll('.pay__btn').forEach(b => b.addEventListener('click', () => {
  etat.moyen = { paypal: 'PayPal', lydia: 'Lydia', wero: 'Wero' }[b.dataset.pay];
  const info = $('payinfo'); info.textContent = ''; info.hidden = false;
  const fini = bouton('C\'est envoyé 🎉', false, async () => {
    fini.disabled = true;
    await Promise.race([notifier(), new Promise(r => setTimeout(r, 4000))]);
    merci(); fini.disabled = false;
  });

  if (b.dataset.pay === 'paypal') {
    const url = `https://paypal.me/${encodeURIComponent(CONFIG.paypalMe)}/${etat.montant}EUR`;
    info.append(ligne('PayPal s\'ouvre avec le montant déjà rempli. Choisis « Entre proches » si on te le propose : pas de frais.'));
    info.append(bouton('Ouvrir PayPal →', false, () => { notifier(); window.open(url, '_blank', 'noopener'); }));
    const qr = document.createElement('img');
    qr.src = 'paypal-qr.png'; qr.alt = 'QR code PayPal de Linéo'; qr.className = 'qr'; qr.width = 180; qr.height = 180;
    info.append(ligne('Sur ordinateur ? Scanne ce QR code avec ton téléphone :', 'small qr-txt'), qr);
    info.append(fini);
  } else {
    const nom = etat.moyen;
    const lien = b.dataset.pay === 'lydia' ? CONFIG.lydiaLien : '';
    const num = b.dataset.pay === 'lydia' ? CONFIG.lydiaNumero : CONFIG.weroNumero;
    if (lien) {
      info.append(ligne(`Le lien ${nom} s'ouvre ; mets ${fmt(etat.montant)} € et ton prénom en message.`));
      info.append(bouton(`Ouvrir ${nom} →`, false, () => { notifier(); window.open(lien, '_blank', 'noopener'); }));
    }
    if (num) {
      info.append(ligne(`Dans ton appli ${nom === 'Wero' ? 'bancaire (Wero)' : 'Lydia'}, envoie ${fmt(etat.montant)} € à :`));
      info.append(ligne(num, 'num'));
      const c = bouton('Copier', true, () => { notifier(); copier(num, c); });
      info.append(c);
    }
    info.append(fini);
  }
  info.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}));

function merci() {
  $('thx-title').textContent = `Merci ${etat.prenom} !`;
  $('thx-fun').textContent = phrase(etat.montant);
  afficherJauge(totalServeur ?? (totalConnu + etat.montant));
  aller('s4');
  confettis();
}
$('again').addEventListener('click', () => {
  Object.assign(etat, { montant: 0, moyen: '', notifie: false, envoi: null }); totalServeur = null;
  $('montant').value = ''; majMontant('');
  afficherJauge(totalConnu);
  aller('s2');
});

/* ---------- Confettis ---------- */
function confettis() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('confetti'), ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
  const cols = ['#ffd96a', '#ff8fc7', '#7ef0c4', '#a99bff', '#ffffff'];
  const emo = ['💤', '⭐', '🛏️', '☁️'];
  const ps = Array.from({ length: 140 }, (_, i) => ({
    x: innerWidth / 2, y: innerHeight * .35,
    vx: (Math.random() - .5) * 14, vy: Math.random() * -14 - 4,
    r: Math.random() * 6 + 4, c: cols[i % cols.length], a: Math.random() * 6,
    e: i % 9 === 0 ? emo[i % emo.length] : null,
  }));
  let n = 0;
  (function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ps.forEach(p => {
      p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += .2;
      if (p.e) { ctx.font = '22px serif'; ctx.fillText(p.e, p.x, p.y); }
      else { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore(); }
    });
    if (++n < 180) requestAnimationFrame(tick); else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })();
}

chargerTotal();
