import { ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function HeroSection() {
  return (
    <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-[1.05fr_0.95fr] md:pb-24 md:pt-20">
      <div>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#ead9d2] bg-white/75 px-4 py-2 text-sm font-semibold text-[#8a675c] shadow-sm"
        >
          <Sparkles size={16} />
          Gifts made personal
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl text-5xl font-semibold leading-[0.96] tracking-[-0.055em] text-[#2c1f1b] md:text-7xl"
        >
          Choose it. Personalize it. Wrap it beautifully.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mt-6 max-w-xl text-lg leading-8 text-[#735f58]"
        >
          A warm gifting experience for ready-made gifts, engraving, wrapping,
          photo printing, seasonal occasions, and corporate requests.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-9 flex flex-col gap-3 sm:flex-row"
        >
          <a
  href="/shop"
  style={{ color: "#ffffff" }}
  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#2c1f1b] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#2c1f1b]/15 transition hover:bg-[#4b332b]"
>
  Shop gifts <ArrowRight size={18} />
</a>

          <a
            href="#services"
            className="inline-flex items-center justify-center rounded-full border border-[#d8bfb6] bg-white/75 px-7 py-3.5 text-sm font-semibold text-[#4b332b] transition hover:bg-white"
          >
            Personalize a gift
          </a>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.65 }}
        className="relative"
      >
        <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-[#ead0c8]/60 blur-3xl" />
        <div className="absolute -bottom-10 -right-8 h-56 w-56 rounded-full bg-[#f5ded7]/80 blur-3xl" />

        <div className="relative rounded-[2rem] border border-white/80 bg-white/58 p-4 shadow-2xl shadow-[#4b332b]/10 backdrop-blur">
          <div className="aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#ead9d2]">
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#f6e7e1] via-[#fffaf7] to-[#dfc3b9] p-10 text-center">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#8a675c]">
                  Tap & Wrap
                </p>
                <h2 className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-[#4b332b]">
                  Real product photo or video
                </h2>
                <p className="mt-4 text-[#735f58]">
                  We will replace this with client gift visuals.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}