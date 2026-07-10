import {
  Navigate,
  Outlet,
  useLocation
} from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import {
  useAdminAuth
} from "../../context/AdminAuthContext";

export default function ProtectedAdminRoute() {
  const location = useLocation();

  const {
    isAuthenticated,
    isLoading
  } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fffaf7]">
        <div className="text-center">
          <LoaderCircle
            size={34}
            className="mx-auto animate-spin text-[#5a3d34]"
          />

          <p className="mt-4 font-semibold text-[#735f58]">
            Checking admin session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{
          from: location.pathname
        }}
      />
    );
  }

  return <Outlet />;
}