import { initStripe } from "@stripe/stripe-react-native";

export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const STRIPE_MERCHANT_IDENTIFIER = "merchant.market.cotto.app";

/**
 * Points the Stripe SDK at a cook's connected account (Direct charges,
 * HANDOFF.md §39) or, with no argument, back at Cotto's platform account.
 * PaymentSheet and handleNextAction act on whichever account was set last,
 * so every screen that switches to a cook's account must switch back.
 */
export async function setStripeAccount(stripeAccountId?: string): Promise<void> {
  await initStripe({
    publishableKey: STRIPE_PUBLISHABLE_KEY,
    merchantIdentifier: STRIPE_MERCHANT_IDENTIFIER,
    stripeAccountId,
  });
}
