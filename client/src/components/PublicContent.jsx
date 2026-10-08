import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getPublishedBundles, getProductReviews, getSiteContent } from '../services/website.js';
import { developerContent } from '../content/developer-content.js';
import { formatCatalogPrice } from '../utils/catalog.js';

export function useSiteContent() {
  return useQuery({ queryKey: ['website', 'content'], queryFn: ({ signal }) => getSiteContent(signal), staleTime: 60_000, retry: false, refetchOnWindowFocus: false });
}
export function DeveloperHeroMedia() {
  const video = developerContent.heroVideo;
  const localVideo = (value) => typeof value === 'string' && /^\/media\/[a-zA-Z0-9/_-]+\.(mp4|webm)$/.test(value);
  if (!video || !localVideo(video.src)) return <p className="editorial-note">Development preview · Owner-approved hero footage is awaiting delivery.</p>;
  return <video className="website-hero-video" controls muted playsInline preload="none" poster={video.poster || undefined} width={video.width || 1920} height={video.height || 1080} aria-label="Tap & Wrap hero film">{localVideo(video.mobileSrc) && <source media="(max-width: 600px)" src={video.mobileSrc} type={video.mobileSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'}/>}<source src={video.src} type={video.src.endsWith('.webm') ? 'video/webm' : 'video/mp4'} /></video>;
}
export function TrustStatistics() {
  const statistics = developerContent.trustStatistics.filter(item => item.approved === true && typeof item.value === 'string' && typeof item.label === 'string' && item.source).slice(0, 4);
  return <section className="section website-trust" aria-label="Owner-approved trust information">{statistics.length ? <dl>{statistics.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p className="editorial-note">Development preview · Trust figures will appear after owner approval.</p>}</section>;
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
