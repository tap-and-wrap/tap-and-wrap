import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import HomePage from './pages/HomePage.jsx';
import ShopPage from './pages/ShopPage.jsx';
import CustomizePage from './pages/CustomizePage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import StaticPage from './pages/StaticPage.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import { CartProvider } from './commerce/CartContext.jsx';
import RouteMetadata from './seo/RouteMetadata.jsx';
import TrackingConsent from './tracking/TrackingConsent.jsx';
const CategoryPage = lazy(() => import('./pages/CategoryPage.jsx'));
const AccountRecoveryPage = lazy(() => import('./pages/AccountRecoveryPage.jsx'));
const AdminWebsitePage = lazy(() => import('./pages/AdminWebsitePage.jsx'));
const CartPage = lazy(() => import('./pages/CartPage.jsx'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage.jsx'));
const OrdersPage = lazy(() => import('./pages/OrdersPage.jsx'));
const TrackOrderPage = lazy(() => import('./pages/TrackOrderPage.jsx'));
const CustomizationPage = lazy(() => import('./pages/CustomizationPage.jsx'));
const AdminCommercePage = lazy(() => import('./pages/AdminCommercePage.jsx'));
const AdminOrderPage = lazy(() => import('./pages/AdminOrderPage.jsx'));
const AdminProductConfigurationPage = lazy(() => import('./pages/AdminProductConfigurationPage.jsx'));
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const AdminProductsPage = lazy(() => import('./pages/AdminProductsPage.jsx'));
const AdminProductFormPage = lazy(() => import('./pages/AdminProductFormPage.jsx'));
const AdminProductPreviewPage = lazy(() => import('./pages/AdminProductPreviewPage.jsx'));

export default function App() {
 return <CartProvider><RouteMetadata/><Header/><Suspense fallback={<main className="page-shell" role="status">Loading…</main>}><Routes>
  <Route path="/" element={<HomePage/>}/>
  <Route path="/shop" element={<ShopPage/>}/>
  <Route path="/categories/:slug" element={<CategoryPage/>}/>
  <Route path="/products/:slug" element={<ProductPage/>}/>
  <Route path="/products/:slug/customize" element={<CustomizationPage/>}/>
  <Route path="/customize" element={<CustomizePage/>}/>
  <Route path="/customize/gift-box" element={<CustomizationPage kind="gift_box"/>}/>
  <Route path="/customize/laser-engraving" element={<CustomizationPage kind="laser_engraving"/>}/>
  <Route path="/login" element={<AuthPage/>}/>
  <Route path="/signup" element={<AuthPage signup/>}/>
  <Route path="/forgot-password" element={<AccountRecoveryPage/>}/>
  <Route path="/reset-password" element={<AccountRecoveryPage reset/>}/>
  <Route path="/verify-email" element={<AccountRecoveryPage verify/>}/>
  <Route path="/about" element={<StaticPage page="about"/>}/>
  <Route path="/track-order" element={<TrackOrderPage/>}/>
  <Route path="/my-orders" element={<OrdersPage/>}/>
  <Route path="/orders/:id" element={<OrdersPage/>}/>
  <Route path="/cart" element={<CartPage/>}/>
  <Route path="/checkout" element={<CheckoutPage/>}/>
  <Route path="/contact" element={<StaticPage page="contact"/>}/>
  <Route path="/privacy-policy" element={<StaticPage page="privacy-policy"/>}/>
  <Route path="/refund-policy" element={<StaticPage page="refund-policy"/>}/>
  <Route path="/shipping-policy" element={<StaticPage page="shipping-policy"/>}/>
  <Route path="/terms-of-service" element={<StaticPage page="terms-of-service"/>}/>
  <Route path="/admin" element={<RequireAdmin><Navigate to="/admin/website/overview" replace/></RequireAdmin>}/>
  <Route path="/admin/website/:section" element={<RequireAdmin><AdminWebsitePage/></RequireAdmin>}/>
  <Route path="/admin/products" element={<RequireAdmin><AdminProductsPage/></RequireAdmin>}/>
  <Route path="/admin/products/new" element={<RequireAdmin><AdminProductFormPage/></RequireAdmin>}/>
  <Route path="/admin/products/:id/edit" element={<RequireAdmin><AdminProductFormPage/></RequireAdmin>}/>
  <Route path="/admin/products/:id/preview" element={<RequireAdmin><AdminProductPreviewPage/></RequireAdmin>}/>
  <Route path="/admin/products/:id/configuration" element={<RequireAdmin><AdminProductConfigurationPage/></RequireAdmin>}/>
  <Route path="/admin/commerce/:section" element={<RequireAdmin><AdminCommercePage/></RequireAdmin>}/>
  <Route path="/admin/commerce/orders/:id" element={<RequireAdmin><AdminOrderPage/></RequireAdmin>}/>
  <Route path="/home" element={<Navigate to="/" replace/>}/>
  <Route path="*" element={<StaticPage page="notfound"/>}/>
 </Routes></Suspense><Footer/><TrackingConsent/><Toaster position="top-right" richColors/></CartProvider>;
}
