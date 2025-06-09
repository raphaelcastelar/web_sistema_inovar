// tailwind.config.js

const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // A propriedade 'content' diz ao Tailwind para escanear todos os arquivos
  
  darkMode: 'class',
  // dentro de 'src' em busca de classes para gerar o CSS.
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      // Sua configuração de fonte está correta e foi mantida.
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};