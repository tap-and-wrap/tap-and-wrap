import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ShoppingBag, UserRound, Home, ChevronDown } from 'lucide-react';
import { adminLinks } from '../admin/navigation.js';
import { useCart } from '../commerce/CartContext.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { commerceError } from '../commerce/api.js';
import useModalDialog from './useModalDialog.js';
import AdminNotificationBell from './AdminNotificationBell.jsx';
import useStaggeredMenuMotion from './useStaggeredMenuMotion.js';
import { publicContacts } from '../../../shared/storefront-content.mjs';
import { whatsappUrl } from '../utils/contact.js';

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

function NavigationLinks({ links, onClose, admin = false, numbered = false }) {
  const location = useLocation();
  const root = useRef(null);
  useEffect(() => { root.current?.querySelectorAll('details[open]').forEach(element => { element.open = false; }); }, [location.key]);
  useEffect(() => {
    const dismiss = event => root.current?.querySelectorAll('details[open]').forEach(element => { if (!element.contains(event.target)) element.open = false; });
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  return <ul ref={root}>{links.map((item,index) => {
    const Icon = item.icon;
    const label=<>{numbered&&<span className="sm-link-number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span>}<span className="sm-link-label"><span>{item.text}</span></span></>;
    return <li key={item.to} style={{'--nav-index':index}}>{item.children ? <details className="admin-customization-menu" onKeyDown={event => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); event.stopPropagation(); } }}>
      <summary className={/^\/admin\/(customization|gift-box|engraving)/.test(location.pathname) ? 'is-active' : ''}>{admin && Icon && <Icon size={18} aria-hidden="true"/>}{label}<ChevronDown size={14} aria-hidden="true"/></summary>
      <ul>{item.children.map(child => <li key={child.to}><NavLink to={child.to} onClick={event => { event.currentTarget.closest('details').open = false; onClose?.(event,child); }}>{child.text}</NavLink></li>)}</ul>
    </details> : <NavLink to={item.to} end={item.end} onClick={event=>onClose?.(event,item)}>{admin && Icon && <Icon size={18} aria-hidden="true"/>}{label}</NavLink>}</li>;
  })}</ul>;
}

function NavigationDrawer({ links, onClose, admin, returnFocus }) {
  const navigate=useNavigate(),dismiss=useRef(()=>{});
  const { dialogRef, dialogProps } = useModalDialog({ onClose:()=>dismiss.current(), initialFocus:'.menu-close', returnFocus });
  const {closing,close}=useStaggeredMenuMotion(dialogRef,onClose);dismiss.current=close;
  const follow=(event,item)=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;event.preventDefault();close(()=>navigate(item.to));};
  return <dialog ref={dialogRef} {...dialogProps} id="navigation-drawer" className={`navigation-drawer ${closing?'is-closing':''}`} aria-labelledby="navigation-title" aria-modal="true">
    <div className="sm-prelayer sm-prelayer-rose" aria-hidden="true"/><div className="sm-prelayer sm-prelayer-blush" aria-hidden="true"/><div className="sm-prelayer sm-prelayer-beige" aria-hidden="true"/>
    <div className="sm-panel">
      <div className="drawer-header"><Link className="drawer-logo" to={admin?'/admin':'/'} onClick={event=>follow(event,{to:admin?'/admin':'/'})} aria-label="Tap and Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667"/></Link><button type="button" className="menu-toggle menu-close" onClick={()=>close()} aria-label="Close menu" autoFocus><span className="menu-text" aria-hidden="true"><span className="menu-text-inner"><span>Menu</span><span>Close</span></span></span><span className="menu-glyph" aria-hidden="true"><span/><span/></span></button></div>
      <h2 id="navigation-title" className="drawer-eyebrow">{admin?'Your store':'Explore Tap & Wrap'}</h2>
      <nav className={`drawer-nav ${admin ? 'admin-drawer-nav' : ''}`} aria-label={admin ? 'Administration' : 'Main navigation'}><NavigationLinks links={links} admin={admin} numbered onClose={follow}/></nav>
      <div className="sm-socials"><p>{admin?'Thoughtfully managed.':'A little thought. A lasting memory.'}</p><div aria-label="Find Tap & Wrap">{/^https:\/\/www\.instagram\.com\/[a-zA-Z0-9._/-]+\/?$/.test(publicContacts.instagram||'')&&<a href={publicContacts.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}{whatsappUrl(publicContacts.whatsapp)&&<a href={whatsappUrl(publicContacts.whatsapp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicContacts.email||'')&&<a href={`mailto:${publicContacts.email}`}>Email</a>}</div></div>
    </div>
  </dialog>;
}

export default function Header() {
  const { cart } = useCart();
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const headerRef = useRef(null);
  const menuOpener = useRef(null);
  const openMenu = event => { menuOpener.current = event.currentTarget; setOpen(true); };
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
      <header className={admin&&!adminWorkspace?'site-header has-owner-actions':'site-header'}>
      <button type="button" className="menu-toggle menu-icon" aria-label="Open menu" aria-haspopup="dialog" aria-controls={open ? 'navigation-drawer' : undefined} aria-expanded={open} onClick={openMenu}><span className="menu-text" aria-hidden="true">Menu</span><span className="menu-glyph" aria-hidden="true"><span/><span/></span></button>
      <Link className="site-logo" to={adminWorkspace ? '/admin' : '/'} aria-label={adminWorkspace ? 'Tap and Wrap dashboard' : 'Tap and Wrap home'}><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" /></Link>
      <nav className="desktop-navigation" aria-label={adminWorkspace ? 'Administration' : 'Main navigation'}><NavigationLinks links={links} admin={adminWorkspace}/></nav>
      <div className="header-actions">
        {!adminWorkspace&&<button type="button" className="menu-toggle desktop-menu-opener" aria-label="Open menu" aria-haspopup="dialog" aria-controls={open?'navigation-drawer':undefined} aria-expanded={open} onClick={openMenu}><span aria-hidden="true">Menu</span><span className="menu-glyph" aria-hidden="true"><span/><span/></span></button>}
        {admin && <AdminNotificationBell />}
        {session.ready ? <Link className="icon-button" to={adminWorkspace ? '/' : accountDestination} aria-label={adminWorkspace ? 'Home — storefront' : 'Account'} title={adminWorkspace ? 'View storefront' : admin ? 'Admin dashboard' : session.user ? 'My account and orders' : 'Sign in'}>{adminWorkspace ? <Home size={20} aria-hidden="true"/> : <UserRound size={20} aria-hidden="true"/>}</Link> : <button className="icon-button" type="button" disabled aria-label={session.phase === 'error' ? 'Account unavailable' : 'Checking account'}><UserRound size={20} aria-hidden="true"/></button>}
        {!adminWorkspace && <Link className="icon-button" data-cart-anchor to="/cart" aria-label={`Cart${cart.quantity ? `, ${cart.quantity} items` : ''}`} title="Cart"><ShoppingBag size={20} aria-hidden="true"/>{cart.quantity > 0 && <span className="commerce-cart-count" aria-hidden="true">{cart.quantity > 99 ? '99+' : cart.quantity}</span>}</Link>}
        {admin && <button className="header-signout" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Signing out…' : 'Sign out'}</button>}
      </div>
      {logout.error && !open && <p className="header-error" role="alert">{commerceError(logout.error)}</p>}
      </header>
    </div>
    {open && <NavigationDrawer links={links} admin={adminWorkspace} returnFocus={menuOpener.current} onClose={() => setOpen(false)}/>}
  </>;
}
