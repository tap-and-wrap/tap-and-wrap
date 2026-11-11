import { productHref } from '../../../shared/product-paths.mjs';
import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { formatCatalogPrice } from '../utils/catalog.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext.jsx';

export default function ProductCard({ product }) {
  const cardRef = useRef(null);
  const cart = useCart();
  const { generation } = useSession();
  const [addingGeneration, setAdding] = useState(null);
  const adding = addingGeneration === generation;
  const operation = useRef(null);
  async function add() {
    if (operation.current === generation || cart.pending) return;
    operation.current = generation; setAdding(generation);
    try { await cart.add({ productId: product._id, quantity: 1 }, cardRef.current?.querySelector('img')); }
    catch { /* Shared cart feedback reports the failure. */ }
    finally { if (operation.current === generation) operation.current = null; setAdding(current => current === generation ? null : current); }
  }
  const approvedPrice = product.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres > 0;
  const outOfStock = approvedPrice && product.businessState === 'out_of_stock';
  const enquiryRequired = !outOfStock && (product.browseOnly === true || !approvedPrice || product.orderingAvailable !== true);
  const orderingAvailable = !enquiryRequired && product.orderingAvailable === true;
  const enquiryUrl = `https://wa.me/201508216472?text=${encodeURIComponent(`Hello Tap & Wrap, please confirm the price and availability of ${product.name}: https://tapandwrap.net${productHref(product)}`)}`;
  const action = !orderingAvailable ? 'Sold Out' : product.requiresOptions ? 'Choose Options' : 'Add to Cart';
  const detailUrl = productHref(product);

  return (
    <article ref={cardRef} className="catalog-card">
      <div className="catalog-card-image">
        {product.mainImageUrl ? (
          <img src={product.mainImageUrl} alt={product.name} width="600" height="600" loading="lazy" decoding="async" />
        ) : <span className="catalog-image-placeholder" aria-hidden="true">Image coming soon</span>}
        <span className="catalog-card-badges">
          {!enquiryRequired && product.bestSeller === true && <span>Best Seller</span>}
          {enquiryRequired ? <span>{approvedPrice ? 'Confirm availability' : 'Price on Request'}</span> : !orderingAvailable && <span>Out of Stock</span>}
        </span>
      </div>
      <div className="catalog-card-body">
        {product.category?.name && <p className="catalog-card-category">{product.category.name}</p>}
        <h3><Link className="catalog-card-link" to={detailUrl}><span className="catalog-card-title">{product.name}</span></Link></h3>
        <p className="catalog-price">
          <span>{approvedPrice ? formatCatalogPrice(product.pricePiastres) : 'Price on Request'}</span>
          {approvedPrice && Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > product.pricePiastres && (
            <del>{formatCatalogPrice(product.compareAtPiastres)}</del>
          )}
        </p>
        {enquiryRequired ? <a className="catalog-card-action" href={enquiryUrl} target="_blank" rel="noopener noreferrer" aria-label={`Enquire on WhatsApp about ${product.name}`}>Enquire on WhatsApp</a>
          : !orderingAvailable ? <Link className="catalog-card-action" to={detailUrl} aria-label={`View details: ${product.name}`}>View Details</Link>
          : product.requiresOptions ? <Link className="catalog-card-action" to={detailUrl} aria-label={`Choose Options: ${product.name}`}>Choose Options</Link>
            : <button type="button" className="catalog-card-action" disabled={cart.pending} aria-label={`Add to Cart: ${product.name}`} onClick={add}>{adding ? 'Please wait…' : action}</button>}
      </div>
    </article>
  );
}
