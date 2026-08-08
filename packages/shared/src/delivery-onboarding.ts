import { z } from "zod";

export const VEHICLE_TYPES = ["sedan", "suv", "truck", "bike", "ebike", "scooter", "on_foot"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  sedan: "Sedan",
  suv: "SUV",
  truck: "Truck",
  bike: "Bike",
  ebike: "E-bike",
  scooter: "Scooter",
  on_foot: "On foot",
};

export const DELIVERY_RADIUS_OPTIONS = [3, 5, 10, 15] as const;
export type DeliveryRadiusMiles = (typeof DELIVERY_RADIUS_OPTIONS)[number];

export const licenseSchema = z.object({
  driversLicenseExpiresOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});
export type LicenseInput = z.infer<typeof licenseSchema>;

export const vehicleTypeSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
});
export type VehicleTypeInput = z.infer<typeof vehicleTypeSchema>;

export const insuranceAttestationSchema = z.object({
  attested: z.boolean().refine((v) => v === true, "You must attest to insurance coverage to continue"),
});
export type InsuranceAttestationInput = z.infer<typeof insuranceAttestationSchema>;

export const deliveryAgreementSchema = z.object({
  agreed: z.boolean().refine((v) => v === true, "You must accept the Cotto Delivery Partner Agreement to continue"),
});
export type DeliveryAgreementInput = z.infer<typeof deliveryAgreementSchema>;

export const radiusSchema = z.object({
  defaultRadiusMiles: z.union([z.literal(3), z.literal(5), z.literal(10), z.literal(15)]),
});
export type RadiusInput = z.infer<typeof radiusSchema>;

export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface AvailabilityWindow {
  start: string; // "HH:mm", 24h local
  end: string; // "HH:mm", 24h local
}

export type Availability = Partial<Record<DayOfWeek, AvailabilityWindow[]>>;

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};
