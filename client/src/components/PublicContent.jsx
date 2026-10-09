import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPublishedBundles, getProductReviews, getSiteContent } from '../services/website.js';
import { developerContent } from '../content/developer-content.js';
import { formatCatalogPrice } from '../utils/catalog.js';

export function useSiteContent() {
  return useQuery({ queryKey: ['website', 'content'], queryFn: ({ signal }) => getSiteContent(signal), staleTime: 60_000, retry: false, refetchOnWindowFocus: false });
}
function useMediaPreference(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export function DeveloperHeroMedia({ video = developerContent.heroVideo }) {
  const mobile = useMediaPreference('(max-width: 767px)');
  const reducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [failedSource, setFailedSource] = useState(null);
  const localVideo = (value) => typeof value === 'string' && /^\/media\/[a-zA-Z0-9/_-]+\.(mp4|webm)$/.test(value);
  const localPoster = value => typeof value === 'string' && /^\/media\/[a-zA-Z0-9/_-]+\.(webp|avif|jpg|jpeg|png)$/.test(value);
  const source = video?.approved === true && localVideo(video.src) ? mobile && localVideo(video.mobileSrc) ? video.mobileSrc : video.src : null;
  const poster = mobile && localPoster(video?.mobilePoster) ? video.mobilePoster : localPoster(video?.poster) ? video.poster : undefined;
  const failed = failedSource === source;
  const width = Number.isSafeInteger(video?.width) && video.width > 0 ? video.width : 1920;
  const height = Number.isSafeInteger(video?.height) && video.height > 0 ? video.height : 1080;
  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (reducedMotion || video?.autoplay !== true) element.pause();
    else void element.play().catch(() => { /* Autoplay policy: explicit Play remains available. */ });
  }, [source, reducedMotion, video?.autoplay, failed]);
  if (!source) return <p className="editorial-note hero-media-note">Development preview · Owner-approved hero footage is awaiting delivery.</p>;
  function togglePlayback() {
    if (playing) videoRef.current?.pause();
    else void videoRef.current?.play().catch(() => setFailedSource(source));
  }
  return <figure className="hero-film" style={{ aspectRatio: `${width} / ${height}` }}>
    {failed ? <>{poster && <img className="hero-film-poster" src={poster} width={width} height={height} alt="Owner-approved Tap & Wrap hero poster" fetchPriority="high"/>}<figcaption className="hero-film-error">The film is unavailable. You can still explore our gifts.</figcaption></> : <><video ref={videoRef} className="website-hero-video" src={source} muted playsInline loop={video?.loop === true} preload="none" poster={poster} width={width} height={height} aria-label="Tap & Wrap hero film" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setFailedSource(source)}/><button className="hero-video-control" type="button" aria-label={playing ? 'Pause hero video' : 'Play hero video'} onClick={togglePlayback}>{playing ? 'Pause film' : 'Play film'}</button></>}
  </figure>;
}
export function TrustStatistics({ claims = developerContent.trustStatistics }) {
  const rootRef = useRef(null);
  const counters = useRef([]);
  const statistics = useMemo(() => {
    if (!Array.isArray(claims) || claims.length !== 4 || new Set(claims.map(item => item?.id)).size !== 4) return [];
    return claims.every(item => item && item.approved === true && Number.isSafeInteger(item.value) && item.value >= 0 && Number.isSafeInteger(item.scale) && item.scale > 0 && typeof item.suffix === 'string' && typeof item.label === 'string' && item.label.trim() && typeof item.source === 'string' && item.source.trim() && typeof item.approvalEvidence === 'string' && item.approvalEvidence.trim() && typeof item.approvedAt === 'string' && Number.isFinite(Date.parse(item.approvedAt))) ? claims : [];
  }, [claims]);
  useEffect(() => {
    if (statistics.length !== 4) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0; let started = false;
    const write = progress => statistics.forEach((item, index) => {
      if (counters.current[index]) counters.current[index].textContent = `${(progress >= 1 ? item.value / item.scale : Math.floor(item.value / item.scale * progress)).toLocaleString('en-US')}${item.suffix}`;
    });
    const finish = () => { cancelAnimationFrame(frame); write(1); };
    const animate = () => {
      if (started) return;
      started = true; observer?.disconnect();
      if (motion.matches) { finish(); return; }
      let start;
      const tick = time => {
        start ??= time;
        const progress = Math.min(1, (time - start) / 1600);
        write(1 - (1 - progress) ** 3);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) animate(); }, { threshold: .2 }) : null;
    const motionChanged = () => { if (motion.matches) { started = true; observer?.disconnect(); finish(); } };
    if (motion.matches || !observer) finish(); else { write(0); observer.observe(rootRef.current); }
    motion.addEventListener('change', motionChanged);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); motion.removeEventListener('change', motionChanged); };
  }, [statistics]);
  return <section ref={rootRef} className="section website-trust" aria-label="Owner-approved trust information">{statistics.length === 4 ? <dl>{statistics.map((item, index) => {
    const finalValue = `${(item.value / item.scale).toLocaleString('en-US')}${item.suffix}`;
    return <div className="trust-statistic" key={item.id}><dt>{item.label}</dt><dd style={{ width: `${Math.max(5, finalValue.length) * .65}em` }}><span className="storefront-sr-only">{finalValue}</span><span ref={element => { counters.current[index] = element; }} aria-hidden="true">{finalValue}</span></dd></div>;
  })}</dl> : <p className="editorial-note">Development preview · Trust figures will appear after owner approval.</p>}</section>;
}
export function PublishedBundles() {
  const query = useQuery({ queryKey: ['website', 'bundles'], queryFn: ({ signal }) => getPublishedBundles(signal), staleTime: 60_000, retry: false, refetchOnWindowFocus: false });
  const bundles = query.data?.bundles || [];
  if (!bundles.length) return null;
  return <section className="section" aria-labelledby="home-bundles-heading"><div className="section-heading"><p className="eyebrow">THOUGHTFUL COMBINATIONS</p><h2 id="home-bundles-heading">Gift Bundles</h2></div><div className="website-bundle-grid">{bundles.map(bundle => <article className="website-bundle" key={bundle.id}><h3>{bundle.name}</h3>{bundle.description && <p>{bundle.description}</p>}<p>{Number.isSafeInteger(bundle.effectiveDiscountPiastres) ? formatCatalogPrice(bundle.effectiveDiscountPiastres) : bundle.discountKind === 'percentage' ? `${bundle.discountValue / 100}%` : `Up to ${formatCatalogPrice(bundle.discountValue)}`} bundle saving when all configured items are eligible in your cart.</p><ul>{bundle.products.map(product => <li key={`${product._id}:${product.variantKey || ''}`}><Link to={`/products/${product.slug}`}>{product.name}</Link> × {product.bundleQuantity || 1}</li>)}</ul><p className="editorial-note">The server applies eligible bundle savings at checkout.</p></article>)}</div></section>;
}
export function ReviewCards({ reviews }) {
  return <div className="website-reviews">{reviews.map(review => <figure key={review.id}><p className="website-review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p><blockquote>{review.text}</blockquote><figcaption>{review.authorLabel}</figcaption></figure>)}</div>;
}
export function ProductReviews({ slug, preview }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['website', 'reviews', slug, page], queryFn: ({ signal }) => getProductReviews(slug, page, signal), enabled: !preview, retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  const reviews = query.data?.reviews || [];
  return <section className="product-reviews" aria-labelledby="product-reviews-heading"><h2 id="product-reviews-heading">Product reviews</h2>{preview ? <p>Reviews are unavailable in draft preview.</p> : query.isPending ? <p role="status">Loading reviews…</p> : query.isError ? <div><p>Reviews are unavailable at the moment.</p><button className="catalog-text-button" onClick={() => query.refetch()}>Retry reviews</button></div> : !reviews.length ? <p>No owner-approved reviews have been published for this product.</p> : <><ReviewCards reviews={reviews}/>{query.data.pagination.pages > 1 && <nav className="commerce-pagination" aria-label="Review pages"><button disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={page >= query.data.pagination.pages || query.isFetching} onClick={() => setPage(page + 1)}>Next</button></nav>}</>}</section>;
}
export function ApprovedFaq({ entries = [] }) {
  return entries.length ? <div className="website-faq">{entries.map(entry => <details key={entry.question}><summary>{entry.question}</summary><p>{entry.answer}</p></details>)}</div> : <p className="placeholder-strip">Development preview · FAQ answers are awaiting owner approval.</p>;
}
