/* =============================================================================
   INTRO PIXEL-ART + COMPAGNON — Linéo Biribin
   ---------------------------------------------------------------------------
   Acte 1 (extérieur) : il rentre chez lui, arrivée tirée au sort (ponton,
   maison de gauche, maison de droite), il pousse la porte du bâtiment central.
   Acte 2 (intérieur, cutaway du studio) : il fait une activité tirée au sort
   parmi neuf — café, cuisine, télé, bureau, repassage, dodo, plantes, lecture,
   ménage. Une étiquette signale en permanence où il est et ce qu'il fait.
   Puis zoom, flash, et l'iris-wipe ouvre le site.
   Après l'intro, il se balade en bas de page et commente la section lue.

   Tout est dessiné au pixel dans un canvas 320x180 : art original, aucun asset
   tiers. La fonte 'Press Start 2P' n'ayant pas de majuscules accentuées
   (É devient é), les textes pixel restent en casse normale.

   Hooks de debug, sans effet de bord :
     ?nointro         -> saute l'intro
     ?introTime=2500  -> rend une seule image figée à 2500 ms
     ?act=tv          -> force une activité (voir ACTS)
     ?from=pier       -> force l'arrivée (pier | left | right)
   ========================================================================== */
(function () {
  'use strict';

  var W = 320, H = 180;
  var qs = new URLSearchParams(location.search);
  var FREEZE = qs.has('introTime') ? parseInt(qs.get('introTime'), 10) : null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- palette */
  var C = {
    grass:  '#4aa838', grassA: '#57b944', grassB: '#3d9330', grassC: '#2f7d28',
    flowerP:'#f28fb4', flowerW: '#fdfdf2', flowerY: '#f7d94c',
    dirt:   '#e0bd7f', dirtA: '#d0a869', dirtB: '#c0954f', dirtEdge: '#a2793f',
    water:  '#1e7ed2', waterA: '#2a91e8', waterB: '#1866b4', waterC: '#12518f',
    foam:   '#e6f5ff',
    rock:   '#8b5a33', rockA: '#a9744a', rockB: '#69431f', rockC: '#4e3016',
    trunk:  '#7a4b26', trunkA: '#5d3819',
    leaf:   '#2f8a33', leafA: '#46a844', leafB: '#1f6427', leafC: '#8ecf62',
    wall:   '#dfe7ec', wallA: '#f2f7fa', wallB: '#b3c2cc', wallC: '#8496a3',
    roofO:  '#ef7a1c', roofOA: '#ff9b3d', roofOB: '#c9550c', roofOC: '#9c3d06',
    roofB:  '#2f6ed0', roofBA: '#4a8ded', roofBB: '#1d4a9e',
    door:   '#8d5b2c', doorA: '#a6703c', doorB: '#5f3b18',
    glass:  '#a8dcff', glassA: '#d8f1ff', glassB: '#5aa9d8',
    frame:  '#ffffff', outline: '#2a2118',
    signBg: '#f4e6ad', signInk: '#c0392b',
    wood:   '#c69455', woodA: '#dcae6c', woodB: '#9a6c34', woodC: '#70491f',
    mailbox:'#d63a2b', mailboxA: '#f0574a', mailboxB: '#8f231a',
    shadow: 'rgba(0,0,0,.28)',
    emblem: '#1b2430', emblemA: '#ffffff', emblemB: '#3B82F6'
  };

  // Intérieur : beige chaud, plancher, et les accents du site (bleu, violet, vert).
  var I = {
    ceil:'#2a2118', ceilA:'#3a2e20',
    wall:'#d9c8ab', wallA:'#e7d9c1', wallB:'#c0ac8b', wallC:'#a08a68',
    base:'#7a5730', baseA:'#8f6a3c',
    floor:'#a9743e', floorA:'#bd8a52', floorB:'#8b5c2c', floorC:'#6f4720',
    metal:'#dfe6ea', metalB:'#a8b6bd', metalC:'#78868d',
    counter:'#cdb28c', counterB:'#a8886000', counterTop:'#8b6b45',
    stove:'#343a41', stoveB:'#22262b', burner:'#7d3325', flame:'#ffb03a', flameA:'#ffe08a',
    pot:'#8a939b', potB:'#5d666e', steam:'rgba(255,255,255,.55)',
    sofa:'#2f6ed0', sofaA:'#4a8ded', sofaB:'#1d4a9e',
    tv:'#1b1b24', tvB:'#0d0d13', screen:'#123047', screenA:'#3B82F6',
    desk:'#8b5a2b', deskA:'#a5703a', deskB:'#5f3b18',
    mon:'#15181f', monB:'#0a0c10',
    bed:'#8f6a3c', blanket:'#7c3fc4', blanketA:'#9333EA', blanketB:'#5a2a90',
    pillow:'#f2efe6', pillowB:'#cfc9ba',
    plant:'#22C55E', plantA:'#4ade80', plantB:'#15803d', pot2:'#b5643c',
    lamp:'#f7d94c', lampB:'#c9a92f',
    poster:'#2b3a4a', posterA:'#22C55E',
    board:'#e6e2d6', boardB:'#b9b3a3', iron:'#4a5058', ironA:'#7c848d',
    book:'#c0392b', bookA:'#e05c48',
    broom:'#c69455', broomA:'#8a6a3a',
    can:'#3f8fa8', canA:'#63b7cf',
    rug:'#b8493f', rugA:'#d4665a', rugB:'#8f342c',
    dark:'rgba(6,8,16,.55)'
  };

  function surface(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c: c, x: x };
  }
  function hash(x, y) {
    var n = (x | 0) * 374761393 + (y | 0) * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }
  function px(g, x, y, w, h, col) { g.fillStyle = col; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function disc(g, cx, cy, r, col) {
    g.fillStyle = col;
    var r2 = r * r;
    for (var dy = -r; dy <= r; dy++) {
      var span = Math.floor(Math.sqrt(Math.max(0, r2 - dy * dy)));
      if (span >= 0) g.fillRect((cx - span) | 0, (cy + dy) | 0, span * 2 + 1, 1);
    }
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ==========================================================================
     LE PERSONNAGE — cheveux longs bruns, veste noire, col blanc
     ========================================================================== */
  var SP = {
    '.': null,
    o: '#12101a', d: '#2b1d15', h: '#4b3527', H: '#6d4f36',
    s: '#f0b892', S: '#cf9068', j: '#20202a', J: '#14141c',
    w: '#eef0e8', p: '#2b2f3a', b: '#191922'
  };

  var UP = [
    '....dddddd....', '..ddhhhhhhdd..', '.dhhhhhhhhhhd.', '.dhhhHHHHhhhd.',
    '.dhhhhhhhhhhd.', '.dhhhhhhhhhhd.', 'ddhhhhhhhhhhdd', 'dhhhhhhhhhhhhd',
    'dhhhhhwwhhhhhd', 'ojjhhhwwhhhjjo', 'ojjjhhjjhhjjjo', '.ojjjjjjjjjjo.',
    '.oJjjjjjjjjJo.', '..ojjjjjjjjo..', '...oppppppo...', '...oppppppo...'
  ];
  var DOWN = [
    '....dddddd....', '..ddhhhhhhdd..', '.dhhhhhhhhhhd.', '.dhhhhhhhhhhd.',
    '.dhhssssssshd.', '.dhsssssssshd.', '.dhsoossoossd.', '.dhsssssssshd.',
    '.dhhsSssSshhd.', '..dhhsooshhd..', '..ddhhhhhhdd..', 'ojjhhhwwhhhjjo',
    'ojjjhwwwwhjjjo', '.ojjjwwwwjjjo.', '..ojjjjjjjjo..', '...oppppppo...'
  ];
  var SIDE = [
    '...dddddd.....', '..dhhhhhhd....', '.dhhhhhhhhd...', '.dhhhhhhssd...',
    '.dhhhhhsssd...', '.dhhhhhssSd...', '.dhhhhhhsdd...', '.ddhhhhwwo....',
    '..ojjhhwwjjo..', '..ojjjhwwjjo..', '..ojjjjwjjjo..', '..ojjjjjjjjo..',
    '...ojjjjjjo...', '...oppppppo...', '...oppppppo...', '...oppppppo...'
  ];
  var LEGS_FRONT = [
    ['...opp..ppo...', '...obb..bbo...', '....oo..oo....'],
    ['...oppppppo...', '...obbbbbbo...', '....oooooo....'],
    ['..oppo..oppo..', '..obbo..obbo..', '...oo....oo...']
  ];
  var LEGS_SIDE = [
    ['..opp...ppo...', '..obb...bbo...', '...oo...oo....'],
    ['...oppppppo...', '...obbbbbbo...', '....oooooo....'],
    ['.oppo...oppo..', '.obbo...obbo..', '..oo.....oo...']
  ];
  // Assis : cuisses tendues vers l'avant, mollets qui redescendent.
  var SIT = [
    '...dddddd.....', '..dhhhhhhd....', '.dhhhhhhhhd...', '.dhhhhhhssd...',
    '.dhhhhhsssd...', '.dhhhhhssSd...', '.dhhhhhhsdd...', '.ddhhhhwwo....',
    '..ojjhhwwjjo..', '..ojjjhwwjjo..', '..ojjjjwjjjo..', '..ojjjppppppo.',
    '..ojjjppppppo.', '...ooo...oppo.', '.........obbo.', '.........oooo.'
  ];
  var BODIES = { up: UP, down: DOWN, side: SIDE, sit: SIT };
  var LEGSETS = { up: LEGS_FRONT, down: LEGS_FRONT, side: LEGS_SIDE };

  var spriteCache = {};
  function sprite(dir, frame) {
    var key = dir + frame;
    if (spriteCache[key]) return spriteCache[key];
    var rows = LEGSETS[dir] ? BODIES[dir].concat(LEGSETS[dir][frame]) : BODIES[dir];
    var s = surface(14, rows.length);
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var col = SP[rows[y][x]];
        if (col) px(s.x, x, y, 1, 1, col);
      }
    }
    spriteCache[key] = s.c;
    return s.c;
  }
  function blit(g, img, cx, feetY, flip) {
    var dx = Math.round(cx - img.width / 2), dy = Math.round(feetY - img.height + 1);
    if (flip) {
      g.save(); g.translate(dx + img.width, dy); g.scale(-1, 1);
      g.drawImage(img, 0, 0); g.restore();
    } else {
      g.drawImage(img, dx, dy);
    }
  }
  var CYCLE = [0, 1, 2, 1];
  function hero(g, x, y, dir, frame, flip, noShadow) {
    if (!noShadow) {
      px(g, x - 5, y - 2, 11, 3, C.shadow);
      px(g, x - 6, y - 1, 13, 1, C.shadow);
    }
    blit(g, sprite(dir, CYCLE[frame % 4]), x, y, flip);
  }

  /* ==========================================================================
     LE COMPAGNON — il se balade en bas de page et commente la section lue
     ========================================================================== */
  function startWalker() {
    if (reduce) return;
    var el = document.getElementById('buddy');
    var cv = document.getElementById('buddy-canvas');
    var bubble = document.getElementById('buddy-bubble');
    var ping = document.getElementById('buddy-ping');
    if (!el || !cv || !bubble) return;

    var g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    var CW = cv.width, CH = cv.height, FEET = CH - 1, CX = 20;

    /* ------------------------------------------------- ce qu'il raconte */
    var SAY = {
      hero: ['Salut ! Fais comme chez toi.',
             'Tout ce qui est \u00e9crit ici tourne vraiment.',
             'Le CV est en haut, en PDF.'],
      projets: ['Une centaine de flux tournent l\u00e0-dedans.',
                '51 de ces workflows sont en open source.',
                'Les cartes \u00ab en ligne \u00bb sont cliquables.'],
      parcours: ['Depuis mars 2026 : paie, DSN, DPAE, conformit\u00e9.',
                 'Du cadrage \u00e0 la mise en production.',
                 'Moins de 1 % d\u2019\u00e9cart sur le bulletin de r\u00e9f\u00e9rence.'],
      profil: ['Mon m\u00e9tier : cadrer, sp\u00e9cifier, recetter.',
               'Les agents \u00e9crivent le code. Moi je le v\u00e9rifie.',
               'Validation humaine avant tout envoi. Toujours.'],
      competences: ['n8n, MCP, Claude, Postgres, Docker...',
                    'Et la paie, la DSN, la convention de l\u2019int\u00e9rim.',
                    'Relire et recetter, pas \u00e9crire.'],
      contact: ['\u00c9cris-moi, je r\u00e9ponds vite.',
                'Pr\u00e9avis d\u2019un mois. Tout type de contrat.',
                'Nogent-sur-Marne, et France enti\u00e8re.']
    };
    var said = {};

    /* ------------------------------- ce qu'il fait, comme s'il etait chez lui */
    function mug(x, y) {
      px(g, x, y, 6, 6, '#e8e8f0'); px(g, x + 1, y + 1, 4, 4, '#f7f4e6');
      px(g, x + 1, y + 1, 4, 1, '#8a5a2b'); px(g, x + 6, y + 2, 2, 1, '#c9c9d4');
      px(g, x + 7, y + 2, 1, 2, '#c9c9d4'); px(g, x + 6, y + 4, 2, 1, '#c9c9d4');
    }
    function smoke(x, y, t, n) {
      for (var i = 0; i < n; i++) {
        var k = ((t / 1100) + i / n) % 1;
        g.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - k)) + ')';
        g.fillRect((x + Math.sin(k * 6.283 + i) * 2) | 0, (y - k * 9) | 0, 1, 1);
      }
    }
    var ACTIVITIES = [
      { key: 'cafe', dur: 7000, pose: 'down', say: 'Pause caf\u00e9. Tu veux quelque chose ?',
        draw: function (t) { mug(28, FEET - 9); smoke(31, FEET - 12, t, 3); } },
      { key: 'lecture', dur: 8000, pose: 'down', say: 'Deux pages, et je reviens.',
        draw: function (t) {
          var k = Math.floor(t / 1400) % 2;
          px(g, 25, FEET - 12, 12, 9, '#c0392b');
          px(g, 26, FEET - 11, 10, 7, '#f7f4e6');
          px(g, 30 + k, FEET - 11, 1, 7, '#c0392b');
          px(g, 27, FEET - 9, 3, 1, '#9aa0a6'); px(g, 32, FEET - 7, 3, 1, '#9aa0a6');
        } },
      { key: 'balai', dur: 7000, pose: 'side', say: 'Un coup de balai, \u00e7a ne se fait pas tout seul.',
        draw: function (t) {
          var k = Math.sin(t / 300), bx = 30 + Math.round(k * 3);
          px(g, bx, FEET - 17, 2, 14, '#8a6a3a');
          px(g, bx - 3, FEET - 4, 8, 4, '#c69455');
          px(g, bx - 3, FEET - 1, 8, 1, '#8a6a3a');
          for (var i = 0; i < 3; i++) {
            px(g, bx + 6 + i * 3, FEET - 2 - Math.abs(Math.round(Math.sin(t / 170 + i) * 2)), 1, 1, '#6b7280');
          }
        } },
      { key: 'arrosage', dur: 7000, pose: 'side', say: 'Les plantes aussi ont un planning.',
        draw: function (t) {
          px(g, 27, FEET - 11, 9, 6, '#3f8fa8');
          px(g, 28, FEET - 10, 7, 4, '#63b7cf');
          px(g, 35, FEET - 10, 4, 2, '#3f8fa8');
          for (var i = 0; i < 4; i++) {
            var k = ((t / 220) + i * 0.25) % 1;
            px(g, 38 + Math.round(k * 2), FEET - 8 + Math.round(k * 7), 1, 2, '#8fd4ff');
          }
          px(g, 34, FEET - 3, 10, 3, '#b5643c');
          disc(g, 39, FEET - 7, 4, '#15803d');
          disc(g, 38, FEET - 8, 3, '#22C55E');
        } },
      { key: 'dodo', dur: 9000, pose: 'sit', say: 'Cinq minutes, pas plus...',
        draw: function (t) { zzz(g, 27, FEET - 22, Math.floor(t / 700) % 3); } },
      { key: 'repassage', dur: 8000, pose: 'down', say: 'Une chemise pour demain.',
        draw: function (t) {
          px(g, 24, FEET - 9, 16, 3, '#b9b3a3');
          px(g, 24, FEET - 9, 16, 1, '#e6e2d6');
          px(g, 26, FEET - 6, 2, 6, '#78868d'); px(g, 36, FEET - 6, 2, 6, '#78868d');
          var ix = 27 + Math.round((Math.sin(t / 380) * 0.5 + 0.5) * 8);
          px(g, ix, FEET - 13, 7, 4, '#4a5058');
          px(g, ix + 1, FEET - 13, 5, 1, '#7c848d');
          smoke(ix + 3, FEET - 16, t, 2);
        } }
    ];

    /* ------------------------------------------------------------- etat */
    var x = 24, dir = 1, tx = null;
    var mode = 'wait', act = null, frame = 0, tFrame = 0;
    var timer = 1800, talkUntil = 0, last = 0;
    var SPEED = 30;

    // largeur reelle de l'element : il est deux fois plus petit sur telephone
    function maxX() {
      var w = el.offsetWidth || CW * 3;
      return Math.max(12, window.innerWidth - w - 12);
    }

    function say(text, ms) {
      bubble.textContent = text;
      var rel = (x + el.offsetWidth / 2) / window.innerWidth;
      bubble.classList.toggle('right', rel > 0.58);
      bubble.classList.toggle('left', rel < 0.34);
      el.classList.add('talk');
      talkUntil = performance.now() + (ms || 4600);
    }
    function section() {
      if (window.scrollY < window.innerHeight * 0.55) return 'hero';
      var mid = window.scrollY + window.innerHeight / 2, best = 'hero';
      var secs = document.querySelectorAll('section[id]');
      for (var i = 0; i < secs.length; i++) {
        if (mid >= secs[i].offsetTop && mid <= secs[i].offsetTop + secs[i].offsetHeight) best = secs[i].id;
      }
      return SAY[best] ? best : 'projets';
    }
    function talk() {
      var k = section(), lines = SAY[k];
      said[k] = (said[k] == null ? 0 : (said[k] + 1) % lines.length);
      say(lines[said[k]]);
    }
    function goWalk() {
      mode = 'walk';
      act = null;
      tx = 16 + Math.random() * (maxX() - 16);
      if (Math.abs(tx - x) < 90) tx = x + (tx > x ? 140 : -140);
      tx = Math.max(16, Math.min(maxX(), tx));
      dir = tx > x ? 1 : -1;
    }
    function arrive() {                          // l'indicateur : il vient d'arriver
      mode = 'ping';
      timer = 950;
      if (ping) ping.classList.add('on');
    }
    function startAct() {
      if (ping) ping.classList.remove('on');
      act = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
      mode = 'act';
      timer = act.dur;
      if (Math.random() < 0.75) say(act.say, 4800);
    }

    cv.addEventListener('click', talk);
    el.addEventListener('click', talk);
    var pdfs = document.querySelectorAll('a[href$=".pdf"]');
    for (var pi = 0; pi < pdfs.length; pi++) {
      pdfs[pi].addEventListener('click', function () { say('Bonne lecture !', 5200); });
    }

    function step(now) {
      if (!last) last = now;
      var dt = Math.min(64, now - last);
      last = now;
      if (talkUntil && now > talkUntil) { el.classList.remove('talk'); talkUntil = 0; }

      if (mode === 'walk') {
        var d = tx - x, move = SPEED * dt / 1000;
        if (Math.abs(d) <= move) { x = tx; arrive(); }
        else x += (d > 0 ? 1 : -1) * move;
        tFrame += dt;
        if (tFrame > 165) { tFrame = 0; frame++; }
      } else {
        timer -= dt;
        frame = 1;
        if (timer <= 0) {
          if (mode === 'ping') startAct();
          else goWalk();
        }
      }

      x = Math.max(16, Math.min(maxX(), x));
      el.style.transform = 'translate3d(' + Math.round(x) + 'px,0,0)';

      render(now);
      requestAnimationFrame(step);
    }

    // dessin d'une image : appele aussi une fois tout de suite, pour ne jamais
    // laisser un canvas vide si rAF est bride (onglet en arriere-plan, headless)
    function render(now) {
      g.clearRect(0, 0, CW, CH);
      var pose = mode === 'walk' ? 'side' : (act ? act.pose : 'down');
      if (act && mode === 'act' && act.key === 'dodo') {
        blit(g, sprite('sit', 0), CX, FEET, false);
      } else {
        blit(g, sprite(pose, CYCLE[frame % 4]), CX, FEET, mode === 'walk' && dir < 0);
      }
      if (act && mode === 'act') act.draw(now);
    }

    el.classList.add('on');
    setTimeout(function () { say('Je suis l\u00e0, en bas. Clique sur moi.', 5400); }, 1500);
    goWalk();
    el.style.transform = 'translate3d(' + Math.round(x) + 'px,0,0)';
    render(0);
    requestAnimationFrame(step);
  }

  /* ==========================================================================
     BOOTSTRAP
     ========================================================================== */
  var root = document.getElementById('intro');
  var playIntro = !!root && !reduce && !qs.has('nointro');

  if (!playIntro) {
    if (root) root.remove();
    if (typeof window.__openIris === 'function') window.__openIris();
    if (document.readyState === 'complete') setTimeout(startWalker, 600);
    else window.addEventListener('load', function () { setTimeout(startWalker, 600); });
    return;
  }

  var view = document.getElementById('intro-canvas');
  var ctx = view.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  var ext = surface(W, H);        // extérieur (eau laissée transparente)
  var int1 = surface(W, H);       // intérieur, plan arrière
  var int2 = surface(W, H);       // intérieur, avant-plan (devant le personnage)

  /* ==========================================================================
     ACTE 1 — EXTÉRIEUR
     ========================================================================== */
  var shore = new Int16Array(W);
  for (var sx = 0; sx < W; sx++) {
    var base = 122 + 16 * (sx / W) + Math.sin(sx / 26) * 1.6 + Math.sin(sx / 9) * 0.8;
    if (sx > 46 && sx < 84) base = 125;
    shore[sx] = Math.round(base);
  }

  var PATHS = [
    { x: 14, y: 100, w: 292, h: 14 },
    { x: 57, y: 76, w: 9, h: 26 },
    { x: 153, y: 82, w: 15, h: 20 },
    { x: 258, y: 76, w: 9, h: 26 },
    { x: 56, y: 112, w: 17, h: 16 }
  ];
  var dirt = new Uint8Array(W * H);

  function markDirt() {
    for (var i = 0; i < PATHS.length; i++) {
      var p = PATHS[i];
      for (var y = p.y; y < p.y + p.h; y++) {
        if (y < 0 || y >= H) continue;
        for (var x = p.x; x < p.x + p.w; x++) {
          if (x >= 0 && x < W && y < shore[x]) dirt[y * W + x] = 1;
        }
      }
    }
  }
  function drawGrass(g) {
    for (var x = 0; x < W; x++) px(g, x, 0, 1, shore[x], C.grass);
    for (var y = 0; y < H; y++) {
      for (var x2 = 0; x2 < W; x2++) {
        if (y >= shore[x2] || dirt[y * W + x2]) continue;
        var r = hash(x2, y);
        if (r > 0.965) px(g, x2, y, 2, 1, C.grassA);
        else if (r > 0.94) px(g, x2, y, 1, 1, C.grassB);
        else if (r > 0.933) px(g, x2, y, 2, 1, C.grassC);
      }
    }
    for (var i = 0; i < 105; i++) {
      var fx = Math.floor(hash(i * 7 + 3, 11) * W), fy = Math.floor(hash(i * 13 + 5, 29) * H);
      if (fy >= shore[fx] - 2 || dirt[fy * W + fx] || fy < 18) continue;
      var p2 = hash(i, 71);
      px(g, fx, fy, 2, 2, p2 > 0.62 ? C.flowerW : (p2 > 0.14 ? C.flowerP : C.flowerY));
    }
  }
  function drawDirt(g) {
    function at(x, y) { return (x < 0 || x >= W || y < 0 || y >= H) ? 0 : dirt[y * W + x]; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (!dirt[y * W + x]) continue;
      var r = hash(x * 3, y * 5);
      px(g, x, y, 1, 1, r > 0.9 ? C.dirtB : (r > 0.72 ? C.dirtA : C.dirt));
    }
    for (var y2 = 0; y2 < H; y2++) for (var x2 = 0; x2 < W; x2++) {
      if (!dirt[y2 * W + x2]) continue;
      if (!at(x2 - 1, y2) || !at(x2 + 1, y2) || !at(x2, y2 - 1) || !at(x2, y2 + 1)) px(g, x2, y2, 1, 1, C.dirtEdge);
    }
  }
  function drawCliff(g) {
    for (var x = 0; x < W; x++) {
      var sy = shore[x], depth = 7 + Math.round(hash(x, 3) * 3);
      for (var d = 0; d < depth; d++) {
        var y = sy - depth + d;
        if (y < 0) continue;
        var r = hash(x * 2, y * 3);
        px(g, x, y, 1, 1, d < 2 ? (r > 0.5 ? C.rockA : C.rock)
          : (d > depth - 3 ? (r > 0.6 ? C.rockC : C.rockB) : (r > 0.62 ? C.rockA : C.rock)));
      }
      px(g, x, sy - 1, 1, 1, C.rockC);
    }
  }
  function tree(g, cx, by, s) {
    var th = s === 2 ? 6 : 4;
    px(g, cx - 1, by - th, 3, th, C.trunk);
    px(g, cx + 1, by - th, 1, th, C.trunkA);
    var r = s === 2 ? 9 : 7, cy = by - th - r + 2;
    disc(g, cx, cy, r, C.leafB);
    disc(g, cx, cy - 1, r - 1, C.leaf);
    disc(g, cx - 2, cy - 3, r - 3, C.leafA);
    disc(g, cx - 3, cy - 4, Math.max(2, r - 5), C.leafC);
  }
  function window4(g, x, y) {
    px(g, x - 1, y - 1, 10, 9, C.frame);
    px(g, x, y, 8, 7, C.glass);
    px(g, x, y, 4, 3, C.glassA);
    px(g, x + 4, y + 3, 4, 4, C.glassB);
    px(g, x + 3, y, 1, 7, C.frame);
    px(g, x, y + 3, 8, 1, C.frame);
    px(g, x - 1, y + 8, 10, 1, C.wallC);
  }
  function doorFlat(g, x, y, w, h) {
    px(g, x, y, w, h, C.doorB);
    px(g, x + 1, y + 1, w - 2, h - 1, C.door);
    px(g, x + 1, y + 1, 2, h - 1, C.doorA);
    px(g, x + w - 3, y + Math.floor(h / 2), 1, 1, C.signBg);
  }
  function roof(g, x, y, w, h, c1, c2, c3) {
    var inset = 7;
    for (var i = 0; i < h; i++) {
      var k = i / (h - 1), off = Math.round(inset * (1 - k)), xx = x + off, ww = w - off * 2;
      px(g, xx, y + i, ww, 1, i % 3 === 2 ? c3 : (i % 2 ? c2 : c1));
      px(g, xx, y + i, 1, 1, c3);
      px(g, xx + ww - 1, y + i, 1, 1, c3);
    }
    px(g, x + inset, y, w - inset * 2, 2, c3);
    px(g, x + inset + 1, y + 1, w - inset * 2 - 2, 1, c2);
    for (var v = 4; v < w - 4; v += 6) {
      var top = Math.round(h * 0.35);
      px(g, x + v, y + top, 1, h - top - 1, c3);
    }
    px(g, x, y + h - 2, w, 2, c3);
    px(g, x + 1, y + h - 2, w - 2, 1, c1);
  }
  function house(g, x, y, w, h, kind) {
    var c1 = kind === 'blue' ? C.roofB : C.roofO;
    var c2 = kind === 'blue' ? C.roofBA : C.roofOA;
    var c3 = kind === 'blue' ? C.roofBB : C.roofOB;
    px(g, x, y, w, h, C.outline);
    px(g, x + 1, y + 1, w - 2, h - 2, C.wall);
    px(g, x + 1, y + 1, w - 2, 2, C.wallC);
    px(g, x + 1, y + 3, w - 2, 2, C.wallA);
    px(g, x + 1, y + h - 4, w - 2, 3, C.wallB);
    px(g, x + 1, y + h - 2, w - 2, 1, C.wallC);
    px(g, x + 1, y + 1, 2, h - 2, C.wallB);
    px(g, x + w - 3, y + 1, 2, h - 2, C.wallB);
    for (var l = 6; l < h - 5; l += 4) px(g, x + 1, y + l, w - 2, 1, C.wallB);
    roof(g, x - 5, y - 17, w + 10, 18, c1, c2, c3);
    var dw = 9, dh = 12, dx = x + Math.floor(w / 2) - Math.floor(dw / 2);
    doorFlat(g, dx, y + h - dh, dw, dh);
    window4(g, x + 6, y + h - 20);
    window4(g, x + w - 15, y + h - 20);
    px(g, x, y + h - 1, w, 1, C.outline);
  }
  function emblem(g, cx, cy) {
    disc(g, cx, cy, 9, C.wallB);
    disc(g, cx, cy, 8, C.outline);
    disc(g, cx, cy, 7, C.emblem);
    px(g, cx - 4, cy - 2, 9, 1, C.emblemA);
    px(g, cx, cy - 2, 1, 6, C.emblemA);
    px(g, cx - 5, cy - 3, 3, 3, C.emblemB);
    px(g, cx + 3, cy - 3, 3, 3, C.emblemB);
    px(g, cx - 1, cy + 3, 3, 3, C.emblemB);
  }
  // Police 4x5 : en 3 de large, le N n'a pas la place de sa diagonale et se lit M.
  var GLYPH = {
    L: ['1000', '1000', '1000', '1000', '1111'], I: ['0100', '0100', '0100', '0100', '0100'],
    N: ['1001', '1101', '1011', '1001', '1001'], E: ['1111', '1000', '1110', '1000', '1111'],
    É: ['1111', '1000', '1110', '1000', '1111'], O: ['1111', '1001', '1001', '1001', '1111'],
    ' ': ['0000', '0000', '0000', '0000', '0000']
  };
  function tinyText(g, str, x, y, col) {
    for (var i = 0; i < str.length; i++) {
      var rows = GLYPH[str[i]];
      if (!rows) continue;
      for (var r = 0; r < 5; r++) for (var c = 0; c < 4; c++) {
        if (rows[r][c] === '1') px(g, x + i * 5 + c, y + r, 1, 1, col);
      }
      if (str[i] === 'É') {                       // accent aigu, au-dessus de la capitale
        px(g, x + i * 5 + 1, y - 2, 1, 1, col);
        px(g, x + i * 5 + 2, y - 3, 1, 1, col);
      }
    }
  }
  var doorPos = { x: 160, y: 80 };
  function centerBuilding(g, x, y, w, h) {
    px(g, x, y, w, h, C.outline);
    px(g, x + 1, y + 1, w - 2, h - 2, C.wall);
    px(g, x + 1, y + 1, w - 2, 2, C.wallC);
    px(g, x + 1, y + 3, w - 2, 2, C.wallA);
    px(g, x + 1, y + 1, 2, h - 2, C.wallB);
    px(g, x + w - 3, y + 1, 2, h - 2, C.wallB);
    for (var l = 6; l < h - 6; l += 5) px(g, x + 1, y + l, w - 2, 1, C.wallB);
    px(g, x + 4, y + 6, w - 8, 8, C.outline);
    px(g, x + 5, y + 7, w - 10, 6, C.glass);
    px(g, x + 5, y + 7, w - 10, 2, C.glassA);
    for (var m = x + 8; m < x + w - 8; m += 6) px(g, m, y + 7, 1, 6, C.frame);

    var rx = x - 6, ry = y - 21, rw = w + 12, rh = 21;
    px(g, rx, ry, rw, rh, C.roofOB);
    px(g, rx + 1, ry + 1, rw - 2, rh - 3, C.roofO);
    px(g, rx, ry, 3, 1, C.grass); px(g, rx, ry + 1, 1, 1, C.grass);
    px(g, rx + rw - 3, ry, 3, 1, C.grass); px(g, rx + rw - 1, ry + 1, 1, 1, C.grass);
    px(g, rx + 4, ry + 4, rw - 8, 12, C.roofOC);
    px(g, rx + 5, ry + 5, rw - 10, 10, C.roofOA);
    for (var s2 = rx + 8; s2 < rx + rw - 6; s2 += 5) px(g, s2, ry + 5, 1, 10, C.roofO);
    px(g, rx, ry + rh - 3, rw, 3, C.roofOC);
    px(g, rx + 1, ry + rh - 3, rw - 2, 1, C.roofOB);

    emblem(g, x + Math.floor(w / 2), y + 1);
    // Enseigne : cale entre la vitrine et la porte, qui est dessinee apres et
    // rognerait le panneau. 1 px de mur de chaque cote, le nom ne touche rien.
    var sw = 56, sx2 = x + Math.floor(w / 2) - sw / 2, sy2 = y + 16;
    var txt = 'LINÉO', txtW = txt.length * 5 - 1;
    px(g, sx2 - 1, sy2 - 1, sw + 2, 11, C.outline);
    px(g, sx2, sy2, sw, 9, C.signBg);
    px(g, sx2, sy2, sw, 1, '#fff8dc');
    tinyText(g, txt, sx2 + Math.round((sw - txtW) / 2), sy2 + 3, C.signInk);

    var dw = 18, dx = x + Math.floor(w / 2) - dw / 2, dh = 14;
    px(g, dx - 1, y + h - dh - 1, dw + 2, dh + 1, C.outline);
    px(g, dx, y + h - dh, dw, dh, '#20303c');
    px(g, dx + 1, y + h - dh + 1, 7, dh - 2, '#2c4657');
    px(g, dx + dw - 8, y + h - dh + 1, 7, dh - 2, '#2c4657');
    px(g, dx + dw / 2 - 1, y + h - dh, 2, dh, C.wallC);
    px(g, dx - 4, y + h - 1, dw + 8, 2, C.wallB);
    px(g, dx - 6, y + h + 1, dw + 12, 2, C.wallC);
    return { x: dx + dw / 2, y: y + h, w: dw, top: y + h - dh };
  }
  function pier(g) {
    var x0 = 56, x1 = 73, top = 122, bot = 176;
    for (var y = top; y < bot; y++) {
      var r = hash(y, 7);
      px(g, x0, y, x1 - x0, 1, (y - top) % 4 === 0 ? C.woodB : (r > 0.6 ? C.woodA : C.wood));
    }
    px(g, x0 - 1, top, 1, bot - top, C.woodC);
    px(g, x1, top, 1, bot - top, C.woodC);
    var posts = [[x0 - 3, 140], [x1 + 1, 140], [x0 - 3, 168], [x1 + 1, 168]];
    for (var i = 0; i < posts.length; i++) {
      px(g, posts[i][0], posts[i][1], 4, 12, C.woodC);
      px(g, posts[i][0], posts[i][1], 4, 2, C.woodA);
      px(g, posts[i][0] + 1, posts[i][1] + 2, 2, 10, C.woodB);
    }
  }
  function mailbox(g, x, y) {
    px(g, x + 1, y, 2, 7, C.woodB);
    px(g, x - 2, y - 6, 8, 6, C.mailboxB);
    px(g, x - 1, y - 5, 6, 4, C.mailbox);
    px(g, x - 1, y - 5, 6, 1, C.mailboxA);
    px(g, x + 4, y - 4, 2, 1, C.wallA);
  }
  function buildExterior() {
    var g = ext.x;
    g.clearRect(0, 0, W, H);
    markDirt();
    drawGrass(g); drawDirt(g); drawCliff(g); pier(g);
    house(g, 26, 40, 70, 36, 'orange');
    doorPos = centerBuilding(g, 116, 40, 88, 42);       // plus grand : le nom respire
    house(g, 228, 40, 70, 36, 'blue');
    mailbox(g, 222, 74);
    var trees = [
      [16, 34, 1], [100, 50, 1], [104, 74, 1], [220, 50, 1], [308, 38, 1],
      [100, 98, 1], [118, 100, 2], [136, 98, 1], [178, 100, 2], [196, 98, 1],
      [210, 100, 1], [42, 96, 1], [22, 100, 1], [284, 98, 2], [302, 100, 1],
      [92, 128, 1], [108, 132, 2], [130, 130, 1], [216, 132, 2], [238, 136, 1],
      [258, 134, 2], [280, 140, 1], [300, 144, 1], [12, 118, 1]
    ];
    for (var i = 0; i < trees.length; i++) {
      if (trees[i][1] > shore[trees[i][0]] - 2) continue;
      tree(g, trees[i][0], trees[i][1], trees[i][2]);
    }
  }
  function drawWater(g, t) {
    for (var x = 0; x < W; x++) {
      var sy = shore[x];
      px(g, x, sy, 1, H - sy, C.water);
      if (sy < H - 30) px(g, x, sy + 26, 1, H - sy - 26, C.waterB);
      if (sy < H - 52) px(g, x, sy + 48, 1, H - sy - 48, C.waterC);
    }
    for (var i = 0; i < 120; i++) {
      var wy = 118 + ((i * 13) % 62), speed = 8 + (i % 5) * 4;
      var wx = ((i * 47) + t * speed / 1000 * 12) % (W + 30) - 15, len = 5 + (i % 4) * 4;
      if (wy < shore[Math.max(0, Math.min(W - 1, wx | 0))] + 2) continue;
      px(g, wx, wy, len, 1, i % 3 ? C.waterA : C.foam);
    }
    var ph = (t / 900) % 1;
    for (var x2 = 0; x2 < W; x2++) {
      var sy2 = shore[x2];
      var wave = Math.sin(x2 / 7 + ph * 6.283) * 0.5 + Math.sin(x2 / 3.1) * 0.5;
      if (wave > -0.1) {
        px(g, x2, sy2, 1, 1, C.foam);
        if (wave > 0.75) px(g, x2, sy2 + 1, 1, 1, C.foam);
      } else px(g, x2, sy2, 1, 1, C.waterA);
    }
  }

  /* ==========================================================================
     ACTE 2 — INTÉRIEUR (cutaway du studio)
     ========================================================================== */
  var FLOOR = 100;                       // ligne mur / plancher
  var LANE = 134;                        // hauteur des pieds quand il marche
  var IS = 2;                            // à l'intérieur, le personnage est dessiné 2x
                                         // (sinon les meubles font deux têtes de haut)

  function blitBig(g, img, cx, feetY, flip) {
    var w = img.width * IS, h = img.height * IS;
    var dx = Math.round(cx - w / 2), dy = Math.round(feetY - h + IS);
    g.save();
    if (flip) { g.translate(dx + w, dy); g.scale(-IS, IS); }
    else { g.translate(dx, dy); g.scale(IS, IS); }
    g.drawImage(img, 0, 0);
    g.restore();
  }
  function heroBig(g, x, y, dir, frame, flip) {
    px(g, x - 9, y - 3, 19, 4, C.shadow);
    px(g, x - 11, y - 1, 23, 2, C.shadow);
    blitBig(g, sprite(dir, CYCLE[frame % 4]), x, y, flip);
  }

  // La plante passe devant le lit. Les scenes qui repeignent le lit par-dessus
  // le decor doivent donc la repasser ensuite, sinon son feuillage est tronque.
  function houseplant(g) {
    px(g, 292, 114, 16, 12, I.pot2);
    px(g, 293, 115, 14, 10, '#8a4a2c');
    disc(g, 300, 106, 8, I.plantB);
    disc(g, 299, 104, 6, I.plant);
    disc(g, 297, 102, 4, I.plantA);
    px(g, 300, 108, 1, 7, I.plantB);
  }

  function buildInterior() {
    var g = int1.x, f = int2.x;
    g.clearRect(0, 0, W, H); f.clearRect(0, 0, W, H);

    // ------------------------------------------------- plafond, mur, plancher
    px(g, 0, 0, W, 8, I.ceil);
    px(g, 0, 6, W, 2, I.ceilA);
    px(g, 0, 8, W, FLOOR - 8, I.wall);
    for (var x = 0; x < W; x += 2) {
      for (var y = 10; y < FLOOR; y += 2) {
        if (hash(x, y) > 0.9) px(g, x, y, 1, 1, I.wallA);
        else if (hash(x + 1, y) > 0.95) px(g, x, y, 1, 1, I.wallB);
      }
    }
    px(g, 0, FLOOR - 3, W, 3, I.base);
    px(g, 0, FLOOR - 3, W, 1, I.baseA);

    // parquet : lames horizontales, veines, joints decales
    px(g, 0, FLOOR, W, H - FLOOR, I.floor);
    for (var yb = FLOOR; yb < H; yb += 6) {
      var t1 = hash(0, yb), tint = t1 > 0.62 ? I.floorA : (t1 > 0.3 ? I.floor : I.floorB);
      px(g, 0, yb, W, 6, tint);
      px(g, 0, yb, W, 1, I.floorC);
      for (var gr = 0; gr < 46; gr++) {
        px(g, Math.floor(hash(gr, yb) * W), yb + 1 + Math.floor(hash(gr + 7, yb) * 4),
           2 + Math.floor(hash(gr, yb + 3) * 7), 1,
           hash(gr, yb + 1) > 0.5 ? I.floorA : I.floorB);
      }
      var off = (Math.floor((yb - FLOOR) / 6) % 2) ? 32 : 0;
      for (var sj = off; sj < W; sj += 64) px(g, sj, yb, 1, 6, I.floorC);
    }
    g.fillStyle = 'rgba(247,217,76,.06)';
    g.beginPath(); g.moveTo(106, 26); g.lineTo(120, 26);
    g.lineTo(152, H); g.lineTo(74, H);
    g.closePath(); g.fill();

    // ---------------------------------------------------------- porte d'entree
    px(g, 4, 48, 34, 4, I.wallC);
    px(g, 6, 52, 30, 48, I.deskB);
    px(g, 7, 53, 28, 47, I.desk);
    px(g, 9, 55, 24, 43, I.deskA);
    px(g, 9, 55, 24, 2, I.deskB);
    px(g, 30, 76, 3, 3, I.lamp);
    px(g, 2, 98, 38, 2, I.baseA);

    // ---------------------------------------------------------------- cuisine
    px(g, 44, 24, 54, 20, I.wallC);
    px(g, 45, 25, 52, 18, I.counter);
    px(g, 45, 25, 52, 2, I.wallA);
    px(g, 70, 25, 2, 18, I.counterTop);
    px(g, 52, 34, 8, 2, I.metalB); px(g, 82, 34, 8, 2, I.metalB);
    px(g, 40, 76, 62, 4, I.counterTop);
    px(g, 40, 80, 62, 20, I.wallB);
    px(g, 41, 81, 60, 19, I.counter);
    px(g, 44, 84, 16, 13, I.counterTop);
    px(g, 62, 84, 16, 13, I.counterTop);
    px(g, 80, 84, 18, 13, I.counterTop);
    px(g, 50, 89, 4, 1, I.metalB); px(g, 68, 89, 4, 1, I.metalB); px(g, 87, 89, 4, 1, I.metalB);
    px(g, 42, 76, 14, 4, I.metalB);
    px(g, 44, 77, 10, 2, I.metalC);
    px(g, 48, 70, 1, 7, I.metalC); px(g, 48, 70, 4, 1, I.metalC);
    px(g, 72, 75, 24, 5, I.stove);
    px(g, 74, 76, 8, 3, I.stoveB); px(g, 85, 76, 8, 3, I.stoveB);
    px(g, 72, 80, 24, 2, I.stoveB);
    px(g, 58, 62, 12, 14, I.stove);
    px(g, 59, 63, 10, 6, I.metalC);
    px(g, 60, 70, 8, 5, I.stoveB);
    px(g, 62, 72, 4, 3, I.metal);

    // ------------------------------------------------------------------ frigo
    px(g, 104, 52, 22, 48, I.metalC);
    px(g, 105, 53, 20, 46, I.metal);
    px(g, 105, 70, 20, 1, I.metalB);
    px(g, 122, 58, 2, 7, I.metalC); px(g, 122, 74, 2, 7, I.metalC);
    px(g, 108, 56, 7, 4, I.posterA);
    px(g, 108, 77, 5, 3, I.screenA);

    // --------------------------------------------------- plafonnier + horloge
    px(g, 112, 8, 1, 12, I.ceilA);
    px(g, 106, 20, 13, 4, I.stove);
    px(g, 108, 24, 9, 2, I.lamp);
    disc(g, 114, 34, 6, I.deskB);
    disc(g, 114, 34, 5, I.pillow);
    px(g, 114, 30, 1, 5, I.ceil); px(g, 114, 34, 4, 1, I.ceil);

    // ---------------------------------------------------------------- fenetre
    px(g, 132, 18, 44, 32, I.ceil);
    px(g, 134, 20, 40, 28, '#101a34');
    for (var st = 0; st < 16; st++) {
      px(g, 136 + Math.floor(hash(st, 5) * 36), 22 + Math.floor(hash(st, 9) * 24), 1, 1,
         hash(st, 3) > 0.5 ? '#ffffff' : '#9fb6ff');
    }
    disc(g, 165, 28, 4, '#f4efdc');
    disc(g, 163, 27, 3, '#101a34');
    px(g, 153, 20, 2, 28, I.wallA);
    px(g, 134, 32, 40, 2, I.wallA);
    px(g, 128, 16, 6, 38, I.rugB); px(g, 174, 16, 6, 38, I.rugB);
    px(g, 129, 17, 4, 36, I.rug);  px(g, 175, 17, 4, 36, I.rug);

    // ----------------------------------------------------------------- canape
    px(g, 130, 70, 64, 20, I.sofaB);                 // dossier
    px(g, 131, 71, 62, 18, '#24589f');
    px(g, 134, 73, 27, 13, I.sofa);                  // coussins de dossier
    px(g, 163, 73, 27, 13, I.sofa);
    px(g, 130, 88, 64, 14, I.sofaB);                 // assise
    px(g, 132, 89, 60, 12, I.sofa);
    px(g, 134, 90, 27, 10, I.sofaA);
    px(g, 163, 90, 27, 10, I.sofaA);
    px(g, 126, 80, 9, 24, I.sofaB);                  // accoudoirs
    px(g, 189, 80, 9, 24, I.sofaB);
    px(g, 127, 81, 7, 22, I.sofa);
    px(g, 190, 81, 7, 22, I.sofa);
    px(g, 128, 104, 5, 5, I.deskB); px(g, 190, 104, 5, 5, I.deskB);   // pieds
    px(f, 126, 100, 72, 8, I.sofaB);                 // bord d'assise, avant-plan
    px(f, 127, 101, 70, 6, I.sofa);
    px(f, 127, 101, 70, 1, I.sofaA);

    // ------------------------------------------------------------------- tele
    px(g, 200, 90, 32, 10, I.deskB);
    px(g, 201, 91, 30, 8, I.desk);
    px(g, 202, 60, 26, 30, I.tvB);
    px(g, 204, 62, 22, 26, I.tv);
    px(g, 205, 63, 20, 22, I.screen);
    px(g, 213, 90, 4, 3, I.tvB);
    px(g, 202, 24, 28, 20, I.ceil);                  // affiche
    px(g, 204, 26, 24, 16, I.poster);
    px(g, 207, 34, 5, 5, I.posterA);
    px(g, 214, 29, 5, 5, I.screenA);
    px(g, 221, 35, 4, 4, I.lamp);

    // ---------------------------------------------------------------- bureau
    px(g, 236, 76, 38, 4, I.deskB);
    px(g, 237, 76, 36, 2, I.deskA);
    px(g, 237, 80, 3, 20, I.deskB);
    px(g, 270, 80, 3, 20, I.deskB);
    px(g, 244, 56, 22, 20, I.monB);
    px(g, 246, 58, 18, 16, I.mon);
    px(g, 253, 76, 4, 2, I.monB);
    px(g, 238, 34, 34, 3, I.deskB);
    var cols = [I.book, I.sofa, I.plant, I.lamp, I.bookA, I.screenA];
    for (var b = 0; b < 6; b++) px(g, 240 + b * 5, 25, 4, 9, cols[b]);
    px(g, 250, 80, 14, 20, I.deskB);
    px(g, 251, 81, 12, 18, I.desk);
    px(g, 236, 90, 38, 3, I.deskB);   // traverse : derriere lui, il est assis devant

    // ------------------------------------------------------------------- lit
    px(g, 278, 72, 8, 30, I.bed);
    px(g, 279, 73, 6, 28, I.deskA);
    px(g, 284, 82, 36, 20, I.bed);
    px(g, 285, 83, 34, 18, I.blanketB);
    px(g, 286, 84, 32, 15, I.blanket);
    px(g, 286, 84, 32, 3, I.blanketA);
    px(g, 287, 79, 15, 6, I.pillowB);
    px(g, 288, 79, 13, 5, I.pillow);
    px(g, 284, 100, 36, 3, I.deskB);
    px(g, 288, 30, 26, 18, I.ceil);                  // cadre photo
    px(g, 290, 32, 22, 14, I.poster);
    px(g, 293, 36, 7, 7, I.plantA);
    px(g, 303, 34, 6, 9, I.pillowB);

    houseplant(g);                                   // avant-plan : devant le lit

    // ----------------------------------------------------------------- tapis
    px(g, 134, 112, 78, 14, I.rugB);
    px(g, 135, 113, 76, 12, I.rug);
    for (var rr2 = 138; rr2 < 208; rr2 += 8) px(g, rr2, 113, 3, 12, I.rugA);
  }

  /* ------------------------------------------------------- activités du soir */
  var ACTS = {
    cafe: {
      x: 64, dir: 'up', label: 'à la machine à café',
      line: 'Un café, et j’attaque.',
      anim: function (g, t, hx) {
        var k = (t / 240) % 1;
        px(g, 63, 70 + Math.round(k * 4), 1, 2, '#6b3b1e');
        puff(g, 64, 60, t, 3);
        arm(g, hx, LANE, 'up', t);
      }
    },
    cuisine: {
      x: 86, dir: 'up', label: 'dans la cuisine',
      line: 'Je fais mijoter quelque chose.',
      anim: function (g, t, hx) {
        px(g, 76, 66, 16, 10, I.potB);
        px(g, 77, 67, 14, 8, I.pot);
        px(g, 75, 64, 18, 2, I.potB);
        px(g, 83, 60, 2, 4, I.metalB);
        px(g, 74, 76, 8, 2, I.flame);
        px(g, 75, 76, 6, 1, I.flameA);
        puff(g, 84, 58, t, 4);
        puff(g, 79, 56, t + 500, 3);
        arm(g, hx, LANE, 'up', t);
      }
    },
    tv: {
      // sitY 106 : les pieds retombent sur la ligne de sol du canape (y 108),
      // buste au-dessus de l'assise et jambes visibles devant le bord.
      x: 160, dir: 'sit', sitY: 106, label: 'devant la télé',
      line: 'Pause. Un épisode, pas plus.',
      anim: function (g, t) {
        var f = Math.floor(t / 160) % 4;
        var cols = ['#3B82F6', '#22C55E', '#9333EA', '#f7d94c'];
        px(g, 205, 63, 20, 22, I.screen);
        for (var i = 0; i < 5; i++) {
          var yy = 64 + ((i * 4 + f) % 20);
          px(g, 206, yy, 18, 2, i === f % 5 ? cols[f] : 'rgba(59,130,246,.35)');
        }
        px(g, 205, 63 + ((t / 90) % 22), 20, 1, 'rgba(255,255,255,.35)');
        g.fillStyle = 'rgba(59,130,246,.11)';
        g.beginPath(); g.moveTo(204, 86); g.lineTo(226, 86);
        g.lineTo(238, 132); g.lineTo(188, 132);
        g.closePath(); g.fill();
      }
    },
    bureau: {
      x: 234, dir: 'sit', sitY: 100, label: 'au bureau',
      line: 'Je déploie un workflow.',
      anim: function (g, t) {
        px(g, 246, 58, 18, 16, I.mon);
        var n = [[249, 62], [255, 60], [255, 67], [260, 64]];
        for (var i = 0; i < n.length; i++) {
          var on = ((t / 420 | 0) % n.length) === i;
          px(g, n[i][0], n[i][1], 3, 3, on ? '#22C55E' : '#3B82F6');
        }
        px(g, 252, 63, 4, 1, I.metalB); px(g, 252, 68, 4, 1, I.metalB);
        px(g, 258, 61, 3, 1, I.metalB); px(g, 258, 66, 3, 1, I.metalB);
        px(g, 247, 71, 16, 1, 'rgba(255,255,255,.18)');
      }
    },
    repassage: {
      x: 124, dir: 'up', label: 'il repasse une chemise',
      line: 'Une chemise propre pour demain.',
      prop: function (g) {
        px(g, 100, 106, 50, 5, I.boardB);
        px(g, 101, 107, 48, 3, I.board);
        px(g, 104, 111, 3, 18, I.metalC);
        px(g, 143, 111, 3, 18, I.metalC);
        px(g, 108, 101, 30, 5, I.pillow);
        px(g, 108, 101, 30, 1, I.pillowB);
      },
      anim: function (g, t, hx) {
        var k = Math.sin(t / 340);
        var ix = 118 + Math.round(k * 16);
        px(g, ix, 98, 10, 6, I.iron);
        px(g, ix + 1, 98, 8, 2, I.ironA);
        px(g, ix + 2, 104, 6, 1, I.metalC);
        puff(g, ix + 5, 94, t, 3);
        arm(g, hx, LANE, 'up', t, k);
      }
    },
    dodo: {
      x: 300, dir: 'lie', label: 'il dort',
      line: 'Chut... il dort.',
      anim: function (g, t) {
        px(g, 284, 82, 36, 20, I.bed);
        px(g, 285, 83, 34, 18, I.blanketB);
        px(g, 286, 84, 32, 15, I.blanket);
        px(g, 286, 84, 32, 3, I.blanketA);
        px(g, 298, 86, 20, 12, I.blanketB);
        px(g, 287, 79, 15, 6, I.pillowB);
        px(g, 288, 79, 13, 5, I.pillow);
        px(g, 288, 72, 16, 8, SP.h);
        px(g, 289, 73, 14, 6, SP.h);
        px(g, 290, 74, 11, 4, SP.H);
        px(g, 298, 76, 5, 4, SP.s);
        houseplant(g);                   // le lit vient d'etre repeint par-dessus
        zzz(g, 306, 62, Math.floor(t / 700) % 3);
        g.fillStyle = I.dark;
        g.fillRect(0, 0, W, H);
        disc(g, 112, 26, 26, 'rgba(247,217,76,.06)');
      }
    },
    plantes: {
      x: 276, dir: 'side', label: 'il arrose les plantes',
      line: 'Elles ne s’arrosent pas toutes seules.',
      anim: function (g, t, hx) {
        px(g, 288, 108, 12, 8, I.can);
        px(g, 289, 109, 10, 6, I.canA);
        px(g, 298, 110, 5, 2, I.can);
        for (var i = 0; i < 4; i++) {
          var k = ((t / 200) + i * 0.25) % 1;
          px(g, 302 + Math.round(k * 2), 112 + Math.round(k * 4), 1, 2, '#8fd4ff');
        }
        arm(g, hx, LANE, 'side', t);
      }
    },
    lecture: {
      x: 150, dir: 'sit', sitY: 106, label: 'il lit',
      line: 'Deux pages avant de dormir.',
      anim: function (g, t) {
        var k = Math.floor(t / 900) % 2;
        px(g, 158, 84, 16, 12, I.book);
        px(g, 159, 85, 14, 10, I.pillow);
        px(g, 165 + k, 85, 1, 10, I.book);
        px(g, 161, 88, 4, 1, I.metalC);
        px(g, 168, 91, 4, 1, I.metalC);
      }
    },
    menage: {
      x: 210, dir: 'side', label: 'il fait le ménage',
      line: 'Un coup de balai et c’est bon.',
      anim: function (g, t, hx) {
        var k = Math.sin(t / 300);
        var bx = 222 + Math.round(k * 6);
        px(g, bx, 106, 2, 26, I.broomA);
        px(g, bx - 4, 130, 10, 5, I.broom);
        px(g, bx - 4, 134, 10, 2, I.broomA);
        for (var i = 0; i < 3; i++) {
          px(g, bx + 8 + i * 4, 131 - Math.abs(Math.round(Math.sin(t / 180 + i) * 2)), 1, 1, '#d9c8ab');
        }
        arm(g, hx, LANE, 'side', t, k);
      }
    }
  };

  // un vrai Z, lisible : deux barres et la diagonale
  function zzz(g, x, y, n) {
    for (var i = 0; i <= n; i++) {
      var zx = x + i * 6, zy = y + (n - i) * 8;
      px(g, zx, zy, 5, 1, '#ffffff');
      px(g, zx + 3, zy + 1, 1, 1, '#ffffff');
      px(g, zx + 2, zy + 2, 1, 1, '#ffffff');
      px(g, zx + 1, zy + 3, 1, 1, '#ffffff');
      px(g, zx, zy + 4, 5, 1, '#ffffff');
    }
  }

  function puff(g, x, y, t, n) {
    for (var i = 0; i < n; i++) {
      var k = ((t / 900) + i / n) % 1;
      var yy = y - k * 18, xx = x + Math.sin((k * 6.283) + i) * 3;
      g.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - k)) + ')';
      g.fillRect(xx | 0, yy | 0, 2, 2);
    }
  }
  // petit bras qui s'agite : suffit a lire l'action
  function arm(g, hx, feetY, dir, t, k) {
    var s2 = k == null ? Math.sin(t / 240) : k;
    var dy = Math.round(s2 * 3);
    if (dir === 'up') px(g, hx + 10, feetY - 26 + dy, 5, 10, SP.j);
    else px(g, hx + 12, feetY - 22 + dy, 8, 5, SP.j);
  }

  var actKey = qs.get('act');
  if (!ACTS[actKey]) actKey = pick(Object.keys(ACTS));
  var ACT = ACTS[actKey];

  /* ==========================================================================
     MISE EN SCÈNE
     ========================================================================== */
  var ARRIVALS = {
    pier:  [[64, 120], [64, 108], [160, 108], [160, 86]],
    left:  [[61, 88], [61, 108], [160, 108], [160, 86]],
    right: [[262, 88], [262, 108], [160, 108], [160, 84]]
  };
  var fromKey = qs.get('from');
  if (!ARRIVALS[fromKey]) fromKey = pick(Object.keys(ARRIVALS));
  var WPS = ARRIVALS[fromKey];

  var SPEED_EXT = 56;
  var route = [], extDur = 0;
  (function () {
    for (var i = 1; i < WPS.length; i++) {
      var a = WPS[i - 1], b = WPS[i];
      var d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      var dur = (d / SPEED_EXT) * 1000;
      route.push({ a: a, b: b, t0: extDur, dur: dur, vertical: a[0] === b[0] });
      extDur += dur + 90;
    }
  })();

  var P = {};
  P.fade = 420;
  P.extEnd = P.fade + extDur;
  P.doorEnd = P.extEnd + 500;
  P.cutEnd = P.doorEnd + 220;
  P.iwalkEnd = P.cutEnd + 900;
  P.actEnd = P.iwalkEnd + 2400;
  P.end = P.actEnd + 720;

  function extHero(tw) {
    for (var i = 0; i < route.length; i++) {
      var r = route[i];
      if (tw < r.t0) return { x: r.a[0], y: r.a[1], v: r.vertical, moving: false, back: r.b[1] < r.a[1] };
      if (tw <= r.t0 + r.dur) {
        var k = (tw - r.t0) / r.dur;
        return {
          x: r.a[0] + (r.b[0] - r.a[0]) * k, y: r.a[1] + (r.b[1] - r.a[1]) * k,
          v: r.vertical, moving: true, back: r.b[1] < r.a[1], right: r.b[0] > r.a[0]
        };
      }
      if (tw < r.t0 + r.dur + 90) {
        return { x: r.b[0], y: r.b[1], v: r.vertical, moving: false, back: r.b[1] < r.a[1], right: r.b[0] > r.a[0] };
      }
    }
    var l = route[route.length - 1];
    return { x: l.b[0], y: l.b[1], v: l.vertical, moving: false, back: true, right: true };
  }

  var intStart = Math.max(24, Math.min(W - 24, ACT.x - 48));
  var intFlip = ACT.x < intStart;

  /* ------------------------------------------------------------------ dialog */
  var boxEl = document.getElementById('intro-box');
  var textEl = document.getElementById('intro-text');
  var TYPE = 20;
  var LINES = [
    { at: 380, txt: 'Linéo → Salut ! Bienvenue chez moi.' },
    { at: Math.max(1500, P.extEnd - 300), txt: 'Entre donc, fais comme chez toi.' },
    { at: P.cutEnd + 250, txt: ACT.line },
    { at: P.actEnd - 900, txt: 'Installe-toi : le site est prêt.' }
  ];
  var shown = -1, typed = 0, lastType = 0;

  function dialog(t) {
    var idx = -1;
    for (var i = 0; i < LINES.length; i++) if (t >= LINES[i].at) idx = i;
    if (idx < 0) { boxEl.classList.remove('on'); return; }
    if (idx !== shown) { shown = idx; typed = 0; lastType = t; boxEl.classList.add('on'); }
    var full = LINES[idx].txt;
    if (FREEZE !== null) { typed = full.length; textEl.textContent = full; }
    else if (typed < full.length && t - lastType > TYPE) {
      typed = Math.min(full.length, typed + Math.max(1, Math.round((t - lastType) / TYPE)));
      lastType = t;
      textEl.textContent = full.slice(0, typed);
    }
    boxEl.classList.toggle('done', typed >= full.length);
  }

  /* --------------------------------------------------------------- une image */
  function frame(t) {
    var g = ctx;
    g.clearRect(0, 0, W, H);
    var hx = 160, hy = 108, what = 'il rentre chez lui';

    if (t < P.cutEnd) {
      /* ---------------- extérieur ---------------- */
      drawWater(g, t);
      g.drawImage(ext.c, 0, 0);
      var tw = Math.min(Math.max(0, t - P.fade), extDur);
      var h = extHero(tw);
      var f = h.moving ? Math.floor(t / 165) : 1;
      hx = h.x; hy = h.y;

      if (t < P.extEnd) {
        hero(g, h.x, h.y, h.v ? (h.back ? 'up' : 'down') : 'side', f, !h.v && !h.right);
      } else {
        // il pousse la porte et entre
        var k = Math.min(1, (t - P.extEnd) / 500);
        px(g, doorPos.x - 9, doorPos.top, 18, 14, '#101820');          // porte ouverte
        px(g, doorPos.x - 9, doorPos.top, Math.round(9 - 8 * k), 14, '#2c4657');
        g.fillStyle = 'rgba(255,236,190,' + (0.25 + 0.45 * k) + ')';
        g.fillRect(doorPos.x - 9, doorPos.top, 18, 15);
        g.save();
        g.beginPath();
        g.rect(0, doorPos.y - 16 + Math.round(16 * k), W, H);
        g.clip();
        hero(g, doorPos.x, doorPos.y + 2, 'up', f, false);
        g.restore();
        what = 'il ouvre la porte';
        hy = doorPos.y;
      }
      if (t < P.fade) {
        g.fillStyle = 'rgba(5,5,5,' + (1 - t / P.fade) + ')';
        g.fillRect(0, 0, W, H);
      }
    } else {
      /* ---------------- intérieur ---------------- */
      g.drawImage(int1.c, 0, 0);
      if (ACT.prop) ACT.prop(g);

      var walkT = Math.min(1, (t - P.cutEnd) / (P.iwalkEnd - P.cutEnd));
      hx = intStart + (ACT.x - intStart) * walkT;
      hy = LANE;
      var fi = Math.floor(t / 165);

      if (walkT < 1) {
        what = 'il rentre du travail';
        // debout, il marche devant les meubles (pieds sur LANE, sous eux) :
        // l'avant-plan passe derriere lui, sinon le canape lui coupe la tete
        g.drawImage(int2.c, 0, 0);
        heroBig(g, hx, LANE, 'side', fi, intFlip);
      } else {
        what = ACT.label;
        hx = ACT.x;
        if (ACT.dir === 'sit') {
          hy = ACT.sitY || 104;
          // assis : il est pose sur l'assise, donc devant le bord du canape.
          // Sinon celui-ci lui mange le buste et escamote les jambes.
          g.drawImage(int2.c, 0, 0);
          blitBig(g, sprite('sit', 0), hx, hy, ACT.flip);
          ACT.anim(g, t, hx);
        } else if (ACT.dir === 'lie') {
          g.drawImage(int2.c, 0, 0);
          ACT.anim(g, t, hx);
          hy = 84;
        } else {
          g.drawImage(int2.c, 0, 0);
          heroBig(g, hx, LANE, ACT.dir === 'side' ? 'side' : 'up', 1, ACT.flip);
          ACT.anim(g, t, hx);
        }
      }
      // fondu du raccord
      if (t < P.cutEnd + 260) {
        g.fillStyle = 'rgba(255,240,210,' + (1 - (t - P.cutEnd) / 260) + ')';
        g.fillRect(0, 0, W, H);
      }
    }

    dialog(t);

    var z = t - P.actEnd;
    if (z > 0) {
      var k2 = Math.min(1, z / (P.end - P.actEnd)), e = k2 * k2 * (3 - 2 * k2);
      view.style.transformOrigin = (hx / W * 100) + '% ' + (hy / H * 100) + '%';
      view.style.transform = 'scale(' + (1 + 2.2 * e) + ')';
      root.style.setProperty('--flash', String(Math.max(0, (k2 - 0.5) / 0.5)));
      boxEl.classList.remove('on');
    }
  }

  /* ------------------------------------------------------------------ moteur */
  var t0 = null, raf = 0, dead = false;

  function loop(now) {
    if (dead) return;
    if (t0 === null) t0 = now;
    var t = now - t0;
    try { frame(t); } catch (e) { bail(); return; }
    if (t >= P.end) { finish(); return; }
    raf = requestAnimationFrame(loop);
  }
  function fit() {
    var s = Math.min(window.innerWidth / W, window.innerHeight / H);
    view.style.width = Math.round(W * s) + 'px';
    view.style.height = Math.round(H * s) + 'px';
  }
  function leave(fade) {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    document.documentElement.classList.remove('intro-lock');
    if (typeof window.__openIris === 'function') window.__openIris();
    if (fade) {
      root.classList.add('out');
      setTimeout(function () { if (root.parentNode) root.remove(); }, 700);
    } else if (root.parentNode) root.remove();
    cleanup();
    setTimeout(startWalker, fade ? 900 : 400);
  }
  function finish() { leave(true); }
  function bail() { leave(false); }
  function skip() { leave(true); }

  var skipBtn = document.getElementById('intro-skip');
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') skip();
  }
  function cleanup() {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', fit);
    if (skipBtn) skipBtn.removeEventListener('click', skip);
  }

  try {
    buildExterior();
    buildInterior();
  } catch (e) { bail(); return; }

  document.documentElement.classList.add('intro-lock');
  root.classList.add('on');
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('keydown', onKey);
  if (skipBtn) skipBtn.addEventListener('click', skip);
  view.addEventListener('click', skip);

  if (FREEZE !== null) {
    frame(FREEZE);
    document.documentElement.classList.remove('intro-lock');
    return;
  }

  setTimeout(function () { if (!dead) bail(); }, P.end + 4000);
  raf = requestAnimationFrame(loop);
})();
