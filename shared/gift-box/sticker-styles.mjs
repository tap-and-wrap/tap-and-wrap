// New IDs deliberately do not reuse historical engraving style identities.
export const STICKER_STYLES = Object.freeze(
['rochester', 'allura', 'greatvibes', 'sacramento', 'parisienne', 'pinyonscript', 'arefruqaa', 'amiri', 'lateef', 'scheherazadenew', 'rakkas', 'mirza'].map((family, index) => Object.freeze({
  id: `sticker-${family}-v1`, family, label: family === 'arefruqaa' ? 'Aref Ruqaa' : family === 'scheherazadenew' ? 'Scheherazade New' : family === 'greatvibes' ? 'Great Vibes' : family === 'pinyonscript' ? 'Pinyon Script' : family[0].toUpperCase() + family.slice(1),
  language: index < 6 ? 'en' : 'ar', fontFamily: `Gift-${family}`,
})));
export const stickerStyle = id => STICKER_STYLES.find(style => style.id === id);
export const STICKER_APPLICATION = 'exterior-front';
