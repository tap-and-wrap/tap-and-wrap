import { ApprovedFaq } from '../components/PublicContent.jsx';
import { Instagram, Mail, MessageCircle } from 'lucide-react';
import { whatsappUrl } from '../utils/contact.js';
import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { fixedPages, fixedFaq, publicContacts, contentPublicationApproved } from '../../../shared/storefront-content.mjs';
import '../information-pages.css';

export default function StaticPage({ page }) {
  const record = fixedPages[page];
  if (!record) return <PageShell eyebrow="TAP & WRAP" title="Page not found"><PageMetadata title="Page not found | Tap & Wrap" pathname={window.location.pathname} indexable={false}/><p>This page could not be found.</p><Link to="/shop">Explore the Shop</Link></PageShell>;
  return <main className={`information-page information-${page}`}>
    <PageMetadata title={`${record.title} | Tap & Wrap`} description={record.description} pathname={`/${page}`} indexable={contentPublicationApproved}/>
    <header className="information-heading"><p className="eyebrow">{record.eyebrow}</p><h1>{record.title}</h1><p className="information-intro">{record.intro}</p></header>
    <div className="information-layout">
      <article className="information-copy">{record.sections.map((s, i) => <section key={s.heading} id={`information-${i}`} aria-labelledby={`heading-${i}`}><h2 id={`heading-${i}`}>{s.heading}</h2>{s.paragraphs.map(text => <p key={text}>{text}</p>)}{page === 'contact' && i === 0 && <div className="contact-page-actions"><a className="button button-dark" href={whatsappUrl(publicContacts.whatsapp)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} aria-hidden="true"/>WhatsApp</a><a className="button button-outline" href={publicContacts.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={18} aria-hidden="true"/>Instagram</a><a className="button button-outline" href={`mailto:${publicContacts.email}`}><Mail size={18} aria-hidden="true"/>Email</a></div>}</section>)}
        {page === 'refund-policy' && <p className="information-references">Reference: <a href="https://cpa.gov.eg/ar-eg/%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D8%B9%D9%84%D8%A7%D9%85%D9%8A%D8%A9/ArtMID/654/ArticleID/6790" target="_blank" rel="noopener noreferrer">Consumer Protection Agency returns guidance</a> and <a href="https://cpa.gov.eg/en-us/Legislations" target="_blank" rel="noopener noreferrer">Law No. 181 of 2018</a>.</p>}
      </article>
    </div>
    {page === 'contact' && <section id="questions" className="information-faq" aria-labelledby="all-questions-heading"><h2 id="all-questions-heading">Questions about your gift</h2><ApprovedFaq entries={fixedFaq} categorized/></section>}
  </main>;
}
