import { Link, useSearchParams } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Gift, PenLine, ArrowUpRight } from 'lucide-react';
import AdminLayout, { EmbeddedAdmin } from '../admin/AdminLayout.jsx';
const Components = lazy(() => import('./AdminGiftBoxComponentsPage.jsx'));
const Personalization = lazy(() => import('./AdminGiftBoxPersonalizationPage.jsx'));
const Visuals = lazy(() => import('./AdminGiftBoxVisualPreviewPage.jsx'));
const Packing = lazy(() => import('./AdminGiftBoxPoliciesPage.jsx'));
const tabs = [['components', 'Components & stock', Components], ['personalization', 'Personalization', Personalization], ['visuals', 'Visual configuration', Visuals], ['packing', 'Packing policies', Packing]];

export function AdminGiftBoxWorkspace() {
  const [params, setParams] = useSearchParams();
  const [tab, , Component] = tabs.find(([id]) => id === params.get('tab')) || tabs[0];
  return <AdminLayout title="Gift Box" description="Manage the pieces, personal touches and packing behind every box." actions={<Link className="admin-button admin-button-secondary" to="/admin/orders?type=gift_box">Gift Box orders</Link>}>
    <nav className="owner-workspace-tabs" aria-label="Gift Box sections">{tabs.map(([id, label]) => <Link key={id} to={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} onClick={event => { event.preventDefault(); setParams({ tab: id }); }}>{label}</Link>)}</nav>
    <EmbeddedAdmin.Provider value><Suspense fallback={<p role="status" className="admin-state">Loading Gift Box settings…</p>}><Component key={tab}/></Suspense></EmbeddedAdmin.Provider>
  </AdminLayout>;
}
export default function AdminCustomizationPage() {
  return <AdminLayout title="Customization" description="Two thoughtful services. Manage the details here; process every job in Orders."><div className="owner-analytics-grid">{[{ title: 'Gift Box', text: 'Components, prices, stock, personal touches and packing policies.', to: '/admin/gift-box', Icon: Gift }, { title: 'Standalone Engraving', text: 'Engraving types, placement options, fonts, icons and versioned publishing.', to: '/admin/engraving', Icon: PenLine }].map(({ title, text, to, Icon }) => <Link key={to} className="owner-service-card" to={to}><Icon size={30} aria-hidden="true"/><h2>{title}</h2><p>{text}</p><span>Manage service <ArrowUpRight size={18} aria-hidden="true"/></span></Link>)}</div></AdminLayout>;
}
