import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { commerceDelete, commerceError, commerceGet, commercePatch, commercePost } from './api';
import { animateToCart } from './animation';
import { emitTracking } from '../tracking/client.js';

const CartContext = createContext(null);
const cartKey = ['commerce', 'cart'];

export function CartProvider({ children }) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const query = useQuery({ queryKey: cartKey, queryFn: ({ signal }) => commerceGet('/cart', undefined, signal), retry: false, staleTime: 30_000, refetchOnWindowFocus: false });
  const update = useCallback(async (operation, success, source) => {
    setPending(true);
    setFeedback('');
    try {
      const result = await operation();
      if (result.cart) queryClient.setQueryData(cartKey, (previous) => ({ ...previous, ...result }));
      else await queryClient.invalidateQueries({ queryKey: cartKey });
      setFeedback(success);
      emitTracking(result.tracking);
      if (source) animateToCart(source);
      return result;
    } catch (error) {
      setFeedback(commerceError(error));
      throw error;
    } finally { setPending(false); }
  }, [queryClient]);
  const value = useMemo(() => ({
    cart: query.data?.cart || { items: [], subtotalPiastres: 0, quantity: 0 },
    checkoutEnabled: query.data?.checkoutEnabled === true,
    loading: query.isPending, error: query.error, pending, feedback,
    add: (item, source) => update(() => commercePost('/cart/items', item), 'Added to your cart.', source),
    setQuantity: (id, quantity) => update(() => commercePatch(`/cart/items/${id}`, { quantity }), 'Cart updated.'),
    remove: (id) => update(() => commerceDelete(`/cart/items/${id}`), 'Item removed.'),
    clear: () => update(() => commerceDelete('/cart'), 'Cart cleared.'),
    merge: () => update(() => commercePost('/cart/merge', {}), 'Your eligible guest items have been saved to your account.'),
    refresh: () => queryClient.invalidateQueries({ queryKey: cartKey }),
  }), [query.data, query.isPending, query.error, pending, feedback, update, queryClient]);
  return <CartContext.Provider value={value}>{children}<div className="commerce-announcement" role="status" aria-live="polite">{feedback}</div></CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('CartProvider is required.');
  return context;
}
