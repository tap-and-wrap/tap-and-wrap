import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AdminLayout from '../admin/AdminLayout.jsx';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet, adminCommercePost, commerceError } from '../commerce/api.js';
import '../admin/notifications.css';

const views = [['all','All notifications'], ['unread','Unread'], ['orders','Orders'], ['requests','Requests'], ['followups','Follow-ups']];
const date = value => value ? new Date(value).toLocaleString('en-EG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export default function AdminNotificationsPage() {
  const session = useSession(), queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState('');
  const view = views.some(([id]) => id === params.get('view')) ? params.get('view') : 'all';
  const parsed = Number(params.get('page') || 1);
  const page = Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 1;
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'admin-notifications', page, 20, view),
    queryFn: ({ signal }) => adminCommerceGet('/notifications', { page, limit: 20, view }, signal),
    retry: false, refetchInterval: 30000, staleTime: 0 });
  const readAll = useMutation({ mutationFn: () => adminCommercePost('/notifications/read-all', {}), onSuccess: async () => {
    setNotice('All current notifications marked as read. New updates and due reminders will still appear.');
    await queryClient.invalidateQueries({ queryKey: privateQueryKey(session.ownerKey, 'admin-notifications') });
  } });
  const change = (filter, next) => {
    const updated = new URLSearchParams(params);
    updated.set(filter, String(next));
    if (filter === 'view') updated.delete('page');
    setParams(updated);
  };
  return <AdminLayout title="Notifications" description="Orders, custom requests and follow-up reminders in one place. No scheduled reminder emails are needed for this page." busy={query.isPending}>
    <section className="admin-panel admin-notifications-page" aria-label="Admin notification history">
      <div className="admin-notification-page-head"><div><h2>Recent activity</h2><p>Unread: <strong>{query.data?.unreadCount ?? '—'}</strong>. Reminders appear automatically when contact is due within three hours, even while no email worker is running.</p></div><button className="button button-secondary" type="button" disabled={!query.data?.unreadCount || readAll.isPending} onClick={() => { setNotice(''); readAll.mutate(); }}>{readAll.isPending ? 'Updating…' : 'Mark all as read'}</button></div>
      <label className="commerce-field admin-notification-filter">Show notifications<select value={view} onChange={event => change('view', event.target.value)}>{views.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      {query.error && <p role="alert">{commerceError(query.error)} <button type="button" onClick={() => query.refetch()}>Try again</button></p>}
      {readAll.error && <p role="alert">Could not mark notifications as read. {commerceError(readAll.error)}</p>}
      {notice && <p role="status">{notice}</p>}
      {query.isPending && <p role="status">Loading notifications…</p>}
      {query.data && (query.data.notifications.length ? <ul className="admin-notification-history">{query.data.notifications.map(item => <li key={item.id} className={item.unread ? 'is-unread' : ''}>
        <div className="admin-notification-history-copy"><p><strong>{item.title}</strong>{item.unread && <span className="admin-notification-new">New</span>}</p><p>{item.detail}</p><small>{date(item.at)}{item.followup === 'overdue' ? ' · Contact overdue' : item.followup === 'soon' ? ' · 3 hours or less until contact deadline' : ''}</small></div><Link className="button button-secondary" to={item.href}>Open {item.kind}</Link>
      </li>)}</ul> : <p>No notifications in this view.</p>)}
      {query.data && <nav className="commerce-pagination" aria-label="Notification history pages"><button type="button" disabled={page <= 1} onClick={() => change('page', page - 1)}>Previous</button><span>Page {page} of {Math.max(1, query.data.pagination.pages)}</span><button type="button" disabled={page >= query.data.pagination.pages} onClick={() => change('page', page + 1)}>Next</button></nav>}
    </section>
  </AdminLayout>;
}
