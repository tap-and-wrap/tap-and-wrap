// Playwright-only entry point, excluded from Vite's production input graph.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import VisualEngravingEditor from '../../../src/engraving/visual/VisualEngravingEditor.jsx';
import { FONT_REGISTRY } from '../../../../shared/engraving/definitions.mjs';
import { loadPrivateVisualAsset } from '../../../src/engraving/visual/private-assets.js';
import { configureSession, refreshSession, sessionOwner, sessionChangedElsewhere } from '../../../src/auth/session.js';
import { QueryClient } from '@tanstack/react-query';
import { DesignPreview } from '../../../src/engraving/StudioControls.jsx';
import '../../../src/styles.css';
import '../../../src/design-system.css';
import '../../../src/engraving/engraving.css';

configureSession(new QueryClient(), () => {});
await refreshSession();
window.loadPrivateVisualAsset = options => loadPrivateVisualAsset({ sessionOwnerKey: sessionOwner(), ...options });
window.changeEditorSession = sessionChangedElsewhere;
window.snapshotEditor = () => window.latestVisualDraft;
function Harness() {
  const [scope, setScope] = useState('guest:0:cart-fixture'), [revision, setRevision] = useState(0), [initial, setInitial] = useState(), [assets, setAssets] = useState({});
  const [fonts, setFonts] = useState(FONT_REGISTRY.map(font => font.id));
  window.setApprovedEditorFonts = setFonts;
  window.restoreEditor = (draft, resources = window.latestVisualAssets) => { setInitial(draft); setAssets(resources); setRevision(value => value + 1); };
  window.rotateEditorOwner = () => { setScope('guest:1:cart-rotated'); };
  window.openApprovedProduct = () => { setInitial({ ownerScope: scope, design: { version: 'visual-engraving-v1', surface: { assetId: 'product-image', aspectRatio: 1.5 }, layers: [] } }); setAssets({ 'product-image': { approved: true, src: '/fixture-product.png' } }); setRevision(value => value + 1); };
  return <><VisualEngravingEditor key={revision} ownerScope={scope} initialDraft={initial} assets={assets} approvedFontIds={fonts} onChange={(draft, resources, readiness) => { window.latestVisualDraft = draft; window.latestVisualAssets = resources; window.visualReadiness = readiness; }}/><div hidden><DesignPreview content={{ mode: 'icons', iconId: 'engraving-heart-v1' }}/></div></>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
