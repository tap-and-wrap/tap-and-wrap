export default function FinalCTA() {
  return (
    <section id="corporate" className="mx-auto max-w-7xl px-5 py-20">
      <div className="rounded-[2rem] border border-[#ead9d2] bg-white/80 p-8 text-center shadow-sm md:p-14">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
          Custom gifting
        </p>

        <h2 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.035em] text-[#2c1f1b] md:text-5xl">
          Need help choosing the perfect gift?
        </h2>

        <p className="mx-auto mt-5 max-w-2xl leading-8 text-[#735f58]">
          Customers can shop directly, personalize a product, or contact Tap & Wrap
          for custom gift boxes, live events, corporate collabs, and seasonal campaigns.
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a
            href="https://wa.me/201508216472"
            target="_blank"
            rel="noreferrer"
            className="inline-flex justify-center rounded-full bg-[#5a3d34] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-[#3d2923]"
          >
            Chat on WhatsApp
          </a>

          <a
            href="https://www.instagram.com/tapandwrap"
            target="_blank"
            rel="noreferrer"
            className="inline-flex justify-center rounded-full border border-[#d8bfb6] bg-white/75 px-7 py-3.5 text-sm font-semibold text-[#4b332b] transition hover:bg-white"
          >
            View Instagram
          </a>
        </div>
      </div>
    </section>
  );
}