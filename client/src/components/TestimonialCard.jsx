export default function TestimonialCard({ review, label }) {
  return <figure className="testimonial-card" aria-label={label} data-review-id={review.id}>
    <blockquote lang={review.language} dir={review.language === 'ar-EG' ? 'rtl' : 'ltr'}>{review.text}</blockquote>
    <figcaption><bdi>{review.authorLabel}</bdi>{review.rating === 5 && <span className="review-marquee-rating customer-words-stars" aria-label="5 out of 5 stars">★★★★★</span>}</figcaption>
  </figure>;
}
