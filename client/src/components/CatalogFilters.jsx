import { useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCategories } from '../services/catalog.js';
import { egpToPiastres, formatCatalogPrice, piastresToInput } from '../utils/catalog.js';

export function PriceRange({ minPrice, maxPrice, bounds, onChange }) {
  const id = useId();
  const lowerBound = Number.isSafeInteger(bounds?.min) ? bounds.min : 0;
  const upperBound = Number.isSafeInteger(bounds?.max) && bounds.max > lowerBound ? bounds.max : lowerBound + 1;
  const minimum = minPrice === '' ? lowerBound : Math.max(lowerBound, Math.min(Number(minPrice), upperBound));
  const maximum = maxPrice === '' ? upperBound : Math.max(lowerBound, Math.min(Number(maxPrice), upperBound));
  const start = ((minimum - lowerBound) / (upperBound - lowerBound)) * 100;
  const end = ((maximum - lowerBound) / (upperBound - lowerBound)) * 100;
  const hasBounds = Number.isSafeInteger(bounds?.min) && Number.isSafeInteger(bounds?.max) && bounds.max > bounds.min;

  return (
    <fieldset className="catalog-price-filter">
      <legend>Price</legend>
      <div className="catalog-price-slider" style={{ '--range-start': `${start}%`, '--range-end': `${end}%` }}>
        <div className="catalog-range-track" />
        <input type="range" aria-label="Minimum price" aria-valuetext={formatCatalogPrice(minimum)} min={lowerBound} max={upperBound} step="1" value={Math.min(minimum, maximum)} disabled={!hasBounds}
          onChange={(event) => onChange({ minPrice: String(Math.min(Number(event.target.value), maximum)) })} />
        <input type="range" aria-label="Maximum price" aria-valuetext={formatCatalogPrice(maximum)} min={lowerBound} max={upperBound} step="1" value={Math.max(minimum, maximum)} disabled={!hasBounds}
          onChange={(event) => onChange({ maxPrice: String(Math.max(Number(event.target.value), minimum)) })} />
      </div>
      <div className="catalog-price-inputs">
        <label htmlFor={`${id}-minimum`}>Min (EGP)
          <input id={`${id}-minimum`} type="number" inputMode="decimal" min="0" step="0.01" value={piastresToInput(minPrice)} placeholder="Any"
            onChange={(event) => { const value = egpToPiastres(event.target.value); if (value !== null) onChange({ minPrice: value }); }} />
        </label>
        <label htmlFor={`${id}-maximum`}>Max (EGP)
          <input id={`${id}-maximum`} type="number" inputMode="decimal" min="0" step="0.01" value={piastresToInput(maxPrice)} placeholder="Any"
            onChange={(event) => { const value = egpToPiastres(event.target.value); if (value !== null) onChange({ maxPrice: value }); }} />
        </label>
      </div>
    </fieldset>
  );
}

export default function CatalogFilters({ initialFilters, categories, categoriesLoading, categoriesError, retryCategories, priceRange, onApply, onClear, mobile = false, lockedCategory, lockedSubcategory }) {
  const id = useId();
  const [filters, setFilters] = useState(initialFilters);
  const [error, setError] = useState('');
  const subcategories = useInfiniteQuery({
    queryKey: ['catalog', 'categories', filters.category],
    initialPageParam: 1,
    enabled: Boolean(filters.category) && !lockedSubcategory,
    queryFn: ({ pageParam, signal }) => listCategories({ parent: filters.category, limit: 20, page: pageParam }, signal),
    getNextPageParam: (lastPage) => lastPage.pagination?.page < lastPage.pagination?.pages ? lastPage.pagination.page + 1 : undefined,
  });
  const childCategories = subcategories.data?.pages.flatMap((page) => page.categories) || [];
  const change = (values) => { setFilters((current) => ({ ...current, ...values })); setError(''); };
  const clear = () => {
    setFilters({ category: lockedCategory?.slug || '', subcategory: lockedSubcategory?.slug || '', availability: '', minPrice: '', maxPrice: '' });
    setError('');
    onClear?.();
  };
  const apply = (event) => {
    event.preventDefault();
    if (filters.minPrice !== '' && filters.maxPrice !== '' && Number(filters.minPrice) > Number(filters.maxPrice)) {
      setError('Minimum price must be less than or equal to maximum price.');
      return;
    }
    onApply(filters);
  };

  return (
    <form className={`catalog-filters ${mobile ? 'catalog-filters-mobile' : ''}`} onSubmit={apply}>
      <div className="catalog-filter-fields">
        <label htmlFor={`${id}-category`}>Category
          <select id={`${id}-category`} value={filters.category} disabled={categoriesLoading || Boolean(lockedCategory)}
            onChange={(event) => change({ category: event.target.value, subcategory: '' })}>
            {lockedCategory ? <option value={lockedCategory.slug}>{lockedCategory.name}</option> : <><option value="">All categories</option>
              {filters.category && !categories.some((category) => category.slug === filters.category) && <option value={filters.category}>Current category</option>}
              {categories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}</>}
          </select>
        </label>
        {lockedCategory && <Link className="catalog-text-button" to="/shop">Browse all categories</Link>}
        {categoriesError && !lockedCategory && <div className="catalog-inline-error"><p>Categories could not be loaded.</p><button type="button" onClick={retryCategories}>Retry categories</button></div>}
        <label htmlFor={`${id}-subcategory`}>Subcategory
          <select id={`${id}-subcategory`} value={filters.subcategory} disabled={!filters.category || subcategories.isLoading || Boolean(lockedSubcategory)}
            onChange={(event) => change({ subcategory: event.target.value })}>
            {lockedSubcategory ? <option value={lockedSubcategory.slug}>{lockedSubcategory.name}</option> : <><option value="">All subcategories</option>
              {filters.subcategory && !childCategories.some((category) => category.slug === filters.subcategory) && <option value={filters.subcategory}>Current subcategory</option>}
              {childCategories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}</>}
          </select>
        </label>
        {!lockedSubcategory && subcategories.hasNextPage && <button className="catalog-text-button" type="button" onClick={() => subcategories.fetchNextPage()} disabled={subcategories.isFetchingNextPage}>
          {subcategories.isFetchingNextPage ? 'Loading subcategories…' : 'Load more subcategories'}
        </button>}
        {filters.category && !lockedSubcategory && subcategories.isError && <div className="catalog-inline-error"><p>Subcategories could not be loaded.</p><button type="button" onClick={() => subcategories.refetch()}>Retry subcategories</button></div>}
        <label htmlFor={`${id}-availability`}>Availability
          <select id={`${id}-availability`} value={filters.availability} onChange={(event) => change({ availability: event.target.value })}>
            <option value="">All availability</option>
            <option value="available">Available</option>
            <option value="sold_out">Sold Out</option>
          </select>
        </label>
        <PriceRange minPrice={filters.minPrice} maxPrice={filters.maxPrice} bounds={priceRange} onChange={change} />
        {error && <p className="catalog-inline-error" role="alert">{error}</p>}
      </div>
      <div className="catalog-filter-actions">
        <button type="button" className="catalog-secondary-button" onClick={clear}>Clear All</button>
        <button type="submit" className="button button-dark">{mobile ? 'View Results' : 'Apply filters'}</button>
      </div>
    </form>
  );
}
