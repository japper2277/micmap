# MicMap API vs Transiter API Comparison

## Overview

**MicMap API** - Specialized venue discovery service for NYC comedy open mics with integrated transit features

**Transiter API** - Generic real-time GTFS transit data aggregation service supporting multiple transit agencies

---

## Core Purpose & Use Cases

### MicMap API
✅ **Primary Purpose**: Discover open mic comedy venues in NYC with transit directions
- Venue discovery and filtering
- Real-time transit routing to venues
- MTA alert integration
- Comedian/venue information

### Transiter API
✅ **Primary Purpose**: Unified access to real-time GTFS transit data from multiple agencies
- Generic transit system information
- Real-time vehicle arrivals at any stop
- Route and trip information
- Works with multiple transit systems (NYC Subway, BART, etc.)

---

## API Endpoints Comparison

### Transit/Route Information

| Feature | MicMap | Transiter | Notes |
|---------|--------|-----------|-------|
| **Subway Routes** | `GET /api/subway/routes` | `GET /systems/{id}/stops/{stop_id}` | MicMap returns venue-specific routing; Transiter returns stop info |
| **Real-time Arrivals** | `GET /api/mta/arrivals/:line/:stopId` | `GET /systems/{id}/stops/{stop_id}` | Both return upcoming trains |
| **Service Alerts** | `GET /api/mta/alerts` | Included in stop endpoint | MicMap has dedicated alerts endpoint |
| **Route Planner** | Custom Dijkstra routing | Not included | MicMap specializes in multi-leg transit |

### Location/Venue Information

| Feature | MicMap | Transiter | Notes |
|---------|--------|-----------|-------|
| **Venue Search** | `GET /api/v1/mics` | `GET /systems/{id}` | MicMap: comedy venues; Transiter: transit systems |
| **Geocoding** | Mapbox + HERE | Not included | MicMap includes address lookup |
| **Walking Routes** | `GET /api/proxy/here/walk` | Not included | MicMap integrates pedestrian routing |
| **Distance Matrix** | Google Distance Matrix | Not included | For transit time estimation |

### Data Access Patterns

| MicMap Endpoints | Transiter Endpoints | Purpose |
|-----------------|-------------------|---------|
| `/api/v1/mics` | `/systems/{id}` | Get location data |
| `/api/mta/arrivals/{line}/{stopId}` | `/systems/{id}/stops/{stop_id}` | Real-time vehicle arrivals |
| `/api/subway/routes` | N/A | Multi-leg trip planning |
| `/api/proxy/geocode` | N/A | Location lookup |
| `/api/proxy/here/walk` | N/A | Pedestrian routing |

---

## Response Structure Comparison

### Example: Real-time Arrivals

**MicMap** Response:
```json
{
  "id": "line-4-stops-640",
  "times": [
    {
      "time": 234,
      "direction": "Downtown",
      "terminal": "Brooklyn Bridge-City Hall"
    },
    {
      "time": 564,
      "direction": "Downtown",
      "terminal": "Brooklyn Bridge-City Hall"
    }
  ]
}
```

**Transiter** Response:
```json
{
  "stopTimes": [
    {
      "trip": {
        "id": "068450_D..N",
        "route": { "id": "D", "color": "EB6800" },
        "destination": { "name": "Coney Island-Stillwell Av" }
      },
      "arrivalTime": 1702509900,
      "departureTime": 1702509900
    }
  ]
}
```

### Example: Stop Information

**MicMap** - No direct equivalent

**Transiter** Stop:
```json
{
  "id": "D15N",
  "name": "47-50 Sts-Rockefeller Ctr",
  "latitude": 40.758663,
  "longitude": -73.981329,
  "serviceMaps": [
    {
      "configId": "weekday",
      "routes": [
        { "id": "M", "color": "EB6800" },
        { "id": "F", "color": "FF6319" }
      ]
    }
  ],
  "stopTimes": [...]
}
```

---

## Data Coverage

### MicMap
✅ **Covered**:
- NYC comedy venues (298 venues in current DB)
- NYC MTA subway data only
- Walking distances
- Venue details (cost, host, sign-up info, etc.)
- Custom routing (Dijkstra + Google)

❌ **Not Covered**:
- Non-NYC transit systems
- Bus routes (MTA buses not included)
- Non-comedy venues
- Historical data

### Transiter
✅ **Covered**:
- Multiple transit systems (NYC, BART, Tube, etc.)
- Complete GTFS data (all agencies)
- All transportation modes
- Multi-system queries
- Historical schedule data

❌ **Not Covered**:
- Venue/POI data
- Walking routes
- Non-transit destinations
- Service filtering by use case
- Custom routing algorithms

---

## Technical Architecture

### MicMap
- **Stack**: Node.js/Express backend, MongoDB, Redis caching
- **Real-time**: MTA GTFS Realtime (protobuf)
- **Routing**: Custom Dijkstra implementation + external APIs (Google, HERE)
- **Caching**: Redis + MongoDB fallback
- **External APIs**: Google Maps, HERE, Mapbox, MTA

### Transiter
- **Stack**: Golang backend
- **Real-time**: GTFS Realtime feeds from agencies
- **Routing**: Stop/route indexing, real-time vehicle tracking
- **Caching**: Multi-level caching of GTFS data
- **External APIs**: GTFS feeds only (no third-party APIs)

---

## Feature Matrix

| Feature | MicMap | Transiter |
|---------|--------|-----------|
| Real-time Transit Data | ✅ NYC only | ✅ Multiple systems |
| Route Planning | ✅ Dijkstra multi-leg | ❌ Stop lookup only |
| Walking Routes | ✅ (HERE) | ❌ |
| Geocoding | ✅ (Mapbox + HERE) | ❌ |
| Venue/POI Search | ✅ Comedy venues | ❌ |
| Service Alerts | ✅ Dedicated endpoint | ✅ Included in stops |
| Multi-system Support | ❌ | ✅ |
| Stop Information | ✅ (MTA stops) | ✅ All agencies |
| Trip Planning | ✅ Optimized for venues | ❌ Stop/route only |
| Historical Data | ❌ | ✅ |
| Custom Venue Data | ✅ | ❌ |
| Protobuf Support | ✅ (parses) | ❌ (JSON only) |

---

## Use Case Alignment

### When to Use MicMap
- Finding open mic comedy shows in NYC
- Getting transit directions to a specific venue
- Checking current MTA alerts
- Real-time arrival information for NYC subway
- Discovering new comedy venues

### When to Use Transiter
- Querying transit data for multiple systems
- Building a generic transit app (not venue-specific)
- Accessing GTFS data programmatically
- Cross-system transit queries
- Non-NYC transit information
- Historical transit schedule data
- Stop information for any transit agency

---

## Comparison Summary

| Dimension | MicMap | Transiter |
|-----------|--------|-----------|
| **Specificity** | Domain-specific (comedy venues) | Generic (transit systems) |
| **Data Breadth** | Narrow (NYC only) | Wide (multiple systems worldwide) |
| **Data Depth** | Deep (venue details + transit routing) | Deep (complete GTFS + real-time) |
| **Use Cases** | Venue discovery + routing | Transit data access |
| **Integrations** | Many (Google, HERE, Mapbox) | Minimal (GTFS feeds only) |
| **Real-time** | Yes (MTA feeds) | Yes (Agency feeds) |
| **Maintenance** | Protobuf parsing + venue DB | GTFS feed monitoring |
| **Learning Curve** | Medium (domain-specific) | Low (standard GTFS) |

---

## What Matches vs. What Differs

### ✅ What Matches Up
1. **Real-time Arrivals**: Both provide next train information
2. **MTA Data**: Both use NYC MTA data as source
3. **Service Alerts**: Both show service disruptions
4. **JSON Responses**: Both return JSON (Transiter only)
5. **REST API**: Both are HTTP REST APIs
6. **Caching**: Both cache real-time data

### ❌ What's Different
1. **Scope**: MicMap is venue-focused; Transiter is transit-focused
2. **Multi-system**: Transiter supports many systems; MicMap is NYC-only
3. **Routing**: MicMap has trip planning; Transiter doesn't
4. **Format**: MicMap parses protobuf; Transiter provides JSON
5. **POI Data**: MicMap has venues; Transiter has stops
6. **Walking**: MicMap integrates walking routes; Transiter doesn't

---

## Conclusion

**MicMap and Transiter serve complementary purposes:**

- **MicMap** is a specialized venue discovery platform with integrated transit support for NYC
- **Transiter** is a generic transit data aggregation service for multiple transit systems

### Potential Integration Points

1. **Replace MTA Parsing**
   - Current: MicMap parses MTA protobuf directly
   - Alternative: Call Transiter API instead
   - Benefit: Simpler code, no protobuf parsing needed

2. **Multi-city Expansion**
   - Current: MicMap is NYC-only
   - Alternative: Use Transiter for transit data in other cities
   - Benefit: Scale to multiple cities with consistent transit API

3. **Complement Each Other**
   - MicMap provides venue data
   - Transiter provides transit data
   - Together: Complete venue discovery + transit solution

### Current Status
- MicMap uses direct MTA GTFS Realtime feeds
- Could refactor to use Transiter for cleaner architecture
- Would reduce maintenance of protobuf parsing
- Trade-off: Dependency on external service (Transiter)
