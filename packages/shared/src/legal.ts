// Single source of truth for the Terms & Conditions / Privacy Policy URLs --
// referenced from multiple screens (sign-up, complete-profile, vendor
// onboarding business basics) that each need tappable links as part of the
// inline SMS consent disclosures required by Twilio's A2P 10DLC campaign
// review. Keeping these in one place avoids drift/typos across screens,
// which matters here specifically since Twilio checks these exact URLs.
export const TERMS_URL = "https://cottomarket.com/terms-and-conditions";
export const PRIVACY_URL = "https://cottomarket.com/privacy-policy";
