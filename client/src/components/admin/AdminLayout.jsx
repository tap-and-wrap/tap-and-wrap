import {
  BarChart3,
  Boxes,
  FolderTree,
  Gift,
  Home,
  LogOut,
  PackageSearch,
  Settings,
  ShoppingBag,
  Sparkles,
  Tags
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useNavigate
} from "react-router-dom";
import toast from "react-hot-toast";

import {
  useAdminAuth
} from "../../context/AdminAuthContext";

const navigationItems = [
  {
    label: "Overview",
    to: "/admin",
    icon: Home,
    end: true
  },
  {
    label: "Orders",
    to: "/admin/orders",
    icon: ShoppingBag
  },
  {
    label: "Products",
    to: "/admin/products",
    icon: Boxes
  },
  {
    label: "Categories",
    to: "/admin/categories",
    icon: FolderTree
  },
  {
    label: "Services",
    to: "/admin/services",
    icon: Sparkles
  },
  {
    label: "Offers & Bundles",
    to: "/admin/offers",
    icon: Gift
  },
  {
    label: "Discount Codes",
    to: "/admin/discounts",
    icon: Tags
  },
  {
    label: "Analytics",
    to: "/admin/analytics",
    icon: BarChart3
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: Settings
  }
];

export default function AdminLayout() {
  const navigate =
    useNavigate();

  const {
    admin,
    logout
  } = useAdminAuth();

  async function handleLogout() {
    try {
      await logout();

      toast.success(
        "Logged out"
      );

      navigate(
        "/admin/login",
        {
          replace: true
        }
      );
    } catch {
      toast.error(
        "Could not log out"
      );
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f3f1] text-[#2c1f1b]">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="border-r border-[#e5d8d2] bg-[#2c1f1b] px-5 py-6 text-white">
          <Link
            to="/admin"
            className="block rounded-3xl border border-white/10 bg-white/[0.06] p-5"
          >
            <p className="text-lg font-semibold tracking-[0.2em]">
              TAP & WRAP
            </p>

            <p className="mt-2 text-xs uppercase tracking-[0.22em] text-white/50">
              Admin dashboard
            </p>
          </Link>

          <nav className="mt-7 grid gap-1.5">
            {navigationItems.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({
                      isActive
                    }) =>
                      `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                        isActive
                          ? "bg-white text-[#2c1f1b]"
                          : "text-white/65 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    <Icon
                      size={18}
                    />

                    {item.label}
                  </NavLink>
                );
              }
            )}
          </nav>

          <div className="mt-8 border-t border-white/10 pt-5">
            <div className="rounded-2xl bg-white/[0.06] p-4">
              <p className="truncate font-semibold">
                {admin?.name}
              </p>

              <p className="mt-1 truncate text-xs text-white/50">
                {admin?.email}
              </p>

              <p className="mt-2 inline-flex rounded-full bg-white/10 px-2.5 py-1 text-xs capitalize text-white/70">
                {admin?.role}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut
                size={17}
              />

              Log out
            </button>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex items-center justify-between border-b border-[#e5d8d2] bg-white/85 px-5 py-4 backdrop-blur md:px-8">
            <div>
              <p className="text-sm text-[#806a62]">
                Tap & Wrap management
              </p>

              <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em]">
                Welcome, {admin?.name}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Link
                to="/shop"
                target="_blank"
                className="hidden items-center gap-2 rounded-full border border-[#e5d8d2] bg-white px-4 py-2.5 text-sm font-semibold text-[#5a3d34] transition hover:bg-[#fff8f4] sm:inline-flex"
              >
                <PackageSearch
                  size={17}
                />

                View store
              </Link>

              <Link
                to="/"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-full bg-[#2c1f1b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4b332b]"
              >
                <ShoppingBag
                  size={17}
                />

                Website
              </Link>
            </div>
          </header>

          <main className="p-5 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
