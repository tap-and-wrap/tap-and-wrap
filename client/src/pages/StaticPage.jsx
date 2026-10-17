import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell.jsx';
import PageMetadata from '../seo/PageMetadata.jsx';
import { contactTracking } from '../tracking/client.js';
import { whatsappUrl } from '../utils/contact.js';
import { fixedPages, publicContacts, contentPublicationApproved, legalReviewNotice } from '../../../shared/storefront-content.mjs';
import '../information-pages.css';

export default function StaticPage({ page }) {
  const record = fixedPages[page];
  if (!record) return <PageShell eyebrow="TAP & WRAP" title="Page not found"><PageMetadata title="Page not found | Tap & Wrap" pathname={window.location.pathname} indexable={false}/><p>This page could not be found.</p><Link to="/shop">Explore the Shop</Link></PageShell>;
  return <main className={`information-page information-${page}`}>
    <PageMetadata title={`${record.title} | Tap & Wrap`} description={record.description} pathname={`/${page}`} indexable={contentPublicationApproved}/>
    <header className="information-heading"><p className="eyebrow">{record.eyebrow}</p><h1>{record.title}</h1><p className="information-intro">{record.intro}</p></header>
    <div className="information-layout"><nav className="information-contents" aria-label="On this page"><p className="eyebrow">ON THIS PAGE</p>{record.sections.map((s, i) => <a key={s.heading} href={`#information-${i}`}>{s.heading}</a>)}</nav>
      <article className="information-copy">{record.sections.map((s, i) => <section key={s.heading} id={`information-${i}`} aria-labelledby={`heading-${i}`}><h2 id={`heading-${i}`}>{s.heading}</h2>{s.paragraphs.map(text => <p key={text}>{text}</p>)}</section>)}
        {record.legal && !contentPublicationApproved && <aside className="information-review" aria-label="Publication review">{legalReviewNotice}</aside>}
        {page === 'refund-policy' && <p className="information-references">Reference: <a href="https://cpa.gov.eg/ar-eg/%D8%A8%D9%8A%D8%A7%D9%86%D8%A7%D8%AA-%D8%A7%D8%B9%D9%84%D8%A7%D9%85%D9%8A%D8%A9/ArtMID/654/ArticleID/6790" target="_blank" rel="noopener noreferrer">Consumer Protection Agency returns guidance</a> and <a href="https://cpa.gov.eg/en-us/Legislations" target="_blank" rel="noopener noreferrer">Law No. 181 of 2018</a>.</p>}
      </article>
    </div>
    <section className="information-support" aria-labelledby="support-heading"><div><p className="eyebrow">HERE FOR THE DETAILS</p><h2 id="support-heading">A thoughtful gift starts with a conversation.</h2><p>For order support, include your order or request reference.</p></div><div className="information-actions"><a className="button button-dark" href={whatsappUrl(publicContacts.whatsapp)} target="_blank" rel="noopener noreferrer" onClick={contactTracking}>Chat on WhatsApp</a><a href={`mailto:${publicContacts.email}`} onClick={contactTracking}>{publicContacts.email}</a><a href={publicContacts.instagram} target="_blank" rel="noopener noreferrer" onClick={contactTracking}>Find us on Instagram</a></div></section>
    <nav className="information-related" aria-label="Related information">{Object.entries(fixedPages).filter(([slug]) => slug !== page).map(([slug, value]) => <Link key={slug} to={`/${slug}`}>{value.title}</Link>)}<Link to="/shop">Explore the Shop</Link></nav>
  </main>;
}
