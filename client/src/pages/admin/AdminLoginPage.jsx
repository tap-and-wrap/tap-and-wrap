import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react";
import {
  Navigate,
  useLocation,
  useNavigate
} from "react-router-dom";
import toast from "react-hot-toast";

import {
  useAdminAuth
} from "../../context/AdminAuthContext";

import {
  getAdminAuthErrorMessage
} from "../../features/admin/adminAuthApi";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    isAuthenticated,
    isLoading,
    login
  } = useAdminAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [
    showPassword,
    setShowPassword
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting
  ] = useState(false);

  useEffect(() => {
    document.title = "Admin Login | Tap & Wrap";
  }, []);

  if (!isLoading && isAuthenticated) {
    return (
      <Navigate
        to="/admin"
        replace
      />
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      toast.error("Enter your email and password");

      return;
    }

    setIsSubmitting(true);

    try {
      await login({
        email: email.trim(),
        password
      });

      toast.success("Welcome back");

      navigate(
        location.state?.from || "/admin",
        {
          replace: true
        }
      );
    } catch (error) {
      toast.error(
        getAdminAuthErrorMessage(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#fffaf7] lg:grid-cols-[0.9fr_1.1fr]">
      <section className="hidden bg-[#2c1f1b] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <p className="text-xl font-semibold tracking-[0.22em]">
            TAP & WRAP
          </p>

          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-white/45">
            Admin management
          </p>
        </div>

        <div className="max-w-lg">
          <ShieldCheck
            size={42}
            className="text-[#e6c9bf]"
          />

          <h1 className="mt-7 text-5xl font-semibold leading-tight tracking-[-0.05em]">
            Manage every gift experience from one place.
          </h1>

          <p className="mt-5 max-w-md leading-8 text-white/60">
            Products, orders, engraving, wrapping,
            payments, categories, offers, and customer
            updates.
          </p>
        </div>

        <p className="text-sm text-white/35">
          Secure Tap & Wrap administration
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-[2rem] border border-[#ead9d2] bg-white/90 p-7 shadow-xl shadow-[#4b332b]/10 md:p-9">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
              <LockKeyhole size={26} />
            </div>

            <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
              Admin login
            </h1>

            <p className="mt-3 leading-7 text-[#735f58]">
              Sign in using the secure Tap & Wrap owner
              account.
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 grid gap-5"
            >
              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#4b332b]">
                  Email address
                </span>

                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a766b]"
                  />

                  <input
                    type="email"
                    value={email}
                    onChange={(event) =>
                      setEmail(event.target.value)
                    }
                    autoComplete="email"
                    placeholder="owner@example.com"
                    className="w-full rounded-2xl border border-[#ead9d2] bg-white py-3.5 pl-11 pr-4 text-[#2c1f1b] outline-none transition focus:border-[#8a675c] focus:ring-4 focus:ring-[#ead9d2]/45"
                  />
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-semibold text-[#4b332b]">
                  Password
                </span>

                <div className="relative">
                  <LockKeyhole
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9a766b]"
                  />

                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full rounded-2xl border border-[#ead9d2] bg-white py-3.5 pl-11 pr-12 text-[#2c1f1b] outline-none transition focus:border-[#8a675c] focus:ring-4 focus:ring-[#ead9d2]/45"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((value) => !value)
                    }
                    aria-label={
                      showPassword
                        ? "Hide password"
                        : "Show password"
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#806a62]"
                  >
                    {showPassword ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={isSubmitting || isLoading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-4 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="animate-spin"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    Sign in securely
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}