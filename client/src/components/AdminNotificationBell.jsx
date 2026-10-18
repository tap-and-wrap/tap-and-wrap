import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet } from '../commerce/api.js';
import '../admin/notifications.css';

const shortDate = value => value ? new Date(value).toLocaleString('en-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '';

/** Only mounted for verified administrators; query data is session scoped. */
export default function AdminNotificationBell() {
  const session = useSession();
  const location = useLocation();
  const root = useRef(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: privateQueryKey(session.ownerKey, 'admin-notifications', 1, 5, 'all'),
    queryFn: ({ signal }) => adminCommerceGet('/notifications', { page: 1, limit: 5, view: 'all' }, signal),
    enabled: session.ready && session.user?.role === 'admin', retry: false, staleTime: 15000, refetchInterval: 30000,
  });
  useEffect(() => { setOpen(false); }, [location.key]);
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  const unread = query.data?.unreadCount || 0;
  return <div className="admin-bell" ref={root}>
    <button className="icon-button admin-bell-trigger" type="button" aria-label={`Admin notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-controls="admin-notification-preview" title="Admin notifications" onClick={() => { setOpen(value => !value); if (!open) void query.refetch(); }}>
      <Bell size={20} aria-hidden="true"/>{unread > 0 && <span className="admin-bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="admin-notification-popover" id="admin-notification-preview" aria-label="Recent admin notifications">
      <div className="admin-notification-heading"><strong>Notifications</strong><span>{unread} unread</span></div>
      {query.isPending ? <p role="status">Loading notifications…</p> : query.error ? <p role="alert">Notifications are temporarily unavailable. <button type="button" onClick={() => query.refetch()}>Retry</button></p>
        : !query.data?.notifications?.length ? <p>No notifications yet.</p>
          : <ul className="admin-notification-preview-list">{query.data.notifications.map(item => <li key={item.id}><Link to={item.href} className={item.unread ? 'is-unread' : ''} onClick={() => setOpen(false)}><span>{item.title}</span><small>{item.detail} · {shortDate(item.at)}</small></Link></li>)}</ul>}
      <Link className="admin-notification-all-link" to="/admin/notifications" onClick={() => setOpen(false)}>View all notifications</Link>
    </section>}
  </div>;
}
