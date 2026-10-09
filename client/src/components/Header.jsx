import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Menu, Pause, Play, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { useCart } from '../commerce/CartContext.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import useModalDialog from './useModalDialog.js';

const primaryLinks = [
  { to: '/', text: 'Home', end: true },
  { to: '/shop', text: 'Shop' },
  { to: '/customize', text: 'Customize' },
  { to: '/about', text: 'About Us' },
];
const announcement = 'Thoughtful gifts, made personal — welcome to Tap & Wrap';

function AnnouncementBar() {
  const [paused, setPaused] = useState(false);
  return <div className="announcement announcement-marquee" data-paused={paused}>
    <span className="storefront-sr-only">{announcement}</span>
    <div className="announcement-window" aria-hidden="true"><div className="announcement-track">{[0, 1].map(group => <div className="announcement-group" key={group}>{[0, 1, 2].map(item => <span key={item}>{announcement}<span className="announcement-separator">✦</span></span>)}</div>)}</div></div>
    <button type="button" className="announcement-pause" aria-label={paused ? 'Resume announcements' : 'Pause announcements'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={15} aria-hidden="true"/> : <Pause size={15} aria-hidden="true"/>}</button>
  </div>;
}

function NavigationDrawer({ links, onClose, admin, logout }) {
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  return <dialog ref={dialogRef} {...dialogProps} id="navigation-drawer" className="navigation-drawer" aria-labelledby="navigation-title" aria-modal="true">
    <div className="drawer-header"><h2 id="navigation-title">Explore Tap & Wrap</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close menu" autoFocus><X size={22} aria-hidden="true"/></button></div>
    <nav className="drawer-nav" aria-label="Main navigation"><ul>{links.map(item => <li key={item.to}><NavLink to={item.to} end={item.end} onClick={onClose}>{item.text}</NavLink></li>)}</ul></nav>
    {admin && <div className="drawer-account"><p>Administrator account</p><button className="catalog-text-button" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button>{logout.error && <p role="alert">{commerceError(logout.error)}</p>}</div>}
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
  const links = [...primaryLinks];
  if (session.ready && !session.user) links.push({ to: '/track-order', text: 'Track Order' });
  else if (role === 'customer') links.push({ to: '/my-orders', text: 'My Orders' });
  else if (admin) links.push({ to: '/admin', text: 'Dashboard' });
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
    <AnnouncementBar/>
    <header ref={headerRef} className="site-header">
      <button type="button" className="icon-button menu-icon" aria-label="Open menu" aria-haspopup="dialog" aria-controls={open ? 'navigation-drawer' : undefined} aria-expanded={open} onClick={() => setOpen(true)}><Menu size={23} aria-hidden="true"/></button>
      <Link className="site-logo" to="/" aria-label="Tap and Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" /></Link>
      <nav className="desktop-navigation" aria-label="Main navigation"><ul>{links.map(item => <li key={item.to}><NavLink to={item.to} end={item.end}>{item.text}</NavLink></li>)}</ul></nav>
      <div className="header-actions">
        <Link className="icon-button" to="/shop" aria-label="Shop and search" title="Shop and search"><Search size={20} aria-hidden="true"/></Link>
        {session.ready ? <Link className="icon-button" to={accountDestination} aria-label="Account" title={admin ? 'Admin dashboard' : session.user ? 'My account and orders' : 'Sign in'}><UserRound size={20} aria-hidden="true"/></Link> : <button className="icon-button" type="button" disabled aria-label={session.phase === 'error' ? 'Account unavailable' : 'Checking account'}><UserRound size={20} aria-hidden="true"/></button>}
        <Link className="icon-button" data-cart-anchor to="/cart" aria-label={`Cart${cart.quantity ? `, ${cart.quantity} items` : ''}`} title="Cart"><ShoppingBag size={20} aria-hidden="true"/>{cart.quantity > 0 && <span className="commerce-cart-count" aria-hidden="true">{cart.quantity > 99 ? '99+' : cart.quantity}</span>}</Link>
        {admin && <button className="header-signout" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button>}
      </div>
      {logout.error && !open && <p className="header-error" role="alert">{commerceError(logout.error)}</p>}
    </header>
    {open && <NavigationDrawer links={links} onClose={() => setOpen(false)} admin={admin} logout={logout}/>}
  </>;
}
