import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { formatCatalogPrice } from '../utils/catalog.js';
import { useCart } from '../commerce/CartContext.jsx';

export default function ProductCard({ product }) {
  const cardRef = useRef(null);
  const cart = useCart();
  const approvedPrice = product.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres >= 0;
  const orderingAvailable = approvedPrice && product.orderingAvailable === true;
  const action = !orderingAvailable ? 'Sold Out' : product.requiresOptions ? 'Choose Options' : 'Add to Cart';
  const detailUrl = `/products/${encodeURIComponent(product.slug)}`;

  return (
    <article ref={cardRef} className="catalog-card">
      <Link className="catalog-card-image" to={detailUrl} aria-label={`View ${product.name}`}>
        {product.mainImageUrl ? (
          <img src={product.mainImageUrl} alt={product.name} width="600" height="600" loading="lazy" decoding="async" />
        ) : <span className="catalog-image-placeholder" aria-hidden="true">Image coming soon</span>}
        <span className="catalog-card-badges">
          {product.bestSeller === true && <span>Best Seller</span>}
          {!orderingAvailable && <span>Sold Out</span>}
        </span>
      </Link>
      <div className="catalog-card-body">
        {product.category?.name && <p className="catalog-card-category">{product.category.name}</p>}
        <h3><Link to={detailUrl}>{product.name}</Link></h3>
        <p className="catalog-price">
          <span>{approvedPrice ? formatCatalogPrice(product.pricePiastres) : 'Price unavailable'}</span>
          {approvedPrice && Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > product.pricePiastres && (
            <del>{formatCatalogPrice(product.compareAtPiastres)}</del>
          )}
        </p>
        {!orderingAvailable ? <button type="button" className="catalog-card-action" disabled aria-label={`Sold Out: ${product.name}`}>Sold Out</button>
          : product.requiresOptions ? <Link className="catalog-card-action" to={detailUrl} aria-label={`Choose Options: ${product.name}`}>Choose Options</Link>
            : <button type="button" className="catalog-card-action" disabled={cart.pending} aria-label={`Add to Cart: ${product.name}`} onClick={() => cart.add({ productId: product._id, quantity: 1 }, cardRef.current?.querySelector('img')).catch(() => {})}>{cart.pending ? 'Please wait…' : action}</button>}
      </div>
    </article>
  );
}
