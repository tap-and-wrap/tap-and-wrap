import ProductEngravingSettings from '../product-engraving/ProductEngravingSettings.jsx';
import { toast } from 'sonner';
import Select from '../components/form/Select.jsx';
import { EngravingRequestEditor } from '../admin/RequestEligibilityEditors.jsx';
import AdminImageGallery from '../admin/AdminImageGallery.jsx';
import ProductPersonalizationEditor from '../admin/ProductPersonalizationEditor.jsx';
import AdminForm from '../admin/AdminForm.jsx';
import { useState } from 'react';
import EditConflict from '../admin/EditConflict';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getAdminProduct, listAdminCategories, saveAdminProduct } from '../services/catalog';
import { adminErrorMessage, catalogId, createProductDraft, createProductPayload, inventoryChoice, selectInventoryAvailability, slugFromName } from '../admin/catalog-form';
import '../admin.css';
import AdminLayout from '../admin/AdminLayout.jsx';
import { invalidateAdminDependencies } from '../admin/query-invalidation.js';

function InventoryFields({ value, onChange, prefix = 'Product', name = 'inventory', variantParent = false }) {
  function update(field, next) {
    onChange({ ...value, [field]: next,
      ...(field === 'quantity' ? { approved: /^\d+$/.test(next) && Number.isSafeInteger(Number(next)) } : {}),
    });
  }
  if (variantParent) return <label>Product availability<Select value={value.available ? 'available' : 'unavailable'} onChange={event => onChange({ ...value, available: event.target.value === 'available' })}><option value="available">Available when a configured variant has stock</option><option value="unavailable">Unavailable - enquiries only</option></Select><span className="admin-help">Each variant owns its real stock below. The imported parent quantity is retained but never used for ordering.</span></label>;
  return <div className="admin-inventory-fields">
    <label>{prefix} availability<Select name={`${name}.mode`} value={inventoryChoice(value)} onChange={event => onChange(selectInventoryAvailability(value, event.target.value))}><option value="unconfirmed">Stock not confirmed</option><option value="tracked">Tracked stock — enter actual quantity</option><option value="made_to_order">Made by Request — no stock tracking</option><option value="unavailable">Unavailable — enquiries only</option></Select></label>
    {value.mode === 'tracked' ? <label>{prefix} quantity<input name={`${name}.quantity`} type="text" inputMode="numeric" value={value.quantity} onChange={(event) => update('quantity', event.target.value)} required={value.approved} pattern="[0-9]+" /></label> : <p className="admin-help">Made on Demand products do not deduct stock. Select this only for items you can create when ordered.</p>}
    {!value.approved && <p className="admin-help">Stock is not confirmed. Select Made on Demand, or enter the actual quantity to confirm it.</p>}
  </div>;
}

function ProductEditor({ product }) {
  const [draft, setDraft] = useState(() => createProductDraft(product));
  const [revision, setRevision] = useState(product?.revision ?? 0);
  const [slugEdited, setSlugEdited] = useState(Boolean(product));
  const [categoryPage, setCategoryPage] = useState(1);
  const [mediaPending, setMediaPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = catalogId(product);
  const roots = useQuery({ queryKey: ['admin', 'categories', 'root', 'choices'], queryFn: ({ signal }) => listAdminCategories({ parent: 'root', page: 1, limit: 20, includeProductCounts: false }, signal), retry: false });
  const mainCategory = roots.data?.categories?.find((category) => catalogId(category) === draft.categoryId);
  const children = useQuery({ queryKey: ['admin', 'categories', mainCategory?.slug, categoryPage, 'choices'], queryFn: ({ signal }) => listAdminCategories({ parent: mainCategory.slug, page: categoryPage, limit: 20, includeProductCounts: false }, signal), enabled: Boolean(mainCategory?.slug), retry: false });
  const subcategories = children.data?.categories || [];
  const subcategoryOnPage = subcategories.some((category) => catalogId(category) === draft.subcategoryId);
  const fieldErrors = error?.response?.data?.error?.details || error?.details || [];

  function change(name, value) {
    setDraft((current) => ({ ...current, [name]: value,
      ...(name === 'price' ? { priceApproved: /^\d+(?:\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0 } : {}),
    }));
    setFeedback('');
  }
  function changeName(value) {
    setDraft((current) => ({ ...current, name: value, ...(!slugEdited ? { slug: slugFromName(value) } : {}) }));
  }
  function changeVariant(index, update) {
    setDraft((current) => ({ ...current, variants: current.variants.map((variant, position) => position === index ? { ...variant, ...update } : variant) }));
  }
  async function save(event) {
    event.preventDefault();
    if (saving || mediaPending) return;
    setError(null);
    setFeedback('');
    let payload;
    try { payload = createProductPayload(draft); } catch (validationError) { setError(validationError); return; }
    if (id) payload.expectedRevision = revision;
    setSaving(true);
    try {
      const result = await saveAdminProduct(id || null, payload);
      const saved = result.product;
      queryClient.setQueryData(['admin', 'product', catalogId(saved)], result);
      await invalidateAdminDependencies(queryClient, 'products');
      toast.success(id ? 'Changes saved.' : 'Product created.', { id: 'admin-product-save' });
      if (!id) navigate(`/admin/products/${catalogId(saved)}/edit`, { replace: true, state: { saved: true } });
      else { setDraft(createProductDraft(saved)); setRevision(saved.revision); setFeedback(''); }
    } catch (saveError) { setError(saveError); }
    finally { setSaving(false); }
  }

  return <AdminLayout title={id ? 'Edit product' : 'Add product'} description="Set the price, real availability and product options. Purchase eligibility is calculated automatically; imported notes remain available." actions={id && <Link className="admin-button admin-button-secondary" to={`/admin/products/${id}/preview`}>Preview saved product</Link>}>
    <AdminForm error={error} onSubmit={save} className="admin-product-form">
      <fieldset disabled={saving} className="admin-form-fields">
        <section className="admin-panel"><h2>Product information</h2><div className="admin-form-grid">
          <label className="admin-span-all">Product name<input name="name" required maxLength={240} value={draft.name} onChange={(event) => changeName(event.target.value)} /></label>
          <label>Product slug<input name="slug" required maxLength={300} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={(event) => { setSlugEdited(true); change('slug', event.target.value); }} /><span className="admin-help">Use lowercase letters, numbers and hyphens. Changing a slug changes the product URL.</span></label>
          <label>SKU<input name="sku" maxLength={100} value={draft.sku} onChange={(event) => change('sku', event.target.value)} /></label>
          <label>Main category<Select name="categoryId" required value={draft.categoryId} disabled={roots.isPending || roots.isError} onChange={(event) => { setDraft((current) => ({ ...current, categoryId: event.target.value, subcategoryId: '' })); setCategoryPage(1); }}><option value="">Select a main category</option>{(roots.data?.categories || []).map((category) => <option key={catalogId(category)} value={catalogId(category)}>{category.name}{category.active === false ? ' (inactive)' : ''}</option>)}</Select></label>
          <label>Subcategory<Select name="subcategoryId" value={draft.subcategoryId} disabled={!mainCategory || children.isPending || children.isError} onChange={(event) => change('subcategoryId', event.target.value)}><option value="">No subcategory</option>{draft.subcategoryId && !subcategoryOnPage && <option value={draft.subcategoryId}>Current subcategory</option>}{subcategories.map((category) => <option key={catalogId(category)} value={catalogId(category)}>{category.name}{category.active === false ? ' (inactive)' : ''}</option>)}</Select></label>
          <label className="admin-span-all">Description<textarea name="description" rows={6} maxLength={10000} value={draft.description} onChange={(event) => change('description', event.target.value)} /></label>
        </div>
        {(roots.isError || children.isError) && <p role="alert" className="admin-feedback admin-feedback-error">{adminErrorMessage(roots.error || children.error)}</p>}
        {mainCategory && (children.data?.pagination?.total || 0) > 20 && <div className="admin-inline admin-subcategory-pages"><span>Subcategory choices, page {categoryPage}</span><button type="button" className="admin-button admin-button-secondary" disabled={categoryPage <= 1} onClick={() => setCategoryPage((current) => current - 1)}>Previous subcategories</button><button type="button" className="admin-button admin-button-secondary" disabled={categoryPage * 20 >= children.data.pagination.total} onClick={() => setCategoryPage((current) => current + 1)}>Next subcategories</button></div>}
        </section>

        <section className="admin-panel"><h2>Price and display</h2><div className="admin-form-grid">
          <label>Price (EGP)<input name="pricePiastres" type="text" inputMode="decimal" value={draft.price} onChange={(event) => change('price', event.target.value)} placeholder="Price on Request" /><span className="admin-help">Leave blank for Price on Request and WhatsApp enquiries. A positive price enables online purchase as soon as real stock is confirmed.</span></label>
          <label>Compare-at price (EGP)<input name="compareAtPiastres" type="text" inputMode="decimal" value={draft.compareAt} onChange={(event) => change('compareAt', event.target.value)} placeholder="Optional" /></label>
          <label>How is this product sold?<Select name="optionStructure" value={draft.optionStructure} onChange={event => change('optionStructure', event.target.value)}><option value="single">One item - no variants</option><option value="variants">With the variants configured below</option><option value="unresolved">Options still need clarification - enquiries only</option></Select></label>
        </div><label>Public display<Select name="visibility" value={draft.visibility} onChange={event => change('visibility', event.target.value)}><option value="hidden">Hidden</option><option value="public">Published</option><option value="withdrawn">Withdrawn</option></Select></label><p className="admin-help">Published products are visible with or without a price. Save a price and real stock once to enable Add to Cart. Removing the price restores WhatsApp enquiries.</p>
        </section>

        <section className="admin-panel"><h2>Inventory and availability</h2><InventoryFields variantParent={draft.optionStructure === 'variants'} value={draft.inventory} onChange={(inventory) => change('inventory', inventory)} /><p className="admin-help">Imported quantities are not confirmed stock and are not prefilled here. Enter the actual count, select Made by Request only when you can fulfil orders, or choose Unavailable for enquiries. Saving other fields never approves placeholder stock.</p></section>

        <section className="admin-panel"><AdminImageGallery key={revision} keys={draft.galleryKeys} onChange={galleryKeys => change('galleryKeys', galleryKeys)} onBusyChange={setMediaPending} label="Product images" /></section>
        <ProductEngravingSettings keys={draft.galleryKeys} value={draft.productEngraving} onChange={productEngraving => setDraft(current => ({ ...current, productEngraving, productEngravingEdited: true }))}/>
        <EngravingRequestEditor value={draft.engravingRequest} onChange={engravingRequest => setDraft(current => ({ ...current, engravingRequest, engravingEdited: true }))} />
        <ProductPersonalizationEditor value={draft.personalization} onChange={personalization => setDraft(current => ({ ...current, personalization, personalizationEdited: true }))} />

        <section className="admin-panel"><h2>Configured variants</h2><p className="admin-help">Use explicit variant attributes such as Size or Color. No variants are inferred from the original catalog notes.</p>
          {draft.variants.length === 0 && <p>No variants configured.</p>}
          {draft.variants.map((variant, index) => <fieldset className="admin-variant" key={index}><legend>Variant {index + 1}</legend><div className="admin-form-grid">
            <label>Variant {index + 1} key<input name={`variants.${index}.key`} required maxLength={80} pattern="[a-z0-9][a-z0-9_-]*" value={variant.key} onChange={(event) => changeVariant(index, { key: event.target.value })} /></label>
            <label>Variant {index + 1} SKU<input name={`variants.${index}.sku`} maxLength={100} value={variant.sku} onChange={(event) => changeVariant(index, { sku: event.target.value })} /></label>
            <label>Variant {index + 1} price (EGP)<input name={`variants.${index}.pricePiastres`} inputMode="decimal" value={variant.price} onChange={(event) => changeVariant(index, { price: event.target.value, priceApproved: /^\d+(?:\.\d{1,2})?$/.test(event.target.value.trim()) && Number(event.target.value) > 0 })} placeholder="Not set" /></label>
          </div>
          {variant.attributes.map((attribute, attributeIndex) => <div className="admin-attribute-row" key={attributeIndex}><label>Variant {index + 1} attribute {attributeIndex + 1} name<input name={`variants.${index}.attributes.${attributeIndex}.name`} required maxLength={80} value={attribute.name} onChange={(event) => changeVariant(index, { attributes: variant.attributes.map((item, position) => position === attributeIndex ? { ...item, name: event.target.value } : item) })} /></label><label>Variant {index + 1} attribute {attributeIndex + 1} value<input name={`variants.${index}.attributes.${attributeIndex}.value`} required maxLength={120} value={attribute.value} onChange={(event) => changeVariant(index, { attributes: variant.attributes.map((item, position) => position === attributeIndex ? { ...item, value: event.target.value } : item) })} /></label><button type="button" className="admin-text-button" onClick={() => changeVariant(index, { attributes: variant.attributes.filter((_, position) => position !== attributeIndex) })} aria-label={`Remove variant ${index + 1} attribute ${attributeIndex + 1}`}>Remove</button></div>)}
          <button type="button" className="admin-button admin-button-secondary" disabled={variant.attributes.length >= 10} onClick={() => changeVariant(index, { attributes: [...variant.attributes, { name: '', value: '' }] })}>Add variant {index + 1} attribute</button>
          <InventoryFields name={`variants.${index}.inventory`} prefix={`Variant ${index + 1}`} value={variant.inventory} onChange={(inventory) => changeVariant(index, { inventory })} />
          <button type="button" className="admin-text-button" onClick={() => change('variants', draft.variants.filter((_, position) => position !== index))}>Remove variant {index + 1}</button>
          </fieldset>)}
          <button type="button" className="admin-button admin-button-secondary" disabled={draft.variants.length >= 30} onClick={() => change('variants', [...draft.variants, { key: '', sku: '', attributes: [], price: '', priceApproved: false, inventory: { mode: 'tracked', quantity: '', approved: false, available: true } }])}>Add variant</button>
        </section>

        <section className="admin-panel"><h2>Homepage selections</h2><p className="admin-help">Selections are made by an administrator. They do not imply sales rankings. Only publicly eligible products are shown; all eligible Best Seller selections appear in their configured order. Fewer than four selections are complemented by varied fallback gifts.</p><div className="admin-form-grid">
          <label className="admin-checkbox"><input name="featured" type="checkbox" checked={draft.featured} onChange={(event) => change('featured', event.target.checked)} />Featured product</label><label>Featured display order<input name="featuredOrder" inputMode="numeric" pattern="[0-9]+" value={draft.featuredOrder} onChange={(event) => change('featuredOrder', event.target.value)} /></label>
          <label className="admin-checkbox"><input name="bestSeller" type="checkbox" checked={draft.bestSeller} onChange={(event) => change('bestSeller', event.target.checked)} />Best Seller selection</label><label>Best Seller display order<input name="bestSellerOrder" inputMode="numeric" pattern="[0-9]+" value={draft.bestSellerOrder} onChange={(event) => change('bestSellerOrder', event.target.value)} /></label>
        </div></section>

        <section className="admin-panel"><h2>Original catalog notes</h2>{product?.reviewReasons?.length > 0 && <ul className="admin-review-reasons">{product.reviewReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}{product?.merchantReviewNotes && <p>{product.merchantReviewNotes}</p>}{product?.variantSourceNotes && <p>{product.variantSourceNotes}</p>}<p>Import notes are retained for reference. Clarify any ambiguous options using the product and variant fields before offering online purchase.</p><p className="admin-help">These original notes are retained. Configure the actual product options above; saving does not reclassify, merge or erase imported information.</p></section>


      </fieldset>
      {error && fieldErrors.length === 0 && <div role="alert" className="admin-feedback admin-feedback-error"><p>{adminErrorMessage(error)}</p></div>}
      <EditConflict error={error} onReload={async () => {
        const result = await getAdminProduct(id);
        setDraft(createProductDraft(result.product)); setRevision(result.product.revision);
        queryClient.setQueryData(['admin', 'product', id], result); setError(null); setFeedback('Latest saved record loaded.');
      }} />
      {feedback && <p className="admin-feedback" role="status">{feedback}</p>}
      <div className="admin-save-row"><button type="submit" disabled={saving || mediaPending || roots.isPending || roots.isError} className="admin-button">{saving ? 'Saving…' : id ? 'Save changes' : 'Save product'}</button><Link to="/admin/products">Back to products</Link></div>
    </AdminForm>
  </AdminLayout>;
}

function ExistingProduct({ id }) {
  const query = useQuery({ queryKey: ['admin', 'product', id], queryFn: ({ signal }) => getAdminProduct(id, signal), retry: false });
  if (query.isPending) return <AdminLayout title="Edit product" busy><p className="admin-state" role="status">Loading product…</p></AdminLayout>;
  if (query.isError) return <AdminLayout title="Product could not be loaded"><div className="admin-state"><p role="alert">{adminErrorMessage(query.error)}</p><button type="button" className="admin-button" onClick={() => query.refetch()}>Try again</button><p><Link to="/admin/products">Back to products</Link></p></div></AdminLayout>;
  return <ProductEditor key={id} product={query.data.product} />;
}

export default function AdminProductFormPage() {
  const { id } = useParams();
  return id ? <ExistingProduct id={id} /> : <ProductEditor />;
}
