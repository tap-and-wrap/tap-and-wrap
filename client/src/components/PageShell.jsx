import { Link } from 'react-router-dom';
export default function PageShell({ eyebrow, title, children, account = false }) {
  const back = <p className="page-back"><Link to="/">← Back to Home</Link></p>;
  return <main className={`page-shell${account ? ' account-page' : ''}`}>{account && back}<p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children || <p>This page is part of the JavaScript starter. Live features will be connected in the next development phase.</p>}{!account && back}</main>;
}
