// Invalidate dependency families, rather than clearing public caches or matching
// only the list that happened to be open when the merchant saved a record.
import { sessionOwner } from '../auth/session.js';
const families = {
  products: [['admin', 'categories'], ['admin', 'website', 'categories'], ['admin', 'website', 'category-roots'], ['admin', 'website', 'homepage-categories'], ['admin', 'commerce', 'category-picker'], ['admin', 'products'], ['admin', 'product'], ['admin', 'product-preview'], ['admin', 'product-configuration'], ['admin', 'website', 'homepage-products'], ['admin', 'website', 'product-choices'], ['admin', 'commerce', 'product-picker'], ['admin', 'website', 'overview'], ['catalog', 'products'], ['catalog', 'product'], ['catalog', 'home-best-sellers'], ['catalog', 'categories'], ['catalog', 'category'], ['catalog', 'featured-categories'], ['commerce', 'service-products'], ['commerce', 'product-customization'], ['website', 'bundles']],
  categories: [['admin', 'products'], ['admin', 'product'], ['admin', 'product-preview'], ['admin', 'product-configuration'], ['admin', 'website', 'homepage-products'], ['admin', 'website', 'product-choices'], ['admin', 'commerce', 'product-picker'], ['admin', 'categories'], ['admin', 'website', 'categories'], ['admin', 'website', 'category-roots'], ['admin', 'website', 'homepage-categories'], ['admin', 'commerce', 'category-picker'], ['catalog', 'categories'], ['catalog', 'category'], ['catalog', 'featured-categories'], ['catalog', 'products'], ['catalog', 'product'], ['catalog', 'home-best-sellers'], ['commerce', 'service-products'], ['commerce', 'product-customization'], ['website', 'bundles']],
  templates: [['admin', 'commerce', 'templates'], ['admin', 'commerce', 'assignment-templates'], ['admin', 'product-configuration'], ['admin', 'product-preview'], ['catalog', 'product'], ['catalog', 'products'], ['catalog', 'home-best-sellers'], ['commerce', 'service-products'], ['commerce', 'product-customization'], ['commerce', 'customization-quote']],
  components: [['admin', 'commerce', 'components'], ['admin', 'commerce', 'component-picker'], ['commerce', 'service-products'], ['commerce', 'product-customization'], ['commerce', 'customization-quote']],
  bundles: [['admin', 'commerce', 'bundles'], ['website', 'bundles']],
  discounts: [['admin', 'commerce', 'discounts']],
  shipping: [['admin', 'commerce', 'shipping']],
  reviews: [['admin', 'website', 'reviews'], ['admin', 'website', 'review'], ['admin', 'website', 'overview'], ['website', 'content'], ['website', 'reviews']],
  content: [['admin', 'website', 'content'], ['website', 'content']],
  orders: [['admin', 'commerce', 'orders'], ['admin', 'commerce', 'order'], ['admin', 'website', 'overview'], ['admin', 'website', 'analytics'], ['admin', 'website', 'notifications']],
};

export function invalidateAdminDependencies(client, domain) {
  const prefixes = families[domain] || [];
  const requests = prefixes.map(queryKey => client.invalidateQueries({ queryKey }));
  if (['products', 'categories', 'templates', 'components', 'bundles', 'discounts', 'shipping'].includes(domain)) {
    const owner = sessionOwner();
    requests.push(client.invalidateQueries({ predicate: query => query.queryKey[0] === 'private' && query.queryKey[1] === owner && ['checkout-config', 'checkout-quote'].includes(query.queryKey[2]) }));
  }
  return Promise.all(requests);
}
