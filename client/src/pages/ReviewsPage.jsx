import { ownerReviews } from '../content/owner-confirmed-reviews.js';
import TestimonialCard from '../components/TestimonialCard.jsx';

export default function ReviewsPage() {
  return <main className="page-shell customer-reviews-page">
    <div className="section-heading"><p className="eyebrow">KIND WORDS</p><h1>All Customer Reviews</h1><p>64 customer testimonials, shared in Arabic and English.</p></div>
    <div className="customer-reviews-grid">{ownerReviews.map(review => <TestimonialCard key={review.id} review={review}/>)}</div>
  </main>;
}
