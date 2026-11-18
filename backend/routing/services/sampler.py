"""
Geodesic Checkpoint Sampler & ETA Calculator for Spotter Truck Routing.

Walks along road geometry using Haversine distances to sample checkpoints
at specified mile intervals (10, 25, or 50 miles). Calculates precise arrival
timestamps (ETAs), segment mileage allocations, and GeoJSON segment geometries.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
import math
from typing import Any, Optional, Sequence


EARTH_RADIUS_MILES = 3958.8


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth in miles."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_MILES * c


def parse_datetime(dt_val: Optional[Any]) -> datetime:
    """Safely parse input string or datetime into a timezone-aware UTC datetime."""
    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            return dt_val.replace(tzinfo=timezone.utc)
        return dt_val

    if isinstance(dt_val, str) and dt_val.strip():
        s = dt_val.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(s)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            pass

    return datetime.now(timezone.utc)


@dataclass
class RouteCheckpoint:
    """Sampled checkpoint along a route corridor."""
    index: int
    milepost: float
    segment_miles: float
    lat: float
    lon: float
    eta_iso: str
    hours_from_departure: float
    segment_geometry: list[list[float]]  # [[lon, lat], ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def interpolate_coordinate_at_distance(
    coords: Sequence[list[float]],
    cum_distances: Sequence[float],
    target_dist: float,
) -> tuple[float, float]:
    """
    Interpolate [lat, lon] at target_dist miles along a polyline.
    coords is in [lon, lat] format.
    """
    if target_dist <= cum_distances[0]:
        return coords[0][1], coords[0][0]  # lat, lon
    if target_dist >= cum_distances[-1]:
        return coords[-1][1], coords[-1][0]

    # Find segment [k, k+1] enclosing target_dist
    k = 0
    while k < len(cum_distances) - 1 and cum_distances[k + 1] < target_dist:
        k += 1

    d_start = cum_distances[k]
    d_end = cum_distances[k + 1]
    seg_len = d_end - d_start

    if seg_len <= 1e-6:
        return coords[k][1], coords[k][0]

    fraction = (target_dist - d_start) / seg_len
    lon = coords[k][0] + fraction * (coords[k + 1][0] - coords[k][0])
    lat = coords[k][1] + fraction * (coords[k + 1][1] - coords[k][1])
    return lat, lon


def extract_subgeometry(
    coords: Sequence[list[float]],
    cum_distances: Sequence[float],
    start_dist: float,
    end_dist: float,
) -> list[list[float]]:
    """Extract coordinates between start_dist and end_dist along polyline."""
    sub: list[list[float]] = []

    # Start point
    s_lat, s_lon = interpolate_coordinate_at_distance(coords, cum_distances, start_dist)
    sub.append([round(s_lon, 5), round(s_lat, 5)])

    # Intermediate original vertices
    for i, c in enumerate(coords):
        d = cum_distances[i]
        if start_dist < d < end_dist:
            sub.append([round(c[0], 5), round(c[1], 5)])

    # End point
    e_lat, e_lon = interpolate_coordinate_at_distance(coords, cum_distances, end_dist)
    sub.append([round(e_lon, 5), round(e_lat, 5)])

    return sub


def sample_route_checkpoints(
    coordinates: list[list[float]],
    distance_miles: float,
    travel_time_seconds: float,
    departure_time: Optional[Any] = None,
    sample_interval_miles: int = 25,
) -> list[RouteCheckpoint]:
    """
    Sample checkpoints along a GeoJSON coordinates path at exact mileposts:
      - Mile 0.0 (Origin)
      - Every sample_interval_miles (e.g. 10, 25, 50 miles)
      - Destination milepost (distance_miles)

    Allocates contiguous segment miles so sum(segment_miles) == distance_miles.
    """
    if not coordinates or len(coordinates) < 2:
        raise ValueError("Route must contain at least 2 coordinates.")

    interval = float(max(5, sample_interval_miles))
    dist_total = max(0.1, float(distance_miles))
    dur_total = max(60.0, float(travel_time_seconds))
    dep_dt = parse_datetime(departure_time)

    # 1. Compute cumulative Haversine distance along line coordinates
    cum_dists: list[float] = [0.0]
    raw_dist = 0.0
    for i in range(1, len(coordinates)):
        lon1, lat1 = coordinates[i - 1][0], coordinates[i - 1][1]
        lon2, lat2 = coordinates[i][0], coordinates[i][1]
        d = haversine_miles(lat1, lon1, lat2, lon2)
        raw_dist += d
        cum_dists.append(raw_dist)

    # Scale cumulative distances to match OSRM road distance
    scale = (dist_total / raw_dist) if raw_dist > 0.0 else 1.0
    scaled_cum_dists = [round(d * scale, 4) for d in cum_dists]
    scaled_cum_dists[-1] = dist_total

    # 2. Determine target sample mileposts: 0.0, 25.0, 50.0, ..., destination
    sample_mileposts: list[float] = [0.0]
    curr = interval
    while curr < dist_total - (interval * 0.25):  # avoid tiny final sliver (< 25% of interval)
        sample_mileposts.append(round(curr, 2))
        curr += interval
    sample_mileposts.append(round(dist_total, 2))

    num_samples = len(sample_mileposts)

    # 3. Compute segment boundaries using midpoints so each checkpoint
    #    covers a contiguous, non-overlapping slice and sum == dist_total
    boundaries: list[float] = [0.0]
    for i in range(num_samples - 1):
        mid = (sample_mileposts[i] + sample_mileposts[i + 1]) / 2.0
        boundaries.append(round(mid, 3))
    boundaries.append(round(dist_total, 3))

    # 4. Create checkpoints
    checkpoints: list[RouteCheckpoint] = []
    for i in range(num_samples):
        mp = sample_mileposts[i]
        seg_len = round(boundaries[i + 1] - boundaries[i], 2)

        lat, lon = interpolate_coordinate_at_distance(coordinates, scaled_cum_dists, mp)

        # ETA calculation
        frac = mp / dist_total
        seconds_elapsed = frac * dur_total
        eta_dt = dep_dt + timedelta(seconds=seconds_elapsed)
        hours_elapsed = round(seconds_elapsed / 3600.0, 2)

        # Extract road segment geometry
        seg_geom = extract_subgeometry(
            coordinates, scaled_cum_dists, boundaries[i], boundaries[i + 1]
        )

        checkpoints.append(
            RouteCheckpoint(
                index=i,
                milepost=round(mp, 1),
                segment_miles=seg_len,
                lat=round(lat, 5),
                lon=round(lon, 5),
                eta_iso=eta_dt.isoformat(),
                hours_from_departure=hours_elapsed,
                segment_geometry=seg_geom,
            )
        )

    # 5. Fix tiny rounding difference on segment_miles so sum is mathematically exact
    sum_segs = sum(cp.segment_miles for cp in checkpoints)
    diff = round(dist_total - sum_segs, 2)
    if abs(diff) > 0.001 and len(checkpoints) > 0:
        checkpoints[-1].segment_miles = round(checkpoints[-1].segment_miles + diff, 2)

    return checkpoints
