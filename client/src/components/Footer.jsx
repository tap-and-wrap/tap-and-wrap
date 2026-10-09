import { Link } from 'react-router-dom';
import { Instagram, Mail, MessageCircle } from 'lucide-react';
import { useSiteContent } from './PublicContent.jsx';
import { whatsappUrl } from '../utils/contact.js';
export default function Footer() {
  const content = useSiteContent();
  const contact = content.data?.contact;
  const whatsapp = whatsappUrl(contact?.whatsapp);
  const instagram = typeof contact?.instagram === 'string' && /^https:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._/-]+\/?$/.test(contact.instagram) ? contact.instagram : null;
  const email = typeof contact?.email === 'string' && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(contact.email) ? contact.email : null;
  return <footer className="site-footer">
    <div className="footer-brand"><Link className="footer-logo" to="/" aria-label="Tap and Wrap home"><img src="/tap-wrap-logo.webp" alt="Tap & Wrap" width="2000" height="667" loading="lazy" /></Link><p>Unlock the Magic of Giving.</p></div>
    <nav className="footer-information" aria-label="Information"><strong>Information</strong><Link to="/privacy-policy">Privacy Policy</Link><Link to="/refund-policy">Refund Policy</Link><Link to="/shipping-policy">Shipping Policy</Link><Link to="/terms-of-service">Terms of Service</Link><Link to="/contact">Contact</Link></nav>
    <div className="footer-contact"><strong>Get in touch</strong><div className="footer-social-links">{instagram && <a href={instagram} aria-label="Instagram" title="Instagram" target="_blank" rel="noopener noreferrer"><Instagram size={21} aria-hidden="true"/></a>}{whatsapp && <a href={whatsapp} aria-label="WhatsApp" title="WhatsApp" target="_blank" rel="noopener noreferrer"><MessageCircle size={21} aria-hidden="true"/></a>}{email && <a href={`mailto:${email}`} aria-label="Email Tap & Wrap" title="Email Tap & Wrap"><Mail size={21} aria-hidden="true"/></a>}</div>{!instagram && !whatsapp && !email && <p className="footer-contact-pending">Contact channels are awaiting owner approval.</p>}</div>
    <div className="footer-bottom">© {new Date().getFullYear()} Tap & Wrap. Built by Web District.</div>
  </footer>;
}
