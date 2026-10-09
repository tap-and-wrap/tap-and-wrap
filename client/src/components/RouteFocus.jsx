import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const positions = new Map();
function remember(key) {
  positions.set(key, { top: window.scrollY, left: window.scrollX });
  if (positions.size > 100) positions.delete(positions.keys().next().value);
}

export function focusMainContent(event) {
  event.preventDefault();
  document.getElementById('main-content')?.focus({ preventScroll: true });
  document.getElementById('main-content')?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

export default function RouteFocus() {
  const location = useLocation();
  const navigation = useNavigationType();
  const previous = useRef(location);
  useLayoutEffect(() => {
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = original; };
  }, []);
  useLayoutEffect(() => {
    const old = previous.current;
    const changed = old.pathname !== location.pathname;
    previous.current = location;
    const root = document.getElementById('main-content');
    let observer;
    let timer;
    let frame;
    let focusFrame;
    let restoreFrame;
    let restoreTimer;
    let restoreResize;
    let restoreMutation;
    let restoring = false;
    let focusedHeading;
    let focusStopped = false;
    const stored = navigation === 'POP' && old.key !== location.key ? positions.get(location.key) : null;
    function stopRestore() {
      restoring = false;
      clearTimeout(restoreTimer);
      cancelAnimationFrame(restoreFrame);
      restoreResize?.disconnect();
      restoreMutation?.disconnect();
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.removeEventListener(type, cancelRestore, true);
      window.removeEventListener('resize', requestRestore);
    }
    function cancelRestore() { stopRestore(); remember(location.key); }
    function restorePosition() {
      if (!restoring) return;
      // A lazy page can initially be shorter than its saved position. Do not
      // record that clamp or repeatedly scroll while waiting for its content.
      if (document.documentElement.scrollHeight - window.innerHeight + 1 < stored.top) return;
      window.scrollTo({ top: stored.top, left: stored.left, behavior: 'auto' });
      stopRestore();
      remember(location.key);
    }
    function requestRestore() {
      cancelAnimationFrame(restoreFrame);
      restoreFrame = requestAnimationFrame(restorePosition);
    }
    function waitForContent() {
      restoring = true;
      if (root) {
        restoreMutation = new MutationObserver(requestRestore);
        restoreMutation.observe(root, { childList: true, subtree: true });
        if (typeof ResizeObserver !== 'undefined') {
          restoreResize = new ResizeObserver(requestRestore);
          restoreResize.observe(root);
        }
      }
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.addEventListener(type, cancelRestore, { capture: true, passive: true });
      window.addEventListener('resize', requestRestore);
      restoreTimer = setTimeout(stopRestore, 8000);
      restorePosition();
    }
    function stopFocus() {
      focusStopped = true;
      observer?.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('close', retryFocus, true);
      document.removeEventListener('pointerdown', stopFocus, true);
      document.removeEventListener('keydown', stopFocus, true);
      document.removeEventListener('focusin', preserveControlFocus, true);
    }
    function preserveControlFocus(event) {
      if (event.target.matches?.('a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"])')) stopFocus();
    }
    const retryFocus = () => {
      if (focusStopped) return;
      cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(focusPage);
    };
    function focusPage() {
      if (focusStopped || !root || document.querySelector('dialog[open]')) return false;
      const heading = [...root.querySelectorAll('h1')].find(node => node.getClientRects().length
        && !node.closest('[inert], [hidden], [aria-hidden="true"], [role="status"], [aria-busy="true"]')
        && !['hidden', 'collapse'].includes(getComputedStyle(node).visibility));
      if (!heading) return false;
      if (heading === focusedHeading) return true;
      // A user or assistive technology may have moved focus without a pointer
      // event. Do not override it while later authorization/content settles.
      if (focusedHeading && document.activeElement !== focusedHeading && document.activeElement !== document.body && document.activeElement !== root) {
        stopFocus();
        return false;
      }
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      if (document.activeElement !== heading) return false;
      focusedHeading = heading;
      return true;
    }
    function anchor() {
      if (!location.hash) return;
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    if (changed || (navigation === 'POP' && old.key !== location.key)) {
      if (stored && document.documentElement.scrollHeight - window.innerHeight + 1 < stored.top) waitForContent();
      else window.scrollTo({ top: stored?.top ?? (changed ? 0 : window.scrollY), left: stored?.left ?? 0, behavior: 'auto' });
    }
    if (changed && root) {
      // A ready heading can be replaced by an authorization/loading shell.
      // Observe that bounded settling period even after the first focus succeeds.
      observer = new MutationObserver(retryFocus);
      observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-busy', 'hidden', 'aria-hidden', 'style', 'class'] });
      document.addEventListener('close', retryFocus, true);
      document.addEventListener('pointerdown', stopFocus, true);
      document.addEventListener('keydown', stopFocus, true);
      document.addEventListener('focusin', preserveControlFocus, true);
      focusPage();
      retryFocus();
      timer = setTimeout(stopFocus, 8000);
    }
    if (!stored && (changed || old.hash !== location.hash)) frame = requestAnimationFrame(anchor);
    const scroll = () => { if (!restoring) remember(location.key); };
    window.addEventListener('scroll', scroll, { passive: true });
    document.addEventListener('click', scroll, true);
    // Reading scrollY in cleanup would capture the newly committed short page's
    // clamped position, overwriting the scroll last seen on the outgoing page.
    return () => { stopRestore(); stopFocus(); cancelAnimationFrame(frame); window.removeEventListener('scroll', scroll); document.removeEventListener('click', scroll, true); };
    // Query-only changes retain focused filter inputs and scroll position.
  }, [location, navigation]);
  return null;
}
