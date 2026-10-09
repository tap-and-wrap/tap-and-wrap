import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { commerceDelete, commerceError, commerceGet, commercePatch, commercePost } from './api';
import { animateToCart } from './animation';
import { emitTracking } from '../tracking/client.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey, refreshSession, sessionOwner, sessionSnapshot } from '../auth/session.js';
import { authGeneration } from '../services/api.js';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const cartKey = privateQueryKey(session.ownerKey, 'cart');
  const [feedbackState, setFeedback] = useState(null);
  const [pendingGeneration, setPending] = useState(null);
  const feedback = feedbackState?.generation === session.generation ? feedbackState.text : '';
  const pending = pendingGeneration === session.generation;
  const query = useQuery({ queryKey: cartKey, queryFn: ({ signal }) => commerceGet('/cart', undefined, signal), enabled: session.ready, retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  const update = useCallback(async (operation, success, source) => {
    const generation = authGeneration();
    const opener = document.activeElement;
    const key = privateQueryKey(sessionOwner(), 'cart');
    setPending(generation);
    setFeedback(null);
    try {
      const phase = sessionSnapshot().phase;
      if (!phase || phase !== 'ready') throw new Error(phase === 'error' ? 'Your session could not be verified. Open the cart and choose Try again, then retry this action.' : 'Please wait while your session is verified.');
      const result = await operation();
      if (result.cart) await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (generation !== authGeneration()) throw new Error('Your account changed. Please review the current cart.');
      if (result.cart) queryClient.setQueryData(key, (previous) => ({ ...previous, ...result }));
      else await queryClient.invalidateQueries({ queryKey: key });
      setFeedback({ generation, text: success, opener });
      emitTracking(result.tracking);
      if (source) animateToCart(source);
      return result;
    } catch (error) {
      if (generation === authGeneration()) setFeedback({ generation, text: commerceError(error), opener });
      throw error;
    } finally { setPending(current => current === generation ? null : current); }
  }, [queryClient]);
  const value = useMemo(() => ({
    cart: session.ready && query.data?.cart || { items: [], subtotalPiastres: 0, quantity: 0 },
    checkoutEnabled: session.ready && query.data?.checkoutEnabled === true,
    checkoutOwnerKey: session.ready && /^[a-f0-9]{64}$/.test(query.data?.checkoutOwnerKey || '') ? query.data.checkoutOwnerKey : null,
    loading: session.phase === 'checking' || session.phase === 'transition' || session.ready && query.isPending, error: session.error || query.error, pending, feedback,
    add: (item, source) => update(() => commercePost('/cart/items', item), 'Added to your cart.', source),
    setQuantity: (id, quantity) => update(() => commercePatch(`/cart/items/${id}`, { quantity }), 'Cart updated.'),
    remove: (id) => update(() => commerceDelete(`/cart/items/${id}`), 'Item removed.'),
    clear: () => update(() => commerceDelete('/cart'), 'Cart cleared.'),
    merge: () => update(() => commercePost('/cart/merge', {}), 'Your eligible guest items have been saved to your account.'),
    refresh: async () => {
      if (sessionSnapshot().phase === 'error') await refreshSession();
      return queryClient.invalidateQueries({ queryKey: privateQueryKey(sessionOwner(), 'cart') });
    },
  }), [query.data, query.isPending, query.error, session.ready, session.phase, session.error, pending, feedback, update, queryClient]);
  function dismissFeedback() {
    const opener = feedbackState?.generation === session.generation ? feedbackState.opener : null;
    setFeedback(null);
    if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) opener.focus({ preventScroll: true });
    else document.querySelector('[data-cart-anchor]')?.focus({ preventScroll: true });
  }
  return <CartContext.Provider value={value}>{children}<div className="commerce-announcement" role="status" aria-live="polite">{feedback && <><span>{feedback}</span><button type="button" className="commerce-feedback-dismiss" aria-label="Dismiss cart feedback" onClick={dismissFeedback}>×</button></>}</div></CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('CartProvider is required.');
  return context;
}
