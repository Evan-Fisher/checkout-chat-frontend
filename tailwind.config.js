/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,tsx,ts}"],
  theme: {
    colors: {
      white: "#FFFFFF",
      green: "#258055",
      brightGreen: "#EBFF80",
      darkGreen: "#20493E",
      offWhite: "#FEFCF5",
      brownText: "#4E260D",
    },
    extend: {
      boxShadow: {
        "3xl": "0 4px 20px rgba(0, 0, 0, 0.3)",
      },
    },
  },
  plugins: [],
};
