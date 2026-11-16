import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { commerceDelete, commerceError, commerceGet, commercePatch, commercePost } from './api';
import { animateToCart } from './animation';
import { emitTracking } from '../tracking/client.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey, refreshSession, sessionOwner, sessionSnapshot, subscribeSession } from '../auth/session.js';
import { authGeneration } from '../services/api.js';
import { Link } from 'react-router-dom';
import { LoadingSpinner } from '../components/LoadingState.jsx';
import { toast } from 'sonner';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const queryClient = useQueryClient();
  const session = useSession();
  const cartKey = privateQueryKey(session.ownerKey, 'cart');
  const [feedbackState, setFeedback] = useState(null);
  const job = useRef(null), cartOwner = useRef(null);
  const [preparation, setPreparation] = useState(null);
  const lastCartToastId = useRef(null);
  const preparing = preparation?.generation === session.generation;
  useEffect(() => () => job.current?.controller.abort(), []);
  const runPersonalizedAdd = useCallback(async (task, label) => {
    const generation = authGeneration(), owner = sessionOwner(), ownerContext = cartOwner.current;
    if (sessionSnapshot().phase !== 'ready' || !ownerContext) throw Error('Please wait while your private shopping session is verified.');
    if (job.current?.generation === generation) throw Error('Your personalized item is still being prepared.');
    const currentJob = { generation, ownerContext, controller: new AbortController() }; job.current = currentJob;
    const signal = currentJob.controller.signal;
    const isCurrent = () => !signal.aborted && generation === authGeneration() && owner === sessionOwner() && ownerContext === cartOwner.current;
    const unsubscribe = subscribeSession(() => { if (!isCurrent()) currentJob.controller.abort(); });
    const onProgress = text => { if (isCurrent()) setPreparation({ generation, text }); };
    onProgress(label);
    try { return await task({ signal, isCurrent, onProgress }); }
    catch (error) { if (isCurrent()) toast.error(commerceError(error), { id: 'personalized-add' }); throw error; }
    finally { unsubscribe(); if (job.current === currentJob) job.current = null; setPreparation(value => value?.generation === generation ? null : value); }
  }, []);
  const mutationGeneration = useRef(null);
  const [pendingGeneration, setPending] = useState(null);
  const feedback = feedbackState?.generation === session.generation ? feedbackState.text : '';
  const pending = pendingGeneration === session.generation;
  const query = useQuery({ queryKey: cartKey, queryFn: ({ signal }) => commerceGet('/cart', undefined, signal), enabled: session.ready, retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  cartOwner.current = session.ready ? query.data?.checkoutOwnerKey : null;
  useEffect(() => { if (job.current && job.current.ownerContext !== cartOwner.current) job.current.controller.abort(); }, [query.data?.checkoutOwnerKey, session.ready]);
  const update = useCallback(async (operation, success, source) => {
    const generation = authGeneration();
    if (mutationGeneration.current === generation) throw new Error('Your cart is updating. Please wait for this change to finish.');
    mutationGeneration.current = generation;
    const opener = document.activeElement;
    const key = privateQueryKey(sessionOwner(), 'cart');
    setPending(generation);
    setFeedback(null);
    // Sonner 2.0.8 can merge a newly created toast into a leaving toast when
    // both have the same ID. Dismiss the old ID, then use a fresh ID on success.
    if (lastCartToastId.current !== null) toast.dismiss(lastCartToastId.current);
    lastCartToastId.current = null;
    try {
      const phase = sessionSnapshot().phase;
      if (!phase || phase !== 'ready') throw new Error(phase === 'error' ? 'Your session could not be verified. Open the cart and choose Try again, then retry this action.' : 'Please wait while your session is verified.');
      const result = await operation();
      if (result.cart) await queryClient.cancelQueries({ queryKey: key, exact: true });
      if (generation !== authGeneration()) throw new Error('Your account changed. Please review the current cart.');
      if (result.cart) queryClient.setQueryData(key, (previous) => ({ ...previous, ...result }));
      else await queryClient.invalidateQueries({ queryKey: key });
      let notificationId;
      notificationId = toast.success(typeof success === 'function' ? success(result) : success, { onDismiss: () => {
        if (lastCartToastId.current !== notificationId) return;
        lastCartToastId.current = null;
        const focused = document.activeElement;
        if (generation === authGeneration() && (focused === document.body || focused?.closest('[data-sonner-toast]')) && opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) opener.focus({ preventScroll: true });
      } });
      lastCartToastId.current = notificationId;
      // Optional feedback must not turn a successfully saved cart into a failed
      // mutation or encourage a customer to add the same item a second time.
      try { emitTracking(result.tracking); } catch { /* The saved cart remains authoritative. */ }
      try { if (source) animateToCart(source); } catch { /* Accessible status feedback is already present. */ }
      return result;
    } catch (error) {
      if (generation === authGeneration()) setFeedback({ generation, text: commerceError(error), opener });
      throw error;
    } finally { if (mutationGeneration.current === generation) mutationGeneration.current = null; setPending(current => current === generation ? null : current); }
  }, [queryClient]);
  const value = useMemo(() => ({
    cart: session.ready && query.data?.cart || { items: [], subtotalPiastres: 0, quantity: 0 },
    mixedCheckout: session.ready && query.data?.mixedCheckout === true,
    checkoutEnabled: session.ready && query.data?.checkoutEnabled === true,
    checkoutOwnerKey: session.ready && /^[a-f0-9]{64}$/.test(query.data?.checkoutOwnerKey || '') ? query.data.checkoutOwnerKey : null,
    preparing, runPersonalizedAdd,
    loading: session.phase === 'checking' || session.phase === 'transition' || session.ready && query.isPending, error: session.error || query.error, pending, feedback,
    add: (item, source) => update(() => commercePost('/cart/items', item), item.kind?.startsWith('engraving_service') ? 'Engraving added to cart.' : 'Added to your cart.', source),
    // Prepared for future approved builder integration; public builder controls
    // do not invoke this method while fulfillment and media are unapproved.
    addGiftBox: (item, source) => update(() => commercePost('/cart/items', { ...item, kind: 'gift_box_v2' }), 'Added to your cart.', source),
    setQuantity: (id, quantity) => update(() => commercePatch(`/cart/items/${id}`, { quantity }), 'Cart updated.'),
    remove: (id) => update(() => commerceDelete(`/cart/items/${id}`), 'Item removed.'),
    clear: () => update(() => commerceDelete('/cart'), 'Cart cleared.'),
    merge: () => update(() => commercePost('/cart/merge', {}), result => Number.isSafeInteger(result.skipped) && result.skipped > 0
      ? `Your eligible guest items have been saved. ${result.skipped} unavailable guest ${result.skipped === 1 ? 'item could' : 'items could'} not be transferred. Review your cart.`
      : 'Your eligible guest items have been saved to your account.'),
    refresh: async () => {
      if (sessionSnapshot().phase === 'error') await refreshSession();
      return queryClient.invalidateQueries({ queryKey: privateQueryKey(sessionOwner(), 'cart') });
    },
  }), [query.data, query.isPending, query.error, session.ready, session.phase, session.error, pending, preparing, runPersonalizedAdd, feedback, update, queryClient]);
  function dismissFeedback() {
    const opener = feedbackState?.generation === session.generation ? feedbackState.opener : null;
    setFeedback(null);
    if (opener instanceof HTMLElement && opener.isConnected && !opener.matches(':disabled')) opener.focus({ preventScroll: true });
    else document.querySelector('[data-cart-anchor]')?.focus({ preventScroll: true });
  }
  return <CartContext.Provider value={value}>{children}{preparing && <aside className="personalized-add-progress" aria-live="polite"><LoadingSpinner label={preparation.text}/><Link to="/cart">View cart</Link></aside>}<div className="commerce-announcement" role="status" aria-live="polite">{feedback && <><span>{feedback}</span><button type="button" className="commerce-feedback-dismiss" aria-label="Dismiss cart feedback" onClick={dismissFeedback}>×</button></>}</div></CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('CartProvider is required.');
  return context;
}
