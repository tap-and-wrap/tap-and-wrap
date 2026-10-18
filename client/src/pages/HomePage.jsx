import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { FeaturedCategories, BestSellerProducts } from '../components/HomeCatalog.jsx';
import { ApprovedFaq, DeveloperHeroMedia, PublishedBundles, ReviewMarquee } from '../components/PublicContent.jsx';
import ServiceFilm from '../components/ServiceFilm.jsx';
import BrandIconMarquee from '../components/BrandIconMarquee.jsx';
import RibbonOpening from '../components/RibbonOpening.jsx';
import { approvedFaqFallback } from '../content/final-faq.js';
import { ownerFeaturedReviews } from '../content/owner-confirmed-reviews.js';
import '../home-media.css';

export default function HomePage() {
  const reviews = ownerFeaturedReviews;
  const faq = approvedFaqFallback;
  return <><RibbonOpening/><main>
    <section className="hero home-media-hero" aria-labelledby="home-hero-heading">
      <DeveloperHeroMedia />
      <div className="home-hero-content">
        <p className="eyebrow">THOUGHTFUL GIFTS, MADE PERSONAL</p>
        <h1 id="home-hero-heading">Make their heart <em>flutter.</em></h1>
        <p className="home-hero-subtitle">Thoughtful gifts, made personal.</p>
        <div className="button-group"><Link to="/shop" className="button button-dark">Shop Gifts</Link><Link to="/customize" className="button button-outline">Customize Yours</Link></div>
      </div>
    </section>
    <BrandIconMarquee />
    <PublishedBundles />
    <section className="section" aria-labelledby="home-categories-heading"><div className="section-heading"><p className="eyebrow">BROWSE WITH LOVE</p><h2 id="home-categories-heading">Shop by Category</h2></div><FeaturedCategories /></section>
    <section className="section" aria-labelledby="home-featured-heading"><div className="section-heading"><p className="eyebrow">HANDPICKED FOR YOU</p><h2 id="home-featured-heading">Featured Gifts</h2><p>Thoughtful picks from our collection.</p></div><BestSellerProducts /><div className="home-section-footer"><Link className="button button-dark home-shop-all" to="/shop">Shop All</Link></div></section>
    <section className="section service-section" aria-labelledby="home-personal-heading"><div className="section-heading"><p className="eyebrow">MAKE IT YOURS</p><h2 id="home-personal-heading">A gift as unique as them</h2></div><div className="service-grid home-service-grid">
      <article className="home-service-card"><ServiceFilm src="/media/tap-wrap-gift-box.mp4" poster="/media/tap-wrap-gift-box-poster.webp" title="Build Your Gift Box" /><Link className="home-service-detail" to="/customize/gift-box"><h3>Build Your Gift Box</h3><p>Choose the pieces that make someone smile.</p><span>Explore Gift Boxes <ArrowUpRight aria-hidden="true" size={20}/></span></Link></article>
      <article className="home-service-card"><ServiceFilm src="/media/tap-wrap-laser-engraving.mp4" poster="/media/tap-wrap-laser-engraving-poster.webp" title="Laser Engraving" /><Link className="home-service-detail" to="/customize/laser-engraving"><h3>Laser Engraving</h3><p>Add a personal mark to an unforgettable gift.</p><span>Explore Engraving <ArrowUpRight aria-hidden="true" size={20}/></span></Link></article>
    </div></section>
    {reviews.length > 0 && <section className="section home-reviews-section" aria-labelledby="home-reviews-heading"><div className="section-heading"><p className="eyebrow">KIND WORDS</p><h2 id="home-reviews-heading">What Our Customers Say</h2></div><div className="home-named-review-carousel"><ReviewMarquee reviews={reviews}/></div></section>}
    {faq.length > 0 && <section className="section faq-section" aria-labelledby="home-faq-heading"><div className="section-heading"><p className="eyebrow">ANY QUESTIONS?</p><h2 id="home-faq-heading">Frequently Asked Questions</h2></div><ApprovedFaq entries={faq} categorized/></section>}
  </main></>;
}
