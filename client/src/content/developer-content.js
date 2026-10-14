// Developer-managed local assets. Never point these fields at private storage.
// Hero example (enable only after owner approval):
// { approved: true, src: '/media/hero-desktop.webm', mobileSrc: '/media/hero-mobile.webm',
//   poster: '/media/hero-poster.webp', mobilePoster: '/media/hero-mobile-poster.webp',
//   width: 1920, height: 1080, autoplay: true, loop: true }.
// Merchant-owner-approved figures, attested on 2026-10-14. These are owner assertions,
// not independently audited or calculated from this site's database.
export const developerContent = Object.freeze({
  heroVideo: Object.freeze({
    approved: true,
    src: '/media/tap-wrap-desktop-hero.mp4',
    mobileSrc: '/media/tap-wrap-mobile-hero.mp4',
    poster: '/media/tap-wrap-desktop-hero-poster.webp',
    mobilePoster: '/media/tap-wrap-mobile-hero-poster.webp',
    width: 960, height: 570, mobileWidth: 480, mobileHeight: 854,
    autoplay: true, loop: true,
  }),
  trustStatistics: Object.freeze([
    { id: 'customers', value: 50000, scale: 1000, suffix: 'K+', label: 'Customers', approved: true, source: 'Merchant owner confirmation', approvalEvidence: 'Owner verified and approved these four exact figures on 2026-10-14', approvedAt: '2026-10-14' },
    { id: 'returning-customers', value: 90, scale: 1, suffix: '%+', label: 'Returning Customers', approved: true, source: 'Merchant owner confirmation', approvalEvidence: 'Owner verified and approved these four exact figures on 2026-10-14', approvedAt: '2026-10-14' },
    { id: 'reviews', value: 10000, scale: 1000, suffix: 'K+', label: 'Reviews', approved: true, source: 'Merchant owner confirmation', approvalEvidence: 'Owner verified and approved these four exact figures on 2026-10-14', approvedAt: '2026-10-14' },
    { id: 'years', value: 9, scale: 1, suffix: '+', label: 'Years in the Market', approved: true, source: 'Merchant owner confirmation', approvalEvidence: 'Owner verified and approved these four exact figures on 2026-10-14', approvedAt: '2026-10-14' },
  ]),
});
