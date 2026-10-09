import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, ArrowDownUp, ChevronLeft, ChevronRight } from 'lucide-react';
import ProductCard from '../components/ProductCard.jsx';
import CatalogFilters from '../components/CatalogFilters.jsx';
import CatalogDialog from '../components/CatalogDialog.jsx';
import { getCategory, listCategories, listProducts } from '../services/catalog.js';
import { applyCatalogFilters, catalogApiParams, catalogPriceErrors, CATALOG_SORTS, readCatalogParams } from '../utils/catalog.js';
import { emitTracking } from '../tracking/client.js';

export default function ShopPage({ categorySlug, heading, categoryContext, categoryBreadcrumbs }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [drawer, setDrawer] = useState(null);
  const resultsRef = useRef(null);
  const searchRef = useRef(null);
  const searchAction = useRef(null);
  const params = readCatalogParams(searchParams);
  const lockedSubcategory = categorySlug && categoryContext?.parentId ? categoryContext : null;
  const lockedCategory = categorySlug ? (lockedSubcategory ? categoryContext.parent : categoryContext) || { slug: categorySlug, name: heading || 'Current category' } : null;
  if (lockedCategory) params.category = lockedCategory.slug;
  if (lockedCategory) params.subcategory = lockedSubcategory?.slug || '';
  useEffect(() => { if (searchRef.current) searchRef.current.value = params.q; }, [params.q]);
  // Legacy shop links become one visible category selection, never a hidden refinement.
  if (!categorySlug && params.subcategory) { params.category = params.subcategory; params.subcategory = ''; }
  useEffect(() => {
    if (searchParams.has('subcategory')) {
      const next = new URLSearchParams(searchParams);
      if (!categorySlug && next.get('subcategory')) next.set('category', next.get('subcategory'));
      next.delete('subcategory');
      setSearchParams(next, { replace: true });
    }
  }, [categorySlug, searchParams, setSearchParams]);
  const priceErrors = catalogPriceErrors(searchParams);
  const invalidPrices = Object.keys(priceErrors).length > 0;
  const products = useQuery({ queryKey: ['catalog', 'products', params], enabled: !invalidPrices, queryFn: async ({ signal }) => {
    const action = searchAction.current?.q === params.q && params.page === 1 ? searchAction.current : null;
    const result = await listProducts({ ...catalogApiParams(params), includePriceRange: false }, signal, { searchEventId: action?.id });
    if (action && searchAction.current === action) searchAction.current = null;
    return result;
  } });
  const categories = useQuery({ queryKey: ['catalog', 'categories', 'root', 'choices'], enabled: !lockedCategory, queryFn: ({ signal }) => listCategories({ parent: 'root', limit: 20, includeProductCounts: false }, signal) });
  const selectedCategory = useQuery({ queryKey: ['catalog', 'category', params.category], enabled: !lockedCategory && Boolean(params.category) && Boolean(categories.data) && !categories.data.categories.some((category) => category.slug === params.category), retry: false, queryFn: async ({ signal }) => (await getCategory(params.category, signal)).category });
  const rows = products.data?.products || [];
  useEffect(() => { if (products.data?.tracking) emitTracking(products.data.tracking); }, [products.data]);
  const pagination = products.data?.pagination;
  const filterValues = Object.fromEntries(['category', 'availability', 'minPrice', 'maxPrice'].map((key) => [key, priceErrors[key] ? searchParams.get(key) : params[key]]));
  if (lockedSubcategory) filterValues.category = lockedSubcategory.slug;
  const filterKey = JSON.stringify(filterValues);
  const sortLabel = CATALOG_SORTS.find((sort) => sort.value === params.sort)?.label;
  const update = (key, value) => {
    if (key !== 'q') searchAction.current = null;
    const next = new URLSearchParams(searchParams);
    if (value === '') next.delete(key); else next.set(key, String(value));
    if (lockedCategory) next.delete('category');
    if (lockedCategory) next.delete('subcategory');
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
    if (key === 'page') requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
  };
  const filterUrl = (filters) => {
    const next = applyCatalogFilters(searchParams, { ...filters, subcategory: '' });
    if (lockedCategory) next.delete('category');
    if (lockedSubcategory) next.delete('subcategory');
    return next;
  };
  const clearFilters = () => { searchAction.current = null; setSearchParams(filterUrl({})); };
  const filterProps = {
    initialFilters: filterValues,
    initialPriceErrors: priceErrors,
    categories: categories.data?.categories || [],
    categoriesLoading: !lockedCategory && categories.isLoading,
    categoriesError: categories.isError,
    retryCategories: () => categories.refetch(),
    selectedCategory: selectedCategory.data,
    lockedCategory,
    lockedSubcategory,
    onClear: clearFilters,
    onApply: (filters) => { searchAction.current = null; setSearchParams(filterUrl(filters)); setDrawer(null); },
  };

  return (
    <main className="catalog-shop">
      <header className="catalog-page-heading">
        {categoryBreadcrumbs}
        <p className="catalog-eyebrow">TAP & WRAP</p>
        <h1>{heading || 'Shop Our Gifts'}</h1>
        <p>Find a thoughtful gift, made for the moment.</p>
      </header>
      <form className="catalog-search" role="search" onSubmit={(event) => {
        event.preventDefault();
        const q = new FormData(event.currentTarget).get('q').trim();
        searchAction.current = q && !invalidPrices ? { q, id: crypto.randomUUID() } : null;
        if (q === params.q && params.page === 1 && !invalidPrices) void products.refetch();
        else update('q', q);
      }}>
        <Search size={20} aria-hidden="true" />
        <label className="catalog-visually-hidden" htmlFor="catalog-search">Search products by name</label>
        <input ref={searchRef} id="catalog-search" name="q" type="search" defaultValue={params.q} placeholder="Search products by name" maxLength="100" />
        <button type="submit">Search</button>
      </form>
      <div className="catalog-mobile-tools">
        <button type="button" onClick={() => setDrawer('filters')}><SlidersHorizontal size={18} aria-hidden="true" />Filters</button>
        <button type="button" onClick={() => setDrawer('sort')}><ArrowDownUp size={18} aria-hidden="true" />Sort</button>
      </div>
      <div className="catalog-shop-layout">
        <aside className="catalog-sidebar" aria-label="Product filters">
          <div className="catalog-sidebar-heading"><h2>Filters</h2></div>
          <CatalogFilters key={filterKey} {...filterProps} />
        </aside>
        <section ref={resultsRef} id="catalog-results" tabIndex={-1} className="catalog-results" aria-label="Shop products" aria-busy={products.isFetching}>
          <div className="catalog-results-toolbar">
            <p role="status">{invalidPrices ? 'Check price filters' : products.isLoading ? 'Loading products…' : pagination ? `${pagination.total} ${pagination.total === 1 ? 'product' : 'products'}` : 'Products'}</p>
            <label className="catalog-desktop-sort" htmlFor="catalog-sort">Sort by
              <select id="catalog-sort" value={params.sort} onChange={(event) => update('sort', event.target.value)}>
                {CATALOG_SORTS.map((sort) => <option key={sort.value} value={sort.value}>{sort.label}</option>)}
              </select>
            </label>
            <span className="catalog-mobile-sort-label">{sortLabel}</span>
          </div>
          {params.q && <p className="catalog-search-summary">Results for “{params.q}” <button type="button" className="catalog-text-button" onClick={() => update('q', '')}>Clear search</button></p>}
          {invalidPrices ? <div className="catalog-state" role="alert"><h2>Check your price filters</h2><p>{priceErrors.range || 'A price in the URL is invalid. Correct it in Filters or clear the filters.'}</p><button type="button" className="catalog-secondary-button" onClick={clearFilters}>Clear All</button></div>
            : products.isLoading ? <div className="catalog-grid" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <div className="catalog-skeleton" key={index}><div /><span /><span /></div>)}</div>
            : products.isError ? <div className="catalog-state" role="alert"><h2>We couldn’t load the shop</h2><p>{products.error?.message || 'Please try again in a moment.'}</p><button type="button" className="button button-dark" onClick={() => products.refetch()}>Try again</button></div>
              : rows.length === 0 ? <div className="catalog-state"><h2>No products found</h2><p>Try another search or adjust your filters.</p><button type="button" className="catalog-secondary-button" onClick={clearFilters}>Clear All</button></div>
                : <div className="catalog-grid">{rows.map((product) => <ProductCard key={product._id} product={product} />)}</div>}
          {pagination?.pages > 1 && !invalidPrices && !products.isError && (
            <nav className="catalog-pagination" aria-label="Product pagination">
              <button type="button" aria-label="Previous page" disabled={pagination.page <= 1} onClick={() => update('page', pagination.page - 1)}><ChevronLeft size={18} />Previous</button>
              <span>Page {pagination.page} of {pagination.pages}</span>
              <button type="button" aria-label="Next page" disabled={pagination.page >= pagination.pages} onClick={() => update('page', pagination.page + 1)}>Next<ChevronRight size={18} /></button>
            </nav>
          )}
        </section>
      </div>
      {drawer === 'filters' && <CatalogDialog title="Filters" onClose={() => setDrawer(null)}><CatalogFilters key={filterKey} {...filterProps} mobile /></CatalogDialog>}
      {drawer === 'sort' && <CatalogDialog title="Sort by" bottomSheet onClose={() => setDrawer(null)}>
        <div className="catalog-sort-options" role="group" aria-label="Product sorting">
          {CATALOG_SORTS.map((sort) => <button type="button" key={sort.value} aria-pressed={sort.value === params.sort} onClick={() => { update('sort', sort.value); setDrawer(null); }}>{sort.label}<span aria-hidden="true">{sort.value === params.sort ? '✓' : ''}</span></button>)}
        </div>
      </CatalogDialog>}
    </main>
  );
}
