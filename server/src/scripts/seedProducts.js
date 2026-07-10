import "dotenv/config";
import mongoose from "mongoose";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import { connectDB } from "../config/db.js";
import { createSlug } from "../utils/slug.js";

const products = [
  {
    name: "Black Luxury Gift Box",
    categorySlug: "gifts",
    subcategorySlug: "gift-boxes",
    shortDescription: "A premium black gift box ready for wrapping and personalization.",
    description:
      "A clean luxury gift box suitable for perfumes, accessories, watches, and custom gift sets. Customers can add wrapping details, fillers, gift cards, and custom notes.",
    price: 650,
    salePrice: null,
    stock: 12,
    serviceEligibility: {
      engraving: false,
      wrapping: true,
      photoPrinting: false
    },
    tags: ["gift box", "wrapped gift", "luxury"],
    occasions: ["Birthday", "Wedding", "Corporate Events"],
    badges: ["Gift Ready"],
    isFeatured: true,
    isBestSeller: true
  },
  {
    name: "Men Fragrance Gift Set",
    categorySlug: "fragrance-cosmetics",
    subcategorySlug: "fragrance-sets",
    shortDescription: "A fragrance gift set with optional perfume engraving and wrapping.",
    description:
      "A premium fragrance set for men. Customers can add laser engraving on eligible perfume bottles and complete the gift with box color, ribbon color, fillers, and a gift card.",
    price: 1250,
    salePrice: 1100,
    stock: 8,
    serviceEligibility: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    engravingSettings: {
      allowText: true,
      allowImage: true,
      maxCharacters: 60,
      placements: ["Bottle front", "Bottle back"],
      basePrice: 150,
      notes: "Best for short names, initials, dates, or small icons."
    },
    tags: ["perfume", "fragrance", "men"],
    occasions: ["Birthday", "Valentine’s", "Corporate Events"],
    badges: ["Engravable", "Sale"],
    isFeatured: true,
    isBestSeller: true,
    isFlashSale: true
  },
  {
    name: "Classic Watch Gift",
    categorySlug: "watches",
    subcategorySlug: "",
    shortDescription: "A classic watch that can be engraved and wrapped as a gift.",
    description:
      "A simple elegant watch gift. Customers can engrave text, initials, a special date, or a small image depending on the available placement.",
    price: 950,
    salePrice: null,
    stock: 10,
    serviceEligibility: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    engravingSettings: {
      allowText: true,
      allowImage: false,
      maxCharacters: 40,
      placements: ["Back case"],
      basePrice: 120,
      notes: "Short engraving is recommended for watches."
    },
    tags: ["watch", "men", "women", "engraving"],
    occasions: ["Birthday", "Graduation", "Wedding"],
    badges: ["Engravable"],
    isFeatured: true,
    isBestSeller: false
  },
  {
    name: "Personalized Metal Bracelet",
    categorySlug: "accessories",
    subcategorySlug: "women-accessories",
    shortDescription: "A metal bracelet with optional laser engraving.",
    description:
      "A personalized bracelet gift for names, initials, short quotes, or dates. Can be wrapped with premium gift finishing.",
    price: 350,
    salePrice: null,
    stock: 20,
    serviceEligibility: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    engravingSettings: {
      allowText: true,
      allowImage: false,
      maxCharacters: 35,
      placements: ["Bracelet plate"],
      basePrice: 100,
      notes: "Short names and initials work best."
    },
    tags: ["bracelet", "accessory", "engraving"],
    occasions: ["Birthday", "Valentine’s", "Graduation"],
    badges: ["Personalized"],
    isFeatured: true,
    isBestSeller: true
  },
  {
    name: "Birthday Balloon Bundle",
    categorySlug: "balloons",
    subcategorySlug: "birthday-balloons",
    shortDescription: "A birthday balloon bundle for celebration setups.",
    description:
      "A cheerful balloon bundle for birthdays. Can be combined with gift boxes, teddy bears, chocolates, and custom wrapping.",
    price: 450,
    salePrice: null,
    stock: 15,
    serviceEligibility: {
      engraving: false,
      wrapping: true,
      photoPrinting: false
    },
    tags: ["balloons", "birthday", "celebration"],
    occasions: ["Birthday"],
    badges: ["Party Ready"],
    isFeatured: true,
    isBestSeller: false
  },
  {
    name: "10x15 Photo Print Pack",
    categorySlug: "photo-printing",
    subcategorySlug: "10x15-photo-print",
    shortDescription: "Print personal memories and add them to your gift.",
    description:
      "A photo printing pack for customers who want to add real memories to their gift. Perfect with boxes, frames, and personalized gift setups.",
    price: 90,
    salePrice: null,
    stock: 100,
    serviceEligibility: {
      engraving: false,
      wrapping: true,
      photoPrinting: true
    },
    tags: ["photo printing", "memories", "custom"],
    occasions: ["Birthday", "Wedding", "Graduation", "Valentine’s"],
    badges: ["Custom"],
    isFeatured: true,
    isBestSeller: false
  },
  {
    name: "Corporate Trophy Cup",
    categorySlug: "trophies",
    subcategorySlug: "cups",
    shortDescription: "A trophy cup with optional engraving for corporate events.",
    description:
      "A trophy cup for appreciation, competitions, companies, and live events. Customers can add names, dates, company names, or event titles.",
    price: 700,
    salePrice: null,
    stock: 7,
    serviceEligibility: {
      engraving: true,
      wrapping: true,
      photoPrinting: false
    },
    engravingSettings: {
      allowText: true,
      allowImage: true,
      maxCharacters: 80,
      placements: ["Front plate"],
      basePrice: 180,
      notes: "Company names and short award titles are supported."
    },
    tags: ["trophy", "corporate", "award"],
    occasions: ["Corporate Events", "Graduation"],
    badges: ["Corporate"],
    isFeatured: true,
    isBestSeller: false
  },
  {
    name: "Teddy Bear Gift",
    categorySlug: "teddy-bears",
    subcategorySlug: "",
    shortDescription: "A soft teddy bear gift that can be paired with wrapping.",
    description:
      "A soft teddy bear gift for birthdays, Valentine’s, baby shower, and romantic occasions. Can be combined with chocolates, balloons, flowers, and gift cards.",
    price: 300,
    salePrice: null,
    stock: 18,
    serviceEligibility: {
      engraving: false,
      wrapping: true,
      photoPrinting: false
    },
    tags: ["teddy bear", "soft gift", "romantic"],
    occasions: ["Birthday", "Valentine’s", "Baby Shower"],
    badges: ["Gift Favorite"],
    isFeatured: true,
    isBestSeller: true
  }
];

async function findCategoryBySlug(slug) {
  if (!slug) return null;

  return Category.findOne({
    slug,
    isActive: true
  }).select("_id name slug serviceDefaults");
}

async function seedProducts() {
  await connectDB();

  console.log("Seeding Tap & Wrap products...");

  let createdOrUpdated = 0;
  let skipped = 0;

  for (const item of products) {
    const category = await findCategoryBySlug(item.categorySlug);
    const subcategory = await findCategoryBySlug(item.subcategorySlug);

    if (!category) {
      console.log(`Skipped "${item.name}" because category was not found.`);
      skipped += 1;
      continue;
    }

    const slug = createSlug(item.name);

    await Product.findOneAndUpdate(
      { slug },
      {
        $set: {
          name: item.name,
          slug,
          sku: item.sku || "",
          shortDescription: item.shortDescription,
          description: item.description,
          price: item.price,
          salePrice: item.salePrice,
          stock: item.stock,
          category: category._id,
          subcategory: subcategory?._id || null,
          images: [],
          variants: [],
          serviceEligibility: item.serviceEligibility,
          engravingSettings: item.engravingSettings || {},
          tags: item.tags || [],
          occasions: item.occasions || [],
          badges: item.badges || [],
          isFeatured: Boolean(item.isFeatured),
          isBestSeller: Boolean(item.isBestSeller),
          isFlashSale: Boolean(item.isFlashSale),
          isActive: true,
          seoTitle: item.name,
          seoDescription: item.shortDescription
        }
      },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true
      }
    );

    createdOrUpdated += 1;
  }

  const total = await Product.countDocuments();

  console.log(`Done. Products created/updated: ${createdOrUpdated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total products in database: ${total}`);

  await mongoose.disconnect();
}

seedProducts().catch(async (error) => {
  console.error("Product seed failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});