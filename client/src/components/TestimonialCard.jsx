import { BadgeCheck } from 'lucide-react';

export default function TestimonialCard({ review, label }) {
  return <figure className="testimonial-card" aria-label={label} data-review-id={review.id}>
    <blockquote lang={review.language} dir={review.language === 'ar-EG' ? 'rtl' : 'ltr'}>{review.text}</blockquote>
    <figcaption><bdi>{review.authorLabel}</bdi><span className="review-confirmed" tabIndex={0} role="img" aria-label="Customer feedback confirmed by Tap & Wrap." title="Customer feedback confirmed by Tap & Wrap."><BadgeCheck size={17} aria-hidden="true"/></span>{review.rating === 5 && <span className="review-marquee-rating customer-words-stars" aria-label="5 out of 5 stars">★★★★★</span>}</figcaption>
  </figure>;
}
