"""
Route Summary and Recommendation Engine for Spotter Truck Routing.

Aggregates weather risk along route checkpoints, computes segment mile breakdowns
(No Travel, Severe, High, Moderate, Low), and ranks routes based on safety-first
priority criteria.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Optional, Sequence, Union

from .risk_engine import (
    RiskLevel,
    CheckpointRiskResult,
    CheckpointWeatherInput,
    evaluate_checkpoint,
)


@dataclass
class RouteSummary:
    """Summary metrics, safety breakdown, and recommendation status for a route."""
    route_id: str
    name: str
    total_distance_miles: float
    travel_time_seconds: float
    travel_time_minutes: float
    travel_time_formatted: str
    no_travel_miles: float
    severe_miles: float
    high_miles: float
    moderate_miles: float
    low_miles: float
    average_risk_score: float  # Scale 1.0 to 5.0
    overall_route_risk: RiskLevel
    is_travel_advised: bool
    is_recommended: bool = False
    recommendation_reason: Optional[str] = None
    checkpoints: list[CheckpointRiskResult] = field(default_factory=list)
    geometry: Optional[Any] = None  # Polyline or GeoJSON coordinates

    @property
    def overall_route_risk_label(self) -> str:
        return self.overall_route_risk.name

    @property
    def ranking_key(self) -> tuple[float, float, float, float, float]:
        """
        Exact 5-tier priority tuple for safety-first route ranking:
          1. Fewest no_travel_miles
          2. Fewest severe_miles
          3. Fewest high_miles
          4. Lowest average_risk_score
          5. Shortest travel_time_seconds
        Lowest tuple wins.
        """
        return (
            round(self.no_travel_miles, 2),
            round(self.severe_miles, 2),
            round(self.high_miles, 2),
            round(self.average_risk_score, 4),
            self.travel_time_seconds,
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to a JSON-compatible dictionary."""
        data = asdict(self)
        data["overall_route_risk"] = self.overall_route_risk.name
        data["overall_route_risk_score"] = int(self.overall_route_risk)
        data["ranking_key"] = list(self.ranking_key)
        data["checkpoints"] = [cp.to_dict() for cp in self.checkpoints]
        return data


@dataclass
class RouteInput:
    """Input structure representing a route candidate to be analyzed and ranked."""
    route_id: str
    name: str
    total_distance_miles: float
    travel_time_seconds: float
    checkpoints: list[Union[CheckpointRiskResult, CheckpointWeatherInput, dict[str, Any]]]
    geometry: Optional[Any] = None
    load_weight_lbs: float = 0.0


@dataclass
class RecommendationResult:
    """Final recommendation decision containing the top route and all ranked options."""
    recommended_route: RouteSummary
    ranked_routes: list[RouteSummary]
    decision_summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "recommended_route": self.recommended_route.to_dict(),
            "ranked_routes": [r.to_dict() for r in self.ranked_routes],
            "decision_summary": self.decision_summary,
        }


def format_duration(seconds: float) -> str:
    """Format duration in seconds to a concise string e.g. '5h 42m' or '35m'."""
    total_mins = int(round(seconds / 60.0))
    hours = total_mins // 60
    mins = total_mins % 60
    if hours > 0 and mins > 0:
        return f"{hours}h {mins}m"
    if hours > 0:
        return f"{hours}h"
    return f"{mins}m"


def summarize_route(
    route: Union[RouteInput, RouteSummary, dict[str, Any]],
    load_weight_lbs: float = 0.0,
) -> RouteSummary:
    """
    Compute weather risk breakdowns and aggregate metrics for a single route.

    Supports raw weather checkpoints (evaluating them with load_weight_lbs)
    or pre-evaluated CheckpointRiskResult objects.
    """
    if isinstance(route, RouteSummary):
        return route

    # Extract fields from dict or RouteInput
    if isinstance(route, dict):
        route_id = str(route.get("route_id") or route.get("id") or "route")
        name = str(route.get("name") or route_id)
        total_distance = float(route.get("total_distance_miles", 0.0))
        travel_seconds = float(
            route.get("travel_time_seconds")
            or route.get("duration_seconds")
            or (float(route.get("travel_time_minutes", 0.0)) * 60.0)
        )
        raw_checkpoints = route.get("checkpoints", [])
        geometry = route.get("geometry")
        weight = float(route.get("load_weight_lbs", load_weight_lbs))
    else:
        route_id = route.route_id
        name = route.name
        total_distance = float(route.total_distance_miles)
        travel_seconds = float(route.travel_time_seconds)
        raw_checkpoints = route.checkpoints
        geometry = route.geometry
        weight = float(route.load_weight_lbs or load_weight_lbs)

    # 1. Standardize and evaluate checkpoints
    evaluated_checkpoints: list[CheckpointRiskResult] = []
    num_cp = len(raw_checkpoints)

    for i, cp in enumerate(raw_checkpoints):
        if isinstance(cp, CheckpointRiskResult):
            evaluated_checkpoints.append(cp)
        elif isinstance(cp, CheckpointWeatherInput):
            # Compute segment miles if missing
            seg = cp.segment_miles
            if seg <= 0.0 and total_distance > 0.0 and num_cp > 0:
                seg = total_distance / num_cp
            evaluated = evaluate_checkpoint(
                wind_speed_mph=cp.wind_speed_mph,
                rain_rate_in_hr=cp.rain_rate_in_hr,
                snow_rate_in_hr=cp.snow_rate_in_hr,
                load_weight_lbs=weight,
                distance_from_origin_miles=cp.distance_from_origin_miles,
                segment_miles=seg,
                eta_iso=cp.eta_iso,
                lat=cp.lat,
                lon=cp.lon,
                location_name=cp.location_name,
                temperature_f=cp.temperature_f,
            )
            evaluated_checkpoints.append(evaluated)
        elif isinstance(cp, dict):
            # If already evaluated
            if "overall_risk" in cp and isinstance(cp["overall_risk"], (RiskLevel, str, int)):
                risk_lvl = RiskLevel.from_value(cp["overall_risk"])
                wind_lvl = RiskLevel.from_value(cp.get("wind_risk", RiskLevel.LOW))
                rain_lvl = RiskLevel.from_value(cp.get("rain_risk", RiskLevel.LOW))
                snow_lvl = RiskLevel.from_value(cp.get("snow_risk", RiskLevel.LOW))
                seg = float(cp.get("segment_miles", 0.0))
                if seg <= 0.0 and total_distance > 0.0 and num_cp > 0:
                    seg = total_distance / num_cp
                evaluated_checkpoints.append(
                    CheckpointRiskResult(
                        distance_from_origin_miles=float(cp.get("distance_from_origin_miles", 0.0)),
                        segment_miles=round(seg, 2),
                        overall_risk=risk_lvl,
                        wind_risk=wind_lvl,
                        rain_risk=rain_lvl,
                        snow_risk=snow_lvl,
                        risk_reasons=list(cp.get("risk_reasons", [])),
                        wind_speed_mph=float(cp.get("wind_speed_mph", 0.0)),
                        rain_rate_in_hr=float(cp.get("rain_rate_in_hr", 0.0)),
                        snow_rate_in_hr=float(cp.get("snow_rate_in_hr", 0.0)),
                        load_weight_lbs=float(cp.get("load_weight_lbs", weight)),
                        temperature_f=cp.get("temperature_f"),
                        eta_iso=cp.get("eta_iso"),
                        lat=cp.get("lat"),
                        lon=cp.get("lon"),
                        location_name=cp.get("location_name"),
                    )
                )
            else:
                # Raw weather dict
                seg = float(cp.get("segment_miles", 0.0))
                if seg <= 0.0 and total_distance > 0.0 and num_cp > 0:
                    seg = total_distance / num_cp
                evaluated = evaluate_checkpoint(
                    wind_speed_mph=float(cp.get("wind_speed_mph", 0.0)),
                    rain_rate_in_hr=float(cp.get("rain_rate_in_hr", 0.0)),
                    snow_rate_in_hr=float(cp.get("snow_rate_in_hr", 0.0)),
                    load_weight_lbs=weight,
                    distance_from_origin_miles=float(cp.get("distance_from_origin_miles", 0.0)),
                    segment_miles=seg,
                    eta_iso=cp.get("eta_iso"),
                    lat=cp.get("lat"),
                    lon=cp.get("lon"),
                    location_name=cp.get("location_name"),
                    temperature_f=cp.get("temperature_f"),
                )
                evaluated_checkpoints.append(evaluated)

    # 2. Apportion segment miles if sum is 0
    total_seg_miles = sum(cp.segment_miles for cp in evaluated_checkpoints)
    if total_seg_miles <= 0.0 and total_distance > 0.0 and len(evaluated_checkpoints) > 0:
        equal_seg = total_distance / len(evaluated_checkpoints)
        for cp in evaluated_checkpoints:
            cp.segment_miles = round(equal_seg, 2)
        total_seg_miles = sum(cp.segment_miles for cp in evaluated_checkpoints)

    # 3. Sum mileage per risk category
    no_travel_m = 0.0
    severe_m = 0.0
    high_m = 0.0
    moderate_m = 0.0
    low_m = 0.0

    weighted_risk_sum = 0.0
    max_risk = RiskLevel.LOW

    for cp in evaluated_checkpoints:
        seg = cp.segment_miles
        risk = cp.overall_risk
        if risk > max_risk:
            max_risk = risk

        weighted_risk_sum += seg * int(risk)

        if risk == RiskLevel.NO_TRAVEL:
            no_travel_m += seg
        elif risk == RiskLevel.SEVERE:
            severe_m += seg
        elif risk == RiskLevel.HIGH:
            high_m += seg
        elif risk == RiskLevel.MODERATE:
            moderate_m += seg
        else:
            low_m += seg

    # 4. Average risk score calculation
    if total_seg_miles > 0.0:
        avg_risk = weighted_risk_sum / total_seg_miles
    elif evaluated_checkpoints:
        avg_risk = sum(int(cp.overall_risk) for cp in evaluated_checkpoints) / len(evaluated_checkpoints)
    else:
        avg_risk = 1.0

    avg_risk = max(1.0, min(5.0, round(avg_risk, 2)))

    # Fallback distance if total_distance was 0
    if total_distance <= 0.0 and total_seg_miles > 0.0:
        total_distance = total_seg_miles

    travel_minutes = round(travel_seconds / 60.0, 1)
    is_advised = (round(no_travel_m, 2) == 0.0)

    return RouteSummary(
        route_id=route_id,
        name=name,
        total_distance_miles=round(total_distance, 1),
        travel_time_seconds=travel_seconds,
        travel_time_minutes=travel_minutes,
        travel_time_formatted=format_duration(travel_seconds),
        no_travel_miles=round(no_travel_m, 1),
        severe_miles=round(severe_m, 1),
        high_miles=round(high_m, 1),
        moderate_miles=round(moderate_m, 1),
        low_miles=round(low_m, 1),
        average_risk_score=avg_risk,
        overall_route_risk=max_risk,
        is_travel_advised=is_advised,
        checkpoints=evaluated_checkpoints,
        geometry=geometry,
    )


def generate_recommendation_reason(
    winner: RouteSummary,
    alternatives: Sequence[RouteSummary],
) -> str:
    """
    Generate a concise, human-readable explanation of why the winning route was chosen
    over the alternative routes.
    """
    if not alternatives:
        if not winner.is_travel_advised:
            return (
                f"Warning: Route '{winner.name}' crosses {winner.no_travel_miles:.1f} miles of "
                "impassable/NO_TRAVEL weather conditions. No fully safe alternative was available."
            )
        return f"Recommended: Safest route with lowest weather risk profile ({winner.travel_time_formatted})."

    # Find the closest competitor (the 2nd ranked route)
    runner_up = alternatives[0]

    # Scenario 1: Winner avoids No Travel zones that affect runner-up
    if winner.no_travel_miles == 0.0 and runner_up.no_travel_miles > 0.0:
        alt_no_travel = max(alt.no_travel_miles for alt in alternatives if alt.no_travel_miles > 0)
        time_diff_sec = winner.travel_time_seconds - runner_up.travel_time_seconds
        time_diff_min = int(round(time_diff_sec / 60.0))
        if time_diff_min > 0:
            return (
                f"Recommended: Safest choice — completely avoids {alt_no_travel:.1f} miles of "
                f"impassable/NO_TRAVEL weather conditions with only {time_diff_min} min additional travel time."
            )
        return (
            f"Recommended: Safest choice — avoids {alt_no_travel:.1f} miles of "
            f"impassable/NO_TRAVEL zones while maintaining faster or equivalent travel time."
        )

    # Scenario 2: Both have No Travel zones (all routes have impassable conditions)
    if winner.no_travel_miles > 0.0:
        miles_saved = runner_up.no_travel_miles - winner.no_travel_miles
        return (
            f"Caution: All available routes cross dangerous weather zones. Route '{winner.name}' "
            f"minimizes hazardous exposure ({winner.no_travel_miles:.1f} mi vs {runner_up.no_travel_miles:.1f} mi)."
        )

    # Scenario 3: Winner avoids severe weather zones present on runner-up
    if winner.severe_miles < runner_up.severe_miles:
        miles_saved = runner_up.severe_miles - winner.severe_miles
        time_diff_sec = winner.travel_time_seconds - runner_up.travel_time_seconds
        time_diff_min = int(round(time_diff_sec / 60.0))
        if time_diff_min > 0:
            return (
                f"Recommended: Avoids {miles_saved:.1f} miles of severe weather on alternative routes "
                f"with only {time_diff_min} min additional travel time."
            )
        return (
            f"Recommended: Avoids {miles_saved:.1f} miles of severe weather while offering "
            f"optimal travel time ({winner.travel_time_formatted})."
        )

    # Scenario 4: Severe miles tied (e.g. 0), but winner avoids high-risk weather
    if winner.high_miles < runner_up.high_miles:
        miles_saved = runner_up.high_miles - winner.high_miles
        time_diff_sec = winner.travel_time_seconds - runner_up.travel_time_seconds
        time_diff_min = int(round(time_diff_sec / 60.0))
        if time_diff_min > 0:
            return (
                f"Recommended: Avoids {miles_saved:.1f} miles of high-risk weather with "
                f"only {time_diff_min} min additional travel time."
            )
        return (
            f"Recommended: Avoids {miles_saved:.1f} miles of high-risk weather with "
            f"faster travel time ({winner.travel_time_formatted})."
        )

    # Scenario 5: High miles tied, winner has lower average risk score
    if winner.average_risk_score < runner_up.average_risk_score:
        return (
            f"Recommended: Lowest overall weather risk score ({winner.average_risk_score:.2f} vs "
            f"{runner_up.average_risk_score:.2f}) across all corridors."
        )

    # Scenario 6: Weather risk identical, winner is faster
    time_saved_sec = runner_up.travel_time_seconds - winner.travel_time_seconds
    time_saved_min = int(round(time_saved_sec / 60.0))
    if time_saved_min > 0:
        return (
            f"Recommended: Fastest route ({winner.travel_time_formatted}, saving {time_saved_min} min) "
            "with identical low weather risk."
        )

    return f"Recommended: Optimal balance of safety and travel efficiency ({winner.travel_time_formatted})."


def rank_and_recommend_routes(
    routes: Sequence[Union[RouteInput, RouteSummary, dict[str, Any]]],
    load_weight_lbs: float = 0.0,
) -> RecommendationResult:
    """
    Summarize, rank, and select the best route according to the safety-first hierarchy:
      1. Fewest no_travel_miles
      2. Fewest severe_miles
      3. Fewest high_miles
      4. Lowest average_risk_score
      5. Shortest travel_time_seconds

    Returns RecommendationResult with the recommended route marked.
    """
    if not routes:
        raise ValueError("Cannot rank an empty list of routes.")

    # 1. Summarize all routes
    summaries = [summarize_route(r, load_weight_lbs=load_weight_lbs) for r in routes]

    # 2. Sort by the exact 5-tier priority key (lowest tuple wins)
    ranked = sorted(summaries, key=lambda r: r.ranking_key)

    # 3. Identify winner and alternatives
    winner = ranked[0]
    alternatives = ranked[1:]

    # 4. Generate recommendation reason
    reason = generate_recommendation_reason(winner, alternatives)
    winner.is_recommended = True
    winner.recommendation_reason = reason

    # Mark non-recommended routes
    for alt in alternatives:
        alt.is_recommended = False
        alt.recommendation_reason = None

    return RecommendationResult(
        recommended_route=winner,
        ranked_routes=ranked,
        decision_summary=reason,
    )
