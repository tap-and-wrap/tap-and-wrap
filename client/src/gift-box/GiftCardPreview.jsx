import './gift-card-preview.css';

// A presentational proof only. Selection, price and message validation stay
// with the established Gift Box builder and server snapshot.
export default function GiftCardPreview({ message, compact = false }) {
  if (typeof message !== 'string' || !message.trim()) return null;
  return <section className={`tw-gift-card${compact ? ' tw-gift-card--compact' : ''}`} aria-label="Gift card preview">
    <div className="tw-gift-card__frame">
      <span className="tw-gift-card__eyebrow" aria-hidden="true">A little note</span>
      <span className="tw-gift-card__ornament" aria-hidden="true">✦</span>
      <p className="tw-gift-card__message" dir="auto">{message}</p>
      <span className="tw-gift-card__footer" aria-hidden="true">Tap &amp; Wrap</span>
    </div>
  </section>;
}
