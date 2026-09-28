#!/usr/bin/env node

/**
 * Generate the small runtime config consumed by the static MicFinder frontend.
 *
 * Netlify environment variables are available during the build, not directly
 * in browser JavaScript. CARTO's basemap key is intentionally public, so it is
 * emitted into the deployed static asset; it is never stored in the repository.
 */

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const publishDir = path.join(projectRoot, 'map_designs', 'newest_map');
const runtimeConfigPath = path.join(publishDir, 'js', 'runtime-config.js');
const cartoPublicToken = String(process.env.CARTO_PUBLIC_TOKEN || '').trim();

const runtimeConfig = {
    cartoPublicToken
};

fs.writeFileSync(
    runtimeConfigPath,
    `window.MICFINDER_RUNTIME_CONFIG = ${JSON.stringify(runtimeConfig)};\n`,
    'utf8'
);

if (cartoPublicToken) {
    console.log('Netlify build: CARTO public token configured.');
} else {
    console.warn('Netlify build: CARTO_PUBLIC_TOKEN is not set; CARTO will show its API-key watermark.');
}
