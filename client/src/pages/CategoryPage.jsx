import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useLocation } from 'react-router-dom';
import { api } from '../services/api.js';
import ShopPage from './ShopPage.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { breadcrumbs, cleanText, SLUG } from '../seo/metadata.js';

export default function CategoryPage() {
  const { slug } = useParams();
  const { search } = useLocation();
  const categoryQuery = useQuery({
    queryKey: ['catalog', 'category', slug],
    enabled: SLUG.test(slug || ''),
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await api.get(`/public/categories/${encodeURIComponent(slug)}`, { signal });
      return response.data.data.category;
    },
  });
  const category = categoryQuery.data;
  const hasParent = !category?.parentId || Boolean(category.parent?._id && String(category.parent._id) === String(category.parentId) && SLUG.test(category.parent.slug || '') && cleanText(category.parent.name));
  const ready = category?.active === true && category.slug === slug && hasParent;
  const title = ready ? `${cleanText(category.name, 120)} Gifts | Tap & Wrap` : categoryQuery.isLoading ? 'Loading category | Tap & Wrap' : 'Category unavailable | Tap & Wrap';
  const entries = ready ? [{ name: 'Home', pathname: '/' }, { name: 'Shop', pathname: '/shop' }, ...(category.parent ? [{ name: category.parent.name, pathname: `/categories/${category.parent.slug}` }] : []), { name: category.name, pathname: `/categories/${slug}` }] : [];
  const crumb = ready ? breadcrumbs(import.meta.env.VITE_SITE_URL || '', entries) : null;
  const categoryBreadcrumbs = ready ? <nav className="product-breadcrumbs" aria-label="Category breadcrumb">{entries.map((entry, index) => <span key={entry.pathname}>{index > 0 && <span aria-hidden="true"> / </span>}{index === entries.length - 1 ? <span aria-current="page">{entry.name}</span> : <Link to={entry.pathname}>{entry.name}</Link>}</span>)}</nav> : null;
  return <>
    <PageMetadata title={title} description={ready ? `Browse approved ${cleanText(category.name, 100)} products from Tap & Wrap.` : 'This category is not available.'} pathname={`/categories/${slug}`} imageUrl={category?.imageUrl} categoryProductCount={category?.productCount} indexable={ready && category.productCount > 0 && !search} pending={categoryQuery.isLoading} structuredData={crumb ? [crumb] : []} />
    {categoryQuery.isLoading ? <main className="page-shell" role="status">Loading category…</main> : !ready ? <main className="page-shell"><h1>Category unavailable</h1><p>{categoryQuery.error?.response?.status === 404 ? 'This category is not available.' : 'We could not load this category. Please try again.'}</p><Link className="button button-dark" to="/shop">Browse the shop</Link>{categoryQuery.isError && categoryQuery.error?.response?.status !== 404 && <button type="button" className="catalog-secondary-button" onClick={() => categoryQuery.refetch()}>Try again</button>}</main> : <ShopPage categorySlug={slug} heading={`${category.name} Gifts`} categoryContext={category} categoryBreadcrumbs={categoryBreadcrumbs} />}
  </>;
}
