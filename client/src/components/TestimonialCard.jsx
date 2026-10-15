export default function TestimonialCard({ review, label }) {
  return <figure className="testimonial-card" aria-label={label}>
    <blockquote>{review.text}</blockquote>
    <figcaption><span>{review.authorLabel}</span>{review.rating === 5 && <span className="review-marquee-rating customer-words-stars" aria-label="5 out of 5 stars">★★★★★</span>}</figcaption>
  </figure>;
}
