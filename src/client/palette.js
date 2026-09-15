export const palette = {
  '--dsw-alias-bg-base': 'transparent',
  '--dsw-alias-bg-layer-1': '#101e2b',
  '--dsw-alias-bg-layer-2': '#162735',
  '--dsw-alias-bg-layer-3': '#213646',
  '--dsw-alias-bg-overlay': '#101c29',
  '--dsw-alias-border-l1': '#263c4b',
  '--dsw-alias-border-l2': '#365363',
  '--dsw-alias-border-l2-darkmode-thin': '#365363',
  '--dsw-alias-border-l3': '#477079',
  '--dsw-alias-brand-primary': '#72e6db',
  '--dsw-alias-brand-text': '#c0fff4',
  '--dsw-alias-button-elevated-fill': '#203541',
  '--dsw-alias-button-floating-fill': '#233d4a',
  '--dsw-alias-button-floating-hover': '#305563',
  '--dsw-alias-button-info-fill': '#74e0d6',
  '--dsw-alias-button-info-hover': '#a5f2e6',
  '--dsw-alias-interactive-bg-active': '#224e56',
  '--dsw-alias-interactive-bg-hover': '#243e4c',
  '--dsw-alias-interactive-bg-hover-solid': '#243e4c',
  '--dsw-alias-label-primary': '#e5edf1',
  '--dsw-alias-label-primary-bluish': '#d6e8f4',
  '--dsw-alias-label-secondary': '#adc0cc',
  '--dsw-alias-label-tertiary': '#94aab8',
  '--dsw-alias-label-caption': '#8da5b4',
  '--dsw-alias-state-business-primary': '#8cece0',
  '--dsw-alias-state-business-tertiary': '#254950',
  '--dsw-alias-markdown-code-block': '#08131d',
  '--dsw-specific-input-major': '#122432',
  '--dsw-specific-selector': '#213d4d',
  '--dsw-specific-sidebar-fill': 'transparent',

  // The cockpit paints dark surfaces in both modes, so every token the official
  // theme resolves differently for light mode must be pinned here. Otherwise a
  // light-mode visitor gets near-white markdown chips and light text on them
  // (unreadable), or pale panels floating on the dark hull.
  // Markdown surfaces: inline code was the reported unreadable case.
  '--dsw-alias-markdown-inline-code': '#22384a',
  '--dsw-alias-markdown-code-block-banner': '#1b2f3f',
  '--dsw-alias-markdown-code-segment-selected': '#2c4c5e',
  '--dsw-alias-markdown-code-segment-unselected': '#0d1b26',
  '--dsw-alias-markdown-citation': '#22384a',
  '--dsw-alias-markdown-placeholder': '#22384a',
  '--dsw-alias-markdown-tag': '#26404f',
  // Remaining mode-sensitive surfaces.
  '--dsw-alias-bg-module-platform': '#182c3a',
  '--dsw-alias-bg-multi-select': '#1e3543',
  '--dsw-alias-button-ghost-active-fill': '#24404f',
  '--dsw-alias-button-ghost-active-hover': '#2a4a5a',
  '--dsw-alias-button-ghost-active-border': '#3f6373',
  '--dsw-alias-button-primary-dimmed': '#1f3947',
  '--dsw-alias-button-primary-hover': '#8feee2',
  '--dsw-alias-button-contrast-fill': '#e6f2f6',
  '--dsw-alias-brand-primary-invert': '#e9f7f8',
  // Text tones, matched to the official dark-mode intent.
  '--dsw-alias-label-dimmed': '#5b7484',
  '--dsw-alias-label-primary-dimmed': '#c8d8e0',
  '--dsw-alias-label-primary-foreground': '#08131d',
  '--dsw-alias-label-primary-inverted': '#101d28',
  '--dsw-alias-scrollbar-bg-l1': '#1d3542',
  '--dsw-alias-scrollbar-bg-l2': '#223d4c',
  '--dsw-alias-scrollbar-hover-l1': '#2b4c5c',
  '--dsw-alias-scrollbar-hover-l2': '#33606f',
  '--dsw-alias-state-error-primary': '#f25a5a',
  '--dsw-alias-state-success-tertiary': '#16302a',
  '--dsw-alias-state-warn-tertiary': '#332a1c',
  '--dsw-alias-toast-bg': '#1b3241',
  '--dsw-alias-tooltip-bg': '#1f3a4a',
  // Native surfaces that the official theme also resolves per mode. Pinned to
  // their dark-mode intent so a light-mode visitor never gets a pale bubble,
  // pale sidebar hover or a white dropdown mask over the cockpit.
  '--dsw-specific-bubble': '#1b3141',
  '--dsw-specific-bubble-highlight': '#24404f',
  '--dsw-specific-sidebar-nav-item-active': '#22404f',
  '--dsw-specific-sidebar-nav-item-active-accent': '#1d3644',
  '--dsw-specific-sidebar-nav-item-hover': '#1b3141',
  '--dsw-specific-tip': '#1d3644',
  '--dsw-specific-login-input': '#0f1d29',
  '--dsw-alias-border-l4': 'rgba(255, 255, 255, 0.2)',
  '--dsw-alias-bg-skeleton': 'rgba(255, 255, 255, 0.08)',
  '--dsw-alias-bg-mask-1': 'rgba(0, 0, 0, 0.5)',
  '--dsw-alias-bg-mask-2': 'rgba(0, 0, 0, 0.2)',
  '--dsw-alias-bg-mask-drop': 'rgba(16, 28, 41, 0.7)',
  '--dsw-alias-border-inverted': 'rgba(255, 255, 255, 0.06)',
  '--dsw-alias-border-inverted2': 'rgba(255, 255, 255, 0.08)',
  '--dsw-alias-interactive-bg-hover-accent': 'rgba(255, 255, 255, 0.24)',
  '--dsw-alias-interactive-bg-hover-danger': 'rgba(242, 90, 90, 0.15)',
  // Tokens the theme studio can also override. Pinned so the studio's own
  // derived palette can never repaint the cockpit in a light scheme.
  '--dsw-alias-bg-mask-3': 'rgba(0, 0, 0, 0.48)',
  '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',
  '--dsw-alias-brand-primary-new-colorprimary-new-color': '#72e6db',
  '--dsw-alias-button-primary-fill': '#72e6db',
  '--dsw-specific-menu': '#213646',
  // Fade masks for the reasoning stream; light mode defines them as a pure
  // white gradient, which would wash the reasoning text out over the cockpit.
  '--dsw-linear-gradient-think': 'linear-gradient(180deg, #0d1a25 20.19%, rgba(13, 26, 37, 0) 100%)',
  '--dsw-linear-think-select': 'linear-gradient(180deg, #16283a 20.19%, rgba(22, 40, 58, 0) 100%)',
};

export function themeTokens() {
  return Object.fromEntries(Object.entries(palette).map(([key,value]) => [key,{light:value,dark:value}]));
}
