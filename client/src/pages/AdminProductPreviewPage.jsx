import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getAdminProductPreview } from '../services/catalog.js';
import { ProductContent } from './ProductPage.jsx';

function PreviewNotice({ product, id }) {
  const inventory = product.inventory || {};
  const imageCount = product.gallerySlots?.length || 0;
  return (
    <aside className="admin-preview-notice" aria-label="Authenticated staging preview">
      <div className="admin-preview-heading">
        <div><p className="catalog-eyebrow">Authenticated staging preview</p><h2>Review saved product</h2></div>
        <div className="admin-preview-actions"><Link className="catalog-secondary-button" to={`/admin/products/${encodeURIComponent(id)}/edit`}>Edit product</Link><Link className="catalog-secondary-button" to="/admin/products">Back to products</Link></div>
      </div>
      <p>This view does not publish the product or enable ordering. Provisional prices remain hidden.</p>
      <dl className="admin-preview-facts">
        <div><dt>Publication</dt><dd>{product.status || 'Not set'}</dd></div>
        <div><dt>Source ID</dt><dd>{product.externalCatalogId || 'No imported ID'}</dd></div>
        <div><dt>Catalog role</dt><dd>{product.catalogRole || 'Not provided'}</dd></div>
        <div><dt>Price</dt><dd>{product.priceApproved ? 'Approved' : 'Provisional · approval required'}</dd></div>
        <div><dt>Inventory</dt><dd>{inventory.mode === 'made_to_order' ? 'Made by Request' : `Tracked quantity: ${inventory.quantity ?? 'Not set'}`} · {inventory.approved ? 'Approved' : 'Provisional'}</dd></div>
        <div><dt>Catalog review</dt><dd>{product.preview?.reviewRequired ? 'Review required' : 'Review resolved'}</dd></div>
        <div><dt>Category</dt><dd>{product.category ? `${product.category.name}${product.category.active === false ? ' · Inactive' : ''}` : 'Not set'}</dd></div>
        <div><dt>Subcategory</dt><dd>{product.subcategory ? `${product.subcategory.name}${product.subcategory.active === false ? ' · Inactive' : ''}` : 'Not set'}</dd></div>
        <div><dt>Image ordering</dt><dd>{imageCount} saved reference{imageCount === 1 ? '' : 's'}{imageCount > 0 && ' · Image 1 is the selected main photo'}</dd></div>
      </dl>
      {product.gallerySlots?.some((slot) => !slot.url) && <p className="admin-preview-media-note">Media is not configured for some saved references. Numbered placeholders preserve their existing gallery positions; no local image paths are exposed.</p>}
    </aside>
  );
}

export default function AdminProductPreviewPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['admin', 'product-preview', id],
    queryFn: ({ signal }) => getAdminProductPreview(id, signal),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
  if (query.isPending) return <main className="admin-shell"><p role="status">Loading authenticated product preview…</p></main>;
  if (query.isError || !query.data?.product?.preview?.enabled) {
    const status = query.error?.response?.status;
    return <main className="admin-shell admin-access-state"><h1>Staging preview unavailable</h1><p role="alert">{status === 401 ? 'Your administrator session has expired. Sign in again to access this preview.' : status === 403 ? 'Administrator permission is required to access this preview.' : 'A dedicated staging database and the staging preview setting are required. The product may also be unavailable.'}</p><p>Importing the catalog and configuring staging access require separate authorization. No draft product is loaded from public APIs.</p><div className="admin-preview-actions"><Link className="admin-button" to="/admin/products">Back to products</Link>{status === 401 ? <Link className="admin-button admin-button-secondary" to={`/login?returnTo=${encodeURIComponent(`/admin/products/${id}/preview`)}`}>Sign in</Link> : <button type="button" className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button>}</div></main>;
  }
  const product = query.data.product;
  return <ProductContent key={id} product={product} preview previewNotice={<PreviewNotice product={product} id={id} />} />;
}
