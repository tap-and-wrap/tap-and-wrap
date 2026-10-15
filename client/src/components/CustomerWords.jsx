import { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ownerFeaturedReviews } from '../content/owner-confirmed-reviews.js';
import './CustomerWords.css';

export default function CustomerWords() {
  const id = useId();
  const track = useRef(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  useEffect(() => {
    const element = track.current;
    const update = () => {
      const previous = element.scrollLeft > 2;
      const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, []);
  const move = direction => {
    const element = track.current;
    const card = element.firstElementChild;
    element.scrollBy({ left: direction * (card.getBoundingClientRect().width + parseFloat(getComputedStyle(element).columnGap)), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const keyboard = event => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.currentTarget.scrollTo({ left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  };
  return <section className="customer-words" aria-labelledby={`${id}-heading`} aria-roledescription="carousel">
    <div className="section-heading"><p className="eyebrow">KIND WORDS</p><h2 id={`${id}-heading`}>What Our Customers Say</h2><p>Kind words about Tap &amp; Wrap from our customers.</p></div>
    <div className="customer-words-shell">
      <button className="customer-words-previous" type="button" aria-label="Previous testimonials" aria-controls={`${id}-track`} disabled={!edges.previous} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true"/></button>
      <div ref={track} id={`${id}-track`} className="customer-words-track" tabIndex={0} role="group" aria-label="Tap & Wrap customer testimonials. Use arrow keys to browse." onKeyDown={keyboard}>
        {ownerFeaturedReviews.map((review, index) => <figure key={review.id} aria-label={`Testimonial ${index + 1} of ${ownerFeaturedReviews.length}`}>
          <blockquote>{review.text}</blockquote>
          <figcaption><span>{review.authorLabel}</span><span className="customer-words-stars" aria-label="5 out of 5 stars">★★★★★</span></figcaption>
        </figure>)}
      </div>
      <button className="customer-words-next" type="button" aria-label="Next testimonials" aria-controls={`${id}-track`} disabled={!edges.next} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true"/></button>
    </div>
  </section>;
}
