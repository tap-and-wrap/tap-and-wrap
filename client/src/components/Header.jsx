import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Menu, ShoppingBag, UserRound, Home, X, ChevronDown } from 'lucide-react';
import { adminLinks } from '../admin/navigation.js';
import { useCart } from '../commerce/CartContext.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import useModalDialog from './useModalDialog.js';
import AdminNotificationBell from './AdminNotificationBell.jsx';

const primaryLinks = [
  { to: '/', text: 'Home', end: true },
  { to: '/shop', text: 'Shop' },
  { to: '/customize', text: 'Customize' },
  { to: '/about', text: 'About Us' },
];
function AnnouncementBar() {
  const message = 'Unlock the Magic of Giving✨';
  return <div className="announcement announcement-marquee">
    <span className="storefront-sr-only">{message}</span>
    <div className="announcement-track" aria-hidden="true">{[0, 1].map(copy => <span className="announcement-message" key={copy}>{message}</span>)}</div>
  </div>;
}

function NavigationLinks({ links, onClose, admin = false }) {
  const location = useLocation();
  const root = useRef(null);
  useEffect(() => { root.current?.querySelectorAll('details[open]').forEach(element => { element.open = false; }); }, [location.key]);
  useEffect(() => {
    const dismiss = event => root.current?.querySelectorAll('details[open]').forEach(element => { if (!element.contains(event.target)) element.open = false; });
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <ul ref={root}>{links.map(item => {
    const Icon = item.icon;
    return <li key={item.to}>{item.children ? <details className="admin-customization-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); } }}>
      <summary className={/^\/admin\/(customization|gift-box|engraving)/.test(location.pathname) ? 'is-active' : ''}>{admin && Icon && <Icon size={18} aria-hidden="true"/>}{item.text}<ChevronDown size={14} aria-hidden="true"/></summary>
      <ul>{item.children.map(child => <li key={child.to}><NavLink to={child.to} onClick={event => { event.currentTarget.closest('details').open = false; onClose?.(); }}>{child.text}</NavLink></li>)}</ul>
    </details> : <NavLink to={item.to} end={item.end} onClick={onClose}>{admin && Icon && <Icon size={18} aria-hidden="true"/>}{item.text}</NavLink>}</li>;
  })}</ul>;
}

function NavigationDrawer({ links, onClose, admin }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  return <dialog ref={dialogRef} {...dialogProps} id="navigation-drawer" className="navigation-drawer" aria-labelledby="navigation-title" aria-modal="true">
    <div className="drawer-header"><h2 id="navigation-title">{admin ? 'Your store' : 'Explore Tap & Wrap'}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close menu" autoFocus><X size={22} aria-hidden="true"/></button></div>
    <nav className={`drawer-nav ${admin ? 'admin-drawer-nav' : ''}`} aria-label={admin ? 'Administration' : 'Main navigation'}><NavigationLinks links={links} admin={admin} onClose={onClose}/></nav>
  </dialog>;
}

export default function Header() {
  const { cart } = useCart();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const role = session.ready ? session.user?.role : null;
  const admin = role === 'admin';
  const adminWorkspace = admin && /^\/admin(?:\/|$)/.test(location.pathname);
  const links = adminWorkspace ? adminLinks : [...primaryLinks];
  if (!adminWorkspace && session.ready && !session.user) links.push({ to: '/track-order', text: 'Track Order' });
  else if (!adminWorkspace && role === 'customer') links.push({ to: '/my-orders', text: 'My Orders' });
  const accountDestination = admin ? '/admin' : session.user ? '/my-orders' : '/login';
  const logout = useMutation({ mutationFn: () => session.authenticate('/auth/logout', {}), onSuccess: () => { setOpen(false); navigate('/login', { replace: true }); } });

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const dismiss = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', dismiss);
    return () => desktop.removeEventListener('change', dismiss);
  }, []);
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => {
    const header = headerRef.current;
    const measure = () => document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return <>
    <div ref={headerRef} className={`site-header-stack ${adminWorkspace ? 'admin-header-stack' : ''}`}>
      {!adminWorkspace && <AnnouncementBar/>}
      <header className="site-header">
      <button type="button" className="icon-button menu-icon" aria-label="Open menu" aria-haspopup="dialog" aria-controls={open ? 'navigation-drawer' : undefined} aria-expanded={open} onClick={() => setOpen(true)}><Menu size={23} aria-hidden="true"/></button>
      <Link className="site-logo" to={adminWorkspace ? '/admin' : '/'} aria-label={adminWorkspace ? 'Tap and Wrap dashboard' : 'Tap and Wrap home'}><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" /></Link>
      <nav className="desktop-navigation" aria-label={adminWorkspace ? 'Administration' : 'Main navigation'}><NavigationLinks links={links} admin={adminWorkspace}/></nav>
      <div className="header-actions">
        {admin && <AdminNotificationBell />}
        {session.ready ? <Link className="icon-button" to={adminWorkspace ? '/' : accountDestination} aria-label={adminWorkspace ? 'Home — storefront' : 'Account'} title={adminWorkspace ? 'View storefront' : admin ? 'Admin dashboard' : session.user ? 'My account and orders' : 'Sign in'}>{adminWorkspace ? <Home size={20} aria-hidden="true"/> : <UserRound size={20} aria-hidden="true"/>}</Link> : <button className="icon-button" type="button" disabled aria-label={session.phase === 'error' ? 'Account unavailable' : 'Checking account'}><UserRound size={20} aria-hidden="true"/></button>}
        {!adminWorkspace && <Link className="icon-button" data-cart-anchor to="/cart" aria-label={`Cart${cart.quantity ? `, ${cart.quantity} items` : ''}`} title="Cart"><ShoppingBag size={20} aria-hidden="true"/>{cart.quantity > 0 && <span className="commerce-cart-count" aria-hidden="true">{cart.quantity > 99 ? '99+' : cart.quantity}</span>}</Link>}
        {admin && <button className="header-signout" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button>}
      </div>
      {logout.error && !open && <p className="header-error" role="alert">{commerceError(logout.error)}</p>}
      </header>
    </div>
    {open && <NavigationDrawer links={links} admin={adminWorkspace} onClose={() => setOpen(false)}/>}
  </>;
}
