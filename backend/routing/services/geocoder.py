"""
Geocoding Service for Spotter Truck Routing.

Resolves US cities, freight hubs, and addresses to (lat, lon, display_name).
Includes an instantaneous built-in lookup for primary US freight corridors,
an Open-Meteo Geocoding integration with state matching, and an OpenStreetMap
Nominatim fallback with in-memory caching.
"""

from __future__ import annotations

import logging
import re
from typing import Optional, Tuple
import requests

logger = logging.getLogger(__name__)

# US State abbreviations to full names mapping for accurate geocoding resolution
US_STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}

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
    "miami, fl": (25.7617, -80.1918, "Miami, FL, USA"),
    "miami": (25.7617, -80.1918, "Miami, FL, USA"),
    "boston, ma": (42.3601, -71.0589, "Boston, MA, USA"),
    "boston": (42.3601, -71.0589, "Boston, MA, USA"),
    "detroit, mi": (42.3314, -83.0458, "Detroit, MI, USA"),
    "detroit": (42.3314, -83.0458, "Detroit, MI, USA"),
    "philadelphia, pa": (39.9526, -75.1652, "Philadelphia, PA, USA"),
    "philadelphia": (39.9526, -75.1652, "Philadelphia, PA, USA"),
    "san francisco, ca": (37.7749, -122.4194, "San Francisco, CA, USA"),
    "san francisco": (37.7749, -122.4194, "San Francisco, CA, USA"),
    "charlotte, nc": (35.2271, -80.8431, "Charlotte, NC, USA"),
    "charlotte": (35.2271, -80.8431, "Charlotte, NC, USA"),
    "pittsburgh, pa": (40.4406, -79.9959, "Pittsburgh, PA, USA"),
    "pittsburgh": (40.4406, -79.9959, "Pittsburgh, PA, USA"),
    "cleveland, oh": (41.4993, -81.6944, "Cleveland, OH, USA"),
    "cleveland": (41.4993, -81.6944, "Cleveland, OH, USA"),
    "cincinnati, oh": (39.1031, -84.5120, "Cincinnati, OH, USA"),
    "cincinnati": (39.1031, -84.5120, "Cincinnati, OH, USA"),
    "columbus, oh": (39.9612, -82.9988, "Columbus, OH, USA"),
    "columbus": (39.9612, -82.9988, "Columbus, OH, USA"),
    "tampa, fl": (27.9506, -82.4572, "Tampa, FL, USA"),
    "tampa": (27.9506, -82.4572, "Tampa, FL, USA"),
    "orlando, fl": (28.5383, -81.3792, "Orlando, FL, USA"),
    "orlando": (28.5383, -81.3792, "Orlando, FL, USA"),
    "las vegas, nv": (36.1699, -115.1398, "Las Vegas, NV, USA"),
    "las vegas": (36.1699, -115.1398, "Las Vegas, NV, USA"),
    "baltimore, md": (39.2904, -76.6122, "Baltimore, MD, USA"),
    "baltimore": (39.2904, -76.6122, "Baltimore, MD, USA"),
    "milwaukee, wi": (43.0389, -87.9065, "Milwaukee, WI, USA"),
    "milwaukee": (43.0389, -87.9065, "Milwaukee, WI, USA"),
    "new orleans, la": (29.9511, -90.0715, "New Orleans, LA, USA"),
    "new orleans": (29.9511, -90.0715, "New Orleans, LA, USA"),
}

_GEOCODE_CACHE: dict[str, Tuple[float, float, str]] = {}


def normalize_query(query: str) -> str:
    """Normalize query string for dictionary matching."""
    cleaned = query.strip().lower()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def _geocode_via_open_meteo(query: str) -> Optional[Tuple[float, float, str]]:
    """
    Geocode using the free Open-Meteo Geocoding API with state-level disambiguation.
    Returns (lat, lon, display_name) or None.
    """
    try:
        parts = [p.strip() for p in query.split(",")]
        city = parts[0]
        state_filter = ""
        if len(parts) > 1:
            raw_state = parts[1].strip().upper()
            state_filter = US_STATE_NAMES.get(raw_state, parts[1].strip()).lower()

        url = "https://geocoding-api.open-meteo.com/v1/search"
        params = {
            "name": city,
            "count": 5,
            "country": "US",
            "format": "json",
            "language": "en",
        }
        resp = requests.get(url, params=params, timeout=5.0)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("results", [])
            if results:
                # If state was specified, find matching admin1
                if state_filter:
                    for r in results:
                        admin1 = (r.get("admin1") or "").lower()
                        if state_filter in admin1 or admin1 in state_filter:
                            lat = float(r["latitude"])
                            lon = float(r["longitude"])
                            name = f"{r['name']}, {r.get('admin1', 'USA')}, USA"
                            return (lat, lon, name)

                # Default to highest population result
                top = results[0]
                lat = float(top["latitude"])
                lon = float(top["longitude"])
                name = f"{top['name']}, {top.get('admin1', 'USA')}, USA"
                return (lat, lon, name)
    except Exception as exc:
        logger.debug("Open-Meteo geocoding error for %r: %s", query, exc)
    return None


def _geocode_via_nominatim(query: str) -> Optional[Tuple[float, float, str]]:
    """
    Fallback to OpenStreetMap Nominatim with strict compliance headers.
    """
    url = "https://nominatim.openstreetmap.org/search"
    headers = {
        "User-Agent": "SpotterLogisticsRoutingSystem/2.0 (dispatch-safety-team@spotter-freight.com)",
        "Accept": "application/json",
    }
    params = {
        "q": query.strip(),
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
    }
    try:
        response = requests.get(url, params=params, headers=headers, timeout=5.0)
        if response.status_code == 200:
            data = response.json()
            if data and len(data) > 0:
                result = data[0]
                lat = float(result["lat"])
                lon = float(result["lon"])
                display_name = str(result.get("display_name", query))
                parts = [p.strip() for p in display_name.split(",")]
                short_name = ", ".join(parts[:3]) if len(parts) >= 3 else display_name
                return (lat, lon, short_name)
    except Exception as exc:
        logger.debug("Nominatim geocoding error for %r: %s", query, exc)
    return None


def geocode_location(query: str) -> Tuple[float, float, str]:
    """
    Resolve query string to (lat, lon, display_name).

    1. Checks built-in dictionary of US logistics hubs (instant 0ms).
    2. Checks in-memory cache.
    3. Queries Open-Meteo Geocoding API with state-disambiguation.
    4. Fallback to OpenStreetMap Nominatim.
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

    # 3. Open-Meteo Geocoding API
    om_res = _geocode_via_open_meteo(query)
    if om_res:
        _GEOCODE_CACHE[norm] = om_res
        return om_res

    # 4. Fallback to OpenStreetMap Nominatim
    nom_res = _geocode_via_nominatim(query)
    if nom_res:
        _GEOCODE_CACHE[norm] = nom_res
        return nom_res

    # 5. Partial match in BUILT_IN_HUBS
    for key, val in BUILT_IN_HUBS.items():
        if key in norm or norm in key:
            _GEOCODE_CACHE[norm] = val
            return val

    raise ValueError(f"Could not geocode location: '{query}'. Please specify City, ST or a valid address.")
