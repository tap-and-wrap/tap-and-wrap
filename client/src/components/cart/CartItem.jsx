import { Link } from "react-router-dom";
import { Minus, Plus, Trash2 } from "lucide-react";

import {
  calculateLineTotal,
  calculateLineUnitPrice,
  formatPrice
} from "../../utils/cartUtils";

export default function CartItem({ item, onUpdateQuantity, onRemove }) {
  const imageUrl = item.product?.mainImage?.url || "";

  return (
    <article className="grid gap-5 rounded-[1.7rem] border border-[#ead9d2] bg-white/80 p-5 shadow-sm md:grid-cols-[120px_1fr_auto]">
      <Link
        to={`/products/${item.product.slug}`}
        className="aspect-square overflow-hidden rounded-2xl bg-[#f4e5df]"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-semibold text-[#8a675c]">
            Tap & Wrap
          </div>
        )}
      </Link>

      <div>
        <Link
          to={`/products/${item.product.slug}`}
          className="text-xl font-semibold tracking-[-0.02em] text-[#2c1f1b] hover:text-[#5a3d34]"
        >
          {item.product.name}
        </Link>

        <p className="mt-2 text-sm text-[#806a62]">
          Unit: {formatPrice(calculateLineUnitPrice(item))}
        </p>

        <div className="mt-4 grid gap-3 text-sm text-[#735f58]">
          {item.engraving?.enabled ? (
            <div className="rounded-2xl bg-[#fffaf7] p-4">
              <p className="font-semibold text-[#2c1f1b]">Engraving</p>
              <p>Type: {item.engraving.type}</p>
              {item.engraving.text ? <p>Text: {item.engraving.text}</p> : null}
              {item.engraving.imageFileName ? (
                <p>Image: {item.engraving.imageFileName}</p>
              ) : null}
              {item.engraving.placement ? (
                <p>Placement: {item.engraving.placement}</p>
              ) : null}
              <p>Price: {formatPrice(item.engraving.price)}</p>
            </div>
          ) : null}

          {item.wrapping?.enabled ? (
            <div className="rounded-2xl bg-[#fffaf7] p-4">
              <p className="font-semibold text-[#2c1f1b]">Wrapping</p>
              <p>Box color: {item.wrapping.boxColor}</p>
              <p>Ribbon color: {item.wrapping.ribbonColor}</p>

              {item.wrapping.giftCard ? (
                <p>
                  Gift card: yes
                  {item.wrapping.giftCardMessage
                    ? ` — ${item.wrapping.giftCardMessage}`
                    : ""}
                </p>
              ) : null}

              {item.wrapping.textOnBox ? (
                <p>
                  Text on box: yes
                  {item.wrapping.boxText ? ` — ${item.wrapping.boxText}` : ""}
                </p>
              ) : null}

              {item.wrapping.fillers ? <p>Fillers: yes</p> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-5 md:items-end">
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="inline-flex items-center gap-2 rounded-full border border-[#ead9d2] bg-white px-4 py-2 text-sm font-semibold text-[#7b584d] transition hover:bg-[#fff4ef]"
        >
          <Trash2 size={15} />
          Remove
        </button>

        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-[#ead9d2] bg-white p-1">
            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
              className="rounded-full p-2 text-[#5a3d34] transition hover:bg-[#fff4ef]"
            >
              <Minus size={16} />
            </button>

            <input
              value={item.quantity}
              onChange={(event) => onUpdateQuantity(item.id, event.target.value)}
              className="w-12 bg-transparent text-center font-semibold text-[#2c1f1b] outline-none"
            />

            <button
              type="button"
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className="rounded-full p-2 text-[#5a3d34] transition hover:bg-[#fff4ef]"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="text-right">
          <p className="text-sm text-[#806a62]">Line total</p>
          <p className="text-2xl font-semibold text-[#2c1f1b]">
            {formatPrice(calculateLineTotal(item))}
          </p>
        </div>
      </div>
    </article>
  );
}