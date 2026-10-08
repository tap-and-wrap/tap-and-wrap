import { Link } from 'react-router-dom';
import { useSiteContent } from './PublicContent.jsx';
import { whatsappUrl } from '../utils/contact.js';
export default function Footer() {
  const content = useSiteContent();
  const contact = content.data?.contact;
  const whatsapp = whatsappUrl(contact?.whatsapp);
  return <footer className="site-footer">
    <div className="footer-brand"><Link className="footer-logo" to="/" aria-label="Tap and Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" loading="lazy" /></Link><p>Unlock the Magic of Giving.</p></div>
    <div><strong>Explore</strong><Link to="/shop">Shop</Link><Link to="/customize">Customize</Link><Link to="/about">About Us</Link><Link to="/track-order">Track Order</Link></div>
    <div><strong>Information</strong><Link to="/privacy-policy">Privacy Policy</Link><Link to="/refund-policy">Refund Policy</Link><Link to="/shipping-policy">Shipping Policy</Link><Link to="/terms-of-service">Terms of Service</Link><Link to="/contact">Contact</Link></div>
    <div><strong>Get in touch</strong><Link to="/contact">Contact Tap & Wrap</Link>{whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{contact?.instagram && <a href={contact.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}</div>
    <div className="footer-bottom">© {new Date().getFullYear()} Tap & Wrap. Built by Web District.</div>
  </footer>;
}
