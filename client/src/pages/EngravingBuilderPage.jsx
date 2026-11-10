import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { useCart } from '../commerce/CartContext.jsx';
import { commerceGet, commerceError } from '../commerce/api.js';
import LegacyEngravingBuilderPage from '../engraving/LegacyEngravingBuilderPage.jsx';
import StandaloneVisualBuilder from '../engraving/StandaloneVisualBuilder.jsx';
export default function EngravingBuilderPage() {
  const session = useSession(), cart = useCart(), [params] = useSearchParams(), editId = params.get('edit');
  const saved = useQuery({ queryKey: privateQueryKey(session.ownerKey, cart.checkoutOwnerKey, 'engraving-edit', editId), queryFn: ({ signal }) => commerceGet(`/engraving/cart/${editId}`, undefined, signal), enabled: Boolean(editId && session.ready && cart.checkoutOwnerKey), retry: false, staleTime: 0 });
  if (!session.ready || cart.loading || editId && saved.isPending) return <main className="commerce-page" role="status">Preparing your private engraving studio...</main>;
  if (cart.error || saved.error) return <main className="commerce-page"><h1>Laser Engraving</h1><p role="alert">{commerceError(cart.error || saved.error)}</p><button type="button" onClick={() => cart.error ? cart.refresh() : saved.refetch()}>Try again</button></main>;
  if (saved.data?.specification.contractVersion === 'engraving-spec-v1') return <LegacyEngravingBuilderPage/>;
  return <StandaloneVisualBuilder key={`${session.ownerKey}:${cart.checkoutOwnerKey}:${editId || 'new'}`} saved={editId ? saved.data : null} editId={editId}/>;
}
