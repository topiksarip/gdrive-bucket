/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: { 900: "#0b1020", 800: "#0f152b", 700: "#161d3a" },
        brand: { 500: "#6366f1", 400: "#818cf8" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 8px 30px -12px rgba(99,102,241,0.5)",
      },
      keyframes: {
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-100% - 1rem))" },
        },
      },
      animation: {
        marquee: "marquee 24s linear infinite",
      },
    },
  },
  plugins: [],
};
