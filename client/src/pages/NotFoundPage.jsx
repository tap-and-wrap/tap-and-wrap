import {
  Home,
  Search
} from "lucide-react";
import {
  Link
} from "react-router-dom";

import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";

export default function NotFoundPage() {
  return (
    <>
      <Header />

      <main
        id="main-content"
        className="mx-auto flex min-h-[65vh] max-w-4xl items-center px-5 py-16"
      >
        <section className="w-full rounded-[2.2rem] border border-[#ead9d2] bg-white/90 p-8 text-center shadow-sm md:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#f4e5df] text-[#7b584d]">
            <Search
              size={29}
            />
          </div>

          <p className="mt-7 text-sm font-semibold uppercase tracking-[0.25em] text-[#a77d70]">
            Error 404
          </p>

          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b]">
            This page is not here.
          </h1>

          <p className="mx-auto mt-4 max-w-xl leading-8 text-[#735f58]">
            The link may be old, the
            page may have moved, or
            the address may contain a
            typo.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white"
            >
              <Home size={17} />
              Back to home
            </Link>

            <Link
              to="/shop"
              className="inline-flex items-center justify-center rounded-full border border-[#d8bfb6] bg-white px-7 py-3.5 text-sm font-semibold text-[#4b332b]"
            >
              Browse gifts
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
