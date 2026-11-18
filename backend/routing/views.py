"""
REST API Views for Spotter Weather-Aware Truck Routing.

Endpoints:
- POST /api/routes/analyze/: Full pipeline (geocoding, 3-route generation,
  checkpoint sampling, batch weather, risk evaluation, ranking, and 0-48h heatmap).
- GET /api/routes/presets/: Curated high-traffic US freight corridors.
"""

from __future__ import annotations

import logging
from typing import Any
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .services import (
    RiskLevel,
    geocode_location,
    fetch_three_routes,
    sample_route_checkpoints,
    enrich_checkpoints_with_weather,
    build_corridor_heatmap,
    evaluate_checkpoint,
    rank_and_recommend_routes,
)
from .services.sampler import parse_datetime

logger = logging.getLogger(__name__)

PRESET_CORRIDORS = [
    {
        "id": "chicago_denver",
        "title": "Chicago, IL → Denver, CO",
        "origin": "Chicago, IL",
        "destination": "Denver, CO",
        "default_load_weight_lbs": 42000,
        "default_interval_miles": 25,
        "description": "Crosses the Midwest and Great Plains via I-80 / I-70 with high crosswinds and sudden winter squalls.",
        "highlights": ["I-80 Nebraska Plains", "I-76 / I-70 Approaches", "Frequent Crosswind Blowovers"],
    },
    {
        "id": "slc_cheyenne",
        "title": "Salt Lake City, UT → Cheyenne, WY",
        "origin": "Salt Lake City, UT",
        "destination": "Cheyenne, WY",
        "default_load_weight_lbs": 36000,
        "default_interval_miles": 25,
        "description": "The notorious Wyoming I-80 corridor (Elk Mountain, Arlington, Sherman Summit) infamous for 55+ mph rollover winds.",
        "highlights": ["Elk Mountain Pass", "High Plains Gap Winds", "Extreme Rollover Danger"],
    },
    {
        "id": "dallas_atlanta",
        "title": "Dallas, TX → Atlanta, GA",
        "origin": "Dallas, TX",
        "destination": "Atlanta, GA",
        "default_load_weight_lbs": 44000,
        "default_interval_miles": 25,
        "description": "Heavy commercial freight lane across the Deep South via I-20 with intense rain bands and severe thunderstorms.",
        "highlights": ["I-20 Louisiana / Mississippi", "Severe Rain Hydroplaning", "High Traffic Density"],
    },
    {
        "id": "seattle_minneapolis",
        "title": "Seattle, WA → Minneapolis, MN",
        "origin": "Seattle, WA",
        "destination": "Minneapolis, MN",
        "default_load_weight_lbs": 32000,
        "default_interval_miles": 50,
        "description": "Northern transcontinental route traversing Snoqualmie Pass, Montana Rockies, and North Dakota winter freezes.",
        "highlights": ["Cascade Mountain Passes", "Northern Plains Freezes", "Long-Haul Mountain Driving"],
    },
]


class RoutePresetsView(APIView):
    """Returns curated US freight corridor presets for one-click testing."""

    def get(self, request, *args, **kwargs):
        return Response({
            "presets": PRESET_CORRIDORS,
            "sample_intervals_available": [10, 25, 50],
            "weather_modes_available": ["live", "simulated_storm"],
        })


class RouteAnalyzeView(APIView):
    """
    End-to-end route analysis and recommendation endpoint:
    Geocodes -> Fetches 3 Routes -> Samples Checkpoints -> Enriches with Weather
    -> Evaluates Load & Weather Risk -> Ranks Routes -> Builds 0-48h Heatmap.
    """

    def post(self, request, *args, **kwargs):
        data = request.data or {}

        # 1. Input Validation
        origin_query = str(data.get("origin", "")).strip()
        dest_query = str(data.get("destination", "")).strip()

        if not origin_query:
            return Response(
                {"error": "Field 'origin' is required (e.g. 'Chicago, IL')."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not dest_query:
            return Response(
                {"error": "Field 'destination' is required (e.g. 'Denver, CO')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            load_weight_lbs = float(data.get("load_weight_lbs", 35000))
            if load_weight_lbs < 0:
                load_weight_lbs = 0.0
        except (ValueError, TypeError):
            load_weight_lbs = 35000.0

        try:
            interval = int(data.get("sample_interval_miles", 25))
            if interval not in (10, 25, 50):
                interval = 25
        except (ValueError, TypeError):
            interval = 25

        weather_mode = str(data.get("weather_mode", "live")).strip().lower()
        if weather_mode not in ("live", "simulated_storm"):
            weather_mode = "live"

        departure_time_val = data.get("departure_time")
        departure_dt = parse_datetime(departure_time_val)

        # 2. Geocoding
        try:
            o_lat, o_lon, o_name = geocode_location(origin_query)
        except Exception as exc:
            return Response(
                {"error": f"Failed to geocode origin '{origin_query}': {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            d_lat, d_lon, d_name = geocode_location(dest_query)
        except Exception as exc:
            return Response(
                {"error": f"Failed to geocode destination '{dest_query}': {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3. 3-Route Generation
        try:
            raw_routes = fetch_three_routes(o_lat, o_lon, d_lat, d_lon)
        except Exception as exc:
            logger.exception("Error generating routes: %s", exc)
            return Response(
                {"error": f"Failed to generate routing options: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # 4. Checkpoint Sampling along all routes
        sampled_routes: list[dict[str, Any]] = []
        all_lats: list[float] = [o_lat, d_lat]
        all_lons: list[float] = [o_lon, d_lon]

        for r in raw_routes:
            coords = r["geometry"]["coordinates"]
            dist_mi = r["distance_miles"]
            dur_sec = r["travel_time_seconds"]

            checkpoints = sample_route_checkpoints(
                coordinates=coords,
                distance_miles=dist_mi,
                travel_time_seconds=dur_sec,
                departure_time=departure_dt,
                sample_interval_miles=interval,
            )

            for cp in checkpoints:
                all_lats.append(cp.lat)
                all_lons.append(cp.lon)

            sampled_routes.append({
                "raw_route": r,
                "checkpoints": checkpoints,
            })

        corridor_bounds = (min(all_lats), max(all_lats), min(all_lons), max(all_lons))

        # 5. Weather Enrichment & Risk Classification per Route
        prepared_routes_for_ranking: list[dict[str, Any]] = []
        cluster_weather_all: dict[Any, Any] = {}

        for item in sampled_routes:
            r = item["raw_route"]
            cps = item["checkpoints"]

            weather_samples, cluster_weather = enrich_checkpoints_with_weather(
                checkpoints=cps,
                weather_mode=weather_mode,
                load_weight_lbs=load_weight_lbs,
                corridor_bounds=corridor_bounds,
            )
            cluster_weather_all.update(cluster_weather)

            evaluated_cps = []
            for cp, ws in zip(cps, weather_samples):
                eval_res = evaluate_checkpoint(
                    wind_speed_mph=ws.wind_speed_mph,
                    rain_rate_in_hr=ws.rain_rate_in_hr,
                    snow_rate_in_hr=ws.snow_rate_in_hr,
                    load_weight_lbs=load_weight_lbs,
                    distance_from_origin_miles=cp.milepost,
                    segment_miles=cp.segment_miles,
                    eta_iso=cp.eta_iso,
                    lat=cp.lat,
                    lon=cp.lon,
                    temperature_f=ws.temperature_f,
                )
                # Attach segment_geometry to evaluated checkpoint for frontend map rendering
                eval_dict = eval_res.to_dict()
                eval_dict["index"] = cp.index
                eval_dict["milepost"] = cp.milepost
                eval_dict["hours_from_departure"] = cp.hours_from_departure
                eval_dict["segment_geometry"] = cp.segment_geometry
                eval_dict["weather_code"] = ws.weather_code
                evaluated_cps.append(eval_dict)

            prepared_routes_for_ranking.append({
                "route_id": r["route_id"],
                "name": r["name"],
                "total_distance_miles": r["distance_miles"],
                "travel_time_seconds": r["travel_time_seconds"],
                "geometry": r["geometry"],
                "checkpoints": evaluated_cps,
                "load_weight_lbs": load_weight_lbs,
            })

        # 6. Route Ranking & Recommendation
        rec_result = rank_and_recommend_routes(
            routes=prepared_routes_for_ranking,
            load_weight_lbs=load_weight_lbs,
        )

        # Collect all coordinates from the 3 routes for organic corridor feathering
        all_corridor_coords: list[list[float]] = []
        for r in raw_routes:
            coords = r.get("geometry", {}).get("coordinates", [])
            all_corridor_coords.extend(coords)

        # 7. Corridor Heatmap Generation (0-48 hours)
        heatmap = build_corridor_heatmap(
            corridor_bounds=corridor_bounds,
            cluster_weather_map=cluster_weather_all,
            weather_mode=weather_mode,
            load_weight_lbs=load_weight_lbs,
            departure_time=departure_dt,
            corridor_coords=all_corridor_coords,
        )

        # 8. Build structured response
        response_data = {
            "origin": {
                "query": origin_query,
                "display_name": o_name,
                "lat": o_lat,
                "lon": o_lon,
            },
            "destination": {
                "query": dest_query,
                "display_name": d_name,
                "lat": d_lat,
                "lon": d_lon,
            },
            "departure_time": departure_dt.isoformat(),
            "load_weight_lbs": load_weight_lbs,
            "sample_interval_miles": interval,
            "weather_mode": weather_mode,
            "recommended_route_id": rec_result.recommended_route.route_id,
            "recommendation_reason": rec_result.recommended_route.recommendation_reason,
            "decision_summary": rec_result.decision_summary,
            "routes": [r.to_dict() for r in rec_result.ranked_routes],
            "heatmap": heatmap,
        }

        return Response(response_data, status=status.HTTP_200_OK)
