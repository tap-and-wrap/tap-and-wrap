import {
  BadgePercent,
  Balloon,
  Camera,
  Gift,
  Heart,
  Package,
  Sparkles,
  Trophy,
  Wand2,
  Watch
} from "lucide-react";

export const mainCategories = [
  {
    name: "Wrapped Gifts",
    description: "Ready-made gifts wrapped beautifully for every occasion.",
    icon: Gift
  },
  {
    name: "Perfumes & Cosmetics",
    description: "Fragrances, sets, and beauty gifts with optional engraving.",
    icon: Sparkles
  },
  {
    name: "Watches",
    description: "Elegant watches that can be engraved and wrapped.",
    icon: Watch
  },
  {
    name: "Accessories",
    description: "Personal gifts for men and women with premium add-ons.",
    icon: Heart
  },
  {
    name: "Balloons",
    description: "Birthday, graduation, baby shower, and celebration balloons.",
    icon: Balloon
  },
  {
    name: "Photo Printing",
    description: "Print memories in different sizes and add them to gifts.",
    icon: Camera
  },
  {
    name: "Trophies",
    description: "Medals, cups, trophies, and corporate appreciation gifts.",
    icon: Trophy
  },
  {
    name: "Flash Sale",
    description: "Limited offers, bundles, discounts, and seasonal deals.",
    icon: BadgePercent
  }
];

export const services = [
  {
    title: "Laser Engraving",
    description:
      "Engrave names, text, logos, or images on eligible products like watches, perfumes, wallets, bracelets, necklaces, medals, and stationery.",
    icon: Wand2
  },
  {
    title: "Gift Wrapping",
    description:
      "Choose the box color, ribbon color, fillers, gift card, text on box, and extra finishing details for any product.",
    icon: Package
  },
  {
    title: "Custom Gift Request",
    description:
      "Customers can send their own product, optional image, and request engraving, wrapping, or photo printing as a service.",
    icon: Gift
  }
];

export const occasionTags = [
  "Birthday",
  "Wedding",
  "Graduation",
  "Baby Shower",
  "Valentine’s",
  "Ramadan",
  "Christmas",
  "Corporate Events"
];

export const steps = [
  {
    number: "01",
    title: "Choose the gift",
    text: "Shop by product, occasion, or service."
  },
  {
    number: "02",
    title: "Personalize it",
    text: "Add engraving, wrapping, gift cards, fillers, or photo printing."
  },
  {
    number: "03",
    title: "Confirm payment",
    text: "Pay by card, InstaPay, Vodafone Cash, or cash on delivery."
  },
  {
    number: "04",
    title: "We deliver it",
    text: "Cairo & Giza delivery is 80 EGP. Other areas are 120 EGP."
  }
];