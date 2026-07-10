import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";

import {
  getCurrentAdmin,
  loginAdmin,
  logoutAdmin
} from "../features/admin/adminAuthApi";

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAdmin = useCallback(async () => {
    try {
      const response = await getCurrentAdmin();

      setAdmin(response.admin);

      return response.admin;
    } catch {
      setAdmin(null);

      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  async function login(credentials) {
    const response = await loginAdmin(credentials);

    setAdmin(response.admin);

    return response.admin;
  }

  async function logout() {
    try {
      await logoutAdmin();
    } finally {
      setAdmin(null);
    }
  }

  const value = useMemo(
    () => ({
      admin,
      isLoading,
      isAuthenticated: Boolean(admin),
      login,
      logout,
      refreshAdmin
    }),
    [admin, isLoading, refreshAdmin]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error(
      "useAdminAuth must be used inside AdminAuthProvider"
    );
  }

  return context;
}