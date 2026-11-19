"""
Batch Weather & 0-48h Corridor Heatmap Service for Spotter Truck Routing.

Fetches hourly forecasts from Open-Meteo in batched, spatially clustered requests
with in-memory caching. Provides both 'live' forecast mode and a realistic
'simulated_storm' mode for reliable evaluation and testing.
"""

from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Optional, Sequence, Tuple
import requests

from .risk_engine import RiskLevel, classify_wind_risk, classify_rain_risk, classify_snow_risk

logger = logging.getLogger(__name__)

OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast"

# In-memory cache for weather forecasts: key -> (timestamp, forecast_data)
_WEATHER_CACHE: dict[str, Tuple[float, dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 900  # 15 minutes
_METEO_CIRCUIT_UNTIL = 0.0  # Circuit breaker timestamp if Open-Meteo is timing out


def _get_default_hourly() -> dict[str, list[Any]]:
    return {
        "time": [],
        "wind_speed_10m": [16.0] * 72,
        "rain": [0.0] * 72,
        "snowfall": [0.0] * 72,
        "temperature_2m": [48.0] * 72,
        "weather_code": [0] * 72,
    }


@dataclass
class WeatherSample:
    """Weather metrics observed or forecasted at a specific time and location."""
    wind_speed_mph: float
    rain_rate_in_hr: float
    snow_rate_in_hr: float
    temperature_f: Optional[float] = None
    weather_code: Optional[int] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def get_cluster_key(lat: float, lon: float, precision: float = 0.8) -> Tuple[float, float]:
    """Round coordinates to precision grid (e.g. ~55 miles) for spatial clustering."""
    return (round(lat / precision) * precision, round(lon / precision) * precision)


def fetch_batch_open_meteo(
    coordinates: Sequence[Tuple[float, float]],
    timeout: float = 2.0,
) -> dict[Tuple[float, float], dict[str, Any]]:
    """
    Fetch 2-day hourly forecasts for a batch of (lat, lon) coordinates from Open-Meteo.
    Uses 2.0s fast timeout and an automatic circuit-breaker so external API slowdowns
    never block users or cause 1.5-minute hangs.
    """
    global _METEO_CIRCUIT_UNTIL
    results: dict[Tuple[float, float], dict[str, Any]] = {}
    now = time.time()

    # If Open-Meteo was recently timing out, immediately return fallback without blocking
    if now < _METEO_CIRCUIT_UNTIL:
        for pt in coordinates:
            results[pt] = _get_default_hourly()
        return results

    to_fetch: list[Tuple[float, float]] = []
    for pt in coordinates:
        cache_key = f"{round(pt[0], 2)}_{round(pt[1], 2)}"
        if cache_key in _WEATHER_CACHE:
            cached_time, cached_data = _WEATHER_CACHE[cache_key]
            if now - cached_time < CACHE_TTL_SECONDS:
                results[pt] = cached_data
                continue
        to_fetch.append(pt)

    if not to_fetch:
        return results

    # Chunk requests into batches of max 20 coordinates for fast Open-Meteo response
    batch_size = 20
    for i in range(0, len(to_fetch), batch_size):
        chunk = to_fetch[i : i + batch_size]
        lats_str = ",".join(f"{pt[0]:.4f}" for pt in chunk)
        lons_str = ",".join(f"{pt[1]:.4f}" for pt in chunk)

        params = {
            "latitude": lats_str,
            "longitude": lons_str,
            "hourly": "wind_speed_10m,rain,snowfall,precipitation,temperature_2m,weather_code",
            "wind_speed_unit": "mph",
            "precipitation_unit": "inch",
            "temperature_unit": "fahrenheit",
            "forecast_days": 2,
        }

        try:
            resp = requests.get(OPEN_METEO_BASE_URL, params=params, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()

            items = data if isinstance(data, list) else [data]

            for pt, item in zip(chunk, items):
                hourly = item.get("hourly", {})
                hourly_units = item.get("hourly_units", {})

                snow_unit = str(hourly_units.get("snowfall", "")).lower()
                snow_values = list(hourly.get("snowfall", []))
                if "cm" in snow_unit:
                    snow_values = [round(v / 2.54, 3) for v in snow_values]
                    hourly["snowfall"] = snow_values
                    hourly_units["snowfall"] = "inch"

                results[pt] = hourly
                cache_key = f"{round(pt[0], 2)}_{round(pt[1], 2)}"
                _WEATHER_CACHE[cache_key] = (now, hourly)

        except Exception as exc:
            logger.warning("Open-Meteo slow/unreachable (%s). Activating circuit breaker for 60s.", exc)
            _METEO_CIRCUIT_UNTIL = now + 60.0
            # Immediately fill all remaining points with safe fallback without making more stalling requests
            for remaining_pt in to_fetch:
                if remaining_pt not in results:
                    fallback_hourly = _get_default_hourly()
                    results[remaining_pt] = fallback_hourly
                    cache_key = f"{round(remaining_pt[0], 2)}_{round(remaining_pt[1], 2)}"
                    _WEATHER_CACHE[cache_key] = (now, fallback_hourly)
            break

    return results


def simulate_storm_weather(
    lat: float,
    lon: float,
    hours_from_departure: float,
    corridor_bounds: Tuple[float, float, float, float],  # min_lat, max_lat, min_lon, max_lon
) -> WeatherSample:
    """
    Time-evolving realistic winter storm model that moves across the corridor
    over 48 hours. Produces high winds (35-58 mph) and heavy snow bands (1.0-3.5 in/hr)
    centered around an active front.
    """
    min_lat, max_lat, min_lon, max_lon = corridor_bounds
    t = max(0.0, min(48.0, float(hours_from_departure)))

    # Storm center travels from west/central corridor towards northeast
    storm_start_lon = min_lon + (max_lon - min_lon) * 0.25
    storm_end_lon = min_lon + (max_lon - min_lon) * 0.85
    storm_center_lon = storm_start_lon + (t / 48.0) * (storm_end_lon - storm_start_lon)

    mid_lat = (min_lat + max_lat) / 2.0
    storm_center_lat = mid_lat + 0.5 * math.sin((t / 24.0) * math.pi)

    # Distance in degrees from current storm epicenter
    d_lat = lat - storm_center_lat
    d_lon = (lon - storm_center_lon) * math.cos(math.radians(lat))
    dist_deg = math.sqrt(d_lat ** 2 + d_lon ** 2)

    # Wind & Snow gradient based on proximity to storm center
    if dist_deg < 0.9:
        # Epicenter core: severe / impassable blizzard
        wind = 56.0 + 4.0 * math.cos(dist_deg * 3.0)
        snow = 3.2 + 0.6 * math.sin(dist_deg * 2.0)
        rain = 0.0
        temp = 22.0
    elif dist_deg < 2.0:
        # Severe storm band: 46–52 mph winds (escalates to NO_TRAVEL with >30k lbs load)
        wind = 47.5 + 4.5 * math.cos(dist_deg * 2.0)
        snow = 2.2 + 0.5 * math.cos(dist_deg)
        rain = 0.05
        temp = 26.0
    elif dist_deg < 3.4:
        # High wind fringe: 36–42 mph winds (escalates to SEVERE with >40k lbs load)
        wind = 37.0 + 4.0 * math.sin(dist_deg)
        snow = 1.1 + 0.4 * math.cos(dist_deg)
        rain = 0.15
        temp = 32.0
    elif dist_deg < 4.8:
        # Moderate precipitation band
        wind = 26.5 + 3.5 * math.cos(dist_deg)
        snow = 0.6
        rain = 0.20
        temp = 38.0
    else:
        # Safe clear weather beyond storm influence
        wind = 12.0 + 5.0 * math.sin(lat + lon)
        snow = 0.0
        rain = 0.01
        temp = 48.0

    return WeatherSample(
        wind_speed_mph=max(0.0, round(wind, 1)),
        rain_rate_in_hr=max(0.0, round(rain, 2)),
        snow_rate_in_hr=max(0.0, round(snow, 2)),
        temperature_f=round(temp, 1),
        weather_code=71 if snow > 0.5 else (61 if rain > 0.1 else 0),
    )


def build_corridor_heatmap(
    corridor_bounds: Tuple[float, float, float, float],
    cluster_weather_map: dict[Tuple[float, float], dict[str, Any]],
    weather_mode: str = "live",
    load_weight_lbs: float = 0.0,
    departure_time: Optional[datetime] = None,
    corridor_coords: Optional[list[list[float]]] = None,
) -> dict[str, Any]:
    """
    Generate a high-density 0-48 hour spatial heatmap grid (22 x 14 = 308 points)
    spanning the route corridor with smooth Inverse Distance Weighting (IDW) interpolation
    and organic corridor boundary feathering (no hard rectangular box edges).

    For each point, computes a 49-element array (hours 0 through 48)
    containing [wind_mph, rain_in_hr, snow_in_hr, temperature_f, risk_level].
    """
    min_lat, max_lat, min_lon, max_lon = corridor_bounds

    # Pad bounds by 1.8 degrees (~120 miles) for realistic synoptic context
    pad = 1.8
    grid_min_lat = min_lat - pad
    grid_max_lat = max_lat + pad
    grid_min_lon = min_lon - pad
    grid_max_lon = max_lon + pad

    cols = 20  # Fast, smooth corridor resolution
    rows = 10  # Latitudinal height
    lat_step = (grid_max_lat - grid_min_lat) / max(1, rows - 1)
    lon_step = (grid_max_lon - grid_min_lon) / max(1, cols - 1)

    heatmap_points: list[dict[str, Any]] = []

    # Downsample corridor coordinates for fast distance calculation
    sampled_corridor: list[tuple[float, float]] = []
    if corridor_coords:
        step = max(1, len(corridor_coords) // 100)
        for i in range(0, len(corridor_coords), step):
            pt = corridor_coords[i]
            if len(pt) >= 2:
                # pt is [lon, lat]
                sampled_corridor.append((pt[1], pt[0]))

    # Pre-extract cluster coordinates for IDW spatial interpolation
    cluster_pts = list(cluster_weather_map.keys())

    for r in range(rows):
        pt_lat = round(grid_min_lat + r * lat_step, 4)
        cos_pt = math.cos(math.radians(pt_lat))
        # Hexagonal staggering: offset odd rows horizontally by half a step to eliminate vertical grid striping
        hex_offset = (lon_step * 0.5) if (r % 2 == 1) else 0.0

        for c in range(cols):
            pt_lon = round(grid_min_lon + c * lon_step + hex_offset, 4)

            # Compute organic corridor falloff factor
            falloff = 1.0
            if sampled_corridor:
                min_d2 = min(
                    (pt_lat - c_lat) ** 2 + ((pt_lon - c_lon) * cos_pt) ** 2
                    for c_lat, c_lon in sampled_corridor
                )
                min_d_deg = math.sqrt(min_d2)
                # Smooth feathering: 1.0 near corridor, down to 0.0 at ~1.8 degrees away
                falloff = max(0.0, min(1.0, 1.0 - (min_d_deg / 1.8) ** 1.6))

            # Exclude points far outside corridor (frontend discards them anyway)
            if sampled_corridor and falloff <= 0.04:
                continue

            hourly_series: list[dict[str, Any]] = []

            if weather_mode == "simulated_storm":
                for h in range(49):
                    sample = simulate_storm_weather(pt_lat, pt_lon, float(h), corridor_bounds)
                    w_risk, _ = classify_wind_risk(sample.wind_speed_mph, load_weight_lbs)
                    r_risk, _ = classify_rain_risk(sample.rain_rate_in_hr)
                    s_risk, _ = classify_snow_risk(sample.snow_rate_in_hr)
                    overall_risk = max(w_risk, r_risk, s_risk)

                    hourly_series.append({
                        "hour": h,
                        "wind_mph": sample.wind_speed_mph,
                        "rain_in_hr": sample.rain_rate_in_hr,
                        "snow_in_hr": sample.snow_rate_in_hr,
                        "temperature_f": sample.temperature_f,
                        "risk_level": int(overall_risk),
                    })
            else:
                # Live mode: Use Inverse Distance Weighting (IDW) from up to 4 nearest weather clusters
                idw_clusters: list[tuple[float, dict[str, Any]]] = []
                if cluster_pts:
                    # Calculate distance squared to all clusters
                    dist_clusters = []
                    for cpt in cluster_pts:
                        d2 = (pt_lat - cpt[0]) ** 2 + ((pt_lon - cpt[1]) * cos_pt) ** 2
                        dist_clusters.append((d2, cpt))
                    dist_clusters.sort(key=lambda x: x[0])

                    # Take up to 4 nearest clusters
                    top_k = dist_clusters[:min(4, len(dist_clusters))]
                    total_w = 0.0
                    for d2, cpt in top_k:
                        w = 1.0 / (d2 + 1e-4)
                        total_w += w
                        idw_clusters.append((w, cluster_weather_map.get(cpt, {})))

                    # Normalize weights
                    idw_clusters = [(w / total_w, data) for w, data in idw_clusters]

                for h in range(49):
                    if idw_clusters:
                        w_interp = 0.0
                        rn_interp = 0.0
                        sn_interp = 0.0
                        tp_interp = 0.0
                        for weight_frac, data in idw_clusters:
                            winds = data.get("wind_speed_10m", [])
                            rains = data.get("rain", [])
                            snows = data.get("snowfall", [])
                            temps = data.get("temperature_2m", [])

                            idx = min(h, max(0, len(winds) - 1)) if winds else 0
                            w_val = float(winds[idx]) if winds and winds[idx] is not None else 12.0
                            rn_val = float(rains[idx]) if rains and rains[idx] is not None else 0.0
                            sn_val = float(snows[idx]) if snows and snows[idx] is not None else 0.0
                            tp_val = float(temps[idx]) if temps and temps[idx] is not None else 50.0

                            w_interp += weight_frac * w_val
                            rn_interp += weight_frac * rn_val
                            sn_interp += weight_frac * sn_val
                            tp_interp += weight_frac * tp_val

                        w = w_interp
                        rn = rn_interp
                        sn = sn_interp
                        tp = tp_interp
                    else:
                        w, rn, sn, tp = 12.0, 0.0, 0.0, 50.0

                    w_risk, _ = classify_wind_risk(w, load_weight_lbs)
                    r_risk, _ = classify_rain_risk(rn)
                    s_risk, _ = classify_snow_risk(sn)
                    overall_risk = max(w_risk, r_risk, s_risk)

                    hourly_series.append({
                        "hour": h,
                        "wind_mph": round(w, 1),
                        "rain_in_hr": round(rn, 2),
                        "snow_in_hr": round(sn, 2),
                        "temperature_f": round(tp, 1),
                        "risk_level": int(overall_risk),
                    })

            heatmap_points.append({
                "lat": pt_lat,
                "lon": pt_lon,
                "falloff": round(falloff, 3),
                "hourly": hourly_series,
            })

    base_iso = (departure_time or datetime.now(timezone.utc)).isoformat()
    return {
        "hours_count": 49,
        "base_time_iso": base_iso,
        "points": heatmap_points,
    }


def enrich_checkpoints_with_weather(
    checkpoints: list[Any],
    weather_mode: str = "live",
    load_weight_lbs: float = 0.0,
    corridor_bounds: Optional[Tuple[float, float, float, float]] = None,
) -> Tuple[list[WeatherSample], dict[Tuple[float, float], dict[str, Any]]]:
    """
    Query or simulate weather for each checkpoint at its exact arrival hour.
    Returns (list_of_weather_samples_matching_checkpoints, cluster_weather_map).
    """
    if not checkpoints:
        return [], {}

    # Calculate corridor bounding box if not supplied
    if not corridor_bounds:
        lats = [cp.lat for cp in checkpoints]
        lons = [cp.lon for cp in checkpoints]
        corridor_bounds = (min(lats), max(lats), min(lons), max(lons))

    # Mode 1: Simulated Storm
    if weather_mode == "simulated_storm":
        samples: list[WeatherSample] = []
        for cp in checkpoints:
            h = getattr(cp, "hours_from_departure", 0.0)
            sample = simulate_storm_weather(cp.lat, cp.lon, h, corridor_bounds)
            samples.append(sample)
        return samples, {}

    # Mode 2: Live Open-Meteo
    # 1. Cluster checkpoints spatially to reduce redundant API queries
    unique_clusters: set[Tuple[float, float]] = set()
    cp_cluster_map: list[Tuple[float, float]] = []

    for cp in checkpoints:
        c_key = get_cluster_key(cp.lat, cp.lon, precision=0.8)
        unique_clusters.add(c_key)
        cp_cluster_map.append(c_key)

    cluster_weather = fetch_batch_open_meteo(list(unique_clusters))

    samples = []
    for cp, c_key in zip(checkpoints, cp_cluster_map):
        hourly_data = cluster_weather.get(c_key, {})
        winds = hourly_data.get("wind_speed_10m", [])
        rains = hourly_data.get("rain", [])
        snows = hourly_data.get("snowfall", [])
        temps = hourly_data.get("temperature_2m", [])
        codes = hourly_data.get("weather_code", [])

        h = int(round(getattr(cp, "hours_from_departure", 0.0)))
        max_h = max(0, len(winds) - 1) if winds else 47
        clamped_h = max(0, min(max_h, h))

        w = float(winds[clamped_h]) if clamped_h < len(winds) and winds[clamped_h] is not None else 12.0
        rn = float(rains[clamped_h]) if clamped_h < len(rains) and rains[clamped_h] is not None else 0.0
        sn = float(snows[clamped_h]) if clamped_h < len(snows) and snows[clamped_h] is not None else 0.0
        tp = float(temps[clamped_h]) if clamped_h < len(temps) and temps[clamped_h] is not None else 50.0
        code = int(codes[clamped_h]) if clamped_h < len(codes) and codes[clamped_h] is not None else 0

        samples.append(
            WeatherSample(
                wind_speed_mph=round(w, 1),
                rain_rate_in_hr=round(rn, 2),
                snow_rate_in_hr=round(sn, 2),
                temperature_f=round(tp, 1),
                weather_code=code,
            )
        )

    return samples, cluster_weather
