import { ArrowRight } from "lucide-react";
import { services } from "../../data/homeData";

export default function ServicesPreview() {
  return (
    <section id="services" className="mx-auto max-w-7xl px-5 py-16">
      <div className="overflow-hidden rounded-[2rem] bg-[#2c1f1b] p-6 text-white shadow-2xl shadow-[#2c1f1b]/20 md:p-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#e6c9bf]">
              Personalization
            </p>
            <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-[-0.035em]">
              Services that turn a product into a memory.
            </h2>
          </div>

          <a
            href="#"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#2c1f1b] transition hover:bg-[#fff4ef]"
          >
            Explore services <ArrowRight size={17} />
          </a>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {services.map((service) => {
            const Icon = service.icon;

            return (
              <article
                key={service.title}
                className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 transition hover:bg-white/[0.09]"
              >
                <Icon className="mb-6 text-[#e6c9bf]" size={30} />
                <h3 className="text-xl font-semibold">{service.title}</h3>
                <p className="mt-3 leading-7 text-white/70">{service.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}