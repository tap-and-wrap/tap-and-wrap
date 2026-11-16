import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useState } from 'react';
import { Gift, PenLine, ArrowUpRight } from 'lucide-react';
import AdminLayout, { EmbeddedAdmin } from '../admin/AdminLayout.jsx';
const Components = lazy(() => import('./AdminGiftBoxComponentsPage.jsx'));
const Personalization = lazy(() => import('./AdminGiftBoxPersonalizationPage.jsx'));
const BoxSetup = lazy(() => import('./AdminGiftBoxVisualPreviewPage.jsx'));
const SafePacking = lazy(() => import('./AdminGiftBoxPoliciesPage.jsx'));
const tabs = [['components', 'Components & stock', Components], ['personalization', 'Personalization', Personalization]];

export function AdminGiftBoxWorkspace() {
  const [params, setParams] = useSearchParams();
  const [setupOpen, setSetupOpen] = useState(false), [packingOpen, setPackingOpen] = useState(false);
  const [tab, , Component] = tabs.find(([id]) => id === params.get('tab')) || tabs[0];
  if (['visuals', 'packing'].includes(params.get('tab'))) return <Navigate to="/admin/gift-box?tab=components" replace/>;
  return <AdminLayout title="Gift Box" description="Manage the pieces, personal touches and packing behind every box." actions={<Link className="admin-button admin-button-secondary" to="/admin/orders?type=gift_box">Gift Box orders</Link>}>
    <nav className="owner-workspace-tabs" aria-label="Gift Box sections">{tabs.map(([id, label]) => <Link key={id} to={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} onClick={event => { event.preventDefault(); setParams({ tab: id }); }}>{label}</Link>)}</nav>
    <EmbeddedAdmin.Provider value><Suspense fallback={<p role="status" className="admin-state">Loading Gift Box settings…</p>}><Component key={tab}/>{tab === 'components' && <div className="owner-box-operations"><details onToggle={event => {if(event.currentTarget.open)setSetupOpen(true);}}><summary>Box appearance &amp; arrangement settings</summary>{setupOpen && <BoxSetup/>}</details><details onToggle={event => {if(event.currentTarget.open)setPackingOpen(true);}}><summary>Safe packing &amp; box availability</summary>{packingOpen && <SafePacking/>}</details></div>}</Suspense></EmbeddedAdmin.Provider>
  </AdminLayout>;
}
export default function AdminCustomizationPage() {
  return <AdminLayout title="Customization" description="Two thoughtful services. Manage the details here; process every job in Orders."><div className="owner-analytics-grid">{[{ title: 'Gift Box', text: 'Components, prices, stock and personal touches.', to: '/admin/gift-box', Icon: Gift }, { title: 'Standalone Engraving', text: 'Engraving types, prices, locations, fonts and icons.', to: '/admin/engraving', Icon: PenLine }].map(({ title, text, to, Icon }) => <Link key={to} className="owner-service-card" to={to}><Icon size={30} aria-hidden="true"/><h2>{title}</h2><p>{text}</p><span>Manage service <ArrowUpRight size={18} aria-hidden="true"/></span></Link>)}</div></AdminLayout>;
}
