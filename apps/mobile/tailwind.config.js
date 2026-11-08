/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        cotto: {
          accent: "#D96A3E",
          dark: "#2B1D14",
        },
        // Matches the scalloped awning strip on cottomarket.com (same hex
        // values, read off the site's repeating-gradient CSS).
        awning: {
          red: "#8B1A1A",
          cream: "#F5E6C8",
          brown: "#5C3317",
        },
      },
    },
  },
  plugins: [],
};
