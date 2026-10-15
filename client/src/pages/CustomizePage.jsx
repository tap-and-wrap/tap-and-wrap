import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import ServiceFilm from '../components/ServiceFilm.jsx';
import '../home-media.css';
export default function CustomizePage() {
  return <main className="page-shell customize-hub"><p className="eyebrow">MAKE IT YOURS</p><h1>Something made just for them</h1><p>Choose one of our two featured customization services.</p>
    <div className="service-grid home-service-grid customize-service-grid">
      <article className="home-service-card"><ServiceFilm src="/media/tap-wrap-gift-box.mp4" poster="/media/tap-wrap-gift-box-poster.webp" title="Build Your Gift Box" /><Link className="home-service-detail" to="/customize/gift-box"><h2>Build Your Gift Box</h2><p>Choose the pieces that make someone smile.</p><span>Explore Gift Boxes <ArrowUpRight aria-hidden="true" size={20}/></span></Link></article>
      <article className="home-service-card"><ServiceFilm src="/media/tap-wrap-laser-engraving.mp4" poster="/media/tap-wrap-laser-engraving-poster.webp" title="Laser Engraving" /><Link className="home-service-detail" to="/customize/laser-engraving"><h2>Laser Engraving</h2><p>Add a personal mark to an unforgettable gift.</p><span>Explore Engraving <ArrowUpRight aria-hidden="true" size={20}/></span></Link></article>
    </div>
  </main>;
}
