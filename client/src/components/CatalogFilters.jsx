import { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { egpToPiastres, piastresToInput } from '../utils/catalog.js';

export default function CatalogFilters({
  initialFilters, initialPriceErrors = {}, categories, categoriesLoading, categoriesError,
  retryCategories, selectedCategory, onApply, onClear, mobile = false, lockedCategory, lockedSubcategory,
}) {
  const id = useId();
  const form = useRef(null);
  const [filters, setFilters] = useState(initialFilters);
  // Editing is in EGP strings. Conversion is deferred until the user applies.
  const [prices, setPrices] = useState({
    minPrice: initialPriceErrors.minPrice ? initialFilters.minPrice : piastresToInput(initialFilters.minPrice),
    maxPrice: initialPriceErrors.maxPrice ? initialFilters.maxPrice : piastresToInput(initialFilters.maxPrice),
  });
  const [errors, setErrors] = useState(initialPriceErrors);
  const fixedCategory = lockedSubcategory || lockedCategory;
  const change = (values) => setFilters((current) => ({ ...current, ...values }));
  const changePrice = (key, value) => {
    setPrices((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '', range: '' }));
  };
  const clear = () => {
    setFilters({ category: fixedCategory?.slug || '', availability: '', minPrice: '', maxPrice: '' });
    setPrices({ minPrice: '', maxPrice: '' });
    setErrors({});
    onClear?.();
  };
  const apply = (event) => {
    event.preventDefault();
    const converted = {};
    const nextErrors = {};
    for (const key of ['minPrice', 'maxPrice']) {
      converted[key] = egpToPiastres(prices[key].trim());
      if (converted[key] === null) nextErrors[key] = 'Enter a non-negative EGP amount with up to two decimal places.';
    }
    if (!Object.keys(nextErrors).length && converted.minPrice !== '' && converted.maxPrice !== '' && BigInt(converted.minPrice) > BigInt(converted.maxPrice)) {
      nextErrors.range = 'Minimum price must be less than or equal to maximum price.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const priceSection = form.current.querySelector('[data-price-section]');
      priceSection.open = true;
      form.current.querySelector(nextErrors.maxPrice && !nextErrors.minPrice ? '[name=maxPrice]' : '[name=minPrice]').focus();
      return;
    }
    onApply({ ...filters, ...converted, subcategory: '' });
  };
  const currentCategory = fixedCategory || selectedCategory;
  return (
    <form ref={form} className={`catalog-filters ${mobile ? 'catalog-filters-mobile' : ''}`} onSubmit={apply} noValidate>
      <div className="catalog-filter-fields">
        <details className="catalog-filter-group" open>
          <summary>Category<ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="catalog-filter-group-body">
            <label className="catalog-visually-hidden" htmlFor={`${id}-category`}>Category</label>
            <select id={`${id}-category`} value={fixedCategory?.slug || filters.category} disabled={categoriesLoading || Boolean(fixedCategory)}
              onChange={(event) => change({ category: event.target.value })}>
              {fixedCategory ? <option value={fixedCategory.slug}>{fixedCategory.name}</option> : <><option value="">All categories</option>
                {filters.category && !categories.some((category) => category.slug === filters.category) && <option value={filters.category}>{currentCategory?.name || 'Selected category'}</option>}
                {categories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}</>}
            </select>
            {lockedSubcategory && <p className="catalog-filter-context">Within {lockedCategory.name}</p>}
            {fixedCategory && <Link className="catalog-text-button" to="/shop">Browse all categories</Link>}
            {categoriesLoading && <p className="catalog-filter-context" role="status">Loading categories…</p>}
            {categoriesError && !fixedCategory && <div className="catalog-inline-error" role="alert"><p>Categories could not be loaded.</p><button type="button" onClick={retryCategories}>Retry categories</button></div>}
          </div>
        </details>
        <details className="catalog-filter-group" open>
          <summary>Availability<ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="catalog-filter-group-body">
            <label className="catalog-visually-hidden" htmlFor={`${id}-availability`}>Availability</label>
            <select id={`${id}-availability`} value={filters.availability} onChange={(event) => change({ availability: event.target.value })}>
              <option value="">All availability</option><option value="available">Available</option><option value="sold_out">Sold Out</option>
            </select>
          </div>
        </details>
        <details className="catalog-filter-group" data-price-section open>
          <summary>Price<ChevronDown size={18} aria-hidden="true" /></summary>
          <div className="catalog-filter-group-body">
            <p id={`${id}-price-hint`} className="catalog-filter-context">Enter an amount in EGP. Leave blank for no limit.</p>
            <div className="catalog-price-inputs">
              {['minPrice', 'maxPrice'].map((key) => <div className="catalog-price-field" key={key}><label htmlFor={`${id}-${key}`}>{key === 'minPrice' ? 'Minimum price (EGP)' : 'Maximum price (EGP)'}
                <input id={`${id}-${key}`} name={key} type="text" inputMode="decimal" maxLength={24} value={prices[key]} placeholder="Any"
                  aria-invalid={Boolean(errors[key] || errors.range)}
                  aria-describedby={[`${id}-price-hint`, errors[key] && `${id}-${key}-error`, errors.range && `${id}-range-error`].filter(Boolean).join(' ')}
                  onChange={(event) => changePrice(key, event.target.value)} /></label>
                {errors[key] && <span id={`${id}-${key}-error`} className="catalog-inline-error" role="alert">{errors[key]}</span>}
              </div>)}
            </div>
            {errors.range && <p id={`${id}-range-error`} className="catalog-inline-error" role="alert">{errors.range}</p>}
          </div>
        </details>
      </div>
      <div className="catalog-filter-actions">
        <button type="button" className="catalog-secondary-button" onClick={clear}>Clear All</button>
        <button type="submit" className="button button-dark">{mobile ? 'View Results' : 'Apply filters'}</button>
      </div>
    </form>
  );
}
