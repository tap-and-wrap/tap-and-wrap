import { useState } from 'react';
import { ribbonBowLocalUrl } from '../../../shared/gift-box/ribbon-bows.mjs';
import { publicGiftBoxMediaUrl } from './public-media-url.mjs';

export default function RibbonBow({ componentId }) {
  const [failed, setFailed] = useState(false);
  const source = import.meta.env.DEV ? ribbonBowLocalUrl(componentId) : publicGiftBoxMediaUrl({
    baseUrl: import.meta.env.VITE_GIFT_BOX_MEDIA_BASE_URL,
    releaseId: import.meta.env.VITE_GIFT_BOX_MEDIA_RELEASE,
    componentId, role: 'bow',
  });
  if (!source || failed) return <span className="gb-bow-unavailable" aria-hidden="true">Bow artwork pending</span>;
  return <img src={source} alt="" draggable="false" loading="lazy" decoding="async" onError={() => setFailed(true)}/>;
}
