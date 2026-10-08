import { useLocation } from 'react-router-dom';
import PageMetadata from './PageMetadata.jsx';
import { PUBLIC_STATIC_ROUTES, CONTENT_ROUTES, PRIVATE_ROUTE, organizationSchema, privatePageTitle } from './metadata.js';

export default function RouteMetadata() {
  const location = useLocation();
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
  const { search } = location;
  if (/^\/(?:products|categories)\/[a-z0-9-]+\/?$/.test(pathname) || CONTENT_ROUTES.includes(pathname)) return null;
  const publicPage = PUBLIC_STATIC_ROUTES[pathname];
  const origin = import.meta.env.VITE_SITE_URL || '';
  const organization = pathname === '/' ? organizationSchema(origin) : null;
  return <PageMetadata title={publicPage?.title || (PRIVATE_ROUTE.test(pathname) || /^\/products\/[a-z0-9-]+\/customize$/.test(pathname) ? privatePageTitle(pathname) : 'Page not found | Tap & Wrap')} description={publicPage?.description || ''} pathname={pathname} indexable={Boolean(publicPage) && !search} structuredData={organization ? [organization] : []} />;
}
