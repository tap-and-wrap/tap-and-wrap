import { Link } from 'react-router-dom';
import { Gift, PenTool, ArrowUpRight } from 'lucide-react';
export default function CustomizePage() {
  return <main className="page-shell customize-hub"><p className="eyebrow">MAKE IT YOURS</p><h1>Something made just for them</h1><p>Choose one of our two featured customization services.</p><div className="service-grid"><Link className="service-card" to="/customize/gift-box"><Gift size={38}/><h2>Build Your Gift Box</h2><p>Select a gift box and personalize its contents.</p><ArrowUpRight/></Link><Link className="service-card" to="/customize/laser-engraving"><PenTool size={38}/><h2>Laser Engraving</h2><p>Personalize eligible products with names, artwork or meaningful details.</p><ArrowUpRight/></Link></div></main>;
}
