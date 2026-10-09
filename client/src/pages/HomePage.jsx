import { Link } from 'react-router-dom';
import { Gift, PenTool, ArrowUpRight } from 'lucide-react';
import { FeaturedCategories, BestSellerProducts } from '../components/HomeCatalog.jsx';
import { ApprovedFaq, DeveloperHeroMedia, PublishedBundles, ReviewCards, TrustStatistics, useSiteContent } from '../components/PublicContent.jsx';

export default function HomePage() {
  const content = useSiteContent();
  const reviews = content.data?.featuredReviews || [];
  return <main>
    <section className="hero" aria-labelledby="home-hero-heading">
      <p className="eyebrow">A LITTLE MORE THAN A GIFT</p>
      <h1 id="home-hero-heading">Makes someone’s heart flap <em>with Tap & Wrap.</em></h1>
      <p className="hero-description">Thoughtful gifts, personal touches and beautiful moments — all wrapped with love.</p>
      <div className="button-group"><Link to="/shop" className="button button-dark">Shop Gifts</Link><Link to="/customize" className="button button-outline">Customize a Gift</Link></div>
      <DeveloperHeroMedia/>
    </section>
    <TrustStatistics/>
    <PublishedBundles/>
    <section className="section"><div className="section-heading"><p className="eyebrow">BROWSE WITH LOVE</p><h2>Shop by Category</h2></div><FeaturedCategories/></section>
    <section className="section"><div className="section-heading"><p className="eyebrow">CUSTOMER FAVORITES</p><h2>Best Sellers</h2><p>Thoughtful picks from our collection.</p></div><BestSellerProducts/></section>
    <section className="section service-section"><div className="section-heading"><p className="eyebrow">MAKE IT YOURS</p><h2>A gift as unique as them</h2></div><div className="service-grid"><Link className="service-card" to="/customize/gift-box"><Gift size={32}/><h3>Build Your Gift Box</h3><p>Choose the pieces that make someone smile.</p><ArrowUpRight/></Link><Link className="service-card" to="/customize/laser-engraving"><PenTool size={32}/><h3>Laser Engraving</h3><p>Add a personal mark to an unforgettable gift.</p><ArrowUpRight/></Link></div></section>
    <section className="section"><div className="section-heading"><p className="eyebrow">KIND WORDS</p><h2>What Our Customers Say</h2></div>{reviews.length ? <ReviewCards reviews={reviews}/> : <p className="placeholder-strip">Development preview · No owner-approved featured reviews have been published.</p>}</section>
    <section className="section faq-section"><div className="section-heading"><p className="eyebrow">ANY QUESTIONS?</p><h2>Frequently Asked Questions</h2></div><ApprovedFaq entries={content.data?.faq}/>{content.isError && <button className="catalog-text-button" onClick={() => content.refetch()}>Retry website content</button>}</section>
  </main>;
}
