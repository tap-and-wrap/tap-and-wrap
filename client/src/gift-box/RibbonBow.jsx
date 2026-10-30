import { useState } from 'react';
import { ribbonBowLocalUrl } from '../../../shared/gift-box/ribbon-bows.mjs';

export default function RibbonBow({ componentId }) {
  const [failed, setFailed] = useState(false);
  const source = import.meta.env.DEV ? ribbonBowLocalUrl(componentId) : null;
  if (!source || failed) return <span className="gb-bow-unavailable" aria-hidden="true">Bow artwork pending</span>;
  return <img src={source} alt="" draggable="false" loading="lazy" decoding="async" onError={() => setFailed(true)}/>;
}
