import './gift-card-preview.css';

/** Compact, consistent purchased-card summary. Selection is independent of text. */
export default function GiftCardPreview({ message = '', compact = false }) {
  return <div className={`tw-gift-card-details${compact ? ' tw-gift-card-details--compact' : ''}`} aria-label="Gift card details">
    <span className="tw-gift-card-details__label">Gift Card</span>
    <span className="tw-gift-card-details__value" dir="auto">{typeof message === 'string' && message.trim() ? <bdi>{message}</bdi> : 'Blank card'}</span>
  </div>;
}
