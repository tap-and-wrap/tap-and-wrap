import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, X, CheckCheck } from 'lucide-react';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';
import { adminCommerceGet, adminCommercePost, commerceError } from '../commerce/api.js';
import useModalDialog from './useModalDialog.js';
import '../admin/notifications.css';

const shortDate = value => value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }) : '';
function NotificationPanel({ query, onClose }) {
  const session = useSession(), cache = useQueryClient();
  const { dialogRef, dialogProps } = useModalDialog({ onClose });
  const readAll = useMutation({ mutationFn: () => adminCommercePost('/notifications/read-all', {}), onSuccess: () => cache.invalidateQueries({ queryKey: privateQueryKey(session.ownerKey, 'admin-notifications') }) });
  const items = [...new Map((query.data?.pages || []).flatMap(page => page.notifications).map(item => [item.id, item])).values()];
  const unread = query.data?.pages[0]?.unreadCount || 0;
  return <dialog ref={dialogRef} {...dialogProps} id="admin-notification-preview" className="admin-notification-popover" aria-labelledby="notification-title">
    <div className="admin-notification-heading"><div><h2 id="notification-title">Notifications</h2><span>{unread} unread</span></div><button type="button" className="icon-button" aria-label="Close notifications" onClick={onClose} autoFocus><X size={20} aria-hidden="true"/></button></div>
    <button className="admin-notification-read" type="button" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck size={16} aria-hidden="true"/>{readAll.isPending ? 'Updating...' : 'Mark all as read'}</button>
    {query.isPending && <p role="status">Loading notifications...</p>}
    {query.error && <p role="alert">{commerceError(query.error)} <button className="admin-button admin-button-secondary" onClick={() => query.refetch()}>Try again</button></p>}
    {readAll.error && <p role="alert">{commerceError(readAll.error)}</p>}
    {readAll.isSuccess && <p className="storefront-sr-only" role="status">Notifications marked as read.</p>}
    {!query.isPending && !query.error && !items.length && <div className="admin-empty"><Bell size={26} aria-hidden="true"/><h3>All quiet for now</h3><p>Order updates and reminders will appear here.</p></div>}
    <ul className="admin-notification-preview-list">{items.map(item => <li key={item.id}><Link to={item.href} className={item.unread ? 'is-unread' : ''}><span>{item.title}{item.unread && <span className="storefront-sr-only"> · Unread</span>}</span><p>{item.detail}</p><small>{shortDate(item.at)} · Cairo</small></Link></li>)}</ul>
    {query.hasNextPage && <button type="button" className="admin-button admin-button-secondary admin-notification-more" disabled={query.isFetching} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading...' : 'Show More'}</button>}
    {items.length > 0 && !query.hasNextPage && <p className="admin-notification-end">You&rsquo;re all caught up.</p>}
  </dialog>;
}
/** Query and dialog lifetime belong to the verified account generation. */
export default function AdminNotificationBell() {
  const session = useSession(), location = useLocation();
  const [open, setOpen] = useState(false);
  const query = useInfiniteQuery({ queryKey: privateQueryKey(session.ownerKey, 'admin-notifications', 'bell'), initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => adminCommerceGet('/notifications', { page: pageParam, limit: 5, view: 'all' }, signal),
    getNextPageParam: last => last.pagination.page < Math.min(last.pagination.pages, 200) ? last.pagination.page + 1 : undefined,
    enabled: session.ready && session.user?.role === 'admin', retry: false, staleTime: 15000, refetchInterval: open ? false : 30000 });
  useEffect(() => { setOpen(false); }, [location.key, session.ownerKey]);
  const unread = query.data?.pages[0]?.unreadCount || 0;
  return <div className="admin-bell"><button className="icon-button admin-bell-trigger" type="button" aria-label={`Admin notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? 'admin-notification-preview' : undefined} onClick={() => { setOpen(true); if (!open) void query.refetch(); }}><Bell size={20} aria-hidden="true"/>{unread > 0 && <span className="admin-bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}</button>{open && <NotificationPanel key={session.ownerKey} query={query} onClose={() => setOpen(false)}/>}</div>;
}
