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

// --- LOAD DATA ---
const DATA_DIR = path.join(__dirname, '..', 'public', 'data');

// Load both graphs at startup (cached in memory)
let graphWeekday = null;
let graphWeekend = null;
let stations = null;

function loadData() {
    if (!graphWeekday) {
        graphWeekday = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'graph-weekday.json')));
    }
    if (!graphWeekend) {
        graphWeekend = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'graph-weekend.json')));
    }
    if (!stations) {
        stations = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'stations.json')));
    }
}

function getGraph() {
    loadData();
    const day = new Date().getDay();
    return (day === 0 || day === 6) ? graphWeekend : graphWeekday;
}

function getStations() {
    loadData();
    return stations;
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
 * Multi-source, multi-target Dijkstra
 * @param {string[]} startNodes - All entry nodes (e.g., all platforms at origin station)
 * @param {Set<string>} endNodes - All exit nodes (platforms at destination stations)
 * @param {Object} graph - The subway graph
 * @returns {{ time: number, path: string[] } | null}
 */
function dijkstra(startNodes, endNodes, graph) {
    const dist = {};
    const prev = {};
    const visited = new Set();

    // Priority queue as sorted array (fine for ~2000 nodes)
    const queue = [];

    // Multi-source initialization
    for (const node of startNodes) {
        if (graph[node]) {
            dist[node] = 0;
            prev[node] = null;
            queue.push({ node, d: 0 });
        }
    }

    while (queue.length > 0) {
        // Sort and pop minimum
        queue.sort((a, b) => a.d - b.d);
        const { node: u, d } = queue.shift();

        // Skip if already visited with shorter path
        if (visited.has(u)) continue;
        visited.add(u);

        // Check if we've reached any destination
        if (endNodes.has(u)) {
            // Reconstruct path
            const path = [];
            let curr = u;
            while (curr !== null) {
                path.unshift(curr);
                curr = prev[curr];
            }
            return { time: d, path };
        }

        // Relax edges
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

    return null; // No path found
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
            // Use the line from the first actual ride node (path[i]), not potentially stale currentLine
            const rideLine = getLineFromNode(path[i]);
            legs.push({
                type: 'ride',
                line: rideLine,
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
// endNodeCosts: optional map of node -> additional cost (walk time in seconds)
function dijkstraWithBlocked(startNodes, endNodes, graph, blockedNodes = new Set(), endNodeCosts = {}) {
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

    // Track best destination found (including walk cost)
    let bestResult = null;
    let bestTotalCost = Infinity;

    while (queue.length > 0) {
        queue.sort((a, b) => a.d - b.d);
        const { node: u, d } = queue.shift();

        // Early exit: if current distance exceeds best total, we can't improve
        if (d >= bestTotalCost) continue;

        if (visited.has(u)) continue;
        visited.add(u);

        // Check if this is a destination
        if (endNodes.has(u)) {
            const walkCost = endNodeCosts[u] || 0;
            const totalCost = d + walkCost;
            if (totalCost < bestTotalCost) {
                bestTotalCost = totalCost;
                // Reconstruct path
                const path = [];
                let curr = u;
                while (curr !== null) {
                    path.unshift(curr);
                    curr = prev[curr];
                }
                bestResult = { time: d, path, totalCost };
            }
            // Continue exploring edges - there might be a better destination beyond
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

    return bestResult;
}

// --- MAIN: FIND TOP ROUTES ---
/**
 * Find top N diverse routes between two locations
 * Uses iterative blocking to find alternative transfer strategies
 */
function findTopRoutes(userLat, userLng, venueLat, venueLng, limit = 3) {
    const WALK_SPEED = 24; // minutes per mile (2.5 mph)
    const MAX_TIME_PENALTY = 1.5; // Don't show routes >50% longer than best
    const graph = getGraph();

    // Find nearby stations
    const originStations = findStationsWithinRadius(userLat, userLng, 0.5);
    const destStations = findStationsWithinRadius(venueLat, venueLng, 0.4);

    if (originStations.length === 0 || destStations.length === 0) {
        return [];
    }

    // Collect all destination nodes with their walk-to-venue costs
    const destNodes = new Set();
    const destNodeToStation = {};
    const destNodeWalkCost = {}; // Walk time in seconds for each dest node
    destStations.forEach(station => {
        const walkCost = station.distance * WALK_SPEED * 60; // Convert to seconds
        station.nodes.forEach(node => {
            if (graph[node]) {
                destNodes.add(node);
                destNodeToStation[node] = station;
                destNodeWalkCost[node] = walkCost;
            }
        });
    });

    if (destNodes.size === 0) {
        return [];
    }

    // Get closest origin station (we'll use this for all Dijkstra runs)
    // Include all stations at the same location (station complexes like W 4 St)
    const closestOrigin = originStations[0];
    const walkToStation = closestOrigin.distance * WALK_SPEED;

    // Collect entry nodes from ALL stations within ~0.02 miles of closest (same complex)
    const entryNodes = [];
    for (const station of originStations) {
        if (station.distance <= closestOrigin.distance + 0.02) {
            station.nodes.forEach(n => {
                if (graph[n] && !entryNodes.includes(n)) {
                    entryNodes.push(n);
                }
            });
        } else {
            break; // stations are sorted by distance
        }
    }

    if (entryNodes.length === 0) {
        return [];
    }

    const routes = [];
    const seenSignatures = new Set();
    const blockedEdges = new Set(); // Block specific edges, not whole stations
    let bestTime = null;

    // Helper: find the station where a specific line is in the path
    const findLineStation = (path, line) => {
        for (const node of path) {
            if (node.includes(`_${line}`)) {
                // Find parent station for this node
                for (const [stationId, station] of Object.entries(getStations())) {
                    if (station.nodes?.includes(node)) {
                        return stationId;
                    }
                }
            }
        }
        return null;
    };

    // Helper: block a specific line at its station
    const blockLineAtStation = (stationId, line) => {
        if (!stationId) return;
        const stationData = getStations()[stationId];
        if (!stationData?.nodes) return;
        stationData.nodes.forEach(node => {
            if (node.includes(`_${line}`)) {
                blockedEdges.add(node);
            }
        });
    };

    // Iteratively find routes, blocking specific line transfers
    for (let attempt = 0; attempt < limit * 4 && routes.length < limit; attempt++) {
        const result = dijkstraWithBlocked(entryNodes, destNodes, graph, blockedEdges, destNodeWalkCost);
        if (!result || !result.path || result.path.length < 2) break;

        // Find exit station
        const exitNode = result.path[result.path.length - 1];
        const exitStation = destNodeToStation[exitNode];
        const walkToVenue = exitStation ? exitStation.distance * WALK_SPEED : 0;

        // Format legs
        const legs = formatLegs(result.path, graph);
        const lines = legs.filter(l => l.type === 'ride').map(l => l.line);

        // Calculate signature by STATION SEQUENCE
        // N/Q have same stops → same signature → grouped
        // R has different stops → different signature → separate
        const stationSequence = [];
        let lastStation = null;
        for (const node of result.path) {
            for (const [stationId, station] of Object.entries(getStations())) {
                if (station.nodes?.includes(node)) {
                    if (stationId !== lastStation) {
                        stationSequence.push(stationId);
                        lastStation = stationId;
                    }
                    break;
                }
            }
        }
        const signature = stationSequence.join('→');

        const totalTime = Math.round(walkToStation + (result.time / 60) + walkToVenue);

        // Track best time for penalty threshold
        if (bestTime === null) bestTime = totalTime;

        // Skip if too slow compared to best route
        if (totalTime > bestTime * MAX_TIME_PENALTY) {
            // Block the destination line at its actual station
            const transfers = legs.filter(l => l.type === 'transfer');
            if (transfers.length > 0) {
                const destLineStation = findLineStation(result.path, transfers[0].toLine);
                blockLineAtStation(destLineStation, transfers[0].toLine);
            } else if (lines.length > 0) {
                blockLineAtStation(closestOrigin.id, lines[0]);
            }
            continue;
        }

        // Check for duplicate signature
        if (seenSignatures.has(signature)) {
            // MERGE: Add alternative lines to matching legs
            const existingRoute = routes.find(r => r.signature === signature);
            if (existingRoute) {
                // Match legs by position and add alternatives
                legs.forEach((leg, idx) => {
                    if (leg.type === 'ride' && existingRoute.legs[idx]?.type === 'ride') {
                        const existingLeg = existingRoute.legs[idx];
                        if (leg.line !== existingLeg.line) {
                            if (!existingLeg.altLines) existingLeg.altLines = [];
                            if (!existingLeg.altLines.includes(leg.line)) {
                                existingLeg.altLines.push(leg.line);
                            }
                        }
                    }
                });
            }
            // Still block to find more diverse routes
            const transfers = legs.filter(l => l.type === 'transfer');
            if (transfers.length > 0) {
                const destLineStation = findLineStation(result.path, transfers[0].toLine);
                blockLineAtStation(destLineStation, transfers[0].toLine);
            } else {
                // Direct route duplicate - block this line's midpoint
                const midIdx = Math.floor(result.path.length / 2);
                blockedEdges.add(result.path[midIdx]);
            }
            continue;
        }

        seenSignatures.add(signature);
        routes.push({
            type: 'transit',
            totalTime,
            walkToStation: Math.round(walkToStation),
            subwayTime: Math.round(result.time / 60),
            walkToVenue: Math.round(walkToVenue),
            originStation: closestOrigin.name,
            originStationId: closestOrigin.id,
            exitStation: exitStation?.name || 'Unknown',
            exitStationId: exitStation?.id || null,
            lines,
            legs,
            signature,
            path: result.path
        });

        // Block the DESTINATION LINE at its actual station to find alternatives
        // This allows L→N at Union Sq even after finding L→2 at Union Sq
        const transfers = legs.filter(l => l.type === 'transfer');
        if (transfers.length > 0) {
            const destLineStation = findLineStation(result.path, transfers[0].toLine);
            blockLineAtStation(destLineStation, transfers[0].toLine);
        } else {
            // Direct route - block this line's nodes at midpoint
            const midIdx = Math.floor(result.path.length / 2);
            blockedEdges.add(result.path[midIdx]);
        }
    }

    return routes.sort((a, b) => a.totalTime - b.totalTime);
}

// --- QUICK TIME LOOKUP ---
/**
 * Get just the travel time (for sorting mics)
 */
function getRouteTime(userLat, userLng, venueLat, venueLng) {
    const routes = findTopRoutes(userLat, userLng, venueLat, venueLng, 1);
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
