import {
  Banknote,
  Building2,
  CreditCard,
  Smartphone
} from "lucide-react";

const paymentIcons = {
  cod: Banknote,
  instapay: Building2,
  vodafone_cash: Smartphone,
  card: CreditCard
};

export default function PaymentMethodCard({
  value,
  selectedValue,
  label,
  description,
  disabled = false,
  badge,
  onChange
}) {
  const Icon = paymentIcons[value] || CreditCard;
  const selected = selectedValue === value;

  return (
    <label
      className={`relative flex cursor-pointer gap-4 rounded-3xl border p-5 transition ${
        disabled
          ? "cursor-not-allowed border-[#ead9d2] bg-[#f8f4f2] opacity-60"
          : selected
            ? "border-[#5a3d34] bg-[#fff8f4] shadow-sm"
            : "border-[#ead9d2] bg-white hover:border-[#d8bfb6]"
      }`}
    >
      <input
        type="radio"
        name="paymentMethod"
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />

      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          selected
            ? "bg-[#5a3d34] text-white"
            : "bg-[#f4e5df] text-[#7b584d]"
        }`}
      >
        <Icon size={21} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-[#2c1f1b]">
            {label}
          </p>

          {badge ? (
            <span className="rounded-full bg-[#f4e5df] px-2.5 py-1 text-xs font-semibold text-[#7b584d]">
              {badge}
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-sm leading-6 text-[#806a62]">
          {description}
        </p>
      </div>

      <span
        className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-[#5a3d34] bg-[#5a3d34]"
            : "border-[#cdb7ae] bg-white"
        }`}
      >
        {selected ? (
          <span className="h-2 w-2 rounded-full bg-white" />
        ) : null}
      </span>
    </label>
  );
}