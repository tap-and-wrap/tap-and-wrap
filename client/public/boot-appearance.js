/* Before first paint; static content remains available without JavaScript. */
(function () {
  document.documentElement.classList.add('tw-booting');
  var timer = setTimeout(finish, 8000);
  function finish() {
    clearTimeout(timer);
    document.documentElement.classList.remove('tw-booting');
    var root = document.getElementById('root');
    // A missing entry chunk never reaches initializePrerender. Give private
    // SPA documents an honest recovery view instead of an empty white screen.
    if (root && !root.hasChildNodes() && !document.querySelector('.seo-boot-fallback main')) {
      var main = document.createElement('main'); main.className = 'page-shell';
      main.style.cssText = 'max-width:560px;margin:12vh auto;padding:24px;color:#62483F;font:16px/1.6 Arial,sans-serif';
      var heading = document.createElement('h1'); heading.textContent = 'Your page could not open';
      var message = document.createElement('p'); message.textContent = 'Please reload to try again.';
      var link = document.createElement('a'); link.href = window.location.href; link.textContent = 'Reload this page';
      main.append(heading, message, link); root.append(main);
    }
  }
  window.__twBootFinish = finish;
  window.addEventListener('pagehide', finish, { once: true });
}());
