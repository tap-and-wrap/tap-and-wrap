import { LoadingSpinner } from '../components/LoadingState.jsx';
import './background-cart.css';

export default function CartPreparationLine({job, retry, check, cancel}) {
  const busy = ['queued','preparing'].includes(job.status);
  const uncertain = job.status === 'uncertain';
  const canCancel = job.canCancel;
  return <article className="cart-preparation" aria-label={`${job.label} preparation`} aria-busy={busy}>
    <div className="cart-preparation-picture" aria-hidden="true">{job.kind === 'gift_box_v2' ? '🎁' : '✍️'}</div>
    <div className="cart-preparation-body">
      <h2>{job.label}</h2>
      <p className="cart-preparation-state">{busy ? <><LoadingSpinner label="Preparing custom item"/> Preparing — not yet added to your cart</> : uncertain ? 'Cart confirmation needed' : 'Preparation needs your attention'}</p>
      <p className="commerce-muted">{busy ? job.progress || 'Securing your custom item…' : job.error || 'Your item has not been confirmed. Check or retry the same operation.'}</p>
      <p className="commerce-muted">This item is not included in your payable total until the server confirms it.</p>
      <div className="cart-preparation-actions">
        {!busy && <button className="button button-secondary" type="button" onClick={() => void check(job.operationKey)}>Check status</button>}
        {!busy && <button className="button button-secondary" type="button" onClick={() => void retry(job.operationKey)}>Retry same item</button>}
        {canCancel && <button type="button" className="button button-secondary" onClick={() => void cancel(job.operationKey)}>Cancel preparation</button>}
      </div>
      {uncertain && <p className="commerce-muted">Cancellation is unavailable while the server may already have saved this item. Check its status or retry using the same operation key.</p>}
    </div>
  </article>;
}
