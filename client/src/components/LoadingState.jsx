import './loading-state.css';

export default function LoadingState({ label = 'Loading', kind = 'rows', count = 3 }) {
  return <div className={`tw-loading tw-loading-${kind}`} role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{Array.from({length: count}, (_, index) => <div className="tw-skeleton-row" key={index}><span/><div><i/><i/></div></div>)}</div>
  </div>;
}
export function LoadingSpinner({ label }) {
  return <span className="tw-loading-inline" role="status"><span className="tw-spinner" aria-hidden="true"/>{label}</span>;
}
