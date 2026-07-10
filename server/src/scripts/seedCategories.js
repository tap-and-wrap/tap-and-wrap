import "dotenv/config";
import mongoose from "mongoose";
import Category from "../models/Category.js";
import { connectDB } from "../config/db.js";
import { createSlug } from "../utils/slug.js";

const categoryTree = [
  {
    name: "Gifts",
    description: "Wrapped gifts, boxes, boutique gifts, boards, and ready-made gift ideas.",
    showOnHome: true,
    children: [
      "Wrapped Gifts",
      "Gift Boxes",
      "Boutique Gifts",
      "Boards"
    ]
  },
  {
    name: "Engraving",
    description: "Products and service pages related to laser engraving.",
    showOnHome: true,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: [
      "Perfume Engraving",
      "Medal Engraving Leather",
      "Wallet Engraving",
      "Metal Bracelet Engraving",
      "Necklace Engraving",
      "Stationery Engraving"
    ]
  },
  {
    name: "Seasonality",
    description: "Seasonal collections and occasion-based campaigns.",
    showOnHome: true,
    children: [
      "Valentine’s",
      "Christmas",
      "Ramadan"
    ]
  },
  {
    name: "Fragrance & Cosmetics",
    description: "Perfumes, cosmetics, fragrance sets, and beauty gifts.",
    showOnHome: true,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: [
      "Men Fragrance",
      "Women Fragrance",
      "Fragrance Sets",
      "Fragrance Flash Sale"
    ]
  },
  {
    name: "Watches",
    description: "Watches that can be gifted, engraved, and wrapped.",
    showOnHome: true,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: []
  },
  {
    name: "Accessories",
    description: "Men and women accessories with optional personalization.",
    showOnHome: true,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: [
      "Men Accessories",
      "Women Accessories"
    ]
  },
  {
    name: "Balloons",
    description: "Balloons for celebrations and special moments.",
    showOnHome: true,
    children: [
      "Baby Shower Balloons",
      "Birthday Balloons",
      "She Said Yes Balloons",
      "Graduation Balloons",
      "Cartoon Balloons",
      "Trendy Balloons",
      "Small Air Balloons"
    ]
  },
  {
    name: "Photo Printing",
    description: "Print personal photos in fixed or custom sizes.",
    showOnHome: true,
    serviceDefaults: {
      engraving: false,
      wrapping: true,
      photoPrinting: true
    },
    children: [
      "10x15 Photo Print",
      "10x10 Photo Print",
      "8x8 Photo Print",
      "Custom Ratio Photo Print"
    ]
  },
  {
    name: "Toys +25",
    description: "Giftable toys and items for adults.",
    showOnHome: false,
    children: [
      "Men Toys +25",
      "Women Toys +25"
    ]
  },
  {
    name: "Frames",
    description: "Gift frames and personalized display pieces.",
    showOnHome: true,
    children: []
  },
  {
    name: "Teddy Bears",
    description: "Teddy bears and soft gift items.",
    showOnHome: true,
    children: []
  },
  {
    name: "Mugs",
    description: "Mugs and printed gift items.",
    showOnHome: false,
    children: []
  },
  {
    name: "Disney Characters",
    description: "Disney-themed gifts and character items.",
    showOnHome: false,
    children: []
  },
  {
    name: "Trophies",
    description: "Medals, cups, trophies, and appreciation gifts.",
    showOnHome: true,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: [
      "Medals",
      "Cups"
    ]
  },
  {
    name: "Wedding",
    description: "Wedding gifts, cards, giveaways, and bride sets.",
    showOnHome: true,
    children: [
      "Corsage",
      "Wedding Pin",
      "Wedding Card",
      "Light Card",
      "Cup Name",
      "Bridesmaids Giveaways",
      "Bride Set"
    ]
  },
  {
    name: "Lanterns",
    description: "Sky lanterns, Chinese lanterns, and seasonal lantern gifts.",
    showOnHome: false,
    children: [
      "Sky Lantern",
      "Chinese Lantern"
    ]
  },
  {
    name: "Cold Cuts",
    description: "Cold cuts trays and food gifting.",
    showOnHome: false,
    children: [
      "Cold Cuts Tray"
    ]
  },
  {
    name: "Notebooks",
    description: "Adventure books, office notes, and stationery gifts.",
    showOnHome: false,
    serviceDefaults: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    children: [
      "Adventure Book",
      "Office Note"
    ]
  },
  {
    name: "Corporate Collabs",
    description: "Corporate gifting, live events, and branded gift services.",
    showOnHome: true,
    children: [
      "Live Events"
    ]
  },
  {
    name: "Flowers",
    description: "Flowers and floral gift additions.",
    showOnHome: true,
    children: []
  },
  {
    name: "Chocolates",
    description: "Chocolate gifts and sweet add-ons.",
    showOnHome: true,
    children: []
  },
  {
    name: "Candles",
    description: "Candles and cozy gift additions.",
    showOnHome: true,
    children: []
  },
  {
    name: "Gift Cards",
    description: "Gift cards and message cards.",
    showOnHome: false,
    children: []
  },
  {
    name: "Handmade Products",
    description: "Handmade and crafted gift items.",
    showOnHome: true,
    children: []
  },
  {
    name: "Flash Sale",
    description: "Limited-time deals, bundles, and discounts.",
    showOnHome: true,
    children: []
  },
  {
    name: "Kitting Decorations",
    description: "Decorations, finishing pieces, and gift setup items.",
    showOnHome: false,
    children: []
  }
];

async function upsertCategory({ item, parent = null, level = 0, sortOrder = 0 }) {
  const slug = createSlug(item.name);
  const serviceDefaults = item.serviceDefaults || {
    engraving: false,
    wrapping: true,
    photoPrinting: false
  };

  const category = await Category.findOneAndUpdate(
    { slug },
    {
      $set: {
        name: item.name,
        slug,
        description: item.description || "",
        parent,
        level,
        sortOrder,
        showInMenu: true,
        showOnHome: Boolean(item.showOnHome),
        serviceDefaults,
        isActive: true
      }
    },
    {
  returnDocument: "after",
  upsert: true,
  runValidators: true
}
  );

  return category;
}

async function seedCategories() {
  await connectDB();

  console.log("Seeding Tap & Wrap categories...");

  for (let index = 0; index < categoryTree.length; index += 1) {
    const item = categoryTree[index];

    const parent = await upsertCategory({
      item,
      level: 0,
      sortOrder: index
    });

    for (let childIndex = 0; childIndex < item.children.length; childIndex += 1) {
      const childName = item.children[childIndex];

      await upsertCategory({
        item: {
          name: childName,
          description: "",
          showOnHome: false,
          serviceDefaults: item.serviceDefaults
        },
        parent: parent._id,
        level: 1,
        sortOrder: childIndex
      });
    }
  }

  const total = await Category.countDocuments();

  console.log(`Done. Total categories in database: ${total}`);

  await mongoose.disconnect();
}

seedCategories().catch(async (error) => {
  console.error("Category seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});