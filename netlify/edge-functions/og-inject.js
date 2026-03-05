const API_BASE = 'https://micmap-production.up.railway.app';

export default async function handler(request, context) {
  const url = new URL(request.url);
  const micId = url.searchParams.get('mic');

  // No ?mic= param — passthrough
  if (!micId) {
    return context.next();
  }

  // Fetch the origin HTML
  const response = await context.next();
  const html = await response.text();

  // Fetch mic data with timeout
  let mic = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/v1/mics/${micId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      mic = data.mic;
    }
  } catch {
    // Timeout or network error — fall through to default tags
  }

  // Build OG tags
  let ogBlock;
  if (mic) {
    const title = `${mic.name} – ${mic.day} ${mic.startTime}`;
    const venue = mic.venueName || mic.name;
    const cost = mic.cost === '$0' || mic.cost === 'Free' ? 'Free' : mic.cost;
    const desc = `${venue} · ${mic.neighborhood || mic.borough} · ${cost} · ${mic.stageTime || ''}`.replace(/ · $/, '');
    const ogImage = 'https://micfinder.io/images/og-default.png';

    ogBlock = `<!-- OG_TAGS_START -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="https://micfinder.io/?mic=${micId}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${ogImage}" />
    <!-- OG_TAGS_END -->`;
  } else {
    // Default fallback — keep existing tags
    return new Response(html, response);
  }

  const injected = html.replace(
    /<!-- OG_TAGS_START -->[\s\S]*?<!-- OG_TAGS_END -->/,
    ogBlock
  );

  return new Response(injected, response);
}

function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export const config = { path: '/' };
