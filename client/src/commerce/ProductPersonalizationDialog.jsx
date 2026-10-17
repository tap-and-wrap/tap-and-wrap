import { useState } from 'react';
import CatalogDialog from '../components/CatalogDialog.jsx';
import ConfiguredFields, { validateConfiguredFields } from './ConfiguredFields.jsx';
import { focusInvalidField } from '../components/FormFeedback.jsx';

export default function ProductPersonalizationDialog({ product, fields, values, onChange, onComplete, onClose }) {
  const [errors, setErrors] = useState({});
  function change(values) {
    if (fields.filter(field => field.type === 'image').reduce((total, field) => total + (values[field.key]?.length || 0), 0) > 10) {
      setErrors(previous => ({ ...previous, photos: 'Choose no more than ten photos across this product.' })); return;
    }
    setErrors({}); onChange(values);
  }
  function complete(event) {
    event.preventDefault();
    const next = validateConfiguredFields(fields, values);
    const count = fields.filter(field => field.type === 'image').reduce((total, field) => total + (values[field.key]?.length || 0), 0);
    if (count > 10) next.photos = 'Choose no more than ten photos across this product.';
    setErrors(next);
    if (Object.keys(next).length) { focusInvalidField(event.currentTarget); return; }
    onComplete();
  }
  return <CatalogDialog title="Customize This" onClose={onClose} bottomSheet className="product-personalization-dialog"><form className="product-customization-form" noValidate onSubmit={complete}>
    <p className="catalog-eyebrow">Made personal for you</p><h3>{product.name}</h3>
    <p>Personalization is included in the approved product price. Your selected variant and quantity stay unchanged.</p>
    <ConfiguredFields fields={fields} values={values} onChange={change} errors={errors} />
    {errors.photos && <p role="alert">{errors.photos}</p>}
    <p className="commerce-muted">Photos upload privately only when you press Add to Cart. Up to four recent product drafts stay in this tab for 30 minutes while browsing; reloading the page clears unsaved photos and instructions.</p>
    <div className="product-customization-actions"><button type="button" className="button button-secondary" onClick={onClose}>Keep editing later</button><button type="submit" className="button button-primary">Save personalization</button></div>
  </form></CatalogDialog>;
}
