export default function SectionHeader({
  eyebrow,
  title,
  text,
  actionLabel,
  actionHref = "#"
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        {eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#b08a7c]">
            {eyebrow}
          </p>
        ) : null}

        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-[#2c1f1b]">
          {title}
        </h2>

        {text ? (
          <p className="mt-4 max-w-2xl leading-7 text-[#735f58]">{text}</p>
        ) : null}
      </div>

      {actionLabel ? (
        <a
          href={actionHref}
          className="inline-flex w-fit rounded-full border border-[#d8bfb6] bg-white/75 px-5 py-2.5 text-sm font-semibold text-[#4b332b] transition hover:bg-white"
        >
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}