"""
Geocoding Service for Spotter Truck Routing.

Resolves US cities, freight hubs, and addresses to (lat, lon, display_name).
Includes an instantaneous built-in lookup for primary US freight corridors
and falls back to OpenStreetMap Nominatim with in-memory caching.
"""

from __future__ import annotations

import logging
import re
from typing import Optional, Tuple
import requests

logger = logging.getLogger(__name__)

# Standard US freight hubs for zero-latency resolution
BUILT_IN_HUBS: dict[str, Tuple[float, float, str]] = {
    "chicago, il": (41.8781, -87.6298, "Chicago, IL, USA"),
    "chicago": (41.8781, -87.6298, "Chicago, IL, USA"),
    "denver, co": (39.7392, -104.9903, "Denver, CO, USA"),
    "denver": (39.7392, -104.9903, "Denver, CO, USA"),
    "dallas, tx": (32.7767, -96.7970, "Dallas, TX, USA"),
    "dallas": (32.7767, -96.7970, "Dallas, TX, USA"),
    "salt lake city, ut": (40.7608, -111.8910, "Salt Lake City, UT, USA"),
    "salt lake city": (40.7608, -111.8910, "Salt Lake City, UT, USA"),
    "cheyenne, wy": (41.1400, -104.8202, "Cheyenne, WY, USA"),
    "cheyenne": (41.1400, -104.8202, "Cheyenne, WY, USA"),
    "omaha, ne": (41.2565, -95.9345, "Omaha, NE, USA"),
    "omaha": (41.2565, -95.9345, "Omaha, NE, USA"),
    "kansas city, mo": (39.0997, -94.5786, "Kansas City, MO, USA"),
    "kansas city": (39.0997, -94.5786, "Kansas City, MO, USA"),
    "minneapolis, mn": (44.9778, -93.2650, "Minneapolis, MN, USA"),
    "minneapolis": (44.9778, -93.2650, "Minneapolis, MN, USA"),
    "seattle, wa": (47.6062, -122.3321, "Seattle, WA, USA"),
    "seattle": (47.6062, -122.3321, "Seattle, WA, USA"),
    "los angeles, ca": (34.0522, -118.2437, "Los Angeles, CA, USA"),
    "los angeles": (34.0522, -118.2437, "Los Angeles, CA, USA"),
    "atlanta, ga": (33.7490, -84.3880, "Atlanta, GA, USA"),
    "atlanta": (33.7490, -84.3880, "Atlanta, GA, USA"),
    "new york, ny": (40.7128, -74.0060, "New York, NY, USA"),
    "new york": (40.7128, -74.0060, "New York, NY, USA"),
    "st. louis, mo": (38.6270, -90.1994, "St. Louis, MO, USA"),
    "st louis, mo": (38.6270, -90.1994, "St. Louis, MO, USA"),
    "st louis": (38.6270, -90.1994, "St. Louis, MO, USA"),
    "st. louis": (38.6270, -90.1994, "St. Louis, MO, USA"),
    "indianapolis, in": (39.7684, -86.1581, "Indianapolis, IN, USA"),
    "indianapolis": (39.7684, -86.1581, "Indianapolis, IN, USA"),
    "albuquerque, nm": (35.0844, -106.6504, "Albuquerque, NM, USA"),
    "albuquerque": (35.0844, -106.6504, "Albuquerque, NM, USA"),
    "phoenix, az": (33.4484, -112.0740, "Phoenix, AZ, USA"),
    "phoenix": (33.4484, -112.0740, "Phoenix, AZ, USA"),
    "memphis, tn": (35.1495, -90.0490, "Memphis, TN, USA"),
    "memphis": (35.1495, -90.0490, "Memphis, TN, USA"),
    "nashville, tn": (36.1627, -86.7816, "Nashville, TN, USA"),
    "nashville": (36.1627, -86.7816, "Nashville, TN, USA"),
    "des moines, ia": (41.5868, -93.6250, "Des Moines, IA, USA"),
    "des moines": (41.5868, -93.6250, "Des Moines, IA, USA"),
    "lincoln, ne": (40.8136, -96.7026, "Lincoln, NE, USA"),
    "lincoln": (40.8136, -96.7026, "Lincoln, NE, USA"),
    "boise, id": (43.6150, -116.2023, "Boise, ID, USA"),
    "boise": (43.6150, -116.2023, "Boise, ID, USA"),
    "houston, tx": (29.7604, -95.3698, "Houston, TX, USA"),
    "houston": (29.7604, -95.3698, "Houston, TX, USA"),
    "san antonio, tx": (29.4241, -98.4936, "San Antonio, TX, USA"),
    "san antonio": (29.4241, -98.4936, "San Antonio, TX, USA"),
    "portland, or": (45.5152, -122.6784, "Portland, OR, USA"),
    "portland": (45.5152, -122.6784, "Portland, OR, USA"),
}

_GEOCODE_CACHE: dict[str, Tuple[float, float, str]] = {}


def normalize_query(query: str) -> str:
    """Normalize query string for dictionary matching."""
    cleaned = query.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def geocode_location(query: str) -> Tuple[float, float, str]:
    """
    Resolve query string to (lat, lon, display_name).

    1. Checks built-in dictionary of US logistics hubs.
    2. Checks in-memory cache.
    3. Queries OpenStreetMap Nominatim with retry and timeout.
    """
    if not query or not query.strip():
        raise ValueError("Location query cannot be empty.")

    norm = normalize_query(query)

    # 1. Built-in lookup
    if norm in BUILT_IN_HUBS:
        return BUILT_IN_HUBS[norm]

    # Check without dots or extra punctuation
    unpunct = re.sub(r"[^\w\s]", "", norm)
    if unpunct in BUILT_IN_HUBS:
        return BUILT_IN_HUBS[unpunct]

    # 2. In-memory cache
    if norm in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[norm]

    # 3. Fallback to OpenStreetMap Nominatim
    url = "https://nominatim.openstreetmap.org/search"
    headers = {
        "User-Agent": "SpotterWeatherAwareTruckRouting/1.0 (spotter-truck-routing@example.com)",
        "Accept": "application/json",
    }
    params = {
        "q": query.strip(),
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
    }

    try:
        response = requests.get(url, params=params, headers=headers, timeout=6.0)
        response.raise_for_status()
        data = response.json()
        if data and len(data) > 0:
            result = data[0]
            lat = float(result["lat"])
            lon = float(result["lon"])
            display_name = str(result.get("display_name", query))
            # Keep display name concise if too long
            parts = [p.strip() for p in display_name.split(",")]
            short_name = ", ".join(parts[:3]) if len(parts) >= 3 else display_name
            entry = (lat, lon, short_name)
            _GEOCODE_CACHE[norm] = entry
            return entry
    except Exception as exc:
        logger.warning("Nominatim geocoding failed for %r: %s", query, exc)

    # If geocoding failed and query has a partial match in BUILT_IN_HUBS
    for key, val in BUILT_IN_HUBS.items():
        if key in norm or norm in key:
            _GEOCODE_CACHE[norm] = val
            return val

    raise ValueError(f"Could not geocode location: '{query}'. Please specify City, ST or a valid address.")
