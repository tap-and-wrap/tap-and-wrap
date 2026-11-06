import { Package, Layers, ShoppingBag, Gift, TicketPercent, CreditCard, Users, ChartNoAxesCombined } from 'lucide-react';

export const adminLinks = [
  { to: '/admin/products', text: 'Products', icon: Package },
  { to: '/admin/categories', text: 'Categories', icon: Layers },
  { to: '/admin/orders', text: 'Orders', icon: ShoppingBag },
  { to: '/admin/customization', text: 'Customization', icon: Gift, children: [
    { to: '/admin/gift-box', text: 'Gift Box' },
    { to: '/admin/engraving', text: 'Standalone Engraving' },
  ] },
  { to: '/admin/discounts', text: 'Discounts', icon: TicketPercent },
  { to: '/admin/payment', text: 'Payment', icon: CreditCard },
  { to: '/admin/customers', text: 'Customers', icon: Users },
  { to: '/admin/analytics', text: 'Analytics', icon: ChartNoAxesCombined },
];
