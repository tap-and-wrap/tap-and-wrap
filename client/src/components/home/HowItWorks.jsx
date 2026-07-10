import { occasionTags, steps } from "../../data/homeData";

export default function HowItWorks() {
  return (
    <section id="occasions" className="mx-auto max-w-7xl px-5 py-16">
      <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
            Occasions
          </p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-[#2c1f1b]">
            Built around real gifting moments.
          </h2>
          <p className="mt-5 leading-8 text-[#735f58]">
            Customers should not have to think too much. They can shop by occasion,
            choose the product, then add personalization and wrapping in the same flow.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {occasionTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#ead9d2] bg-white/75 px-4 py-2 text-sm font-semibold text-[#6f5a52]"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {steps.map((step) => (
            <article
              key={step.number}
              className="rounded-3xl border border-[#ead9d2] bg-white/76 p-6 shadow-sm"
            >
              <p className="text-sm font-semibold text-[#b08a7c]">{step.number}</p>
              <h3 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-[#2c1f1b]">
                {step.title}
              </h3>
              <p className="mt-3 leading-7 text-[#735f58]">{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}