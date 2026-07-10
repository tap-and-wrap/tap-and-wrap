import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import App from "./App.jsx";
import {
  CartProvider
} from "./context/CartContext.jsx";
import {
  AdminAuthProvider
} from "./context/AdminAuthContext.jsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});

createRoot(
  document.getElementById("root")
).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdminAuthProvider>
        <CartProvider>
          <App />

          <Toaster position="top-center" />
        </CartProvider>
      </AdminAuthProvider>
    </QueryClientProvider>
  </StrictMode>
);