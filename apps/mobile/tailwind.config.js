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
      },
    },
  },
  plugins: [],
};
