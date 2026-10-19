/* Sans JS, ni l'iris ni l'intro ne doivent masquer le site. */
(function(){
  document.documentElement.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.__INTRO__ = !reduce && location.search.indexOf('nointro') < 0;
})();
