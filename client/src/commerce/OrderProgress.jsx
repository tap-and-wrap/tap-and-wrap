const stages = [['received', 'Order received'], ['confirmed', 'Confirmed'], ['preparing', 'Being prepared'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
export const orderStatusLabel = value => ({ awaiting_verification: 'Awaiting payment verification', awaiting_transfer: 'Awaiting transfer', unpaid: 'Payment pending', paid: 'Payment confirmed', partially_paid: 'Partially paid', rejected: 'Payment needs attention', delivery_failed: 'Delivery needs attention', refunded: 'Refund recorded', cancelled: 'Cancelled', returned: 'Returned', ...Object.fromEntries(stages) })[value] || String(value || 'Update pending').replaceAll('_', ' ');

export default function OrderProgress({ state, label = 'Order progress' }) {
  const current = stages.findIndex(([key]) => key === state);
  if (current < 0) return <p className="commerce-notice" role="status">{orderStatusLabel(state)}</p>;
  return <ol className="order-progress" aria-label={label}>{stages.map(([key, text], index) => <li key={key} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''} aria-current={index === current ? 'step' : undefined}><span aria-hidden="true">{index < current ? '✓' : index + 1}</span><div>{text}<small>{index < current ? 'Complete' : index === current ? 'Current stage' : 'Next stage'}</small></div></li>)}</ol>;
}
