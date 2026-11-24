const MAX_SIZE = 10;
const MIN_SIZE = 7.5;

// "Deliveries", the longest label, is about 5.5x its font size wide in bold;
// 0.175 of one tab's width leaves room for it plus the gap between tabs.
const SIZE_PER_TAB_WIDTH = 0.175;

/** Bottom-tab label size that keeps every label on one line. Matters on
 * iPhones with Display Zoom set to Larger Text: the screen is only 320pt wide,
 * so a cook who also delivers gets seven tabs of about 46pt each. */
export function tabLabelSize(screenWidth: number, visibleTabs: number): number {
  const size = (screenWidth / Math.max(visibleTabs, 1)) * SIZE_PER_TAB_WIDTH;
  return Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) * 10) / 10;
}
