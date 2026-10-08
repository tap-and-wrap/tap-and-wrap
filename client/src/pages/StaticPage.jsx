import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell.jsx';
import { useSiteContent } from '../components/PublicContent.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { contactTracking } from '../tracking/client.js';
import { whatsappUrl } from '../utils/contact.js';

const pages = { about: ['About Us', 'about'], contact: ['Contact', 'contact'], 'privacy-policy': ['Privacy Policy', 'privacyPolicy'], 'refund-policy': ['Refund Policy', 'refundPolicy'], 'shipping-policy': ['Shipping Policy', 'shippingPolicy'], 'terms-of-service': ['Terms of Service', 'termsOfService'] };
export default function StaticPage({ page }) {
  const content = useSiteContent();
  const entry = pages[page];
  if (!entry) return <PageShell eyebrow="TAP & WRAP" title="Page not found"><PageMetadata title="Page not found | Tap & Wrap" description="This page could not be found." pathname={window.location.pathname} indexable={false}/><p>The address may have changed or this page does not exist.</p><Link className="button button-dark" to="/shop">Explore the Shop</Link></PageShell>;
  const [title, key] = entry;
  const record = page === 'about' || page === 'contact' ? content.data?.[key] : content.data?.policies?.[key];
  const whatsapp = whatsappUrl(record?.whatsapp);
  return <PageShell eyebrow="TAP & WRAP" title={record?.title || title}><PageMetadata title={`${record?.title || title} | Tap & Wrap`} description={record?.body || `${title} information from Tap & Wrap.`} pathname={`/${page}`} indexable={Boolean(record)}/>{content.isPending ? <p role="status">Loading {title.toLowerCase()}…</p> : content.isError ? <div role="alert"><p>This information could not be loaded.</p><button className="button button-outline" onClick={() => content.refetch()}>Try again</button></div> : !record ? <div className="website-pending"><p>Development preview · Owner-approved {title.toLowerCase()} information is awaiting publication.</p><p>Checkout remains disabled until launch approval.</p><Link to="/shop">Browse the collection</Link></div> : <><div className="website-owner-copy">{record.body}</div>{page === 'contact' && <div className="website-contact-links">{record.email && <a href={`mailto:${record.email}`} onClick={contactTracking}>Email Tap & Wrap</a>}{record.phone && <a href={`tel:${record.phone}`} onClick={contactTracking}>Call Tap & Wrap</a>}{whatsapp && <a href={whatsapp} onClick={contactTracking} target="_blank" rel="noopener noreferrer">WhatsApp</a>}{record.instagram && <a href={record.instagram} onClick={contactTracking} target="_blank" rel="noopener noreferrer">Instagram</a>}{record.address && <p>{record.address}</p>}</div>}{record.updatedAt && <p className="editorial-note">Updated <time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleDateString('en-GB')}</time></p>}</>}</PageShell>;
}
