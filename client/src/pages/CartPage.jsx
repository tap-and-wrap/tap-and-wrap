import SavedProductPhotos from '../product-photos/SavedProductPhotos.jsx';
import SavedProductEngraving from '../product-engraving/SavedProductEngraving.jsx';
import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import { Link } from 'react-router-dom';
import { productHref } from '../../../shared/product-paths.mjs';
import { useSession } from '../auth/SessionProvider.jsx';
import { useCart } from '../commerce/CartContext';
import { commerceError, money } from '../commerce/api';
import EngravingCartCard from '../engraving/EngravingCartCard.jsx';
import PersonalizationSummary from '../commerce/PersonalizationSummary.jsx';
import GiftBoxCartSummary from '../commerce/GiftBoxCartSummary.jsx';
import GiftBoxPreview from '../commerce/GiftBoxPreview.jsx';
import CartLine from '../commerce/CartLine.jsx';

export default function CartPage() {
  const { cart,checkoutEnabled,mixedCheckout,loading,error,pending,setQuantity,remove,refresh }=useCart();
  const session=useSession();
  const invalid=cart.items.some(item=>!item.valid), gifts=cart.items.some(item=>item.kind==='gift_box_v2'), engraving=cart.items.some(item=>isEngravingKind(item.kind));
  if(loading) return <main className="commerce-page"><p role="status">Loading your cart…</p></main>;
  if(error) return <main className="commerce-page"><h1>Your Cart</h1><p role="alert">{commerceError(error)}</p><div className="button-group"><button type="button" className="button button-dark" onClick={()=>refresh()}>Try again</button><Link className="button button-secondary" to="/shop">Return to shop</Link></div></main>;
  return <main className="commerce-page"><div className="commerce-heading"><div><p className="eyebrow">Thoughtful gifts, ready for you</p><h1 tabIndex={-1}>Your Cart</h1></div></div>
    {!cart.items.length ? <div className="commerce-empty"><p>Your cart is empty.</p><Link className="button button-primary" to="/shop">Explore the shop</Link></div> : <div className="commerce-cart-layout">
      <section aria-label="Cart items" className="commerce-cart-items">{cart.items.map(item=>{
        const key=`${session.ownerKey}:${session.generation}:${item.id}`;
        if(isEngravingKind(item.kind)) return <EngravingCartCard key={key} item={item} pending={pending} remove={remove}/>;
        const gift=item.kind==='gift_box_v2', name=gift?'Gift Box':item.name||'Unavailable product';
        const url=item.slug?productHref(item):null;
        const photo=item.mainImageUrl?<img src={item.mainImageUrl} alt={name} loading="lazy"/>:<span>Product image unavailable</span>;
        return <CartLine key={key} item={item} name={name} title={!gift&&url?<Link to={url}>{name}</Link>:null} image={gift?<GiftBoxPreview giftBox={item.giftBox}/>:url?<Link to={url} aria-label={`View ${name}`}>{photo}</Link>:photo} pending={pending} setQuantity={setQuantity} remove={remove} recovery={item.attachments?.replacementRequired&&url?<Link to={url}>Review product and replace files</Link>:null} design={gift || Boolean(item.productEngraving || item.customization || item.personalization && Object.keys(item.personalization).length)}>
          {gift?<GiftBoxCartSummary giftBox={item.giftBox}/>:<>
            <dl><div><dt>Product</dt><dd>{url?<Link to={url}>{name}</Link>:name}</dd></div>{item.variantKey&&<div><dt>Option</dt><dd>{item.variantLabel||item.variantKey}</dd></div>}</dl>
            <PersonalizationSummary values={item.personalization} definitions={item.personalizationDefinitions}/>
            {(item.photoPurchase || item.photoSelection) && <><SavedProductPhotos purchase={item.photoPurchase || { ...item.photoSelection, slots: [] }} values={item.personalization}/>{url && !item.productEngraving && <Link to={`${url}?photoEdit=${item.id}`}>Edit photo choices</Link>}</>}
            {item.productEngraving && <><p>Product engraving ? {money(item.productEngraving.surchargePiastres)} per item</p><SavedProductEngraving cartLineId={item.id}/>{url && <Link to={`${url}?engravingEdit=${item.id}`}>Edit engraving design</Link>}</>}
            {item.customization&&<p>Configured for you{item.customization.templateName?` · ${item.customization.templateName}`:''}</p>}
          </>}
          {item.attachments?.expiresAt&&<p className="commerce-muted">Private files expire <time dateTime={item.attachments.expiresAt}>{new Date(item.attachments.expiresAt).toLocaleString()}</time>. Adding to cart does not extend their lifetime.</p>}
        </CartLine>;
      })}</section>
      <aside className="commerce-summary"><h2>Order Summary</h2><dl><div><dt>Subtotal</dt><dd>{money(cart.subtotalPiastres)}</dd></div><div><dt>Delivery</dt><dd>Confirmed at checkout</dd></div></dl><p className="commerce-muted">Eligible discounts are applied at checkout.</p>
        {mixedCheckout&&<p className="commerce-muted">One order, with engraving payment deferred until inspection and design acceptance.</p>}
        {gifts&&!mixedCheckout&&<p className="commerce-muted">Gift Boxes support COD or InstaPay at checkout. Transfers are verified before preparation.</p>}
        {engraving&&!mixedCheckout&&<p className="commerce-muted">Submit your engraving request first. Payment is requested only after inspection, design review and your acceptance.</p>}
        {invalid&&<p className="form-error" role="alert">Review unavailable items before checkout.</p>}
        {checkoutEnabled&&!invalid?<Link className="button button-primary" to="/checkout">Proceed to Checkout</Link>:<><button className="button button-primary" disabled>Checkout unavailable</button>{!mixedCheckout&&!invalid&&<p className="commerce-muted">Online ordering is currently unavailable for this cart. Your items remain saved.</p>}</>}
        <Link to="/shop" className="commerce-continue">Continue shopping</Link>
      </aside>
    </div>}
  </main>;
}
