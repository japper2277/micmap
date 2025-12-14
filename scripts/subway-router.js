/**
 * SUBWAY ROUTER
 * -------------
 * Dijkstra-based pathfinding for NYC subway using pre-built GTFS graph.
 *
 * Usage:
 *   const router = require('./subway-router');
 *   const routes = router.findTopRoutes(userLat, userLng, venueLat, venueLng, 3);
 */

const fs = require('fs');
const path = require('path');

// --- OSRM WALKING API ---
const OSRM_FOOT_API = 'http://localhost:5001/route/v1/foot';

// Cache for OSRM walking times (key: "lat1,lng1|lat2,lng2" -> { mins, meters })
const walkingCache = new Map();

/**
 * Get accurate walking time from OSRM (with caching)
 * @returns {{ mins: number, meters: number, miles: number }} or null on error
 */
async function getOSRMWalkingTime(fromLat, fromLng, toLat, toLng) {
    // Round to 4 decimals for cache key (~11m precision)
    const cacheKey = `${fromLat.toFixed(4)},${fromLng.toFixed(4)}|${toLat.toFixed(4)},${toLng.toFixed(4)}`;

    if (walkingCache.has(cacheKey)) {
        return walkingCache.get(cacheKey);
    }

    try {
        const url = `${OSRM_FOOT_API}/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.routes && data.routes.length > 0) {
            const result = {
                mins: Math.round(data.routes[0].duration / 60),
                meters: Math.round(data.routes[0].distance),
                miles: Math.round(data.routes[0].distance / 1609.34 * 100) / 100
            };
            walkingCache.set(cacheKey, result);
            return result;
        }
        return null;
    } catch (e) {
        // OSRM unavailable - return null (caller will use Haversine fallback)
        return null;
    }
}

// Haversine fallback for walking time (when OSRM unavailable)
function estimateWalkingTime(distanceMiles) {
    const WALK_SPEED = 24; // minutes per mile (2.5 mph)
    return Math.round(distanceMiles * WALK_SPEED);
}

// --- LOAD DATA ---
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// Load unified graph at startup (cached in memory)
// Real-time MTA data filters which routes are actually running
let graph = null;
let stations = null;

function loadData() {
    if (!graph) {
        graph = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'graph.json')));
    }
    if (!stations) {
        stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json')));
    }
}

function getGraph() {
    loadData();
    return graph;
}

function getStations() {
    loadData();
    return stations;
}

// Check if a line serves a station (by checking station nodes)
function lineServesStation(line, stationId) {
    const stationData = getStations()[stationId];
    if (!stationData || !stationData.nodes) return false;
    return stationData.nodes.some(node => {
        const nodeLine = node.split('_')[1];
        return nodeLine === line || nodeLine === line.replace('X', '') || nodeLine + 'X' === line;
    });
}

// --- HAVERSINE DISTANCE ---
function haversine(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- FIND STATIONS WITHIN RADIUS ---
function findStationsWithinRadius(lat, lng, radiusMiles = 0.5) {
    const stationList = getStations();
    const results = [];

    for (const [id, station] of Object.entries(stationList)) {
        if (!station.lat || !station.lng || !station.nodes || station.nodes.length === 0) continue;
        const distance = haversine(lat, lng, station.lat, station.lng);
        if (distance <= radiusMiles) {
            results.push({
                id,
                name: station.name,
                lat: station.lat,
                lng: station.lng,
                nodes: station.nodes,
                distance
            });
        }
    }

    return results.sort((a, b) => a.distance - b.distance);
}

// --- DIJKSTRA'S ALGORITHM ---
/**
 * Dijkstra that finds ALL reachable destinations and their paths
 * Caller can then calculate total time (subway + walk) for each
 */
function dijkstraAllDests(startNodes, endNodes, graph, maxTime = 7200) {
    const dist = {};
    const prev = {};
    const visited = new Set();
    const results = [];
    const foundDests = new Set();
    const queue = [];

    for (const node of startNodes) {
        if (graph[node]) {
            dist[node] = 0;
            prev[node] = null;
            queue.push({ node, d: 0 });
        }
    }

    while (queue.length > 0) {
        queue.sort((a, b) => a.d - b.d);
        const { node: u, d } = queue.shift();

        if (visited.has(u)) continue;
        if (d > maxTime) break;
        visited.add(u);

        // Record destination but keep searching for others
        if (endNodes.has(u) && !foundDests.has(u)) {
            foundDests.add(u);
            const path = [];
            let curr = u;
            while (curr !== null) {
                path.unshift(curr);
                curr = prev[curr];
            }
            results.push({ time: d, path, endNode: u });
        }

        const edges = graph[u] || [];
        for (const edge of edges) {
            if (visited.has(edge.to)) continue;
            const newDist = d + edge.time;
            if (dist[edge.to] === undefined || newDist < dist[edge.to]) {
                dist[edge.to] = newDist;
                prev[edge.to] = u;
                queue.push({ node: edge.to, d: newDist });
            }
        }
    }

    return results;
}

// --- EXTRACT STATION INFO FROM NODE ---
function getStationFromNode(nodeId) {
    const stopId = nodeId.split('_')[0]; // "127N" from "127N_1"
    const stationList = getStations();

    // Find parent station
    for (const [parentId, station] of Object.entries(stationList)) {
        if (station.nodes && station.nodes.includes(nodeId)) {
            return { id: parentId, name: station.name, lat: station.lat, lng: station.lng };
        }
    }

    // Fallback: try to match by stop ID prefix
    const parentId = stopId.replace(/[NS]$/, ''); // Remove N/S suffix
    if (stationList[parentId]) {
        return { id: parentId, name: stationList[parentId].name, lat: stationList[parentId].lat, lng: stationList[parentId].lng };
    }

    return { id: stopId, name: stopId, lat: null, lng: null };
}

function getLineFromNode(nodeId) {
    return nodeId.split('_')[1] || null;
}

// --- FORMAT PATH INTO LEGS ---
function formatLegs(path, graph) {
    if (!path || path.length < 2) return [];

    const legs = [];
    let i = 0;

    while (i < path.length - 1) {
        const currentNode = path[i];
        const currentLine = getLineFromNode(currentNode);
        const currentStation = getStationFromNode(currentNode);

        // Look ahead to find where we transfer or end
        let j = i + 1;
        while (j < path.length) {
            const nextLine = getLineFromNode(path[j]);
            if (nextLine !== currentLine) break;
            j++;
        }

        // Calculate time for this leg
        let legTime = 0;
        for (let k = i; k < j - 1; k++) {
            const edges = graph[path[k]] || [];
            const edge = edges.find(e => e.to === path[k + 1]);
            if (edge) legTime += edge.time;
        }

        const endStation = getStationFromNode(path[j - 1]);
        const numStops = j - i - 1;

        // Only add as ride if we actually traveled (more than 0 stops)
        // Skip phantom "rides" that are just transfer waypoints
        if (numStops > 0) {
            legs.push({
                type: 'ride',
                line: currentLine,
                from: currentStation.name,
                fromId: currentStation.id,
                to: endStation.name,
                toId: endStation.id,
                time: Math.round(legTime / 60),
                stops: numStops
            });
        }

        // Check if there's a transfer after this segment
        if (j < path.length) {
            const transferFrom = path[j - 1];
            const transferTo = path[j];
            const fromLine = getLineFromNode(transferFrom);
            const toLine = getLineFromNode(transferTo);

            if (fromLine !== toLine) {
                const edges = graph[transferFrom] || [];
                const transferEdge = edges.find(e => e.to === transferTo);
                const transferTime = transferEdge ? transferEdge.time : 120;

                // Get the station where transfer happens
                const transferStation = getStationFromNode(transferFrom);

                // If last leg was a ride, use its destination as transfer point
                // If last leg was also a transfer (chained transfers), merge them
                const lastLeg = legs[legs.length - 1];
                if (lastLeg && lastLeg.type === 'transfer') {
                    // Chained transfer: update the toLine and add time
                    lastLeg.toLine = toLine;
                    lastLeg.time += Math.round(transferTime / 60);
                } else {
                    legs.push({
                        type: 'transfer',
                        at: transferStation.name,
                        atId: transferStation.id,
                        fromLine,
                        toLine,
                        time: Math.round(transferTime / 60)
                    });
                }
            }
        }

        i = j;
    }

    return legs;
}

// --- DIJKSTRA WITH BLOCKED NODES ---
function dijkstraWithBlocked(startNodes, endNodes, graph, blockedNodes = new Set()) {
    const dist = {};
    const prev = {};
    const visited = new Set();
    const queue = [];

    for (const node of startNodes) {
        if (graph[node] && !blockedNodes.has(node)) {
            dist[node] = 0;
            prev[node] = null;
            queue.push({ node, d: 0 });
        }
    }

    while (queue.length > 0) {
        queue.sort((a, b) => a.d - b.d);
        const { node: u, d } = queue.shift();

        if (visited.has(u)) continue;
        visited.add(u);

        if (endNodes.has(u)) {
            const path = [];
            let curr = u;
            while (curr !== null) {
                path.unshift(curr);
                curr = prev[curr];
            }
            return { time: d, path };
        }

        const edges = graph[u] || [];
        for (const edge of edges) {
            if (visited.has(edge.to) || blockedNodes.has(edge.to)) continue;
            const newDist = d + edge.time;
            if (dist[edge.to] === undefined || newDist < dist[edge.to]) {
                dist[edge.to] = newDist;
                prev[edge.to] = u;
                queue.push({ node: edge.to, d: newDist });
            }
        }
    }

    return null;
}

// --- MAIN: FIND TOP ROUTES ---
/**
 * Find top N diverse routes between two locations
 * Uses iterative blocking to find alternative transfer strategies
 */
async function findTopRoutes(userLat, userLng, venueLat, venueLng, limit = 3) {
    const MAX_TIME_PENALTY = 1.5; // Don't show routes >50% longer than best
    const graph = getGraph();

    // Find nearby stations (larger dest radius since OSRM filters by actual walk time)
    const originStations = findStationsWithinRadius(userLat, userLng, 0.5);
    const destStations = findStationsWithinRadius(venueLat, venueLng, 1.0);

    if (originStations.length === 0 || destStations.length === 0) {
        return [];
    }

    // Pre-fetch OSRM walking times for origin station and all dest stations
    const closestOrigin = originStations[0];

    // Get accurate walking time to origin station
    const originWalk = await getOSRMWalkingTime(userLat, userLng, closestOrigin.lat, closestOrigin.lng);
    const walkToStation = originWalk ? originWalk.mins : estimateWalkingTime(closestOrigin.distance);

    // Pre-fetch walking times from each destination station to venue (in parallel)
    const destWalkPromises = destStations.map(async (station) => {
        const walk = await getOSRMWalkingTime(station.lat, station.lng, venueLat, venueLng);
        return {
            stationId: station.id,
            walkMins: walk ? walk.mins : estimateWalkingTime(station.distance)
        };
    });
    const destWalkResults = await Promise.all(destWalkPromises);
    const destWalkTimes = {};
    destWalkResults.forEach(r => { destWalkTimes[r.stationId] = r.walkMins; });

    // Collect all destination nodes
    const destNodes = new Set();
    const destNodeToStation = {};
    destStations.forEach(station => {
        station.nodes.forEach(node => {
            if (graph[node]) {
                destNodes.add(node);
                destNodeToStation[node] = station;
            }
        });
    });

    if (destNodes.size === 0) {
        return [];
    }

    // Collect entry nodes from all nearby origin stations
    const entryNodes = [];
    for (const station of originStations) {
        if (station.distance <= closestOrigin.distance + 0.1) {
            station.nodes.forEach(n => {
                if (graph[n] && !entryNodes.includes(n)) {
                    entryNodes.push(n);
                }
            });
        }
    }

    if (entryNodes.length === 0) {
        return [];
    }

    // Find ALL paths to all destination nodes
    const allPaths = dijkstraAllDests(entryNodes, destNodes, graph);

    // Calculate total time for each path and build route objects
    const candidates = [];
    for (const result of allPaths) {
        const exitStation = destNodeToStation[result.endNode];
        if (!exitStation) continue;

        const walkToVenue = destWalkTimes[exitStation.id] || estimateWalkingTime(exitStation.distance);
        const totalTime = Math.round(walkToStation + (result.time / 60) + walkToVenue);

        // Format legs and get lines used
        const legs = formatLegs(result.path, graph);
        const lines = legs.filter(l => l.type === 'ride').map(l => l.line);

        // Create line signature for diversity (e.g., "L" or "L→G" or "J→M")
        const lineSignature = lines.join('→');

        candidates.push({
            type: 'transit',
            totalTime,
            walkToStation: Math.round(walkToStation),
            subwayTime: Math.round(result.time / 60),
            walkToVenue: Math.round(walkToVenue),
            originStation: closestOrigin.name,
            originStationId: closestOrigin.id,
            exitStation: exitStation.name,
            exitStationId: exitStation.id,
            lines,
            legs,
            lineSignature,
            path: result.path
        });
    }

    // Sort by total time
    candidates.sort((a, b) => a.totalTime - b.totalTime);

    // Pick diverse routes: best route per unique line combination
    const routes = [];
    const seenLineSignatures = new Set();

    for (const route of candidates) {
        if (routes.length >= limit) break;

        // Skip if we already have a route with same lines (keep the faster one)
        if (seenLineSignatures.has(route.lineSignature)) continue;

        seenLineSignatures.add(route.lineSignature);
        routes.push(route);
    }

    return routes;
}

// --- QUICK TIME LOOKUP ---
/**
 * Get just the travel time (for sorting mics)
 */
async function getRouteTime(userLat, userLng, venueLat, venueLng) {
    const routes = await findTopRoutes(userLat, userLng, venueLat, venueLng, 1);
    return routes.length > 0 ? routes[0].totalTime : null;
}

// --- EXPORTS ---
module.exports = {
    findTopRoutes,
    getRouteTime,
    findStationsWithinRadius,
    getGraph,
    getStations,
    haversine
};
