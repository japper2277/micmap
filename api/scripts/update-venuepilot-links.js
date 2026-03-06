#!/usr/bin/env node

/**
 * Updates signup links for mics that use VenuePilot (e.g. Stand Up NY)
 * by querying the VenuePilot GraphQL API for the next upcoming event ID.
 *
 * Usage: node api/scripts/update-venuepilot-links.js
 */

const path = require('path');
const fs = require('fs');

const GRAPHQL_URL = 'https://www.venuepilot.co/graphql';

// Map of mic names (in mics.json) to their VenuePilot config
const VENUEPILOT_MICS = [
  {
    micName: "Let's Go Mental",
    accountId: 2535,
    vpEventName: "Let's Go Mental - Open Mic",
    baseUrl: 'https://standupny.com/upcoming-shows/#/events',
  },
  // Add more VenuePilot mics here as needed
];

async function fetchUpcomingEvents(accountId, eventName) {
  // VenuePilot paginates 100 per page, newest events on later pages
  // Search backwards from the last page to find current/future events
  const today = new Date().toISOString().split('T')[0];

  for (let page = 10; page >= 1; page--) {
    const query = `{ publicEvents(accountId: ${accountId}, page: ${page}) { id name date startTime } }`;

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    const events = data?.data?.publicEvents;
    if (!events || events.length === 0) continue;

    // Filter to matching event name and future dates
    const matches = events
      .filter(e => e.name === eventName && e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (matches.length > 0) {
      return matches[0]; // Return the next upcoming one
    }
  }

  return null;
}

async function main() {
  const micsPath = path.join(__dirname, '..', 'mics.json');
  const mics = JSON.parse(fs.readFileSync(micsPath, 'utf-8'));

  let updated = 0;

  for (const vpMic of VENUEPILOT_MICS) {
    const event = await fetchUpcomingEvents(vpMic.accountId, vpMic.vpEventName);

    if (!event) {
      console.log(`[SKIP] ${vpMic.micName}: no upcoming event found on VenuePilot`);
      continue;
    }

    const directUrl = `${vpMic.baseUrl}/${event.id}`;

    // Update all matching mics in mics.json
    for (const mic of mics) {
      if (mic.name === vpMic.micName) {
        const old = mic.signUpDetails;
        mic.signUpDetails = directUrl;
        if (old !== directUrl) {
          console.log(`[UPDATE] ${mic.name} (${mic.day}): ${old} -> ${directUrl} (${event.date})`);
          updated++;
        } else {
          console.log(`[OK] ${mic.name}: already up to date`);
        }
      }
    }
  }

  if (updated > 0) {
    fs.writeFileSync(micsPath, JSON.stringify(mics, null, 2) + '\n');
    console.log(`\nUpdated ${updated} mic(s) in mics.json`);
  } else {
    console.log('\nNo updates needed');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
