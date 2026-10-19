(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Iris wipe on load ---------- */
  var iris = document.getElementById('iris');
  function openIris(){
    iris.classList.add('open');
    setTimeout(function(){ iris.setAttribute('data-done',''); }, reduce ? 0 : 950);
  }
  window.__openIris = openIris;                    // l'intro pixel-art appelle ceci en sortant
  if (reduce || !window.__INTRO__) {
    if (reduce) openIris();
    else window.addEventListener('load', function(){ setTimeout(openIris, 260); });
  }
  /* Garde-fou : si l'intro echoue ou tarde, le site s'ouvre quand meme. */
  setTimeout(function(){
    if (!iris.hasAttribute('data-done')) {
      var intro = document.getElementById('intro');
      if (intro) intro.remove();
      document.documentElement.classList.remove('intro-lock');
      openIris();
    }
  }, 14000);

  /* ---------- Iris wipe on in-page navigation ---------- */
  function irisTo(hash){
    var target = document.querySelector(hash);
    if(!target) return;
    if(reduce){ target.scrollIntoView(); return; }
    iris.removeAttribute('data-done');
    iris.style.transitionDuration = '.42s';
    iris.classList.remove('open');                 // close (circle grows to cover)
    setTimeout(function(){
      target.scrollIntoView({behavior:'auto', block:'start'});
      iris.classList.add('open');                  // reopen on the new position
      setTimeout(function(){
        iris.setAttribute('data-done','');
        iris.style.transitionDuration = '';
      }, 460);
    }, 440);
  }

  document.querySelectorAll('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var hash = a.getAttribute('href');
      if(hash.length < 2) return;
      e.preventDefault();
      closeMenu();
      irisTo(hash);
      history.replaceState(null,'',hash);
    });
  });

  /* ---------- Nav state + mobile menu ---------- */
  var nav = document.getElementById('nav'), burger = document.getElementById('burger');
  function onScroll(){ nav.classList.toggle('is-stuck', window.scrollY > 12); }
  onScroll(); window.addEventListener('scroll', onScroll, {passive:true});

  function closeMenu(){ nav.classList.remove('is-open'); burger.setAttribute('aria-expanded','false'); }
  burger.addEventListener('click', function(){
    var open = nav.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  /* ---------- Reveal on scroll ---------- */
  var items = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window && !reduce){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, {rootMargin:'0px 0px -12% 0px', threshold:.12});
    items.forEach(function(el, i){ el.style.transitionDelay = (i % 2 ? 90 : 0) + 'ms'; io.observe(el); });
  } else {
    items.forEach(function(el){ el.classList.add('in'); });
  }

  /* ---------- Portrait : retiré s'il ne se charge pas (remplace l'ancien onerror en ligne) ---------- */
  var portrait = document.querySelector('.portrait__img');
  if (portrait) {
    if (portrait.complete && portrait.naturalWidth === 0) portrait.remove();
    else portrait.addEventListener('error', function(){ portrait.remove(); });
  }

  /* ---------- Footer year ---------- */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
