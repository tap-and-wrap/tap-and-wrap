/* One decorative overlay shared by first paint and React. No customer data. */
(function () {
  if (window.__twRibbon) return;
  var key = 'tapwrap-ribbon-opening-v1', overlay, deadline, finishTimer, finished = false;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function finish() {
    finished = true;
    clearTimeout(deadline); clearTimeout(finishTimer);
    if (overlay) overlay.remove();
    overlay = null;
  }
  function prepare() {
    if (finished || overlay || location.pathname !== '/' || motion.matches) return;
    try {
      if (sessionStorage.getItem(key) === 'seen' && new URLSearchParams(location.search).get('previewRibbon') !== '1') return;
      sessionStorage.setItem(key, 'seen');
    } catch (_) { return; }
    var wrapper = document.createElement('div');
    wrapper.innerHTML = "<div class=\"tw-ribbon-opening\" data-testid=\"ribbon-opening\" aria-hidden=\"true\">\n    <div class=\"tw-ribbon-opening__paper tw-ribbon-opening__paper--left\" ></div>\n    <div class=\"tw-ribbon-opening__paper tw-ribbon-opening__paper--right\" ></div>\n    <div class=\"tw-ribbon-opening__shine\" ></div>\n    <div class=\"tw-ribbon-opening__center\">\n      <svg class=\"tw-ribbon-opening__bow\" viewBox=\"0 0 260 164\" xmlns=\"http://www.w3.org/2000/svg\" focusable=\"false\">\n        <defs>\n          <linearGradient id=\"tw-ribbon-v2-satin\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n            <stop offset=\"0\" stop-color=\"#f8ebe2\"/>\n            <stop offset=\".22\" stop-color=\"#c99d94\"/>\n            <stop offset=\".48\" stop-color=\"#f0cfc5\"/>\n            <stop offset=\".76\" stop-color=\"#98645c\"/>\n            <stop offset=\"1\" stop-color=\"#e7c0b6\"/>\n          </linearGradient>\n          <linearGradient id=\"tw-ribbon-v2-knot\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\".9\">\n            <stop offset=\"0\" stop-color=\"#f5ded3\"/>\n            <stop offset=\".46\" stop-color=\"#b78176\"/>\n            <stop offset=\"1\" stop-color=\"#7f504b\"/>\n          </linearGradient>\n        </defs>\n        <g class=\"tw-ribbon-opening__loop tw-ribbon-opening__loop--left\">\n          <path d=\"M113 83C74 31 38 22 18 38 0 55 32 106 116 92c-66-13-80-42-72-51 10-11 42 11 69 42Z\" fill=\"url(#tw-ribbon-v2-satin)\" stroke=\"#9e746c\" stroke-width=\"1.5\"/>\n          <path d=\"M28 40C42 31 67 44 93 69\" stroke=\"#fff7f0\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\" opacity=\".42\"/>\n        </g>\n        <g class=\"tw-ribbon-opening__loop tw-ribbon-opening__loop--right\">\n          <path d=\"M144 83c43-53 78-60 98-42 18 18-13 66-94 51 61-12 80-41 70-51-13-11-43 13-74 42Z\" fill=\"url(#tw-ribbon-v2-satin)\" stroke=\"#9e746c\" stroke-width=\"1.5\"/>\n          <path d=\"M227 39c-18-5-41 8-64 33\" stroke=\"#fff7f0\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\" opacity=\".42\"/>\n        </g>\n        <g class=\"tw-ribbon-opening__tail tw-ribbon-opening__tail--left\">\n          <path d=\"M119 96c-14 22-33 44-64 61 27-5 43-11 60-17l12 19 5-59Z\" fill=\"url(#tw-ribbon-v2-satin)\" stroke=\"#9e746c\" stroke-width=\"1.5\"/>\n        </g>\n        <g class=\"tw-ribbon-opening__tail tw-ribbon-opening__tail--right\">\n          <path d=\"M137 98c15 24 36 42 70 61-24-5-44-12-61-20l-12 17-8-57Z\" fill=\"url(#tw-ribbon-v2-satin)\" stroke=\"#9e746c\" stroke-width=\"1.5\"/>\n        </g>\n        <g class=\"tw-ribbon-opening__knot\">\n          <path d=\"M113 76c8-12 26-13 35-1 8 10 2 29-13 32-19 4-33-13-22-31Z\" fill=\"url(#tw-ribbon-v2-knot)\" stroke=\"#8a5952\" stroke-width=\"2\"/>\n          <path d=\"M121 81c6-6 12-7 18-5\" stroke=\"#f5dacf\" stroke-width=\"3\" fill=\"none\" stroke-linecap=\"round\" opacity=\".7\"/>\n        </g>\n      </svg>\n    </div>\n  </div>";
    overlay = wrapper.firstElementChild;
    document.body.appendChild(overlay);
    // Initialization failure must restore the crawlable static document.
    deadline = setTimeout(finish, 6000);
  }
  function start() {
    prepare();
    if (!overlay || overlay.classList.contains('is-playing')) return;
    clearTimeout(deadline);
    overlay.classList.add('is-playing');
    finishTimer = setTimeout(finish, 2050);
  }
  motion.addEventListener('change', function () { if (motion.matches) finish(); });
  window.addEventListener('pagehide', finish);
  document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
  window.__twRibbon = {start:start, finish:finish};
  prepare();
}());
