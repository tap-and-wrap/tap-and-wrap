import { useEffect } from 'react';
import './HomeMotion.css';

/** Progressive enhancement: content is visible unless an observer deliberately
 * marks an off-screen home section as waiting. Never hide the real homepage
 * before React or when JavaScript / intersection observation is unavailable. */
export default function HomeMotion() {
  useEffect(() => {
    const main = document.querySelector('main.home-page');
    if (!main || typeof IntersectionObserver !== 'function' || typeof window.matchMedia !== 'function') return;

    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) return;

    const targets = [...main.querySelectorAll('.section-heading, .home-service-card')];
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) reveal(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });

    function reveal(node) {
      node.dataset.twMotion = 'visible';
      observer.unobserve(node);
    }
    const viewportHeight = window.innerHeight;
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      // Already-visible, previously-scrolled and zero-size content is never hidden.
      if (rect.height === 0 || rect.bottom <= 0 || rect.top < viewportHeight * 0.93) {
        target.dataset.twMotion = 'visible';
      } else {
        target.dataset.twMotion = 'waiting';
        observer.observe(target);
      }
    }

    // Keyboard users must never tab into a visually hidden link/control.
    const focusEntered = event => {
      const pending = event.target.closest?.('[data-tw-motion="waiting"]');
      if (pending && main.contains(pending)) reveal(pending);
    };
    const preferenceChanged = () => {
      if (preference.matches) {
        for (const target of targets) reveal(target);
        observer.disconnect();
      }
    };
    main.addEventListener('focusin', focusEntered);
    preference.addEventListener('change', preferenceChanged);
    return () => {
      observer.disconnect();
      main.removeEventListener('focusin', focusEntered);
      preference.removeEventListener('change', preferenceChanged);
      for (const target of targets) delete target.dataset.twMotion;
    };
  }, []);

  return null;
}
