import { categoryHref } from '../../../shared/category-paths.mjs';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCategories, listProducts } from '../services/catalog.js';
import ProductCard from './ProductCard.jsx';
import './HomeCatalog.css';

// These files are editorial fallback thumbnails until the owner configures
// category image keys in the existing admin dashboard. API imageUrl wins.
const categoryThumbnails = Object.freeze({
  accessories: '/media/tap-wrap-category-accessories.webp',
  'food-treats': '/media/tap-wrap-category-food-treats.webp',
  'gifts-occasions': '/media/tap-wrap-category-gifts-occasions.webp',
  'home-kitchen': '/media/tap-wrap-category-home-kitchen.webp',
  'beauty-selfcare': '/media/tap-wrap-category-beauty-selfcare.webp',
  'baby-kids': '/media/tap-wrap-category-baby-kids.webp',
  'home-decor': '/media/tap-wrap-category-home-decor.webp',
  'flowers-plants': '/media/tap-wrap-category-flowers-plants.webp',
  'outdoor-travel': '/media/tap-wrap-category-outdoor-travel.webp',
  'electronics-gaming': '/media/tap-wrap-category-electronics-gaming.webp',
  'office-stationery': '/media/tap-wrap-category-office-stationery.webp',
  pets: '/media/tap-wrap-category-pets.webp',
});
function thumbnailFor(category) {
  if (category.imageUrl) return category.imageUrl;
  const normalized = (category.name || category.slug || '').toLowerCase().replace(/&/g, ' ').replace(/\band\b/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return categoryThumbnails[normalized] || categoryThumbnails[category.slug] || null;
}
export function FeaturedCategories() {
  const scroller = useRef(null);
  const [slide, setSlide] = useState({ index: 0, pages: 1, hasPrevious: false, hasNext: false });
  // All active root categories remain controlled by the public catalog API.
  const query = useQuery({ queryKey: ['catalog', 'home-main-categories'], queryFn: ({ signal }) => listCategories({ parent: 'root', limit: 20 }, signal) });
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => {
      const first = node.querySelector('.home-category');
      const step = first ? first.getBoundingClientRect().width + 18 : node.clientWidth;
      const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
      const pages = Math.max(1, Math.ceil(maxLeft / Math.max(1, step)) + 1);
      const index = maxLeft > 0 && node.scrollLeft >= maxLeft - 3 ? pages - 1 : Math.min(pages - 1, Math.round(node.scrollLeft / Math.max(1, step)));
      setSlide({ index, pages, hasPrevious: node.scrollLeft > 3, hasNext: node.scrollLeft < maxLeft - 3 });
    };
    update();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    resize?.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { resize?.disconnect(); node.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [query.data]);
  const navigate = index => {
    const node = scroller.current;
    if (!node) return;
    const first = node.querySelector('.home-category');
    const step = first ? first.getBoundingClientRect().width + 18 : node.clientWidth;
    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    const left = Math.min(maxLeft, Math.max(0, index * step));
    node.scrollTo({ left, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  if (query.isPending) return <p className="catalog-state" role="status">Loading categories…</p>;
  if (query.isError) return <div className="catalog-state" role="alert"><p>Categories are unavailable at the moment.</p><button className="button button-outline" onClick={() => query.refetch()}>Try again</button></div>;
  if (!query.data.categories.length) return <p className="catalog-state">Explore our gifts in the <Link to="/shop">shop</Link>.</p>;
  return <div className="home-categories-wrap">
    <div className="home-category-grid" ref={scroller} aria-label="Shop gift categories">
      {query.data.categories.map(category => <Link className="home-category" key={category._id} to={categoryHref(category)} aria-label={`Shop ${category.name}`}>
        <div className="home-category-image">{thumbnailFor(category) ? <img src={thumbnailFor(category)} alt="" loading="lazy" width="1200" height="900" /> : <span aria-hidden="true">Tap & Wrap</span>}</div>
        <div className="home-category-caption"><h3>{category.name}</h3><span className="home-category-cta">Shop Now</span></div>
      </Link>)}
    </div>
    <nav className="home-category-navigation" aria-label="Category carousel navigation">
      <button type="button" className="home-slide-arrow" aria-label="Previous categories" disabled={!slide.hasPrevious} onClick={() => navigate(slide.index - 1)}>←</button>
      <div className="home-slide-dots" aria-label="Carousel positions">
        {Array.from({ length: Math.min(5, slide.pages) }, (_, offset) => Math.max(0, Math.min(slide.index - 2, slide.pages - 5)) + offset).map(index => <button type="button" key={index} className={`home-slide-dot${slide.index === index ? ' is-active' : ''}`} aria-label={`Show category slide ${index + 1}`} aria-current={slide.index === index ? 'true' : undefined} onClick={() => navigate(index)} />)}
      </div>
      <button type="button" className="home-slide-arrow" aria-label="Next categories" disabled={!slide.hasNext} onClick={() => navigate(slide.index + 1)}>→</button>
    </nav>
    <div className="home-section-footer"><Link className="button button-dark home-shop-all" to="/shop">Shop All</Link></div>
  </div>;
}

export function BestSellerProducts() {
  const selected = useQuery({ queryKey: ['catalog', 'home-owner-picks'], queryFn: ({ signal }) => listProducts({ bestSeller: true, sort: 'best_sellers', limit: 8 }, signal) });
  // Do not start any fallback query until the owner selections are known.
  const needsFallback = selected.isSuccess && selected.data.products.length < 8;
  const fallback = useQuery({ queryKey: ['catalog', 'home-starter-picks'], queryFn: ({ signal }) => listProducts({ sort: 'newest', limit: 8 }, signal), enabled: needsFallback });
  const roots = useQuery({ queryKey: ['catalog', 'home-main-categories'], queryFn: ({ signal }) => listCategories({ parent: 'root', limit: 20 }, signal) });
  // One bounded request per distinct category rather than sampling 8 from the latest watches.
  const categoryCandidates = (roots.data?.categories || []).filter(category => category.productCount > 0).slice(0, 8);
  const picks = useQueries({ queries: categoryCandidates.map(category => ({
    queryKey: ['catalog', 'home-starter-category', category.slug],
    queryFn: ({ signal }) => listProducts({ category: category.slug, sort: 'newest', limit: 1 }, signal),
    enabled: needsFallback,
    staleTime: 300_000,
  })) });
  if (selected.isPending || (needsFallback && (fallback.isPending || roots.isPending || picks.some(query => query.isLoading)))) return <p className="catalog-state" role="status">Loading featured gifts…</p>;
  if (selected.isError || (needsFallback && fallback.isError)) return <div className="catalog-state" role="alert"><p>Featured gifts are unavailable at the moment.</p><button className="button button-outline" onClick={() => { selected.refetch(); if (needsFallback) { fallback.refetch(); roots.refetch(); } }}>Try again</button></div>;
  const ownerPicks = selected.data.products;
  const ids = new Set(ownerPicks.map(item => item._id));
  const varied = picks.flatMap(query => query.data?.products || []).filter(item => {
    if (ids.has(item._id)) return false;
    ids.add(item._id);
    return true;
  });
  const starter = [...(fallback.data?.products || [])].filter(item => !ids.has(item._id)).sort((a, b) => {
    const score = value => [...value.slug].reduce((acc, letter) => (acc * 31 + letter.charCodeAt(0)) >>> 0, 11939);
    return score(a) - score(b);
  });
  const products = [...ownerPicks, ...varied, ...starter].slice(0, 8);
  if (!products.length) return <p className="catalog-state">Find something special in our <Link to="/shop">shop</Link>.</p>;
  return <div className="catalog-grid home-product-grid">{products.map(product => <ProductCard key={product._id} product={product}/>)}</div>;
}
