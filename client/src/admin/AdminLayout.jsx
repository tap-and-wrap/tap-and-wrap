import { NavLink, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import AccountActions from '../components/AccountActions.jsx';
import '../admin.css';

const groups = [
  ['Manage store', [['Overview', '/admin/website/overview'], ['Orders', '/admin/commerce/orders'], ['Products', '/admin/products'], ['Categories', '/admin/website/categories']]],
  ['Website', [['Homepage', '/admin/website/homepage'], ['Reviews', '/admin/website/reviews'], ['Site content', '/admin/website/content']]],
  ['Commerce', [['Customization', '/admin/commerce/templates'], ['Components', '/admin/commerce/components'], ['Bundles', '/admin/commerce/bundles'], ['Discounts', '/admin/commerce/discounts'], ['Shipping', '/admin/commerce/shipping'], ['Payment settings', '/admin/website/payments']]],
  ['Operations', [['Customers', '/admin/website/customers'], ['Analytics', '/admin/website/analytics'], ['Email delivery', '/admin/website/notifications']]],
];

/** One outer geometry for every protected administration route, including states. */
export default function AdminLayout({ title, description, actions, children, navigation = true, busy = false, className = '' }) {
  const [navigationOpen, setNavigationOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 761px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 761px)');
    const update = () => setNavigationOpen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return <main className={`admin-shell admin-layout ${className}`} tabIndex={-1} aria-busy={busy}>
    <header className="admin-page-heading">
      <div><p className="admin-eyebrow">Tap &amp; Wrap administration</p><h1>{title}</h1>{description && <p>{description}</p>}</div>
      <div className="admin-page-actions">{actions}<Link className="admin-button admin-button-secondary" to="/">View storefront</Link></div>
    </header>
    {navigation && <details className="admin-navigation-disclosure" open={navigationOpen} onToggle={event => setNavigationOpen(event.currentTarget.open)}>
      <summary className="admin-navigation-toggle">Administration menu</summary>
      <nav className="admin-navigation" aria-label="Administration" onClick={event => { if (event.target.closest('a') && !window.matchMedia('(min-width: 761px)').matches) setNavigationOpen(false); }}>
      {groups.map(([label, links]) => <div className="admin-navigation-group" key={label}><span className="admin-navigation-label">{label}</span><div>{links.map(([name, path]) => <NavLink key={path} to={path} end={path === '/admin/website/overview'}>{name}</NavLink>)}</div></div>)}
      <div className="admin-navigation-account"><AccountActions compact /></div>
      </nav>
    </details>}
    <div className="admin-content">{children}</div>
  </main>;
}
