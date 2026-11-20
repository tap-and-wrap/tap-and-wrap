import { useEffect, useRef, useState } from 'react';
import useVideoPlayback from './useVideoPlayback.js';

// Decorative portrait film: automatic, muted, non-interactive playback.
// The enclosing service card is the navigation target; there is no pause button.
export default function ServiceFilm({ src, poster, title }) {
  const container = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { videoRef, failed, blocked, videoEvents } = useVideoPlayback({ source: loaded ? src : null, visible });
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') { setVisible(true); setLoaded(true); return; }
    const observer = new IntersectionObserver(entries => { const shown = entries.some(entry => entry.isIntersecting); setVisible(shown); if (shown) setLoaded(true); }, { threshold: 0.2 });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="home-service-media">
    {failed ? <img src={poster} alt="" loading="lazy" width="480" height="854"/> : <video ref={videoRef} src={loaded ? src : undefined} poster={poster} muted playsInline loop preload="none" width="480" height="854" aria-label={`${title} film`} {...videoEvents}/>}
    {blocked && <span className="storefront-sr-only" role="status">Playback is unavailable. You can still open {title} below.</span>}
  </div>;
}
