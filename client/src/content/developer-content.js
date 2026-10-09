// Developer-managed local assets. Never point these fields at private storage.
// Hero example (enable only after owner approval):
// { approved: true, src: '/media/hero-desktop.webm', mobileSrc: '/media/hero-mobile.webm',
//   poster: '/media/hero-poster.webp', mobilePoster: '/media/hero-mobile-poster.webp',
//   width: 1920, height: 1080, autoplay: true, loop: true }.
// Claims below are owner-proposed, unverified marketing figures, NOT database metrics.
// All four require approved=true, source, approvalEvidence and approvedAt before display.
export const developerContent = Object.freeze({
  heroVideo: null,
  trustStatistics: Object.freeze([
    { id: 'customers', value: 50000, scale: 1000, suffix: 'K+', label: 'Customers', approved: false, source: '', approvalEvidence: '', approvedAt: '' },
    { id: 'returning-customers', value: 90, scale: 1, suffix: '%+', label: 'Returning Customers', approved: false, source: '', approvalEvidence: '', approvedAt: '' },
    { id: 'reviews', value: 10000, scale: 1000, suffix: 'K+', label: 'Reviews', approved: false, source: '', approvalEvidence: '', approvedAt: '' },
    { id: 'years', value: 9, scale: 1, suffix: '+', label: 'Years in the Market', approved: false, source: '', approvalEvidence: '', approvedAt: '' },
  ]),
});
