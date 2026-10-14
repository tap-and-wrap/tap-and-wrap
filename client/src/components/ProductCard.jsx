import { Link } from 'react-router-dom';
import { useRef } from 'react';
import { formatCatalogPrice } from '../utils/catalog.js';
import { useCart } from '../commerce/CartContext.jsx';

export default function ProductCard({ product }) {
  const cardRef = useRef(null);
  const cart = useCart();
  const approvedPrice = product.priceApproved === true && Number.isSafeInteger(product.pricePiastres) && product.pricePiastres > 0;
  const enquiryRequired = product.browseOnly === true || !approvedPrice || product.orderingAvailable !== true;
  const orderingAvailable = !enquiryRequired && product.orderingAvailable === true;
  const enquiryUrl = `https://wa.me/201508216472?text=${encodeURIComponent(`Hello Tap & Wrap, please confirm the price and availability of ${product.name}: https://tapandwrap.net/products/${encodeURIComponent(product.slug)}`)}`;
  const action = !orderingAvailable ? 'Sold Out' : product.requiresOptions ? 'Choose Options' : 'Add to Cart';
  const detailUrl = `/products/${encodeURIComponent(product.slug)}`;

  return (
    <article ref={cardRef} className="catalog-card">
      <Link className="catalog-card-image" to={detailUrl} aria-label={`View ${product.name}`}>
        {product.mainImageUrl ? (
          <img src={product.mainImageUrl} alt={product.name} width="600" height="600" loading="lazy" decoding="async" />
        ) : <span className="catalog-image-placeholder" aria-hidden="true">Image coming soon</span>}
        <span className="catalog-card-badges">
          {!enquiryRequired && product.bestSeller === true && <span>Best Seller</span>}
          {enquiryRequired ? <span>Ask for details</span> : !orderingAvailable && <span>Sold Out</span>}
        </span>
      </Link>
      <div className="catalog-card-body">
        {product.category?.name && <p className="catalog-card-category">{product.category.name}</p>}
        <h3><Link to={detailUrl}>{product.name}</Link></h3>
        <p className="catalog-price">
          <span>{enquiryRequired ? 'Price on request' : formatCatalogPrice(product.pricePiastres)}</span>
          {!enquiryRequired && approvedPrice && Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > product.pricePiastres && (
            <del>{formatCatalogPrice(product.compareAtPiastres)}</del>
          )}
        </p>
        {enquiryRequired ? <a className="catalog-card-action" href={enquiryUrl} target="_blank" rel="noopener noreferrer" aria-label={`Enquire on WhatsApp about ${product.name}`}>Enquire on WhatsApp</a>
          : !orderingAvailable ? <Link className="catalog-card-action" to={detailUrl} aria-label={`View details: ${product.name}`}>View Details</Link>
          : product.requiresOptions ? <Link className="catalog-card-action" to={detailUrl} aria-label={`Choose Options: ${product.name}`}>Choose Options</Link>
            : <button type="button" className="catalog-card-action" disabled={cart.pending} aria-label={`Add to Cart: ${product.name}`} onClick={() => cart.add({ productId: product._id, quantity: 1 }, cardRef.current?.querySelector('img')).catch(() => {})}>{cart.pending ? 'Please wait…' : action}</button>}
      </div>
    </article>
  );
}
