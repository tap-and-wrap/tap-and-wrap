import PersonalizationSummary from '../commerce/PersonalizationSummary.jsx';
import { Link } from 'react-router-dom';
import { productHref } from '../../../shared/product-paths.mjs';
import { useCart } from '../commerce/CartContext';
import { commerceError, money } from '../commerce/api';
import GiftBoxCartSummary from '../commerce/GiftBoxCartSummary.jsx';

export default function CartPage() {
  const { cart, checkoutEnabled, loading, error, pending, setQuantity, remove, clear, refresh } = useCart();
  const invalid = cart.items.some((item) => !item.valid);
  const giftCheckoutBlocked = cart.items.some((item) => item.kind === 'gift_box_v2');
  if (loading) return <main className="commerce-page"><p role="status">Loading your cart…</p></main>;
  if (error) return <main className="commerce-page"><h1>Your Cart</h1><p role="alert">{commerceError(error)}</p><div className="button-group"><button type="button" className="button button-dark" onClick={() => refresh()}>Try again</button><Link className="button button-secondary" to="/shop">Return to shop</Link></div></main>;
  return <main className="commerce-page"><div className="commerce-heading"><div><p className="eyebrow">Thoughtful gifts, ready for you</p><h1>Your Cart</h1></div>{cart.items.length > 0 && <button className="commerce-link-button" disabled={pending} onClick={() => clear().catch(() => {})}>Clear cart</button>}</div>
    {!cart.items.length ? <div className="commerce-empty"><p>Your cart is empty.</p><Link className="button button-primary" to="/shop">Explore the shop</Link></div> : <div className="commerce-cart-layout">
      <section aria-label="Cart items" className="commerce-cart-items">{cart.items.map((item) => {
        const gift = item.kind === 'gift_box_v2';
        if (gift) return <article key={item.id} className="commerce-cart-item commerce-gift-cart-item" aria-label={item.name || 'Build Your Gift Box'}>
          <div className="commerce-cart-photo commerce-gift-photo"><span>Gift box preview unavailable</span></div>
          <div className="commerce-cart-item-content"><h2>{item.name || 'Build Your Gift Box'}</h2>
            <GiftBoxCartSummary giftBox={item.giftBox} />
            {item.valid ? <p>{money(item.unitPricePiastres)} per completed gift box</p> : <p className="form-error" role="alert">{item.error || 'This configured gift is currently unavailable. Remove it and review the builder choices.'}</p>}
            <div className="commerce-cart-controls"><label>Quantity<select aria-label={`Quantity for ${item.name || 'Build Your Gift Box'}`} value={item.quantity} disabled={pending || !item.valid} onChange={(event) => setQuantity(item.id, Number(event.target.value)).catch(() => {})}>{Array.from({ length: 99 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button className="commerce-link-button" disabled={pending} onClick={() => remove(item.id).catch(() => {})}>Remove {item.name || 'Build Your Gift Box'}</button></div>
          </div><strong className="commerce-cart-line-total">{item.valid ? money(item.lineTotalPiastres) : 'Unavailable'}</strong>
        </article>;
        const ProductLink = item.slug ? Link : 'div';
        const detailUrl = item.slug ? productHref(item) : undefined;
        return <article key={item.id} className="commerce-cart-item">
        <ProductLink to={detailUrl} className="commerce-cart-photo">{item.mainImageUrl ? <img src={item.mainImageUrl} alt={item.name} loading="lazy" /> : <span>Product image</span>}</ProductLink>
        <div className="commerce-cart-item-content"><ProductLink to={detailUrl}><h2>{item.name || 'Unavailable product'}</h2></ProductLink>{item.variantKey && <p className="commerce-muted">{item.variantLabel || item.variantKey}</p>}
          <PersonalizationSummary values={item.personalization} definitions={item.personalizationDefinitions} />
          {item.customization && <p className="commerce-muted">Configured for you{item.customization.templateName ? ` · ${item.customization.templateName}` : ''}</p>}
          {item.attachments?.status === 'temporary' && item.attachments.expiresAt && <p className="commerce-muted">Private cart files expire <time dateTime={item.attachments.expiresAt}>{new Date(item.attachments.expiresAt).toLocaleString()}</time> unless associated with a successful order.</p>}
          {item.attachments?.replacementRequired && <div className="commerce-notice"><p>Your private files are no longer available. Remove this item and select replacement files before adding it again.</p>{detailUrl && <Link to={detailUrl}>Review product and replace files</Link>}</div>}
          {item.valid ? <p>{money(item.unitPricePiastres)} each</p> : <p className="form-error" role="alert">{item.error || 'This item is currently unavailable. Please remove it or review its options.'}</p>}
          <div className="commerce-cart-controls"><label>Quantity<select value={item.quantity} disabled={pending || !item.valid} onChange={(event) => setQuantity(item.id, Number(event.target.value)).catch(() => {})}>{Array.from({ length: 99 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label><button className="commerce-link-button" disabled={pending} onClick={() => remove(item.id).catch(() => {})}>Remove {item.name}</button></div>
        </div><strong className="commerce-cart-line-total">{item.valid ? money(item.lineTotalPiastres) : 'Unavailable'}</strong>
      </article>; })}</section>
      <aside className="commerce-summary"><h2>Order Summary</h2><dl><div><dt>Subtotal</dt><dd>{money(cart.subtotalPiastres)}</dd></div></dl><p className="commerce-muted">Eligible discounts are verified at checkout. Delivery is separate and Pending Confirmation; the owner will contact you on WhatsApp within 12 hours. Availability and approved prices are checked again before ordering.</p>
        {invalid && <p className="form-error">Review unavailable items before checkout.</p>}
        {giftCheckoutBlocked && <p className="commerce-muted">Gift-box checkout is unavailable while fulfillment and artwork approvals are pending. You can update or remove your saved gift boxes.</p>}
        {checkoutEnabled && !invalid && !giftCheckoutBlocked ? <Link className="button button-primary" to="/checkout">Proceed to Checkout</Link> : <><button className="button button-primary" disabled>Checkout unavailable</button>{!checkoutEnabled && !giftCheckoutBlocked && <p className="commerce-muted">Ordering has not been enabled yet.</p>}</>}
        <Link to="/shop" className="commerce-continue">Continue shopping</Link>
      </aside>
    </div>}
  </main>;
}
