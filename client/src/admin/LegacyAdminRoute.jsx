import { Navigate, useLocation, useParams } from 'react-router-dom';

/** Preserve bookmark context without maintaining another owner navigation. */
export default function LegacyAdminRoute({ kind }) {
  const { section, id } = useParams();
  const { search } = useLocation();
  let destination = '/admin';
  if (kind === 'website') destination = { overview: '/admin', categories: '/admin/categories', customers: '/admin/customers', analytics: '/admin/analytics', payments: '/admin/payment', homepage: '/admin/products?bestSeller=true', products: '/admin/products', orders: '/admin/orders' }[section] || '/admin';
  if (kind === 'commerce') destination = { orders: '/admin/orders', discounts: '/admin/discounts', shipping: '/admin/payment', templates: '/admin/customization', components: '/admin/gift-box', bundles: '/admin/discounts' }[section] || '/admin';
  if (kind === 'order') destination = `/admin/orders/${id}`;
  if (kind === 'request') destination = `/admin/orders/requests${id ? `/${id}` : ''}`;
  if (kind === 'gift-box') destination = `/admin/gift-box?tab=${({ components: 'components', 'visual-preview': 'visuals', 'personalization-options': 'personalization', 'fulfillment-policies': 'packing' })[section] || 'components'}`;
  return <Navigate to={destination.includes('?') ? destination : `${destination}${search}`} replace/>;
}
