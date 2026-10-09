import { canonicalOrigin, PRIVATE_ROUTE } from './metadata.js';

let snapshot = null;

export function readBootSnapshot(documentObject = document, now = Date.now()) {
  try {
    const value = JSON.parse(documentObject.querySelector('script[data-seo-bootstrap]')?.textContent || 'null');
    if (value?.version !== 1 || typeof value.pathname !== 'string' || !/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(value.pathname) || !/^[a-f0-9]{64}$/.test(value.publicationId || '') || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= now) return null;
    return { version: 1, pathname: value.pathname, origin: canonicalOrigin(value.origin), indexable: value.indexable === true, publicationId: value.publicationId, expiresAt: value.expiresAt, productSignature: typeof value.productSignature === 'string' && value.productSignature.length <= 50000 ? value.productSignature : null, minimumCategoryProducts: Number.isSafeInteger(value.minimumCategoryProducts) && value.minimumCategoryProducts >= 1 && value.minimumCategoryProducts <= 20 ? value.minimumCategoryProducts : null };
  } catch { return null; }
}

export function matchingBootSnapshot(pathname, currentOrigin, now = Date.now()) {
  return snapshot && snapshot.pathname === pathname && snapshot.origin === currentOrigin && Date.parse(snapshot.expiresAt) > now ? snapshot : null;
}

export function bootMetadataDecision(boot, { pathname, currentOrigin, configuredOrigin, indexingEnabled, indexable, pending, productSignature, categoryProductCount, search = '', now = Date.now() }) {
  const privatePath = PRIVATE_ROUTE.test(pathname) || /^\/products\/[a-z0-9-]+\/customize$/.test(pathname);
  const matches = !privatePath && boot?.version === 1 && boot.pathname === pathname && boot.origin === currentOrigin && boot.origin === canonicalOrigin(configuredOrigin) && Date.parse(boot.expiresAt) > now;
  const productMatches = !/^\/products\/[a-z0-9-]+$/.test(pathname) || typeof boot?.productSignature === 'string' && boot.productSignature === productSignature;
  const categoryMatches = !/^\/categories\/[a-z0-9-]+$/.test(pathname) || Number.isSafeInteger(boot?.minimumCategoryProducts) && boot.minimumCategoryProducts >= 1 && boot.minimumCategoryProducts <= 20 && Number.isSafeInteger(categoryProductCount) && categoryProductCount >= boot.minimumCategoryProducts;
  return { preservePending: Boolean(matches && indexingEnabled && pending && !search), canIndex: Boolean(matches && productMatches && categoryMatches && indexingEnabled && indexable && boot.indexable && !search) };
}

export function expireBootMetadata(documentObject = document) {
  const robots = documentObject.head.querySelector('meta[name="robots"]');
  if (robots) robots.setAttribute('content', 'noindex, nofollow, noarchive');
  documentObject.head.querySelectorAll('script[data-seo-jsonld]').forEach((script) => script.remove());
}

// This is a bounded handoff, not hydration. Keep meaningful static HTML visible
// until the real route has a non-loading heading, then mount the interactive UI.
export function initializePrerender(root, documentObject = document) {
  snapshot = readBootSnapshot(documentObject);
  if (!root?.querySelector('[data-prerender]')) return () => {};
  const fallback = documentObject.createElement('div');
  fallback.className = 'seo-boot-fallback';
  while (root.firstChild) fallback.append(root.firstChild);
  root.after(fallback);
  const originalDisplay = root.style.display;
  root.style.display = 'none';
  root.setAttribute('aria-hidden', 'true');
  root.inert = true;
  const originalPath = window.location.pathname;
  let done = false;
  let timer;
  const reveal = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(timer);
    root.style.display = originalDisplay;
    root.removeAttribute('aria-hidden');
    root.inert = false;
    fallback.remove();
  };
  const ready = () => {
    if (window.location.pathname !== originalPath || [...root.querySelectorAll('main h1')].some((heading) => !heading.closest('[hidden], [aria-busy="true"], [role="status"]'))) reveal();
  };
  const observer = new MutationObserver(ready);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy', 'hidden'] });
  timer = setTimeout(reveal, 6000);
  return reveal;
}
