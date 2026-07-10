import slugify from "slugify";

export function createSlug(value) {
  return slugify(value || "", {
    lower: true,
    strict: true,
    trim: true
  });
}

export function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}