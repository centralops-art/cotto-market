import { z } from "zod";

export const ALLERGENS = [
  "peanuts",
  "tree_nuts",
  "dairy",
  "eggs",
  "soy",
  "wheat_gluten",
  "fish",
  "shellfish",
  "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const ALLERGEN_LABELS: Record<Allergen, string> = {
  peanuts: "Peanuts",
  tree_nuts: "Tree nuts",
  dairy: "Dairy",
  eggs: "Eggs",
  soy: "Soy",
  wheat_gluten: "Wheat/Gluten",
  fish: "Fish",
  shellfish: "Shellfish",
  sesame: "Sesame",
};

export const LAYOUT_STYLES = ["compact_list", "detail_list", "image_grid", "detail_grid"] as const;
export type LayoutStyle = (typeof LAYOUT_STYLES)[number];

export const LAYOUT_STYLE_LABELS: Record<LayoutStyle, string> = {
  compact_list: "Compact list",
  detail_list: "Detail list",
  image_grid: "Image grid",
  detail_grid: "Detail grid",
};

export const THEME_PRESETS = [
  { name: "Cotto Classic", primary: "#2B1D14", accent: "#D96A3E" },
  { name: "Fresh Market", primary: "#1B3A2B", accent: "#5FA777" },
  { name: "Bakery Blush", primary: "#3A1F2B", accent: "#E88BA1" },
] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const themePaletteSchema = z.object({
  primary: z.string().regex(HEX_COLOR_PATTERN, "Use a hex color like #2B1D14"),
  accent: z.string().regex(HEX_COLOR_PATTERN, "Use a hex color like #D96A3E"),
});
export type ThemePalette = z.infer<typeof themePaletteSchema>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const dayHoursSchema = z.object({
  closed: z.boolean(),
  open: z.string().regex(TIME_PATTERN, "Use HH:MM (24hr)"),
  close: z.string().regex(TIME_PATTERN, "Use HH:MM (24hr)"),
});
export type DayHours = z.infer<typeof dayHoursSchema>;

export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const weekHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});
export type WeekHours = z.infer<typeof weekHoursSchema>;

export function defaultWeekHours(): WeekHours {
  const day: DayHours = { closed: false, open: "09:00", close: "17:00" };
  return {
    monday: { ...day },
    tuesday: { ...day },
    wednesday: { ...day },
    thursday: { ...day },
    friday: { ...day },
    saturday: { ...day },
    sunday: { ...day, closed: true },
  };
}

export const storefrontBasicsSchema = z.object({
  storefrontName: z.string().trim().min(1, "Storefront name is required"),
  tagline: z.string().trim().max(140).optional().or(z.literal("")),
});
export type StorefrontBasicsInput = z.infer<typeof storefrontBasicsSchema>;

export const teamMemberSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required"),
  roleTitle: z.string().trim().max(60).optional().or(z.literal("")),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
});
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;

export const menuCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required"),
});
export type MenuCategoryInput = z.infer<typeof menuCategorySchema>;

export const menuItemSchema = z.object({
  name: z.string().trim().min(1, "Item name is required"),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  ingredients: z.string().trim().max(500).optional().or(z.literal("")),
  priceCents: z.coerce.number().int().min(0, "Price can't be negative"),
  allergens: z.array(z.enum(ALLERGENS)),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;
