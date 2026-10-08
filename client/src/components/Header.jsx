import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import { useCart } from '../commerce/CartContext.jsx';

const links = [
  { to: '/', text: 'Home', end: true },
  { to: '/shop', text: 'Shop' },
  { to: '/customize', text: 'Customize' },
  { to: '/about', text: 'About Us' },
  { to: '/track-order', text: 'Track Order' },
  { to: '/my-orders', text: 'My Orders' },
  { to: '/contact', text: 'Contact' },
];

export default function Header() {
  const { cart } = useCart();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);
  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const location = useLocation();

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    const trigger = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;

    // Native modal dialogs contain focus and make the background inert.
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeButtonRef.current.focus({ preventScroll: true });

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      trigger.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    // Also dismiss on browser back/forward or navigation outside the drawer.
    dialogRef.current.close();
  }, [location.key]);

  function dismissOnBackdrop(event) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
        event.clientY < bounds.top || event.clientY > bounds.bottom) {
      setOpen(false);
    }
  }

  function containKeyboardFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll('button, a[href]');
    const first = controls[0];
    const last = controls[controls.length - 1];

    // Keep the Tab cycle inside the drawer, including at browser-chrome edges.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <>
    <div className="announcement">Thoughtful gifts, made personal — welcome to Tap & Wrap</div>
    <header className="site-header">
      <button ref={menuButtonRef} type="button" className="icon-button menu-icon" aria-label="Open menu" aria-haspopup="dialog" aria-controls="navigation-drawer" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={23} aria-hidden="true"/></button>
      <Link className="site-logo" to="/" aria-label="Tap and Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" /></Link>
      <div className="header-actions">
        <Link className="icon-button" to="/shop" aria-label="Shop and search" title="Shop and search"><Search size={20} aria-hidden="true"/></Link>
        <Link className="icon-button" to="/login" aria-label="Account" title="Account"><UserRound size={20} aria-hidden="true"/></Link>
        <Link className="icon-button" data-cart-anchor to="/cart" aria-label={`Cart${cart.quantity ? `, ${cart.quantity} items` : ''}`} title="Cart"><ShoppingBag size={20} aria-hidden="true"/>{cart.quantity > 0 && <span className="commerce-cart-count" aria-hidden="true">{cart.quantity > 99 ? '99+' : cart.quantity}</span>}</Link>
      </div>
    </header>
    <dialog ref={dialogRef} id="navigation-drawer" className="navigation-drawer" aria-labelledby="navigation-title" aria-modal="true" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={dismissOnBackdrop} onKeyDown={containKeyboardFocus}>
      <div className="drawer-header">
        <h2 id="navigation-title">Explore Tap & Wrap</h2>
        <button ref={closeButtonRef} type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close menu"><X size={22} aria-hidden="true"/></button>
      </div>
      <nav className="drawer-nav" aria-label="Main navigation">
        <ul>
          {links.map(item => <li key={item.to}><NavLink to={item.to} end={item.end} onClick={() => setOpen(false)}>{item.text}</NavLink></li>)}
        </ul>
      </nav>
    </dialog>
  </>;
}
