import {
  useEffect,
  useState
} from "react";
import {
  CheckCircle2,
  LoaderCircle,
  Tag,
  X
} from "lucide-react";

import { formatPrice } from "../../utils/cartUtils";

export default function DiscountCodeBox({
  value,
  onApply,
  onRemove,
  isChecking = false,
  result,
  error = ""
}) {
  const [input, setInput] = useState(value || "");

  useEffect(() => {
    setInput(value || "");
  }, [value]);

  function handleSubmit(event) {
    event.preventDefault();

    const normalizedCode = input
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "");

    if (!normalizedCode) {
      return;
    }

    onApply(normalizedCode);
  }

  const discount = result?.discount;
  const savedAmount = Number(discount?.amount || 0);

  return (
    <div className="rounded-3xl border border-[#ead9d2] bg-[#fffaf7] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f4e5df] text-[#7b584d]">
          <Tag size={19} />
        </div>

        <div>
          <h3 className="font-semibold text-[#2c1f1b]">
            Discount code
          </h3>

          <p className="mt-1 text-sm leading-6 text-[#806a62]">
            Codes are checked after automatic bundle offers, so the final price stays accurate and secure.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <input
          value={input}
          onChange={(event) =>
            setInput(
              event.target.value
                .toUpperCase()
                .replace(/\s+/g, "")
            )
          }
          placeholder="WELCOME10"
          className="min-w-0 flex-1 rounded-2xl border border-[#ead9d2] bg-white px-4 py-3 font-semibold uppercase tracking-[0.1em] text-[#2c1f1b] outline-none focus:border-[#8a675c]"
        />

        <button
          type="submit"
          disabled={isChecking || !input.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2c1f1b] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#4b332b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isChecking ? (
            <LoaderCircle
              size={16}
              className="animate-spin"
            />
          ) : null}

          Apply
        </button>
      </form>

      {discount && !error ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-800">
          <CheckCircle2
            size={19}
            className="mt-0.5 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {discount.code} applied
            </p>

            <p className="mt-1 text-sm leading-6">
              {discount.type === "free_shipping"
                ? Number(discount.shippingDiscount || 0) > 0
                  ? `Delivery discount: ${formatPrice(
                      discount.shippingDiscount
                    )}`
                  : "Free delivery will appear after choosing the delivery governorate."
                : `Code savings: ${formatPrice(savedAmount)}.`}
            </p>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1 text-green-800 transition hover:bg-green-100"
            aria-label="Remove discount code"
          >
            <X size={17} />
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p>{error}</p>

          {value ? (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 rounded-full p-1 transition hover:bg-red-100"
              aria-label="Remove invalid discount code"
            >
              <X size={17} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
