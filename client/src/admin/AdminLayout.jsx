import { createContext, useContext } from 'react';
import '../admin.css';

export const EmbeddedAdmin = createContext(false);

/** One outer geometry for every protected administration route, including states. */
export default function AdminLayout({ title, description, actions, children, busy = false, className = '' }) {
  const embedded = useContext(EmbeddedAdmin);
  const Container = embedded ? 'section' : 'main';
  return <Container className={`${embedded ? 'admin-embedded' : 'admin-shell admin-layout'} ${className}`} tabIndex={-1} aria-busy={busy}>
    {!embedded && <header className="admin-page-heading">
      <div><p className="admin-eyebrow">Your store, thoughtfully managed</p><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>}
    <div className="admin-content">{children}</div>
  </Container>;
}
