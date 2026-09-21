/**
 * Merge this into the host ACEAPT app's tailwind.config.js `theme.extend`.
 * Not a standalone config — Feature 51's frontend components assume these
 * tokens exist (bg-paper, text-ink, border-rule, text-accent, etc.).
 */
module.exports = {
  colors: {
    paper: "#F0F2EE",
    "paper-raised": "#E7EAE4",
    ink: "#161B22",
    "ink-soft": "#4B5259",
    rule: "#C9CCC4",
    accent: "#2451B3",
    "accent-soft": "#E4EBFA",
    calibrated: "#3B7A5A",
    "calibrated-soft": "#E3EDE7",
    attention: "#B5651D",
    "attention-soft": "#F6E9DB",
    regressed: "#8C2F39",
    "regressed-soft": "#F3E1E3"
  },
  fontFamily: {
    sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
    mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"]
  }
};
