import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { getAdminProduct, listAdminCategories, saveAdminProduct } from '../services/catalog';
import { adminErrorMessage, catalogId, createProductDraft, createProductPayload, slugFromName } from '../admin/catalog-form';
import '../admin.css';

function InventoryFields({ value, onChange, prefix = 'Product' }) {
  function update(name, next) {
    onChange({ ...value, [name]: next, ...(name === 'approved' ? {} : { approved: false }) });
  }
  return <div className="admin-inventory-fields">
    <label className="admin-checkbox"><input type="checkbox" checked={value.mode === 'made_to_order'} onChange={(event) => onChange({ ...value, mode: event.target.checked ? 'made_to_order' : 'tracked', quantity: event.target.checked ? '' : '10', approved: false })} />No Inventory Tracking / Made by Request{prefix !== 'Product' && <span className="admin-visually-hidden"> for {prefix}</span>}</label>
    {value.mode === 'tracked' ? <label>{prefix} quantity<input type="text" inputMode="numeric" value={value.quantity} onChange={(event) => update('quantity', event.target.value)} required pattern="[0-9]+" /></label> : <p className="admin-help">Made by Request products do not deduct stock.</p>}
    <label className="admin-checkbox"><input type="checkbox" checked={value.available} onChange={(event) => update('available', event.target.checked)} />{prefix} available for ordering</label>
    <label className="admin-checkbox"><input type="checkbox" checked={value.approved} onChange={(event) => update('approved', event.target.checked)} />Approve {prefix.toLowerCase()} inventory</label>
  </div>;
}

function ProductEditor({ product, initialSaved }) {
  const [draft, setDraft] = useState(() => createProductDraft(product));
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [categoryPage, setCategoryPage] = useState(1);
  const [imageToAdd, setImageToAdd] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(initialSaved ? 'Product created.' : '');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = catalogId(product);
  const roots = useQuery({ queryKey: ['admin', 'categories', 'root'], queryFn: ({ signal }) => listAdminCategories({ parent: 'root', page: 1, limit: 20 }, signal), retry: false });
  const mainCategory = roots.data?.categories?.find((category) => catalogId(category) === draft.categoryId);
  const children = useQuery({ queryKey: ['admin', 'categories', mainCategory?.slug, categoryPage], queryFn: ({ signal }) => listAdminCategories({ parent: mainCategory.slug, page: categoryPage, limit: 20 }, signal), enabled: Boolean(mainCategory?.slug), retry: false });
  const subcategories = children.data?.categories || [];
  const subcategoryOnPage = subcategories.some((category) => catalogId(category) === draft.subcategoryId);
  const fieldErrors = error?.response?.data?.error?.details || error?.details || [];

  function change(name, value) {
    setDraft((current) => ({ ...current, [name]: value, ...(['price', 'compareAt'].includes(name) ? { priceApproved: false } : {}) }));
    setFeedback('');
  }
  function changeName(value) {
    setDraft((current) => ({ ...current, name: value, ...(!slugEdited ? { slug: slugFromName(value) } : {}) }));
  }
  function changeVariant(index, update) {
    setDraft((current) => ({ ...current, variants: current.variants.map((variant, position) => position === index ? { ...variant, ...update } : variant) }));
  }
  function reorderImage(index, nextIndex) {
    setDraft((current) => {
      const galleryKeys = [...current.galleryKeys];
      const [image] = galleryKeys.splice(index, 1);
      galleryKeys.splice(nextIndex, 0, image);
      return { ...current, galleryKeys };
    });
  }
  function addImage() {
    const key = imageToAdd.trim();
    if (!key) return;
    if (draft.galleryKeys.includes(key)) { setError(new Error('This image reference is already in the gallery.')); return; }
    if (draft.galleryKeys.length >= 23) { setError(new Error('A product can have at most 23 image references.')); return; }
    change('galleryKeys', [...draft.galleryKeys, key]);
    setImageToAdd('');
  }
  async function save(event) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setFeedback('');
    let payload;
    try { payload = createProductPayload(draft); } catch (validationError) { setError(validationError); return; }
    setSaving(true);
    try {
      const result = await saveAdminProduct(id || null, payload);
      const saved = result.product;
      queryClient.setQueryData(['admin', 'product', catalogId(saved)], result);
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      if (!id) navigate(`/admin/products/${catalogId(saved)}/edit`, { replace: true, state: { saved: true } });
      else { setDraft(createProductDraft(saved)); setFeedback('Changes saved.'); }
    } catch (saveError) { setError(saveError); }
    finally { setSaving(false); }
  }

  return <main className="admin-shell admin-editor">
    <div className="admin-page-heading"><div><Link to="/admin/products">← Products</Link><h1>{id ? 'Edit product' : 'Add product'}</h1><p>Approvals are explicit. Ready products must pass the server’s publication checks.</p></div>{id && <Link className="admin-button admin-button-secondary" to={`/admin/products/${id}/preview`}>Preview saved product</Link>}</div>
    {id && <p><Link to={`/admin/products/${id}/configuration`}>Edit personalization and customization configuration</Link></p>}
    <form onSubmit={save} className="admin-product-form">
      <fieldset disabled={saving} className="admin-form-fields">
        <section className="admin-panel"><h2>Product information</h2><div className="admin-form-grid">
          <label className="admin-span-all">Product name<input required maxLength={240} value={draft.name} onChange={(event) => changeName(event.target.value)} /></label>
          <label>Product slug<input required maxLength={300} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => { setSlugEdited(true); change('slug', event.target.value); }} /><span className="admin-help">Use lowercase letters, numbers and hyphens. Changing a slug changes the product URL.</span></label>
          <label>SKU<input maxLength={100} value={draft.sku} onChange={(event) => change('sku', event.target.value)} /></label>
          <label>Main category<select required value={draft.categoryId} disabled={roots.isPending || roots.isError} onChange={(event) => { setDraft((current) => ({ ...current, categoryId: event.target.value, subcategoryId: '' })); setCategoryPage(1); }}><option value="">Select a main category</option>{(roots.data?.categories || []).map((category) => <option key={catalogId(category)} value={catalogId(category)}>{category.name}{category.active === false ? ' (inactive)' : ''}</option>)}</select></label>
          <label>Subcategory<select value={draft.subcategoryId} disabled={!mainCategory || children.isPending || children.isError} onChange={(event) => change('subcategoryId', event.target.value)}><option value="">No subcategory</option>{draft.subcategoryId && !subcategoryOnPage && <option value={draft.subcategoryId}>Current subcategory</option>}{subcategories.map((category) => <option key={catalogId(category)} value={catalogId(category)}>{category.name}{category.active === false ? ' (inactive)' : ''}</option>)}</select></label>
          <label className="admin-span-all">Description<textarea rows={6} maxLength={10000} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
        </div>
        {(roots.isError || children.isError) && <p role="alert" className="admin-feedback admin-feedback-error">{adminErrorMessage(roots.error || children.error)}</p>}
        {mainCategory && (children.data?.pagination?.total || 0) > 20 && <div className="admin-inline admin-subcategory-pages"><span>Subcategory choices, page {categoryPage}</span><button type="button" className="admin-button admin-button-secondary" disabled={categoryPage <= 1} onClick={() => setCategoryPage((current) => current - 1)}>Previous subcategories</button><button type="button" className="admin-button admin-button-secondary" disabled={categoryPage * 20 >= children.data.pagination.total} onClick={() => setCategoryPage((current) => current + 1)}>Next subcategories</button></div>}
        </section>

        <section className="admin-panel"><h2>Price and publication</h2><div className="admin-form-grid">
          <label>Price (EGP)<input type="text" inputMode="decimal" value={draft.price} onChange={(event) => change('price', event.target.value)} placeholder="Not set" /><span className="admin-help">Leave blank when a merchant price has not been set.</span></label>
          <label>Compare-at price (EGP)<input type="text" inputMode="decimal" value={draft.compareAt} onChange={(event) => change('compareAt', event.target.value)} placeholder="Optional" /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={draft.priceApproved} onChange={(event) => change('priceApproved', event.target.checked)} />Approve product price</label>
          <label>Publication status<select value={draft.status} onChange={(event) => change('status', event.target.value)}><option value="draft">Draft</option><option value="ready">Ready</option><option value="hold">Hold</option></select></label>
        </div><p className="admin-help">Changing prices clears price approval. Only Ready products with approved prices, approved inventory, resolved review flags and active categories can appear publicly.</p>
        </section>

        <section className="admin-panel"><h2>Inventory and availability</h2><InventoryFields value={draft.inventory} onChange={(inventory) => change('inventory', inventory)} /><p className="admin-help">New stock-tracked products start with a provisional quantity of 10. Editing inventory clears its approval.</p></section>

        <section className="admin-panel"><h2>Image gallery</h2><p className="admin-help">Manage existing image references. The first image is the selected main photo. Uploads are not available yet.</p>
          <ol className="admin-image-list">{draft.galleryKeys.map((key, index) => <li key={index}><label>Image {index + 1}{index === 0 ? ' (main)' : ''}<input maxLength={500} value={key} onChange={(event) => change('galleryKeys', draft.galleryKeys.map((value, position) => position === index ? event.target.value : value))} /></label><div className="admin-image-actions"><button type="button" className="admin-button admin-button-secondary" disabled={index === 0} onClick={() => reorderImage(index, 0)} aria-label={`Set image ${index + 1} as main`}>Set main</button><button type="button" className="admin-button admin-button-secondary" disabled={index === 0} onClick={() => reorderImage(index, index - 1)} aria-label={`Move image ${index + 1} up`}>↑</button><button type="button" className="admin-button admin-button-secondary" disabled={index === draft.galleryKeys.length - 1} onClick={() => reorderImage(index, index + 1)} aria-label={`Move image ${index + 1} down`}>↓</button><button type="button" className="admin-text-button" onClick={() => change('galleryKeys', draft.galleryKeys.filter((_, position) => position !== index))} aria-label={`Remove image ${index + 1} reference`}>Remove reference</button></div></li>)}</ol>
          <div className="admin-inline"><label className="admin-grow">Add existing image reference<input maxLength={500} value={imageToAdd} onChange={(event) => setImageToAdd(event.target.value)} placeholder="Category/Subcategory/product.webp" /></label><button type="button" className="admin-button admin-button-secondary" disabled={!imageToAdd.trim() || draft.galleryKeys.length >= 23} onClick={addImage}>Add reference</button></div>
        </section>

        <section className="admin-panel"><h2>Configured variants</h2><p className="admin-help">Use explicit variant attributes such as Size or Color. No variants are inferred from the original catalog notes.</p>
          {draft.variants.length === 0 && <p>No variants configured.</p>}
          {draft.variants.map((variant, index) => <fieldset className="admin-variant" key={index}><legend>Variant {index + 1}</legend><div className="admin-form-grid">
            <label>Variant {index + 1} key<input required maxLength={80} pattern="[a-z0-9][a-z0-9_-]*" value={variant.key} onChange={(event) => changeVariant(index, { key: event.target.value })} /></label>
            <label>Variant {index + 1} SKU<input maxLength={100} value={variant.sku} onChange={(event) => changeVariant(index, { sku: event.target.value })} /></label>
            <label>Variant {index + 1} price (EGP)<input inputMode="decimal" value={variant.price} onChange={(event) => changeVariant(index, { price: event.target.value, priceApproved: false })} placeholder="Not set" /></label>
            <label className="admin-checkbox"><input type="checkbox" checked={variant.priceApproved} onChange={(event) => changeVariant(index, { priceApproved: event.target.checked })} />Approve variant {index + 1} price</label>
          </div>
          {variant.attributes.map((attribute, attributeIndex) => <div className="admin-attribute-row" key={attributeIndex}><label>Variant {index + 1} attribute {attributeIndex + 1} name<input required maxLength={80} value={attribute.name} onChange={(event) => changeVariant(index, { attributes: variant.attributes.map((item, position) => position === attributeIndex ? { ...item, name: event.target.value } : item) })} /></label><label>Variant {index + 1} attribute {attributeIndex + 1} value<input required maxLength={120} value={attribute.value} onChange={(event) => changeVariant(index, { attributes: variant.attributes.map((item, position) => position === attributeIndex ? { ...item, value: event.target.value } : item) })} /></label><button type="button" className="admin-text-button" onClick={() => changeVariant(index, { attributes: variant.attributes.filter((_, position) => position !== attributeIndex) })} aria-label={`Remove variant ${index + 1} attribute ${attributeIndex + 1}`}>Remove</button></div>)}
          <button type="button" className="admin-button admin-button-secondary" disabled={variant.attributes.length >= 10} onClick={() => changeVariant(index, { attributes: [...variant.attributes, { name: '', value: '' }] })}>Add variant {index + 1} attribute</button>
          <InventoryFields prefix={`Variant ${index + 1}`} value={variant.inventory} onChange={(inventory) => changeVariant(index, { inventory })} />
          <button type="button" className="admin-text-button" onClick={() => change('variants', draft.variants.filter((_, position) => position !== index))}>Remove variant {index + 1}</button>
          </fieldset>)}
          <button type="button" className="admin-button admin-button-secondary" disabled={draft.variants.length >= 30} onClick={() => change('variants', [...draft.variants, { key: '', sku: '', attributes: [], price: '', priceApproved: false, inventory: { mode: 'tracked', quantity: '10', approved: false, available: true } }])}>Add variant</button>
        </section>

        <section className="admin-panel"><h2>Homepage selections</h2><p className="admin-help">Selections are made by an administrator. They do not imply sales rankings. Only publicly eligible products are shown; the homepage displays at most eight Best Sellers.</p><div className="admin-form-grid">
          <label className="admin-checkbox"><input type="checkbox" checked={draft.featured} onChange={(event) => change('featured', event.target.checked)} />Featured product</label><label>Featured display order<input inputMode="numeric" pattern="[0-9]+" value={draft.featuredOrder} onChange={(event) => change('featuredOrder', event.target.value)} /></label>
          <label className="admin-checkbox"><input type="checkbox" checked={draft.bestSeller} onChange={(event) => change('bestSeller', event.target.checked)} />Best Seller selection</label><label>Best Seller display order<input inputMode="numeric" pattern="[0-9]+" value={draft.bestSellerOrder} onChange={(event) => change('bestSellerOrder', event.target.value)} /></label>
        </div></section>

        <section className="admin-panel"><h2>Catalog review</h2>{product?.reviewReasons?.length > 0 && <ul className="admin-review-reasons">{product.reviewReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}{product?.merchantReviewNotes && <p>{product.merchantReviewNotes}</p>}{product?.variantSourceNotes && <p>{product.variantSourceNotes}</p>}<label className="admin-checkbox"><input type="checkbox" checked={draft.reviewRequired} onChange={(event) => change('reviewRequired', event.target.checked)} />Catalog review required</label><p className="admin-help">Clear this flag only after the merchant has reviewed the original grouping and notes. This form does not reclassify or merge catalog entries.</p></section>

        <section className="admin-panel"><h2>Personalization and customization</h2><p className="admin-help">Existing configuration is preserved when saving. Personalization and Customize This are independent.</p><h3>Personalization fields</h3>{product?.personalization?.fields?.length ? <ul>{product.personalization.fields.map((field) => <li key={field.key}>{field.label} · {field.type}{field.required ? ' · Required' : ' · Optional'}</li>)}</ul> : <p>No personalization fields configured.</p>}<h3>Customize This</h3><p>{product?.customization?.enabled ? 'Enabled with an existing customization template.' : 'Not enabled.'}</p>{product?.customization?.serviceKind && <p>Service: {product.customization.serviceKind.replaceAll('_', ' ')}</p>}</section>
      </fieldset>
      {error && <div role="alert" className="admin-feedback admin-feedback-error"><p>{adminErrorMessage(error)}</p>{fieldErrors.length > 0 && <ul>{fieldErrors.map((detail, index) => <li key={index}>{detail.field ? `${detail.field}: ` : ''}{detail.message}</li>)}</ul>}</div>}
      {feedback && <p className="admin-feedback" role="status">{feedback}</p>}
      <div className="admin-save-row"><button type="submit" disabled={saving || roots.isPending || roots.isError} className="admin-button">{saving ? 'Saving…' : id ? 'Save changes' : 'Save product'}</button><Link to="/admin/products">Back to products</Link></div>
    </form>
  </main>;
}

function ExistingProduct({ id, initialSaved }) {
  const query = useQuery({ queryKey: ['admin', 'product', id], queryFn: ({ signal }) => getAdminProduct(id, signal), retry: false });
  if (query.isPending) return <main className="admin-shell"><p role="status">Loading product…</p></main>;
  if (query.isError) return <main className="admin-shell"><h1>Product could not be loaded</h1><p role="alert">{adminErrorMessage(query.error)}</p><button type="button" className="admin-button" onClick={() => query.refetch()}>Try again</button><p><Link to="/admin/products">Back to products</Link></p></main>;
  return <ProductEditor key={id} product={query.data.product} initialSaved={initialSaved} />;
}

export default function AdminProductFormPage() {
  const { id } = useParams();
  const location = useLocation();
  return id ? <ExistingProduct id={id} initialSaved={location.state?.saved === true} /> : <ProductEditor />;
}
