 /** @type {import('tailwindcss').Config} */
 export default {
  // "class" strategy: dark mode is controlled by adding/removing a `dark` class on <html>,
  // not by the OS-level prefers-color-scheme media query. This is what makes a manual light/dark
  // toggle possible — with the default "media" strategy, the user's OS setting would be the only
  // thing that decides, no in-app switch.
  darkMode: "class",
  content: ["./views/**/*.ejs"],
  theme: {
    extend: {
      fontFamily: {
        // Inter instead of the default system font stack — closer to the clean, slightly
        // rounded sans-serif look Discord/Slack/WhatsApp all converge on. Falls back to the
        // normal system stack if the Google Fonts request ever fails (slow network, blocked CDN).
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
