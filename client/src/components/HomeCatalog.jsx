import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
function scrollCategories(node, direction) {
  if (!node) return;
  const first = node.querySelector('.home-category');
  const step = first ? first.getBoundingClientRect().width + 18 : node.clientWidth;
  node.scrollBy({ left: direction * step, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
export function FeaturedCategories() {
  const scroller = useRef(null);
  const [ends, setEnds] = useState({ start: true, end: false });
  // All active root categories appear, not only administratively 'featured' ones.
  // The server's active/category graph gate is retained unchanged.
  const query = useQuery({ queryKey: ['catalog', 'home-main-categories'], queryFn: ({ signal }) => listCategories({ parent: 'root', limit: 20 }, signal) });
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const update = () => setEnds({ start: node.scrollLeft <= 3, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 3 });
    update();
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    resize?.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { resize?.disconnect(); node.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [query.data]);
  if (query.isPending) return <p className="catalog-state" role="status">Loading categories…</p>;
  if (query.isError) return <div className="catalog-state" role="alert"><p>Categories are unavailable at the moment.</p><button className="button button-outline" onClick={() => query.refetch()}>Try again</button></div>;
  if (!query.data.categories.length) return <p className="catalog-state">Explore our gifts in the <Link to="/shop">shop</Link>.</p>;
  return <div className="home-categories-wrap">
    <div className="home-category-controls"><button type="button" aria-label="Previous categories" disabled={ends.start} onClick={() => scrollCategories(scroller.current, -1)}>‹</button><button type="button" aria-label="Next categories" disabled={ends.end} onClick={() => scrollCategories(scroller.current, 1)}>›</button></div>
    <div className="home-category-grid" ref={scroller} aria-label="Shop gift categories">
      {query.data.categories.map(category => <Link className="home-category" key={category._id} to={`/categories/${encodeURIComponent(category.slug)}`} aria-label={`Shop ${category.name}`}>
        <div className="home-category-image">{thumbnailFor(category) ? <img src={thumbnailFor(category)} alt="" loading="lazy" width="1200" height="900" /> : <span aria-hidden="true">Tap & Wrap</span>}</div>
        <div className="home-category-caption"><h3>{category.name}</h3><span className="home-category-cta">Shop Now <span aria-hidden="true">↗</span></span></div>
      </Link>)}
    </div>
  </div>;
}

export function BestSellerProducts() {
  const selected = useQuery({ queryKey: ['catalog', 'home-owner-picks'], queryFn: ({ signal }) => listProducts({ bestSeller: true, sort: 'best_sellers', limit: 8 }, signal) });
  const fallback = useQuery({ queryKey: ['catalog', 'home-starter-picks'], queryFn: ({ signal }) => listProducts({ sort: 'newest', limit: 20 }, signal) });
  if (selected.isPending || fallback.isPending) return <p className="catalog-state" role="status">Loading featured gifts…</p>;
  if (selected.isError || fallback.isError) return <div className="catalog-state" role="alert"><p>Featured gifts are unavailable at the moment.</p><button className="button button-outline" onClick={() => { selected.refetch(); fallback.refetch(); }}>Try again</button></div>;
  const ownerPicks = selected.data.products;
  const ids = new Set(ownerPicks.map(item => item._id));
  // Stable, varied starter selection; explicit admin Best Seller flags override it.
  const starter = [...fallback.data.products].filter(item => !ids.has(item._id)).sort((a, b) => {
    const score = value => [...value.slug].reduce((acc, letter) => (acc * 31 + letter.charCodeAt(0)) >>> 0, 11939);
    return score(a) - score(b);
  });
  const products = [...ownerPicks, ...starter].slice(0, 8);
  if (!products.length) return <p className="catalog-state">Find something special in our <Link to="/shop">shop</Link>.</p>;
  return <div className="catalog-grid home-product-grid">{products.map(product => <ProductCard key={product._id} product={product}/>)}</div>;
}
