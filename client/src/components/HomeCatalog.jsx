import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCategories, listProducts } from '../services/catalog.js';
import ProductCard from './ProductCard.jsx';
import './HomeCatalog.css';
import { imageSizesForManaged } from '../admin/media-url.js';

export function FeaturedCategories() {
  const query = useQuery({ queryKey: ['catalog', 'featured-categories'], queryFn: ({ signal }) => listCategories({ parent: 'root', featured: true, limit: 20 }, signal) });
  if (query.isPending) return <p className="catalog-state" role="status">Loading categories…</p>;
  if (query.isError) return <div className="catalog-state" role="alert"><p>Categories are unavailable at the moment.</p><button className="button button-outline" onClick={() => query.refetch()}>Try again</button></div>;
  if (!query.data.categories.length) return <p className="catalog-state">Our collection is being prepared. Check back soon.</p>;
  return <div className="home-category-grid">{query.data.categories.map(category => <Link className="home-category" key={category._id} to={`/categories/${encodeURIComponent(category.slug)}`}>
    {category.imageUrl ? <img src={category.imageUrl} srcSet={imageSizesForManaged(category.imageUrl)} sizes="(max-width: 600px) 80vw, 320px" alt="" loading="lazy" decoding="async" width="320" height="240"/> : null}
    <h3>{category.name}</h3><span>{category.productCount} {category.productCount === 1 ? 'product' : 'products'}</span>
  </Link>)}</div>;
}

export function BestSellerProducts() {
  const query = useQuery({ queryKey: ['catalog', 'home-best-sellers'], queryFn: ({ signal }) => listProducts({ bestSeller: true, sort: 'best_sellers', availability: 'available', limit: 8 }, signal) });
  if (query.isPending) return <p className="catalog-state" role="status">Loading gifts…</p>;
  if (query.isError) return <div className="catalog-state" role="alert"><p>These gifts are unavailable at the moment.</p><button className="button button-outline" onClick={() => query.refetch()}>Try again</button></div>;
  if (!query.data.products.length) return <p className="catalog-state">Explore our collection as new gifts arrive.</p>;
  if (query.data.products.length !== 8) return <p className="catalog-state">The eight owner-selected gifts are being finalized.</p>;
  return <div className="catalog-grid home-product-grid">{query.data.products.map(product => <ProductCard key={product._id} product={product}/>)}</div>;
}
