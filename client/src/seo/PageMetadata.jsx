import { useEffect } from 'react';
import { canonicalOrigin, canonicalUrl, cleanText, productMetadata, publicImageUrl, serializeJsonLd } from './metadata.js';

const configuredOrigin = import.meta.env.VITE_SITE_URL || '';
const indexingEnabled = import.meta.env.VITE_SEO_INDEXING_ENABLED === 'true';

export default function PageMetadata({ title = 'Tap & Wrap', description = '', pathname = '/', imageUrl, structuredData = [], indexable = false }) {
  const serialized = serializeJsonLd(structuredData);
  useEffect(() => {
    const origin = canonicalOrigin(configuredOrigin);
    const canonical = canonicalUrl(origin, pathname);
    const canIndex = Boolean(origin && canonical && indexingEnabled && indexable && window.location.origin === origin);
    document.title = cleanText(title, 160) || 'Tap & Wrap';
    const update = (selector, tag, attributes) => {
      const existing = document.head.querySelector(selector);
      const element = existing || document.createElement(tag);
      Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
      element.dataset.seo = 'true';
      if (!existing) document.head.append(element);
    };
    update('meta[name="description"]', 'meta', { name: 'description', content: cleanText(description, 160) });
    update('meta[name="robots"]', 'meta', { name: 'robots', content: canIndex ? 'index, follow, max-image-preview:large' : 'noindex, nofollow, noarchive' });
    const canonicalTag = document.head.querySelector('link[rel="canonical"]');
    if (canonical) update('link[rel="canonical"]', 'link', { rel: 'canonical', href: canonical });
    else canonicalTag?.remove();
    const values = { 'og:type': structuredData.some((entry) => entry?.['@type'] === 'Product') ? 'product' : 'website', 'og:site_name': 'Tap & Wrap', 'og:title': cleanText(title, 160), 'og:description': cleanText(description, 160), 'og:url': canonical, 'og:image': publicImageUrl(imageUrl), 'twitter:card': publicImageUrl(imageUrl) ? 'summary_large_image' : 'summary', 'twitter:title': cleanText(title, 160), 'twitter:description': cleanText(description, 160), 'twitter:image': publicImageUrl(imageUrl) };
    Object.entries(values).forEach(([key, value]) => {
      const attribute = key.startsWith('twitter:') ? 'name' : 'property';
      const selector = `meta[${attribute}="${key}"]`;
      if (value) update(selector, 'meta', { [attribute]: key, content: value });
      else document.head.querySelector(selector)?.remove();
    });
    document.head.querySelectorAll('script[data-seo-jsonld]').forEach((script) => script.remove());
    if (canIndex && structuredData.length) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seoJsonld = 'true';
      script.textContent = serialized;
      document.head.append(script);
    }
  // JSON serialization gives metadata stable dependencies even when the caller builds an array inline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, pathname, imageUrl, serialized, indexable]);
  return null;
}

export function ProductMetadata({ product, loading = false, error = false, checkoutEnabled = false }) {
  const metadata = !loading && !error && product ? productMetadata(product, configuredOrigin, { checkoutEnabled }) : { title: loading ? 'Loading product | Tap & Wrap' : 'Product unavailable | Tap & Wrap', description: loading ? 'Loading product information.' : 'This product is not available.', indexable: false };
  return <PageMetadata {...metadata} />;
}
