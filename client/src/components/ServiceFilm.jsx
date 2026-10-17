import { useEffect, useRef, useState } from 'react';
import useVideoPlayback, { videoSurfacePointerDown } from './useVideoPlayback.js';

// Decorative video stays dormant offscreen. Each video has a real static poster
// and a transparent surface control; it is not nested inside a navigation link.
export default function ServiceFilm({ src, poster, title }) {
  const container = useRef(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { videoRef, playing, failed, blocked, toggle, videoEvents } = useVideoPlayback({ source: loaded ? src : null, visible });
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') { setVisible(true); setLoaded(true); return; }
    const observer = new IntersectionObserver(entries => { const shown = entries.some(entry => entry.isIntersecting); setVisible(shown); if (shown) setLoaded(true); }, { threshold: 0.2 });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={container} className="home-service-media">
    {failed ? <img src={poster} alt="" loading="lazy" width="480" height="854"/> : <video ref={videoRef} src={loaded ? src : undefined} poster={poster} muted playsInline loop preload="none" width="480" height="854" aria-label={`${title} film`} {...videoEvents}/>}
    {!failed && <button type="button" className="home-service-video-toggle video-surface-control" aria-label={playing ? `Pause ${title} video` : `Play ${title} video`} onPointerDown={videoSurfacePointerDown} onClick={toggle}><span>{playing ? 'Pause' : 'Play'} video</span></button>}
    {blocked && <span className="storefront-sr-only" role="status">Playback is unavailable. You can still open {title} below.</span>}
  </div>;
}
