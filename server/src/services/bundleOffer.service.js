import BundleOffer from "../models/BundleOffer.js";

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getReferenceId(value) {
  return String(value?._id || value || "");
}

function getMaximumApplications(offer) {
  if (!offer.allowMultipleApplications) {
    return 1;
  }

  if (
    offer.maximumApplicationsPerOrder !== null &&
    offer.maximumApplicationsPerOrder !== undefined
  ) {
    return Math.max(
      Number(offer.maximumApplicationsPerOrder) || 1,
      1
    );
  }

  return Number.POSITIVE_INFINITY;
}

function isLineEligibleForAnyN(offer, item) {
  if (offer.scope === "all_products") {
    return true;
  }

  if (offer.scope === "selected_products") {
    const selectedProducts = new Set(
      (offer.products || []).map(getReferenceId)
    );

    return selectedProducts.has(getReferenceId(item.product));
  }

  const selectedCategories = new Set(
    (offer.categories || []).map(getReferenceId)
  );

  return (
    selectedCategories.has(getReferenceId(item.category)) ||
    selectedCategories.has(getReferenceId(item.subcategory))
  );
}

function getApplicationMerchandiseDiscount({
  discountMode,
  discountValue,
  merchandiseSubtotal
}) {
  const subtotal = Math.max(Number(merchandiseSubtotal || 0), 0);
  const value = Math.max(Number(discountValue || 0), 0);

  if (discountMode === "fixed_bundle_price") {
    return roundMoney(Math.max(subtotal - value, 0));
  }

  if (discountMode === "percentage_off") {
    return roundMoney(subtotal * (value / 100));
  }

  if (discountMode === "fixed_amount_off") {
    return roundMoney(Math.min(value, subtotal));
  }

  return 0;
}

function groupSelectedUnitsByLine(selectedUnits) {
  const groups = new Map();

  for (const unit of selectedUnits) {
    const current = groups.get(unit.itemIndex) || {
      itemIndex: unit.itemIndex,
      merchandiseSubtotal: 0
    };

    current.merchandiseSubtotal += Number(unit.price || 0);
    groups.set(unit.itemIndex, current);
  }

  return [...groups.values()];
}

function allocateDiscountToLines({
  selectedUnits,
  discountAmount,
  lineDiscounts
}) {
  const amount = roundMoney(discountAmount);

  if (amount <= 0 || !selectedUnits.length) {
    return;
  }

  const groups = groupSelectedUnitsByLine(selectedUnits);
  const totalSelected = groups.reduce(
    (total, group) => total + group.merchandiseSubtotal,
    0
  );

  let remainingDiscount = amount;

  groups.forEach((group, index) => {
    const isLast = index === groups.length - 1;

    const allocated = isLast
      ? remainingDiscount
      : roundMoney(
          amount * (group.merchandiseSubtotal / totalSelected)
        );

    remainingDiscount = roundMoney(
      Math.max(remainingDiscount - allocated, 0)
    );

    lineDiscounts.set(
      group.itemIndex,
      roundMoney(
        (lineDiscounts.get(group.itemIndex) || 0) + allocated
      )
    );
  });
}

function consumeSelectedUnits(selectedUnits, remainingQuantities) {
  for (const unit of selectedUnits) {
    remainingQuantities[unit.itemIndex] = Math.max(
      Number(remainingQuantities[unit.itemIndex] || 0) - 1,
      0
    );
  }
}

function buildAnyNCandidateUnits({
  offer,
  normalizedItems,
  remainingQuantities
}) {
  const units = [];

  normalizedItems.forEach((item, itemIndex) => {
    if (!isLineEligibleForAnyN(offer, item)) {
      return;
    }

    const availableQuantity = Number(
      remainingQuantities[itemIndex] || 0
    );

    for (let index = 0; index < availableQuantity; index += 1) {
      units.push({
        itemIndex,
        productId: getReferenceId(item.product),
        price: Number(item.productUnitPrice || 0)
      });
    }
  });

  units.sort((first, second) => second.price - first.price);

  return units;
}

function selectFixedBundleUnits({
  offer,
  normalizedItems,
  remainingQuantities
}) {
  const selectedUnits = [];

  for (const bundleItem of offer.bundleItems || []) {
    const requiredProductId = getReferenceId(bundleItem.product);
    let remainingRequired = Number(bundleItem.quantity || 0);

    const eligibleLines = normalizedItems
      .map((item, itemIndex) => ({
        item,
        itemIndex
      }))
      .filter(
        ({ item, itemIndex }) =>
          getReferenceId(item.product) === requiredProductId &&
          Number(remainingQuantities[itemIndex] || 0) > 0
      )
      .sort(
        (first, second) =>
          Number(second.item.productUnitPrice || 0) -
          Number(first.item.productUnitPrice || 0)
      );

    for (const { item, itemIndex } of eligibleLines) {
      if (remainingRequired <= 0) {
        break;
      }

      const available = Number(remainingQuantities[itemIndex] || 0);
      const take = Math.min(available, remainingRequired);

      for (let index = 0; index < take; index += 1) {
        selectedUnits.push({
          itemIndex,
          productId: requiredProductId,
          price: Number(item.productUnitPrice || 0)
        });
      }

      remainingRequired -= take;
    }

    if (remainingRequired > 0) {
      return null;
    }
  }

  return selectedUnits;
}

function createAppliedOfferSnapshot(offer) {
  return {
    offer: offer._id,
    name: offer.name,
    type: offer.type,
    discountMode: offer.discountMode,
    discountValue: Number(offer.discountValue || 0),
    requiredQuantity: Number(offer.requiredQuantity || 0),
    applications: 0,
    merchandiseSubtotal: 0,
    merchandiseDiscount: 0,
    shippingDiscount: 0,
    freeShipping: Boolean(offer.freeShipping),
    priority: Number(offer.priority || 0)
  };
}

function getActiveOfferFilter(now) {
  return {
    isActive: true,
    $and: [
      {
        $or: [
          { startsAt: null },
          { startsAt: { $exists: false } },
          { startsAt: { $lte: now } }
        ]
      },
      {
        $or: [
          { endsAt: null },
          { endsAt: { $exists: false } },
          { endsAt: { $gte: now } }
        ]
      }
    ]
  };
}

export async function calculateBundleOffers({
  normalizedItems,
  shippingFee,
  session = null
}) {
  const query = BundleOffer.find(getActiveOfferFilter(new Date())).sort({
    priority: -1,
    createdAt: 1
  });

  if (session) {
    query.session(session);
  }

  const offers = await query;
  const remainingQuantities = normalizedItems.map((item) =>
    Number(item.quantity || 0)
  );
  const lineDiscounts = new Map();
  const appliedOffers = [];

  let merchandiseDiscount = 0;
  let freeShippingAwarded = false;

  for (const offer of offers) {
    const maximumApplications = getMaximumApplications(offer);
    const snapshot = createAppliedOfferSnapshot(offer);

    while (snapshot.applications < maximumApplications) {
      let selectedUnits = null;

      if (offer.type === "any_n") {
        const requiredQuantity = Number(offer.requiredQuantity || 0);
        const candidateUnits = buildAnyNCandidateUnits({
          offer,
          normalizedItems,
          remainingQuantities
        });

        if (candidateUnits.length < requiredQuantity) {
          break;
        }

        selectedUnits = candidateUnits.slice(0, requiredQuantity);
      } else {
        selectedUnits = selectFixedBundleUnits({
          offer,
          normalizedItems,
          remainingQuantities
        });

        if (!selectedUnits?.length) {
          break;
        }
      }

      const applicationSubtotal = roundMoney(
        selectedUnits.reduce(
          (total, unit) => total + Number(unit.price || 0),
          0
        )
      );

      const applicationDiscount = getApplicationMerchandiseDiscount({
        discountMode: offer.discountMode,
        discountValue: offer.discountValue,
        merchandiseSubtotal: applicationSubtotal
      });

      const canAwardFreeShipping =
        Boolean(offer.freeShipping) && !freeShippingAwarded;

      if (applicationDiscount <= 0 && !canAwardFreeShipping) {
        break;
      }

      consumeSelectedUnits(selectedUnits, remainingQuantities);
      allocateDiscountToLines({
        selectedUnits,
        discountAmount: applicationDiscount,
        lineDiscounts
      });

      snapshot.applications += 1;
      snapshot.merchandiseSubtotal = roundMoney(
        snapshot.merchandiseSubtotal + applicationSubtotal
      );
      snapshot.merchandiseDiscount = roundMoney(
        snapshot.merchandiseDiscount + applicationDiscount
      );

      merchandiseDiscount = roundMoney(
        merchandiseDiscount + applicationDiscount
      );

      if (canAwardFreeShipping) {
        freeShippingAwarded = true;
        snapshot.shippingDiscount = roundMoney(shippingFee);
      }

      if (!offer.allowMultipleApplications) {
        break;
      }

      if (applicationDiscount <= 0 && canAwardFreeShipping) {
        break;
      }
    }

    if (snapshot.applications > 0) {
      appliedOffers.push(snapshot);
    }
  }

  const shippingDiscount = freeShippingAwarded
    ? roundMoney(shippingFee)
    : 0;

  const adjustedItems = normalizedItems.map((item, itemIndex) => {
    const offerDiscount = roundMoney(lineDiscounts.get(itemIndex) || 0);

    return {
      ...item,
      offerDiscount,
      discountableLineTotal: roundMoney(
        Math.max(Number(item.lineTotal || 0) - offerDiscount, 0)
      )
    };
  });

  const totalDiscount = roundMoney(
    merchandiseDiscount + shippingDiscount
  );

  return {
    appliedOffers,
    adjustedItems,
    merchandiseDiscount,
    shippingDiscount,
    totalDiscount,
    subtotalAfterOffers: roundMoney(
      adjustedItems.reduce(
        (total, item) => total + item.discountableLineTotal,
        0
      )
    ),
    shippingAfterOffers: roundMoney(
      Math.max(Number(shippingFee || 0) - shippingDiscount, 0)
    )
  };
}

export async function recordBundleOfferUsage({
  appliedOffers,
  session
}) {
  if (!appliedOffers?.length) {
    return;
  }

  const operations = appliedOffers.map((appliedOffer) => ({
    updateOne: {
      filter: {
        _id: appliedOffer.offer
      },
      update: {
        $inc: {
          usedOrderCount: 1,
          applicationCount: Number(appliedOffer.applications || 0)
        }
      }
    }
  }));

  await BundleOffer.bulkWrite(operations, {
    session
  });
}
