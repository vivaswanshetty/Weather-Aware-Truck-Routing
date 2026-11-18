"""Services package for routing risk and recommendation domain logic."""

from .risk_engine import (
    RiskLevel,
    CheckpointWeatherInput,
    CheckpointRiskResult,
    classify_wind_risk,
    classify_rain_risk,
    classify_snow_risk,
    evaluate_checkpoint,
)
from .recommender import (
    RouteSummary,
    RouteInput,
    RecommendationResult,
    summarize_route,
    generate_recommendation_reason,
    rank_and_recommend_routes,
)
from .geocoder import geocode_location
from .routing_service import fetch_three_routes
from .sampler import sample_route_checkpoints, RouteCheckpoint
from .weather_service import (
    WeatherSample,
    enrich_checkpoints_with_weather,
    build_corridor_heatmap,
)

__all__ = [
    "RiskLevel",
    "CheckpointWeatherInput",
    "CheckpointRiskResult",
    "classify_wind_risk",
    "classify_rain_risk",
    "classify_snow_risk",
    "evaluate_checkpoint",
    "RouteSummary",
    "RouteInput",
    "RecommendationResult",
    "summarize_route",
    "generate_recommendation_reason",
    "rank_and_recommend_routes",
    "geocode_location",
    "fetch_three_routes",
    "sample_route_checkpoints",
    "RouteCheckpoint",
    "WeatherSample",
    "enrich_checkpoints_with_weather",
    "build_corridor_heatmap",
]
