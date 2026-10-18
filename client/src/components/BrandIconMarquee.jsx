import { Flower2, Gift, Heart, PackageOpen, PenLine, Sparkles } from 'lucide-react';
import './BrandIconMarquee.css';

// Decorative brand details, not claims about orders or customer counts.
const details = [
  { label: 'Thoughtful Gifts', Icon: Gift },
  { label: 'Gift Boxes', Icon: PackageOpen },
  { label: 'Personal Touches', Icon: PenLine },
  { label: 'Little Celebrations', Icon: Flower2 },
  { label: 'Made With Love', Icon: Heart },
  { label: 'Special Moments', Icon: Sparkles },
];

export default function BrandIconMarquee() {
  return <div className="brand-icon-marquee" data-testid="brand-icon-marquee" aria-hidden="true">
    <div className="brand-icon-marquee__track">
      {[0, 1].map(copy => <div className="brand-icon-marquee__group" key={copy}>
        {details.map(({ label, Icon }) => <span className="brand-icon-marquee__item" key={label}>
          <Icon aria-hidden="true" size={25} strokeWidth={1.45}/><span>{label}</span>
        </span>)}
      </div>)}
    </div>
  </div>;
}
