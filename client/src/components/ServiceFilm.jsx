import { useEffect, useRef, useState } from 'react';

// Decorative video stays dormant offscreen. Each video has a real static poster
// and a separate manual control; it is not nested inside a navigation link.
export default function ServiceFilm({ src, poster, title }) {
  const container = useRef(null);
  const video = useRef(null);
  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [requested, setRequested] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { threshold: 0.2 });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!visible || (reducedMotion.matches && !requested)) { node.pause(); return; }
    void node.play().catch(() => { /* Browser policy: manual play remains available. */ });
    return () => node.pause();
  }, [visible, requested]);
  function toggle() {
    if (!video.current) return;
    if (playing) video.current.pause();
    else { setRequested(true); void video.current.play().catch(() => setFailed(true)); }
  }
  return <div ref={container} className="home-service-media">
    {failed ? <img src={poster} alt="" loading="lazy" width="480" height="854"/> : <video ref={video} src={visible ? src : undefined} poster={poster} muted playsInline loop preload="none" width="480" height="854" aria-label={`${title} film`} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}/>}
    {!failed && <button type="button" className="home-service-video-toggle" aria-label={playing ? `Pause ${title} video` : `Play ${title} video`} onClick={toggle}>{playing ? 'Pause' : 'Play'}</button>}
  </div>;
}
