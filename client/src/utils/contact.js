export function whatsappUrl(phone) {
  if (typeof phone !== 'string' || !/^(?:\+20|0)1[0125]\d{8}$/.test(phone)) return null;
  return `https://wa.me/${phone.replace(/^\+20/, '20').replace(/^0/, '20')}`;
}
