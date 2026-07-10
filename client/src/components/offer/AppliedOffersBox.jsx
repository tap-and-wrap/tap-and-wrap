import {
  Gift,
  Layers3,
  Sparkles,
  Truck
} from "lucide-react";

import { formatPrice } from "../../utils/cartUtils";

function getOfferDescription(offer) {
  const applications = Number(offer.applications || 0);
  const quantity = Number(offer.requiredQuantity || 0);

  if (offer.type === "fixed_products") {
    return `${applications} bundle${applications === 1 ? "" : "s"} applied`;
  }

  return `${applications} × ${quantity}-item offer applied`;
}

export default function AppliedOffersBox({
  offers = [],
  totalSavings = 0
}) {
  if (!offers.length) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-[#dfcfbf] bg-[#fff8ef] p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#efe1d1] text-[#7b584d]">
          <Gift size={19} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-[#2c1f1b]">
                Automatic offers applied
              </h3>

              <p className="mt-1 text-sm leading-6 text-[#806a62]">
                Tap & Wrap selected the highest-priority valid offers without discounting the same quantity twice.
              </p>
            </div>

            <span className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-green-700 shadow-sm">
              Save {formatPrice(totalSavings)}
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {offers.map((offer) => (
              <article
                key={String(offer.offer || offer._id || offer.name)}
                className="rounded-2xl border border-[#ead9d2] bg-white p-4"
              >
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-[#2c1f1b]">
                      <Sparkles size={15} />
                      {offer.name}
                    </p>

                    <p className="mt-1 text-sm text-[#806a62]">
                      {getOfferDescription(offer)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {Number(offer.merchandiseDiscount || 0) > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                        <Layers3 size={12} />
                        - {formatPrice(offer.merchandiseDiscount)}
                      </span>
                    ) : null}

                    {offer.freeShipping ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                        <Truck size={12} />
                        Free delivery
                      </span>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
