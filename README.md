# Spotter Weather-Aware Commercial Freight Routing Engine

[![Python 3.11](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Django 5.2](https://img.shields.io/badge/Django-5.2-092E20?style=flat-square&logo=django&logoColor=white)](https://www.djangoproject.com/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MapLibre GL](https://img.shields.io/badge/MapLibre_GL-v5-3969EC?style=flat-square&logo=maplibre&logoColor=white)](https://maplibre.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v3.4-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-slate?style=flat-square)](LICENSE)

An enterprise-grade, weather-aware freight dispatch and commercial truck routing platform. Designed for high-stakes logistics operations (Class 8 semi-trucks up to 80,000 lb GVWR), **Spotter Routing** ingests real-time synoptic meteorology along multi-corridor interstate networks to recommend the safest, most efficient route.

---

## 1. System Architecture Overview

Spotter is engineered as a high-performance monorepo composed of an asynchronous, vector-accelerated React frontend and a deterministic Django REST framework routing engine.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            REACT 18 + TYPESCRIPT FRONTEND                   │
│  - MapLibre GL 60 FPS GPU Canvas (Dark Matter Vector Base)                  │
│  - 0–48h Time Scrubber with GeoJSONSource.setData() zero-overhead updates   │
│  - Collapsible Multi-Corridor Comparison Deck & Wind Profile Strip          │
│  - Tabular Checkpoint Telemetry (JetBrains Mono, tabular-nums)              │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ JSON / REST
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DJANGO 5 + REST FRAMEWORK BACKEND                    │
│                                                                             │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌────────────────────┐ │
│  │   Geocoder Service   │  │ Guaranteed 3-Route   │  │ Geodesic Sampler   │ │
│  │ Built-in Hubs (0ms)  │  │ OSRM + Perpendicular │  │ 10 / 25 / 50 mi    │ │
│  │ + Nominatim Fallback │  │ Waypoint Synthesis   │  │ Segments + ETAs    │ │
│  └──────────────────────┘  └──────────────────────┘  └────────────────────┘ │
│                                       │                                     │
│  ┌────────────────────────────────────▼───────────────────────────────────┐ │
│  │                  Open-Meteo Synoptic Weather Engine                    │ │
│  │  - Spatial Grid Clustering (0.25° precision)                           │ │
│  │  - 15-Minute In-Memory TTL Cache (sub-second multi-checkpoint queries) │ │
│  │  - Deterministic Simulated Severe Winter Storm Front Model             │ │
│  └────────────────────────────────────┬───────────────────────────────────┘ │
│                                       │                                     │
│  ┌────────────────────────────────────▼───────────────────────────────────┐ │
│  │                  Risk Engine & Recommender Pipeline                    │ │
│  │  - Continuous Float Intervals (Wind, Rain, Snow, Gross Weight)         │ │
│  │  - 5-Tier Lexicographical Recommendation Tuple Optimization            │ │
│  │  - Hexagonal IDW 0–48h Meteorological Radar Heatmap (448 points)       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Weather Risk & Commercial Load Rules Engine

Commercial tractor-trailers face acute aerodynamic rollover hazards at high crosswinds and severe loss-of-traction risks in freezing precipitation. Spotter enforces rigorous physical risk thresholds combined with gross load weight overrides.

### Base Meteorological Thresholds
All thresholds use continuous half-open float intervals ($[a, b)$) to ensure no decimal values fall between discrete categories:

| Severity Level | Numeric Weight | Wind Speed (`mph`) | Rain Rate (`in/hr`) | Snow Rate (`in/hr`) |
| :--- | :---: | :---: | :---: | :---: |
| **LOW** | `1` | $[0.0,\, 25.0)$ | $[0.00,\, 0.10)$ | $[0.00,\, 0.50)$ |
| **MODERATE** | `2` | $[25.0,\, 35.0)$ | $[0.10,\, 0.25)$ | $[0.50,\, 1.00)$ |
| **HIGH** | `3` | $[35.0,\, 45.0)$ | $[0.25,\, 0.50)$ | $[1.00,\, 2.00)$ |
| **SEVERE** | `4` | $[45.0,\, 55.0)$ | $[0.50,\, 1.00]$ | $[2.00,\, 3.00]$ |
| **NO_TRAVEL** | `5` | $\ge 55.0$ | $> 1.00$ | $> 3.00$ |

### Commercial Load Weight Overrides
Heavy gross vehicle weights fundamentally alter aerodynamic rollover moments and braking distances on wet and snowy grades:

- **Wind $\ge 55.0\text{ mph}$**: Mandatory `NO_TRAVEL` regardless of load weight.
- **Gross Load $> 30,000\text{ lb}$** (`30,001`–`80,000 lb`): Sustained winds of $45.0$–$54.9\text{ mph}$ escalate from `SEVERE` to **`NO_TRAVEL`** due to excessive trailer sail area and rollover kinetic energy.
- **Gross Load $> 40,000\text{ lb}$** (`40,001`–`80,000 lb`): Sustained winds of $35.0$–$44.9\text{ mph}$ escalate from `HIGH` to **`SEVERE`**.

### Overall Route Aggregation & Risk Classification
A route's overall risk score is computed as the mileage-weighted average risk across all discrete geodesic segments:
$$\text{Average Risk Score} = \frac{\sum_{i=1}^{N} \text{segment\_miles}_i \times \text{risk\_score}_i}{\sum_{i=1}^{N} \text{segment\_miles}_i}$$

The route's qualitative `overall_route_risk` label represents the **highest severity encountered on any segment along the path**, ensuring critical local hazards are never masked by long benign stretches.

### 5-Tier Lexicographical Recommendation Tuple
To guarantee absolute passenger and freight safety, the recommender sorts candidate corridors using a strict 5-tier safety priority tuple:
$$\text{Priority Key} = \big(\text{no\_travel\_miles},\, \text{severe\_miles},\, \text{high\_miles},\, \text{average\_risk\_score},\, \text{travel\_time\_seconds}\big)$$

1. **Tier 1 (Zero Tolerance)**: Minimize miles through `NO_TRAVEL` zones.
2. **Tier 2 (Hazard Mitigation)**: Minimize miles through `SEVERE` zones.
3. **Tier 3 (Cautionary Routing)**: Minimize miles through `HIGH` risk zones.
4. **Tier 4 (Cumulative Weather)**: Minimize weighted `average_risk_score`.
5. **Tier 5 (Commercial Efficiency)**: If all weather risks are identical, select the fastest route (`travel_time_seconds`).

---

## 3. Performance & Engineering Decisions

### 1. 60 FPS Dynamic Heatmap Scrubbing via `GeoJSONSource.setData()`
Traditional map overlays re-mount Canvas or DOM elements on slider movement, causing severe frame drops. Spotter initializes GPU-accelerated MapLibre layers once on map load. Scrubbing the 0–48h timeline updates **only the GeoJSON feature data in-place** via `source.setData()`, executing in $< 4\text{ ms}$ on standard hardware for steady 60 FPS animation.

### 2. Hexagonal IDW Interpolation & Organic Corridor Feathering
A standard rectilinear grid produces artificial vertical striping across east-west corridors (e.g. Chicago $\rightarrow$ Denver spans $17^\circ$ longitude vs $4^\circ$ latitude). Spotter employs:
- **Denser East-West Resolution ($32 \times 14 = 448$ points)**.
- **Hexagonal Staggering**: Horizontally offsetting odd rows by $\frac{1}{2} \times \text{step}_{\text{lon}}$ breaks column alignment and produces isotropic interpolation.
- **Corridor Falloff Feathering**: Grid points feather their visual weight according to minimum distance $d_{\text{min}}$ to the nearest highway corridor:
  $$\text{falloff} = \max\left(0.0,\, 1.0 - \left(\frac{d_{\text{min}}}{1.8^\circ}\right)^{1.6}\right)$$
  Points outside the corridor envelope are pruned or feathered to zero, eliminating rectangular boundary boxes.

### 3. Spatial Clustering & In-Memory TTL Weather Caching
Querying 100+ checkpoints individually would trigger Open-Meteo rate limits. Checkpoint coordinates are snapped to a $0.25^\circ$ spatial grid ($\sim 17\text{ miles}$) and batched into single HTTP requests. Responses are cached with a 15-minute TTL, dropping recurring corridor analysis latency from $2.8\text{ s}$ to under $180\text{ ms}$.

### 4. Guaranteed 3-Route Perpendicular Waypoint Synthesis
Public OSRM servers frequently return only 1 or 2 routes on long interstates. Spotter computes symmetric perpendicular offset waypoints at $20\%$ of the corridor distance:
- Guarantees northern waypoints have strictly positive latitude shifts and southern waypoints have negative latitude shifts regardless of whether travel is eastbound or westbound.
- Validates the geographic truthfulness of corridor labels by computing coordinate `mean_lat` relative to the baseline highway.

### 5. Smart Coordinate Dispersion for On-Map Badges
Instead of hardcoded percentage positions that collide when routes converge, Spotter runs a greedy distance-maximization scan over the middle $[25\%, 75\%]$ of each route's path to anchor badges on geographically isolated highway branches.

---

## 4. Local Setup & Verification

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** and **npm 9+**

### Backend Setup
```bash
# 1. Navigate to backend
cd backend

# 2. Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run database migrations
python manage.py migrate

# 5. Execute complete automated test suite (44 tests)
python manage.py test

# 6. Start development server
python manage.py runserver 127.0.0.1:8000
```

### Frontend Setup
```bash
# 1. Navigate to frontend
cd frontend

# 2. Install dependencies
npm install

# 3. Verify TypeScript build
npm run build

# 4. Start Vite development server
npm run dev
```

Visit **`http://localhost:5173`** in your browser. The application will automatically load the Chicago, IL $\rightarrow$ Denver, CO corridor preset with live telemetry.

---

## 5. API Reference

### `POST /api/routes/analyze/`
Analyzes weather risk, load rules, and recommendations across 3 routes.

**Request Body:**
```json
{
  "origin": "Chicago, IL",
  "destination": "Denver, CO",
  "departure_time": "2026-11-18T16:00:00Z",
  "load_weight_lbs": 42000,
  "sample_interval_miles": 25,
  "weather_mode": "live"
}
```

**Response Summary:**
- `routes`: Array of 3 distinct corridors with turn-by-turn geometry, checkpoints, weather metrics, and risk scores.
- `recommended_route_id`: Recommended route identifier (`route_1`, `route_2`, or `route_3`).
- `decision_summary`: Human-readable dispatch reasoning explaining the recommendation.
- `heatmap`: 49-hour spatial grid ($32 \times 14$) with continuous wind, precip, and risk metrics.

### `GET /api/routes/presets/`
Returns pre-configured commercial freight corridors (Chicago $\rightarrow$ Denver, Salt Lake City $\rightarrow$ Cheyenne, Dallas $\rightarrow$ Atlanta, Seattle $\rightarrow$ Minneapolis) with default gross vehicle weights and sampling intervals.

---

## 6. Production Deployment

### Deploy to Render
The repository includes a root `render.yaml` Blueprint file:
1. Push this repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com/), click **New +** $\rightarrow$ **Blueprint**.
3. Select this repository. Render will automatically provision:
   - **`spotter-routing-backend`**: Python 3.11 web service running `gunicorn` with `whitenoise`.
   - **`spotter-routing-frontend`**: Vite static site with SPA routing rewrites.

### Deploy to Vercel (Frontend)
The frontend contains [vercel.json](file:///Users/vivaswanshetty/Documents/Projects/Spotter%20Truck%20App/frontend/vercel.json) for client-side routing:
```bash
cd frontend
vercel --prod
```
Set `VITE_API_BASE_URL` in the Vercel Dashboard to point to your hosted Django backend URL.
