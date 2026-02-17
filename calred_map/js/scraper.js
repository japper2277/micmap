const scraperService = {
  async fetchEvents() {
    try {
      const res = await fetch(CONFIG.apiPath);
      const data = await res.json();
      if (!data.success) throw new Error('API returned error');
      return data.events.map(e => this.processEvent(e));
    } catch (err) {
      console.error('Failed to fetch events:', err);
      return [];
    }
  },

  processEvent(raw) {
    const event = { ...raw };

    // Parse date/time from "Tue, Feb 17 at 7:00 PM"
    const whenMatch = raw.when.match(/(\w+),\s+(\w+)\s+(\d+)\s+at\s+(\d+):(\d+)\s*(AM|PM)/i);
    if (whenMatch) {
      const [, dayName, month, day, hour, min, ampm] = whenMatch;
      const year = new Date().getFullYear();
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthIdx = monthNames.indexOf(month);
      let h = parseInt(hour);
      if (ampm.toUpperCase() === 'PM' && h < 12) h += 12;
      if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
      event.startDate = new Date(year, monthIdx, parseInt(day), h, parseInt(min));
      event.timeStr = `${hour}:${min} ${ampm}`;
      event.dayName = dayName;
    } else {
      event.startDate = new Date();
      event.timeStr = raw.when;
      event.dayName = '';
    }

    // Parse cost
    if (raw.cost.includes('free') || raw.cost.includes('🌀') || raw.cost.toLowerCase().includes('free')) {
      event.isFree = true;
      event.priceDisplay = 'Free';
    } else {
      event.isFree = false;
      event.priceDisplay = raw.cost || 'See details';
    }

    // Parse categories into array
    event.categoryList = raw.categories
      ? raw.categories.split('/').map(c => c.trim()).filter(Boolean)
      : [];
    event.primaryCategory = raw.categories || 'default';

    // Extract neighborhood from "where" - look for patterns like "williamsburg, bklyn"
    const whereStr = raw.where || '';
    event.neighborhood = this.extractNeighborhood(whereStr);

    // Generate a stable ID
    event.id = this.hashString(raw.title + raw.when);

    return event;
  },

  extractNeighborhood(where) {
    const lower = where.toLowerCase();
    // Common neighborhood patterns in cal.red data
    const neighborhoods = [
      'bushwick', 'williamsburg', 'greenpoint', 'bed-stuy', 'bedstuy',
      'crown heights', 'park slope', 'prospect heights', 'gowanus',
      'ridgewood', 'astoria', 'jackson heights', 'lic', 'long island city',
      'lower east side', 'les', 'east village', 'west village', 'chinatown',
      'soho', 'noho', 'tribeca', 'chelsea', 'midtown', 'harlem',
      'alphabet city', 'loisaida', 'dumbo', 'downtown brooklyn',
      'fort greene', 'clinton hill', 'cobble hill', 'carroll gardens',
      'sunset park', 'bay ridge', 'flatbush', 'ditmas park'
    ];
    for (const n of neighborhoods) {
      if (lower.includes(n)) return n.charAt(0).toUpperCase() + n.slice(1);
    }
    // Try borough abbreviations
    if (lower.includes('bklyn') || lower.includes('brooklyn')) return 'Brooklyn';
    if (lower.includes('mnhtn') || lower.includes('manhattan')) return 'Manhattan';
    if (lower.includes('queens')) return 'Queens';
    if (lower.includes('bronx')) return 'Bronx';
    return '';
  },

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return 'evt_' + Math.abs(hash).toString(36);
  }
};
