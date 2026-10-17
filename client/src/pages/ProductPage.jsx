import ProductPersonalizationDialog from '../commerce/ProductPersonalizationDialog.jsx';
import PersonalizationSummary from '../commerce/PersonalizationSummary.jsx';
import { productDraft, notifyProductDraft } from '../commerce/product-personalization-drafts.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { authGeneration } from '../services/api.js';
import { productHref } from '../../../shared/product-paths.mjs';
import { categoryHref } from '../../../shared/category-paths.mjs';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import { getProduct } from '../services/catalog.js';
import ProductCard from '../components/ProductCard.jsx';
import { formatCatalogPrice, variantLabel } from '../utils/catalog.js';
import { useCart } from '../commerce/CartContext.jsx';
import ConfiguredFields, { validateConfiguredFields } from '../commerce/ConfiguredFields.jsx';
import { commerceError, discardUploads, uploadConfiguredFields } from '../commerce/api.js';
import { ProductReviews } from '../components/PublicContent.jsx';
import CustomerWords from '../components/CustomerWords.jsx';
import { ProductMetadata } from '../seo/PageMetadata.jsx';
import { emitTracking } from '../tracking/client.js';
import { FieldError, fieldErrorProps, focusInvalidField } from '../components/FormFeedback.jsx';

function quantityLimit(inventory) {
  return inventory?.mode === 'tracked' && Number.isSafeInteger(inventory.quantity)
    ? Math.max(1, Math.min(99, inventory.quantity))
    : 99;
}

export function ProductContent(props) {
  const session = useSession();
  const key = JSON.stringify([session.ownerKey, props.product._id, props.product.personalization]);
  return <ProductContentBody key={key} {...props} draftKey={key} sessionReady={session.ready} />;
}

function ProductContentBody({ product, relatedProducts = [], preview = false, previewNotice, embedded = false, draftKey, sessionReady }) {
  const cart = useCart();
  const [draft] = useState(() => productDraft(draftKey));
  useSyncExternalStore(listener => { draft.listeners.add(listener); return () => draft.listeners.delete(listener); }, () => draft.version);
  const [personalization, setPersonalizationState] = useState(draft.values);
  const [complete, setComplete] = useState(draft.complete);
  const [customizing, setCustomizing] = useState(false);
  const uncertain = Boolean(draft.request);
  function setPersonalization(values) {
    draft.values = values; draft.touchedAt = Date.now();
    setPersonalizationState(values);
  }
  function finishPersonalization() { draft.complete = true; setComplete(true); setCustomizing(false); }
  const [fieldErrors, setFieldErrors] = useState({});
  const [addError, setAddError] = useState('');
  const adding = Boolean(draft.busy);
  const [uploadStatus, setUploadStatus] = useState('');
  const [failedImages, setFailedImages] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [variantKey, setVariantKey] = useState(draft.variantKey || '');
  const [quantity, setQuantity] = useState(draft.quantity || 1);
  useEffect(() => { draft.variantKey = variantKey; draft.quantity = quantity; }, [draft, variantKey, quantity]);
  const [showSticky, setShowSticky] = useState(false);
  const purchaseRef = useRef(null);
  const variantId = useId();
  const quantityId = useId();
  const images = preview && product.gallerySlots?.length
    ? product.gallerySlots.map((slot) => ({ ...slot }))
    : [...new Set([product.mainImageUrl, ...(product.galleryUrls || [])].filter(Boolean))].map((url, index) => ({ url, position: index + 1, isMain: index === 0 }));
  const selectedImage = images[activeImage] || images[0];
  const variants = product.variants || [];
  const variant = variants.find((item) => item.key === variantKey);
  const price = variant ? variant.pricePiastres : product.pricePiastres;
  const approvedPrice = (variant ? variant.priceApproved !== false && (variant.priceApproved === true || product.priceApproved === true) : product.priceApproved === true) && Number.isSafeInteger(price) && price > 0;
  const enquiryRequired = !preview && (product.browseOnly === true || !approvedPrice || product.orderingAvailable !== true || variant?.orderingAvailable === false);
  const orderingAvailable = !preview && !enquiryRequired && approvedPrice && product.orderingAvailable === true && (!variant || variant.orderingAvailable === true);
  const enquiryUrl = `https://wa.me/201508216472?text=${encodeURIComponent(`Hello Tap & Wrap, please confirm the price and availability of ${product.name}: https://tapandwrap.net${productHref(product)}`)}`;
  const maximumQuantity = quantityLimit(variant?.inventory || product.inventory);
  const displayPrice = approvedPrice ? formatCatalogPrice(price) : preview ? 'Price awaiting approval' : 'Price on request';
  const personalizationFields = product.personalization?.fields || [];
  const requiresPersonalization = product.personalization?.requiredBeforePurchase === true;
  const personalizationValid = !Object.keys(validateConfiguredFields(personalizationFields, personalization)).length;
  const canCustomize = !requiresPersonalization && !preview && product.customization?.enabled === true && Boolean(product.customization?.templateId) && Boolean(product.customization?.serviceKind);

  useEffect(() => {
    if (preview || !purchaseRef.current || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
    observer.observe(purchaseRef.current);
    return () => observer.disconnect();
  }, [preview]);

  const focusOptions = () => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    purchaseRef.current.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    purchaseRef.current.querySelector('select, input, textarea')?.focus({ preventScroll: true });
  };
  const changeQuantity = (value) => setQuantity(Math.max(1, Math.min(maximumQuantity, Number.isFinite(Number(value)) ? Number(value) : 1)));
  async function addProduct(event) {
    event.preventDefault();
    if (preview || adding || draft.busy || cart.pending || !orderingAvailable || !sessionReady) return;
    if (requiresPersonalization && (!complete || !personalizationValid) && !draft.request) { setCustomizing(true); return; }
    const errors = validateConfiguredFields(personalizationFields, personalization);
    if (variants.length && !variant) errors.variant = 'Choose a size / color.';
    setFieldErrors(errors); setAddError('');
    if (Object.keys(errors).length && !draft.request) { focusInvalidField(purchaseRef.current); return; }
    const generation = authGeneration(), uploadedIds = [];
    draft.busy = true; notifyProductDraft(draft);
    try {
      if (!draft.request) {
        const fields = await uploadConfiguredFields(personalization, personalizationFields, { productId: product._id, onProgress: setUploadStatus, cache: draft.uploads }, uploadedIds);
        draft.request = { operationKey: crypto.randomUUID(), productId: product._id, variantKey: variant?.key || null, quantity, personalization: fields };
      }
      setUploadStatus('Verifying price and adding your item…');
      await cart.add(draft.request, document.querySelector('.product-main-image img'));
      draft.request = null; draft.uploads.clear();
    } catch (error) {
      if (generation !== authGeneration()) return;
      setAddError(commerceError(error));
      if (error.response && error.response.status < 500) draft.request = null;
      const completed = new Set([...draft.uploads.values()].flatMap(files => [...files.values()]));
      await discardUploads(uploadedIds.filter(id => !completed.has(id)));
    } finally { draft.busy = false; notifyProductDraft(draft); if (generation === authGeneration()) setUploadStatus(''); }
  }

  const Container = embedded ? 'div' : 'main';
  const ProductHeading = embedded ? 'h2' : 'h1';
  return (
    <Container className={`catalog-product-page ${embedded ? 'admin-preview-product' : ''} ${showSticky ? 'catalog-product-with-sticky' : ''}`}>
      {previewNotice}
      <nav className="product-breadcrumbs" aria-label="Breadcrumb">
        <Link to={preview ? '/admin/products' : '/shop'}>{preview ? 'Admin products' : 'Shop'}</Link>
        {product.category && <><ChevronRight size={14} aria-hidden="true" /><Link to={preview ? `/admin/products?category=${encodeURIComponent(product.category.slug)}` : categoryHref(product.category)}>{product.category.name}</Link></>}
        <ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{product.name}</span>
      </nav>
      <div className="product-detail-layout">
        <section className="product-gallery" aria-label="Product images">
          <div className="product-main-image">
            {selectedImage?.url && !failedImages.includes(selectedImage.url) ? <img src={selectedImage.url} alt={`${product.name}${activeImage ? `, image ${activeImage + 1}` : ''}`} width="900" height="900" loading="eager" fetchPriority="high" decoding="async" onError={() => setFailedImages((previous) => [...previous, selectedImage.url])} />
              : <span className="catalog-image-placeholder">{preview ? selectedImage ? `${selectedImage.isMain ? 'Main image · ' : ''}Image ${selectedImage.position} · Media not configured` : 'No image references recorded' : 'Image coming soon'}</span>}
            {!preview && !enquiryRequired && product.bestSeller === true && <span className="product-image-badge">Best Seller</span>}
          </div>
          {images.length > 1 && <div className="product-thumbnails" aria-label="Choose product image">
            {images.map((image, index) => <button key={preview ? image.position : image.url} type="button" className={activeImage === index ? 'is-active' : ''} aria-label={`View image ${image.position}${preview && image.isMain ? ' (main)' : ''}`} aria-pressed={activeImage === index} onClick={() => setActiveImage(index)}>{image.url ? <img src={image.url} alt="" width="100" height="100" loading="lazy" decoding="async" /> : <span className="product-preview-thumbnail">Image {image.position}{image.isMain && <small>Main</small>}</span>}</button>)}
          </div>}
        </section>
        <section className="product-summary" aria-labelledby="product-title">
          {product.category?.name && <p className="catalog-eyebrow">{product.category.name}</p>}
          <ProductHeading id="product-title">{product.name}</ProductHeading>
          <p className="catalog-price product-price"><span>{displayPrice}</span>{approvedPrice && Number.isSafeInteger(product.compareAtPiastres) && product.compareAtPiastres > price && <del>{formatCatalogPrice(product.compareAtPiastres)}</del>}</p>
          <p className={`product-stock-status ${orderingAvailable ? '' : 'is-unavailable'}`}>{preview ? 'Preview only · Ordering disabled' : enquiryRequired ? approvedPrice ? 'Online purchase unavailable · Enquire on WhatsApp' : 'Price and availability on request' : orderingAvailable ? (variant?.inventory || product.inventory)?.mode === 'made_to_order' ? 'Made by Request' : 'Available' : 'Currently unavailable'}</p>
          <form ref={purchaseRef} className="product-purchase-section" aria-label="Product options" onSubmit={addProduct} noValidate aria-busy={adding}>
            {variants.length > 0 && <div className="commerce-field"><label htmlFor={variantId}>Choose size / color</label>
              <select id={variantId} value={variantKey} disabled={adding || uncertain} {...fieldErrorProps(variantId, fieldErrors.variant)} required onChange={(event) => {
                const nextKey = event.target.value;
                const nextVariant = variants.find((item) => item.key === nextKey);
                setVariantKey(nextKey);
                setQuantity((current) => Math.min(current, quantityLimit(nextVariant?.inventory || product.inventory)));
              }}>
                <option value="">Choose an option</option>
                {variants.map((item) => <option key={item.key} value={item.key}>{variantLabel(item)}{!preview && item.orderingAvailable === false ? ' — Sold Out' : ''}</option>)}
              </select>
              <FieldError id={variantId}>{fieldErrors.variant}</FieldError>
            </div>}
            {!requiresPersonalization && personalizationFields.length > 0 && <fieldset className="product-personalization"><legend>Personalize your gift</legend><ConfiguredFields fields={personalizationFields} values={personalization} onChange={setPersonalization} errors={fieldErrors} disabled={preview || adding || uncertain || enquiryRequired} /></fieldset>}
            <div className="product-quantity-row">
              <label htmlFor={quantityId}>Quantity</label>
              <div className="product-quantity-controls">
                <button type="button" aria-label="Decrease quantity" disabled={adding || uncertain || quantity <= 1 || !orderingAvailable} onClick={() => changeQuantity(quantity - 1)}><Minus size={16} /></button>
                <input id={quantityId} type="number" inputMode="numeric" min="1" max={maximumQuantity} step="1" value={quantity} disabled={adding || uncertain || !orderingAvailable} onChange={(event) => changeQuantity(Math.floor(Number(event.target.value)))} />
                <button type="button" aria-label="Increase quantity" disabled={adding || uncertain || quantity >= maximumQuantity || !orderingAvailable} onClick={() => changeQuantity(quantity + 1)}><Plus size={16} /></button>
              </div>
            </div>
            {requiresPersonalization && !enquiryRequired && !preview && <>
              <button type="button" className={complete ? 'catalog-secondary-button product-customize-button' : 'button button-dark product-purchase-button'} disabled={adding || uncertain || !orderingAvailable} onClick={() => setCustomizing(true)}>{complete ? 'Edit' : 'Customize This'}</button>
              {complete && <><p className="commerce-muted">Your personalization is ready. Photos are still private on this device until Add to Cart.</p><PersonalizationSummary values={personalization} definitions={personalizationFields} /></>}
            </>}
            {enquiryRequired ? <a className="button button-dark product-purchase-button" href={enquiryUrl} target="_blank" rel="noopener noreferrer">Enquire on WhatsApp</a>
              : (!requiresPersonalization || complete || preview) && <button type="submit" className="button button-dark product-purchase-button" disabled={!orderingAvailable || adding || cart.pending || requiresPersonalization && !personalizationValid && !uncertain} aria-describedby="product-ordering-notice">{preview ? 'Ordering disabled' : adding ? 'Adding…' : uncertain ? 'Retry same Add to Cart' : orderingAvailable ? 'Add to Cart' : 'Sold Out'}</button>}
            {uncertain && <p role="alert">The add response is unconfirmed. Retry the same request or review your cart before adding another item. Reloading clears this local retry; check the cart first.</p>}
            {addError && <p role="alert" className="error-text">{addError}</p>}
            {adding && <p className="upload-progress" role="status"><progress aria-label="Adding your gift"/>{uploadStatus || 'Preparing your item…'}</p>}
            <p id="product-ordering-notice" className="product-ordering-notice">{preview ? 'This authenticated preview does not publish the product or enable cart, checkout or customization.' : enquiryRequired ? approvedPrice ? 'Contact our team on WhatsApp about options and availability. Online purchase is unavailable for this selection.' : 'Contact our team on WhatsApp for the price, options and availability. Online purchase is unavailable for this selection.' : personalizationFields.some(field => field.type === 'image') ? 'Your selected photos stay on this device until you press Add to Cart.' : 'Prices and availability are verified when adding to your cart.'}</p>
            {canCustomize && !enquiryRequired && <Link className="catalog-secondary-button product-customize-button" to={`${productHref(product)}/customize`}>Customize This</Link>}
          </form>
          <div className="product-accordions">
            <details open><summary>Description</summary><div className="product-description">{product.description || 'No description has been provided yet.'}</div></details>
            <details><summary>Product details</summary><div>{product.sku && <p>SKU: {product.sku}</p>}{product.subcategory?.name && <p>Subcategory: {product.subcategory.name}</p>}<p>{enquiryRequired ? 'Ask us to confirm availability.' : product.inventory?.mode === 'made_to_order' ? 'Made by Request' : preview ? 'Inventory approval is shown in the preview notice.' : 'Availability is shown above.'}</p></div></details>
            <details><summary>Shipping</summary><div><p>Read our <Link to="/shipping-policy">shipping policy</Link> for delivery information.</p></div></details>
          </div>
        </section>
      </div>
      {customizing && <ProductPersonalizationDialog product={product} fields={personalizationFields} values={personalization} onChange={setPersonalization} onComplete={finishPersonalization} onClose={() => setCustomizing(false)} />}
      {preview ? <ProductReviews key={product.slug} slug={product.slug} preview/> : <CustomerWords/>}
      {relatedProducts.length > 0 && <section className="product-related" aria-labelledby="product-related-heading"><h2 id="product-related-heading">You May Also Like</h2><div className="catalog-grid catalog-related-grid">{relatedProducts.slice(0, 4).map((item) => <ProductCard key={item._id} product={item} />)}</div></section>}
      {showSticky && <div className="product-sticky-bar" aria-label="Purchase options">
        <div><p>{product.name}</p><span>{displayPrice}</span></div>
        {enquiryRequired ? <a className="button button-dark" href={enquiryUrl} target="_blank" rel="noopener noreferrer">Enquire on WhatsApp</a>
          : orderingAvailable && requiresPersonalization ? <button type="button" className="button button-dark" disabled={adding || uncertain} onClick={() => complete ? focusOptions() : setCustomizing(true)}>{complete ? 'Review personalization' : 'Customize This'}</button>
          : orderingAvailable && product.requiresOptions ? <button type="button" className="button button-dark" onClick={focusOptions}>Choose Options</button>
          : <button type="button" className="button button-dark" disabled={!orderingAvailable || adding || cart.pending} onClick={() => purchaseRef.current.requestSubmit()}>{orderingAvailable ? 'Add to Cart' : 'Sold Out'}</button>}
      </div>}
    </Container>
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const location = useLocation();
  const { checkoutEnabled } = useCart();
  const query = useQuery({ queryKey: ['catalog', 'product', slug], queryFn: ({ signal }) => getProduct(slug, signal) });
  useEffect(() => { if (query.data?.tracking) emitTracking(query.data.tracking); }, [query.data]);
  const metadata = <ProductMetadata product={query.data?.product} loading={query.isLoading} error={Boolean(query.error)} checkoutEnabled={checkoutEnabled}/>;
  if (query.isLoading) return <main className="catalog-product-page">{metadata}<div className="catalog-state" role="status"><h1>Loading product…</h1></div></main>;
  if (query.isError) return <main className="catalog-product-page">{metadata}<div className="catalog-state" role="alert"><h1>{query.error?.status === 404 ? 'Product not found' : 'We couldn’t load this product'}</h1><p>{query.error?.message || 'Please try again in a moment.'}</p><div className="catalog-state-actions"><Link className="catalog-secondary-button" to="/shop">Back to Shop</Link>{query.error?.status !== 404 && <button type="button" className="button button-dark" onClick={() => query.refetch()}>Try again</button>}</div></div></main>;
  if (!query.data?.product) return <main className="catalog-product-page">{metadata}<div className="catalog-state"><h1>Product not found</h1><Link className="catalog-secondary-button" to="/shop">Back to Shop</Link></div></main>;
  if (location.pathname !== productHref(query.data.product)) return <Navigate replace to={`${productHref(query.data.product)}${location.search}`} />;
  return <>{metadata}<ProductContent key={slug} product={query.data.product} relatedProducts={query.data.relatedProducts || query.data.product.relatedProducts || []}/></>;
}
