import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { listAdminCategories, listAdminProducts } from '../services/catalog';
import { adminErrorMessage, catalogId } from '../admin/catalog-form';
import '../admin.css';

const sortOptions = [
  ['newest', 'Newest'], ['featured', 'Featured'], ['best_sellers', 'Best Sellers'],
  ['price_asc', 'Price Low–High'], ['price_desc', 'Price High–Low'],
  ['name_asc', 'Name A–Z'], ['name_desc', 'Name Z–A'],
];
const money = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' });

export default function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(searchParams);
  const requestedPage = Number(filters.page);
  const page = Number.isInteger(requestedPage) ? Math.max(1, Math.min(200, requestedPage)) : 1;
  const allowedFilters = ['q', 'category', 'subcategory', 'status', 'priceApproved', 'inventoryApproved', 'available', 'inventoryMode', 'reviewRequired'];
  const queryParams = { ...Object.fromEntries(allowedFilters.filter((key) => filters[key]).map((key) => [key, filters[key]])), page, limit: 20, sort: filters.sort || 'newest' };
  const products = useQuery({
    queryKey: ['admin', 'products', queryParams],
    queryFn: ({ signal }) => listAdminProducts(queryParams, signal),
    retry: false,
  });
  const categories = useQuery({
    queryKey: ['admin', 'categories', 'root'],
    queryFn: ({ signal }) => listAdminCategories({ parent: 'root', page: 1, limit: 20 }, signal),
    retry: false,
  });
  const subcategoryPage = Math.max(1, Number(filters.subcategoryPage) || 1);
  const subcategories = useQuery({
    queryKey: ['admin', 'categories', filters.category, subcategoryPage],
    queryFn: ({ signal }) => listAdminCategories({ parent: filters.category, page: subcategoryPage, limit: 20 }, signal),
    enabled: Boolean(filters.category),
    retry: false,
  });

  function updateFilter(name, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    if (name === 'category') {
      next.delete('subcategory');
      next.delete('subcategoryPage');
    }
    setSearchParams(next);
  }
  function changePage(nextPage) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(nextPage));
    setSearchParams(next);
  }
  function submitSearch(event) {
    event.preventDefault();
    updateFilter('q', new FormData(event.currentTarget).get('q').trim());
  }
  const data = products.data;
  const pagination = data?.pagination || {};
  const totalPages = pagination.pages ?? pagination.totalPages ?? Math.ceil((pagination.total || 0) / 20);
  const rows = data?.products || [];

  return (
    <main className="admin-shell">
      <div className="admin-page-heading">
        <div><p className="admin-eyebrow">Catalog management</p><h1>Products</h1><p>Review prices, inventory and publication before making a product public.</p></div>
        <div className="admin-inline"><Link className="admin-button admin-button-secondary" to="/admin/website/overview">Dashboard</Link><Link className="admin-button admin-button-secondary" to="/admin/website/categories">Categories</Link><Link className="admin-button admin-button-secondary" to="/admin/website/homepage">Homepage selections</Link><Link className="admin-button admin-button-secondary" to="/admin/commerce/orders">Commerce management</Link><Link className="admin-button" to="/admin/products/new">Add product</Link></div>
      </div>
      <section className="admin-panel" aria-label="Product filters">
        <form className="admin-search" onSubmit={submitSearch}>
          <label htmlFor="admin-product-search">Search product name</label>
          <div className="admin-inline"><input key={filters.q || ''} id="admin-product-search" name="q" type="search" defaultValue={filters.q || ''} maxLength={100} placeholder="Search products" /><button className="admin-button" type="submit">Search</button></div>
        </form>
        <div className="admin-filter-grid">
          <label>Category<select value={filters.category || ''} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{(categories.data?.categories || []).map((category) => <option key={catalogId(category)} value={category.slug}>{category.name}</option>)}</select></label>
          <label>Subcategory<select value={filters.subcategory || ''} disabled={!filters.category || subcategories.isPending} onChange={(event) => updateFilter('subcategory', event.target.value)}><option value="">All subcategories</option>{(subcategories.data?.categories || []).map((category) => <option key={catalogId(category)} value={category.slug}>{category.name}</option>)}</select></label>
          <label>Publication<select value={filters.status || ''} onChange={(event) => updateFilter('status', event.target.value)}><option value="">All statuses</option><option value="draft">Draft</option><option value="ready">Ready</option><option value="hold">Hold</option></select></label>
          <label>Price approval<select value={filters.priceApproved || ''} onChange={(event) => updateFilter('priceApproved', event.target.value)}><option value="">All prices</option><option value="true">Approved</option><option value="false">Provisional</option></select></label>
          <label>Inventory approval<select value={filters.inventoryApproved || ''} onChange={(event) => updateFilter('inventoryApproved', event.target.value)}><option value="">All inventory</option><option value="true">Approved</option><option value="false">Provisional</option></select></label>
          <label>Availability<select value={filters.available || ''} onChange={(event) => updateFilter('available', event.target.value)}><option value="">All availability</option><option value="true">Available</option><option value="false">Unavailable</option></select></label>
          <label>Inventory mode<select value={filters.inventoryMode || ''} onChange={(event) => updateFilter('inventoryMode', event.target.value)}><option value="">All modes</option><option value="tracked">Stock tracked</option><option value="made_to_order">Made by Request</option></select></label>
          <label>Catalog review<select value={filters.reviewRequired || ''} onChange={(event) => updateFilter('reviewRequired', event.target.value)}><option value="">All products</option><option value="true">Review required</option><option value="false">Review resolved</option></select></label>
          <label>Sort products<select value={filters.sort || 'newest'} onChange={(event) => updateFilter('sort', event.target.value)}>{sortOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        {(categories.isError || subcategories.isError) && <p className="admin-feedback admin-feedback-error" role="alert">Category filters could not be loaded. {adminErrorMessage(categories.error || subcategories.error)}</p>}
        {filters.category && (subcategories.data?.pagination?.total || 0) > 20 && <div className="admin-inline admin-subcategory-pages"><span>Subcategory choices, page {subcategoryPage}</span><button type="button" className="admin-button admin-button-secondary" disabled={subcategoryPage <= 1} onClick={() => updateFilter('subcategoryPage', String(subcategoryPage - 1))}>Previous choices</button><button type="button" className="admin-button admin-button-secondary" disabled={subcategoryPage * 20 >= subcategories.data.pagination.total} onClick={() => updateFilter('subcategoryPage', String(subcategoryPage + 1))}>Next choices</button></div>}
        <button className="admin-text-button" type="button" onClick={() => setSearchParams({})}>Clear all filters</button>
      </section>
      {products.isPending && <p className="admin-state" role="status">Loading products…</p>}
      {products.isError && <div className="admin-state admin-feedback-error" role="alert"><p>{adminErrorMessage(products.error)}</p><button type="button" className="admin-button" onClick={() => products.refetch()}>Try again</button></div>}
      {products.isSuccess && <>
        <p role="status" className="admin-result-count">{pagination.total ?? rows.length} matching products{products.isFetching ? ' · Updating…' : ''}</p>
        {rows.length === 0 ? <div className="admin-state"><h2>No products found</h2><p>Adjust the filters or add a product. Imported draft products appear here after an authorized staging import.</p></div> :
          <div className="admin-table-scroll" tabIndex={0} aria-label="Products table, scroll horizontally on small screens">
            <table className="admin-products-table"><thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Inventory</th><th scope="col">Publication</th><th scope="col">Review</th><th scope="col">Action</th></tr></thead><tbody>
              {rows.map((product) => <tr key={catalogId(product)}><td><strong>{product.name}</strong><span className="admin-cell-note">{product.sku || product.externalCatalogId || product.slug}</span>{product.bestSeller && <span className="admin-badge">Best Seller selection</span>}</td><td>{product.pricePiastres == null ? 'Not set' : money.format(product.pricePiastres / 100)}<span className={`admin-cell-note ${product.priceApproved ? '' : 'admin-provisional'}`}>{product.priceApproved ? 'Approved' : 'Provisional'}</span></td><td>{product.inventory?.mode === 'made_to_order' ? 'Made by Request' : `${product.inventory?.quantity ?? '—'} in stock`}<span className="admin-cell-note">{product.inventory?.available === false ? 'Unavailable' : 'Available'} · {product.inventory?.approved ? 'Approved' : 'Provisional'}</span></td><td><span className="admin-badge">{product.status}</span></td><td>{product.reviewRequired ? 'Review required' : 'Resolved'}</td><td><div className="admin-product-actions"><Link to={`/admin/products/${catalogId(product)}/edit`}>Edit <span className="admin-visually-hidden">{product.name}</span></Link><Link to={`/admin/products/${catalogId(product)}/preview`}>Preview <span className="admin-visually-hidden">{product.name}</span></Link></div></td></tr>)}
            </tbody></table>
          </div>}
        <nav className="admin-pagination" aria-label="Product pagination"><button type="button" className="admin-button admin-button-secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous page</button><span>Page {page} of {Math.max(1, totalPages)}</span><button type="button" className="admin-button admin-button-secondary" disabled={page >= totalPages || page >= 200} onClick={() => changePage(page + 1)}>Next page</button></nav>
      </>}
    </main>
  );
}
