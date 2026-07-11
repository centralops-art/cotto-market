import { z } from "zod";

export const VENDOR_TYPES = ["home_cook", "farmers_market", "pop_up", "food_truck"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  home_cook: "Home cook",
  farmers_market: "Farmers market stallholder",
  pop_up: "Pop-up",
  food_truck: "Food truck",
};

export const businessBasicsSchema = z.object({
  storefrontName: z.string().trim().min(1, "Storefront name is required"),
  tagline: z.string().trim().max(140).optional().or(z.literal("")),
  vendorTypes: z.array(z.enum(VENDOR_TYPES)).min(1, "Choose at least one vendor type"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9()\-.\s]{7,20}$/, "Enter a valid phone number"),
  email: z.string().trim().toLowerCase().email(),
});
export type BusinessBasicsInput = z.infer<typeof businessBasicsSchema>;

export const serviceAddressSchema = z.object({
  addressLine1: z.string().trim().min(1, "Street address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().trim().length(2, "Use a 2-letter state code"),
  zip: z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP"),
});
export type ServiceAddressInput = z.infer<typeof serviceAddressSchema>;

export const cfpmCertSchema = z.object({
  cfpmCertExpiresOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});
export type CfpmCertInput = z.infer<typeof cfpmCertSchema>;

export const cottageFoodAgreementSchema = z.object({
  agreed: z.boolean().refine((v) => v === true, "You must accept the cottage food law agreement to continue"),
});
export type CottageFoodAgreementInput = z.infer<typeof cottageFoodAgreementSchema>;
