import {
  BrowserRouter,
  Route,
  Routes
} from "react-router-dom";

import HomePage from "./pages/HomePage";
import ShopPage from "./pages/ShopPage";
import CategoryPage from "./pages/CategoryPage";
import ProductDetailsPage from "./pages/ProductDetailsPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrderSuccessPage from "./pages/OrderSuccessPage";
import ServicesPage from "./pages/ServicesPage";
import TrackOrderPage from "./pages/TrackOrderPage";
import PaymentResultPage from "./pages/PaymentResultPage";
import FaqPage from "./pages/FaqPage";
import DeliveryReturnsPage from "./pages/DeliveryReturnsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsPage from "./pages/TermsPage";
import ContactPage from "./pages/ContactPage";
import NotFoundPage from "./pages/NotFoundPage";

import AdminLoginPage from "./pages/admin/AdminLoginPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import AdminOrderDetailsPage from "./pages/admin/AdminOrderDetailsPage";
import AdminCategoriesPage from "./pages/admin/AdminCategoriesPage";
import AdminProductsPage from "./pages/admin/AdminProductsPage";
import AdminProductEditorPage from "./pages/admin/AdminProductEditorPage";
import AdminDiscountsPage from "./pages/admin/AdminDiscountsPage";
import AdminOffersPage from "./pages/admin/AdminOffersPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminServiceRequestsPage from "./pages/admin/AdminServiceRequestsPage";
import AdminServiceRequestDetailsPage from "./pages/admin/AdminServiceRequestDetailsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";

import ProtectedAdminRoute from "./components/admin/ProtectedAdminRoute";
import AdminLayout from "./components/admin/AdminLayout";
import ScrollToTop from "./components/routing/ScrollToTop";
import SeoManager from "./components/seo/SeoManager";

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <SeoManager />

      <Routes>
        <Route
          path="/"
          element={<HomePage />}
        />

        <Route
          path="/shop"
          element={<ShopPage />}
        />

        <Route
          path="/services"
          element={<ServicesPage />}
        />

        <Route
          path="/track-order"
          element={<TrackOrderPage />}
        />

        <Route
          path="/payment-result"
          element={<PaymentResultPage />}
        />

        <Route
          path="/faq"
          element={<FaqPage />}
        />

        <Route
          path="/delivery-returns"
          element={<DeliveryReturnsPage />}
        />

        <Route
          path="/privacy-policy"
          element={<PrivacyPolicyPage />}
        />

        <Route
          path="/terms"
          element={<TermsPage />}
        />

        <Route
          path="/contact"
          element={<ContactPage />}
        />

        <Route
          path="/categories/:slug"
          element={<CategoryPage />}
        />

        <Route
          path="/products/:slug"
          element={<ProductDetailsPage />}
        />

        <Route
          path="/cart"
          element={<CartPage />}
        />

        <Route
          path="/checkout"
          element={<CheckoutPage />}
        />

        <Route
          path="/order-success/:orderNumber"
          element={<OrderSuccessPage />}
        />

        <Route
          path="/admin/login"
          element={<AdminLoginPage />}
        />

        <Route
          element={
            <ProtectedAdminRoute />
          }
        >
          <Route
            path="/admin"
            element={<AdminLayout />}
          >
            <Route
              index
              element={
                <AdminDashboardPage />
              }
            />

            <Route
              path="orders"
              element={
                <AdminOrdersPage />
              }
            />

            <Route
              path="orders/:id"
              element={
                <AdminOrderDetailsPage />
              }
            />

            <Route
              path="products"
              element={
                <AdminProductsPage />
              }
            />

            <Route
              path="products/new"
              element={
                <AdminProductEditorPage />
              }
            />

            <Route
              path="products/:id"
              element={
                <AdminProductEditorPage />
              }
            />

            <Route
              path="categories"
              element={
                <AdminCategoriesPage />
              }
            />

            <Route
              path="services"
              element={
                <AdminServiceRequestsPage />
              }
            />

            <Route
              path="services/:id"
              element={
                <AdminServiceRequestDetailsPage />
              }
            />

            <Route
              path="offers"
              element={
                <AdminOffersPage />
              }
            />

            <Route
              path="discounts"
              element={
                <AdminDiscountsPage />
              }
            />

            <Route
              path="analytics"
              element={
                <AdminAnalyticsPage />
              }
            />

            <Route
              path="settings"
              element={
                <AdminSettingsPage />
              }
            />
          </Route>
        </Route>

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Routes>
    </BrowserRouter>
  );
}
