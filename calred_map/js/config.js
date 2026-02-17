const CONFIG = {
  apiBase: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3001'
    : 'https://micmap-production.up.railway.app',
  get apiPath() { return `${this.apiBase}/api/proxy/calred`; },
  get geocodePath() { return `${this.apiBase}/api/proxy/here/geocode`; },
  mapCenter: [40.72, -74.00],
  mapZoom: 13,
  mobileMapZoom: 12,

  categoryColors: {
    'music / sound': '#ff6b4a',
    'image / performance': '#9b5de5',
    'political action': '#0077b6',
    'mutual aid / community': '#2a9d8f',
    'literary / research': '#e9c46a',
    'default': '#6c757d'
  },

  categoryIcons: {
    'music / sound': '🎵',
    'image / performance': '🎭',
    'political action': '✊',
    'mutual aid / community': '🤝',
    'literary / research': '📖',
    'default': '📌'
  },

  // Accessible labels for emoji icons (screen readers)
  categoryLabels: {
    'music / sound': 'Music',
    'image / performance': 'Performance',
    'political action': 'Political',
    'mutual aid / community': 'Community',
    'literary / research': 'Literary',
    'default': 'Event'
  }
};
