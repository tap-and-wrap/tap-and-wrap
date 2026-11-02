import { useState } from 'react';
import { localArtwork } from './media.js';
import { ARTWORK_METRICS } from './artwork-metrics.mjs';

export default function Artwork({ componentId, role, alt = '', className = '', normalize = false }) {
  const [failed, setFailed] = useState(false);
  const source = localArtwork(componentId, role);
  if (!source || failed) return <span className="gb-artwork-missing">{alt ? `${alt}: ` : ''}Artwork unavailable</span>;
  const metric=normalize&&ARTWORK_METRICS[componentId];
  const [left,top,right,bottom]=metric?.visibleBounds||[0,0,0,0];
  const style=metric?{position:'absolute',width:`${metric.width/(right-left+1)*100}%`,height:`${metric.height/(bottom-top+1)*100}%`,left:`${-left/(right-left+1)*100}%`,top:`${-top/(bottom-top+1)*100}%`,objectFit:'fill',maxWidth:'none'}:undefined;
  const img=<img className={className} style={style} src={source} alt={alt} draggable="false" loading="lazy" decoding="async" onError={() => setFailed(true)}/>;
  return metric?<span className="gb-normalized-artwork">{img}</span>:img;
}
