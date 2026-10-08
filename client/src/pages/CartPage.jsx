import { Link } from 'react-router-dom';
import { useCart } from '../commerce/CartContext';
import { commerceError, money } from '../commerce/api';

export default function CartPage() {
  const { cart, checkoutEnabled, loading, error, pending, setQuantity, remove, clear } = useCart();
  const invalid = cart.items.some((item) => !item.valid);
  if (loading) return <main className="commerce-page"><p role="status">Loading your cart…</p></main>;
  if (error) return <main className="commerce-page"><h1>Your Cart</h1><p role="alert">{commerceError(error)}</p><Link to="/shop">Return to shop</Link></main>;
  return <main className="commerce-page"><div className="commerce-heading"><div><p className="eyebrow">Thoughtful gifts, ready for you</p><h1>Your Cart</h1></div>{cart.items.length > 0 && <button className="commerce-link-button" disabled={pending} onClick={() => clear().catch(() => {})}>Clear cart</button>}</div>
    {!cart.items.length ? <div className="commerce-empty"><p>Your cart is empty.</p><Link className="button button-primary" to="/shop">Explore the shop</Link></div> : <div className="commerce-cart-layout">
      <section aria-label="Cart items" className="commerce-cart-items">{cart.items.map((item) => {
        const ProductLink = item.slug ? Link : 'div';
        const detailUrl = item.slug ? `/products/${item.slug}` : undefined;
        return <article key={item.id} className="commerce-cart-item">
        <ProductLink to={detailUrl} className="commerce-cart-photo">{item.mainImageUrl ? <img src={item.mainImageUrl} alt={item.name} loading="lazy" /> : <span>Product image</span>}</ProductLink>
        <div className="commerce-cart-item-content"><ProductLink to={detailUrl}><h2>{item.name || 'Unavailable product'}</h2></ProductLink>{item.variantKey && <p className="commerce-muted">{item.variantLabel || item.variantKey}</p>}
          {Object.entries(item.personalization || {}).map(([key, value]) => <p key={key} className="commerce-muted">{key.replaceAll('_', ' ')}: {Array.isArray(value) ? `${value.length} private file${value.length === 1 ? '' : 's'}` : value}</p>)}
          {item.customization && <p className="commerce-muted">Configured for you{item.customization.templateName ? ` · ${item.customization.templateName}` : ''}</p>}
          {item.valid ? <p>{money(item.unitPricePiastres)} each</p> : <p className="form-error" role="alert">{item.error || 'This item is currently unavailable. Please remove it or review its options.'}</p>}
          <div className="commerce-cart-controls"><label>Quantity<select value={item.quantity} disabled={pending || !item.valid} onChange={(event) => setQuantity(item.id, Number(event.target.value)).catch(() => {})}>{Array.from({ length: 99 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button className="commerce-link-button" disabled={pending} onClick={() => remove(item.id).catch(() => {})}>Remove {item.name}</button></div>
        </div><strong className="commerce-cart-line-total">{item.valid ? money(item.lineTotalPiastres) : 'Unavailable'}</strong>
      </article>; })}</section>
      <aside className="commerce-summary"><h2>Order Summary</h2><dl><div><dt>Subtotal</dt><dd>{money(cart.subtotalPiastres)}</dd></div></dl><p className="commerce-muted">Shipping and eligible discounts are calculated at checkout. Availability and approved prices are checked again before ordering.</p>
        {invalid && <p className="form-error">Review unavailable items before checkout.</p>}
        {checkoutEnabled && !invalid ? <Link className="button button-primary" to="/checkout">Proceed to Checkout</Link> : <><button className="button button-primary" disabled>Checkout unavailable</button>{!checkoutEnabled && <p className="commerce-muted">Ordering has not been enabled yet.</p>}</>}
        <Link to="/shop" className="commerce-continue">Continue shopping</Link>
      </aside>
    </div>}
  </main>;
}
