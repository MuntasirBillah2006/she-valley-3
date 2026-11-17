export const DESIGN_TOKENS = {
  colors: {
    canvas: {
      warmIvory: {hex: '#F7F1EB', role: 'Primary page background (60% canvas)'},
      ivoryElevated: {hex: '#FBF8F5', role: 'Card, modal, and input surface (30% surface)'},
      ivoryMuted: {hex: '#EFE6DD', role: 'Subtle secondary panel & skeleton surface'},
    },
    brand: {
      burgundy: {hex: '#6E1F35', role: 'Primary CTA, active navigation, focus rings (10% accent)'},
      burgundyHover: {hex: '#58172A', role: 'Primary interactive hover state'},
      mutedRose: {hex: '#B87A88', role: 'Secondary editorial accent'},
      dustyNude: {hex: '#DEC8BF', role: 'Warm divider / subtle highlight'},
    },
    ink: {
      charcoal: {hex: '#252225', role: 'Primary headings and body copy'},
      charcoalMuted: {hex: '#575056', role: 'Secondary labels, hints, metadata'},
      borderHairline: {hex: '#E4D8CE', role: '1px structural borders & table rules'},
    },
    semantic: {
      success: {fg: '#1F5E43', bg: '#ECF5F0'},
      warning: {fg: '#8A5314', bg: '#FBF3E7'},
      error: {fg: '#991B2E', bg: '#FCECEF'},
      info: {fg: '#3B4254', bg: '#EFF1F5'},
    },
  },
  typography: {
    displayFont: 'Cormorant Garamond + Noto Sans Bengali',
    bodyFont: 'Plus Jakarta Sans + Noto Sans Bengali',
    monoFont: 'JetBrains Mono',
    scale: {
      hero: 'clamp(2.25rem, 4vw, 3.5rem)',
      h2: 'clamp(1.625rem, 2.5vw, 2.25rem)',
      h3: '1.25rem',
      body: '1rem',
      small: '0.875rem',
      caption: '0.75rem',
    },
  },
  spacing: {
    containerMax: '1200px',
    sectionY: 'clamp(3rem, 6vw, 5rem)',
    cardPadding: '1.5rem',
    touchTargetMin: '44px',
  },
  radii: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} as const;
