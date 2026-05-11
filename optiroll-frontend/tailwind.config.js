/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff', 100: '#e0e9ff', 500: '#4f6af6', 600: '#3d56e3', 700: '#2f45c7', 900: '#1a2560',
        },
        surface: {
          0: '#ffffff', 50: '#f8f9fc', 100: '#f1f3f9', 200: '#e2e6f0', 300: '#cdd3e1',
          400: '#9aa3b8', 500: '#6b7288', 600: '#4a5068', 700: '#2d3348', 800: '#1a1f2e', 900: '#0f131f',
        }
      }
    },
  },
  plugins: [],
}
