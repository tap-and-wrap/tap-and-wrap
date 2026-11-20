import OrderProgress, { orderStatusLabel } from '../commerce/OrderProgress.jsx';
import LoadingState from '../components/LoadingState.jsx';
import SavedProductPhotos from '../product-photos/SavedProductPhotos.jsx';
import SavedProductEngraving from '../product-engraving/SavedProductEngraving.jsx';
import { isEngravingKind } from '../../../shared/engraving/definitions.mjs';
import EngravingOrderFiles from '../engraving/EngravingOrderFiles.jsx';
import EngravingSummary from '../engraving/EngravingSummary.jsx';
import EngravingWorkflow from '../engraving/EngravingWorkflow.jsx';
import PersonalizationSummary from '../commerce/PersonalizationSummary.jsx';
import GiftBoxOrderDetails from '../commerce/GiftBoxOrderDetails.jsx';
import { FinancialSummary, CustomerOrderPayments } from '../commerce/OrderFinancials.jsx';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commerceError, commerceGet, commercePost, money } from '../commerce/api';
import AccountActions from '../components/AccountActions.jsx';
import '../commerce/v11-stage2.css';
import { emitTracking } from '../tracking/client.js';
import { useSession } from '../auth/SessionProvider.jsx';
import { privateQueryKey } from '../auth/session.js';

function StoredFields({ fields, label = 'Personalization', definitions = [] }) {
  const entries = Object.entries(fields || {}).slice(0, 50).filter(([, value]) => typeof value === 'string' || Array.isArray(value));
  if (!entries.length) return null;
  return <div className="commerce-order-configuration"><h4>{label}</h4><dl>{entries.map(([key, value]) => <div key={key}><dt>{definitions.find((field) => field.key === key)?.label || key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? `${value.length} private file${value.length === 1 ? '' : 's'}` : value}</dd></div>)}</dl></div>;
}

function StoredCustomization({ customization }) {
  if (!customization) return null;
  const engraving = customization.engraving;
  const fields = Object.fromEntries(Object.entries(customization.fields || {}).filter(([key]) => !engraving || !['engraving_type', 'engraving_other_details', 'engraving_text', 'engraving_material', 'engraving_font', 'engraving_placement'].includes(key)));
  return <div className="commerce-order-configuration"><h4>{customization.templateName || 'Customization'}</h4>{(customization.selections || []).slice(0, 50).map((selection, index) => <p key={index}>{selection.groupLabel && `${selection.groupLabel}: `}{selection.optionLabel || selection.label || selection.componentName || 'Configured option'} × {selection.quantity}</p>)}{engraving && <div><h4>Laser Engraving</h4>{engraving.type && <p>Type: {({ name: 'Name / Text', design: 'Design', other: 'Other' })[engraving.type] || engraving.type}</p>}{engraving.otherDetails && <p>Requested type: {engraving.otherDetails}</p>}{engraving.text && <p>Engraving text: {engraving.text}</p>}<dl>{[['engraving_material', 'Material'], ['engraving_font', 'Font / style'], ['engraving_placement', 'Placement / side']].map(([key, label]) => engraving[key]?.label && <div key={key}><dt>{label}</dt><dd>{engraving[key].label}</dd></div>)}</dl></div>}<StoredFields fields={fields} label="Saved customization fields" definitions={customization.fieldDefinitions} /></div>;
}

function historyState(entry) {
  const next = entry.to;
  if (next && typeof next === 'object') return [next.fulfillmentState, next.paymentState].filter(Boolean).join(' · ').replaceAll('_', ' ');
  if (typeof next === 'string') return next.replaceAll('_', ' ');
  return (entry.fulfillmentState || entry.paymentState || entry.event || entry.status || '').replaceAll('_', ' ');
}

export function OrderRecord({ order, headingLevel = 1, admin = false }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const totals = order.pricing || order.totals || order;
  return <>{!admin && <header className="order-detail-header"><div><p className="eyebrow">{admin ? 'Accepted order' : 'Made personal, for you'}</p><Heading>Order #{order.orderNumber}</Heading>{order.createdAt && <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'long' })}</time>}</div><div className="order-status-chips"><span className="commerce-badge">{orderStatusLabel(order.fulfillmentState || order.status)}</span><span className="commerce-badge">{orderStatusLabel(order.paymentState)}</span></div></header>}{!admin && <><OrderProgress state={order.merchandiseFulfillment || order.fulfillmentState || order.status} label={order.merchandiseFulfillment ? 'Products and Gift Boxes progress' : 'Order progress'}/><p className="order-next-step">{order.paymentState === 'awaiting_verification' ? 'Your screenshot is saved. We are checking the transfer.' : ['received','confirmed'].includes(order.fulfillmentState) ? 'We will contact you to confirm the next arrangements.' : order.fulfillmentState === 'delivered' ? 'Your order is marked delivered. We hope you love your gift.' : 'Follow the latest updates here.'} <Link to="/contact">Need help with this order?</Link></p></>}
    {order.paymentAttention?.code === 'PAYMENT_PROOF_REJECTED' && <section className="commerce-notice"><h2>Payment requires attention</h2><p>{order.paymentAttention.message}</p>{order.paymentAttention.publicReason && <p>{order.paymentAttention.publicReason}</p>}<Link to="/contact">Contact the store about this order</Link></section>}
    <div className={`commerce-cart-layout${admin ? ' v11-order-line-layout' : ''}`}><section>{!admin && <h2>Items</h2>}{(order.lines || order.items || []).map((item, index) => <article className={`commerce-cart-item${item.kind === 'gift_box_v2' ? ' commerce-gift-order-item' : isEngravingKind(item.kind) ? ' commerce-engraving-order-item' : ''}`} aria-label={item.kind === 'gift_box_v2' ? 'Build Your Gift Box' : undefined} key={item.id || index}><div>{item.kind === 'gift_box_v2' ? <div className="commerce-cart-photo commerce-gift-photo">Your custom gift box</div> : item.mainImageUrl && <img className="commerce-order-photo" src={item.mainImageUrl} alt={item.name || item.productSnapshot?.name || ''} loading="lazy" />}</div><div><h3>{item.name || item.productSnapshot?.name}</h3><p>{item.kind === 'gift_box_v2' ? 'Completed gift boxes' : 'Quantity'}: {item.quantity}</p>{item.kind === 'gift_box_v2' ? <><p>{money(item.unitPricePiastres)} per completed gift box</p><GiftBoxOrderDetails giftBox={item.giftBox} admin={admin} /></> : <>{item.variantKey && <p>Option: {item.variantLabel || item.variantKey}</p>}{isEngravingKind(item.kind) && <><EngravingSummary engraving={item.engraving}/>{!admin && <EngravingOrderFiles key={`${order.id}:${item.engraving.itemKey}`} orderId={order.id} engraving={item.engraving} admin={admin}/>}</>}<>{item.productEngraving && <><p>Product engraving &middot; {money(item.productEngraving.surchargePiastres)} per item</p><SavedProductEngraving orderId={order.id} index={index} admin={admin}/></>}</><>{item.photoPurchase && <SavedProductPhotos purchase={item.photoPurchase} values={item.personalization} orderId={order.id} admin={admin}/>}</><StoredCustomization customization={item.customization} /><PersonalizationSummary values={item.personalization} definitions={item.personalizationDefinitions} /></>}</div><strong>{money(item.lineTotalPiastres)}</strong></article>)}
      {!admin && order.customer && <section className="commerce-notice"><h2>{order.engravingWorkflow ? 'Return / contact address' : 'Delivery'}</h2><p>{order.customer.name}</p><p>{order.customer.address}</p><p>{order.customer.governorate}</p></section>}
      {!admin && order.merchandiseFulfillment && <p className="commerce-notice">Products &amp; Gift Boxes: {order.merchandiseFulfillment.replaceAll('_', ' ')}. Engraving custody and return progress are shown separately.</p>}{!admin && <details className="order-history-details"><summary>Order updates</summary><ol className="commerce-history">{(order.statusHistory || order.history || []).map((entry, index) => <li key={index}><strong>{historyState(entry)}</strong>{entry.at && <time dateTime={entry.at}>{new Date(entry.at).toLocaleString()}</time>}{entry.reason && <p>{entry.reason}</p>}</li>)}</ol></details>}
    </section>{!admin && <aside className={`commerce-summary${order.engravingWorkflow ? ' engraving-financial-summary' : ''}`}><h2>Order Total</h2><dl><div><dt>Subtotal</dt><dd>{money(totals.subtotalPiastres)}</dd></div>{(totals.discountPiastres || 0) > 0 && <div><dt>Discount</dt><dd>−{money(totals.discountPiastres)}</dd></div>}<div><dt>Shipping</dt><dd>{Number.isSafeInteger(totals.shippingPiastres) ? money(totals.shippingPiastres) : order.shipping?.amountPiastres == null ? 'Pending Confirmation' : money(order.shipping.amountPiastres)}</dd></div><div className="commerce-total"><dt>Order amount</dt><dd>{money(totals.totalPiastres)}</dd></div></dl></aside>}</div>{!admin && <FinancialSummary order={order} />}</>;
}

function OrderDetail() {
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const session = useSession();
  const key = privateQueryKey(session.ownerKey, 'order', id);
  const order = useQuery({ queryKey: key, queryFn: ({ signal }) => commerceGet(`/orders/${id}`, undefined, signal), enabled: session.ready, retry: false, staleTime: 0 });
  const cancel = useMutation({ mutationFn: () => commercePost(`/orders/${id}/cancel`, { revision: order.data.order.revision }), onSuccess: () => queryClient.invalidateQueries({ queryKey: key }) });
  const record = session.ready ? order.data?.order : null;
  useEffect(() => { if (order.data?.tracking) emitTracking(order.data.tracking); }, [order.data]);
  if (session.error) return <main className="commerce-page"><h1>Order details</h1><p role="alert">Your account could not be verified. Please try again.</p><button type="button" className="button button-secondary" onClick={() => session.refresh()}>Try again</button></main>;
  return <main className="commerce-page">{location.state?.guestCheckout && <p className="commerce-notice" role="status">Your order was received. Keep the order number and checkout phone number to track it.</p>}{order.isPending ? <LoadingState label="Loading your order" kind="rows"/> : order.error ? <><h1>Order details unavailable</h1><p role="alert">{commerceError(order.error)}</p>{order.error?.response?.status !== 404 && <button type="button" className="button button-secondary" disabled={order.isFetching} onClick={() => order.refetch()}>Try again</button>}<Link to="/track-order">Track an order securely</Link></> : record && <><OrderRecord order={record} /><EngravingWorkflow order={record} refresh={() => queryClient.invalidateQueries({ queryKey: key })}/><CustomerOrderPayments key={`${session.ownerKey}:${id}`} order={record} refresh={() => queryClient.invalidateQueries({ queryKey: key })} />{record.canCancel && <button className="button button-secondary" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : [1, 2].includes(record.accountingVersion) ? 'Request cancellation' : 'Cancel order'}</button>}{cancel.isSuccess && <p role="status">Cancellation request recorded. Review the latest order status.</p>}{cancel.error && <p role="alert">{commerceError(cancel.error)}</p>}<Link className="commerce-continue" to="/my-orders">My Orders</Link></>}</main>;
}

function OrderList() {
  const [page, setPage] = useState(1);
  const session = useSession();
  const query = useQuery({ queryKey: privateQueryKey(session.ownerKey, 'orders', page), queryFn: ({ signal }) => commerceGet('/orders', { page, limit: 20 }, signal), enabled: session.ready && Boolean(session.user), retry: false, staleTime: 15_000 });
  const orders = session.ready ? query.data?.orders || [] : [];
  const pagination = query.data?.pagination;
  if (!session.ready) return <main className="commerce-page"><h1>My Orders</h1><p role={session.error ? 'alert' : 'status'}>{session.error ? 'Your account could not be verified. Please try again.' : 'Checking your account…'}</p>{session.error && <button type="button" className="button button-secondary" onClick={() => session.refresh()}>Try again</button>}</main>;
  if (!session.user) return <main className="commerce-page"><h1>My Orders</h1><Link to="/login?returnTo=%2Fmy-orders">Sign in to view your orders</Link><p>Guest orders can be found using <Link to="/track-order">Track Order</Link>.</p></main>;
  return <main className="commerce-page"><h1>My Orders</h1><AccountActions/>{query.isPending ? <LoadingState label="Loading your orders" kind="rows"/> : query.error ? <><p role="alert">{commerceError(query.error)}</p><button type="button" className="button button-secondary" disabled={query.isFetching} onClick={() => query.refetch()}>Try again</button><p>Guest orders can be found using <Link to="/track-order">Track Order</Link>.</p></> : !orders.length ? <div className="commerce-empty"><p>No orders are associated with this account.</p><Link to="/shop">Explore the shop</Link></div> : <><div className="commerce-orders-list">{orders.map((order) => <Link key={order.id || order._id} to={`/orders/${order.id || order._id}`} className="commerce-order-card"><div className="commerce-order-card-heading"><h2>Order #{order.orderNumber}</h2><span className="commerce-badge">{orderStatusLabel(order.fulfillmentState || order.status)}</span></div><div className="commerce-order-card-meta"><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString('en-GB')}</time><span>{Number.isInteger(order.itemCount) ? `${order.itemCount} items` : order.itemTypes?.length ? order.itemTypes.join(' · ') : 'View purchased items'}</span></div><div className="commerce-order-card-total"><span>Order total</span><strong>{money(order.totals?.totalPiastres ?? order.totalPiastres ?? order.pricing?.totalPiastres)}</strong></div><span className="commerce-order-view">View Order</span></Link>)}</div><nav className="commerce-pagination" aria-label="Order pages"><button disabled={page === 1 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page}</span><button disabled={query.isFetching || (pagination ? page >= (pagination.pages || pagination.totalPages || 1) : orders.length < 20)} onClick={() => setPage(page + 1)}>Next</button></nav></>}</main>;
}

export default function OrdersPage() {
  const { id } = useParams();
  return id ? <OrderDetail /> : <OrderList />;
}
