export default function PageIntro({
  eyebrow,
  title,
  description
}) {
  return (
    <header className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#a77d70]">
        {eyebrow}
      </p>

      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#2c1f1b] md:text-5xl">
        {title}
      </h1>

      <p className="mt-4 leading-8 text-[#735f58]">
        {description}
      </p>
    </header>
  );
}
