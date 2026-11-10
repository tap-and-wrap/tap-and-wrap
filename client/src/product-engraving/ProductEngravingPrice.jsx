import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet, adminCommercePatch, commerceError } from '../commerce/api.js';
import { parsePriceInput, priceInput } from '../admin/catalog-form.js';
import { toast } from 'sonner';
export default function ProductEngravingPrice() {
  const session = useSession(), cache = useQueryClient();
  const key = privateQueryKey(session.ownerKey, 'product-engraving-price');
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => adminCommerceGet('/product-engraving/price', undefined, signal), staleTime: 0 });
  return <section className="product-engraving-settings"><h2>Store-product engraving price</h2><p>Per engraved product. New quotes use this setting; accepted orders keep their saved price. Standalone service prices remain independent.</p>{query.isPending ? <p role="status">Loading price...</p> : query.error ? <p role="alert">{commerceError(query.error)}</p> : <PriceEditor key={session.ownerKey} initial={query.data} onSaved={async value => { cache.setQueryData(key, value); await cache.invalidateQueries({ queryKey: privateQueryKey(session.ownerKey, 'cart') }); }}/>}</section>;
}
function PriceEditor({ initial, onSaved }) {
  const [revision, setRevision] = useState(initial.revision), [price, setPrice] = useState(priceInput(initial.pricePiastres)), [pending, setPending] = useState(false), [error, setError] = useState('');
  async function save() { setPending(true); setError(''); try { const pricePiastres = parsePriceInput(price, 'Product engraving price'); if (pricePiastres === null) throw Error('Enter a price.'); const value = await adminCommercePatch('/product-engraving/price', { pricePiastres, expectedRevision: revision }); await onSaved(value); setRevision(value.revision); setPrice(priceInput(value.pricePiastres)); toast.success('Product engraving price saved.'); } catch (caught) { setError(commerceError(caught)); } finally { setPending(false); } }
  return <div><label>Engraving price (EGP)<input inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} disabled={pending}/></label><button type="button" className="admin-button" disabled={pending} onClick={save}>Save engraving price</button>{error && <p role="alert">{error} Your price draft is retained. Reload the page to review the current setting.</p>}</div>;
}
