"""
Core Weather & Load Risk Engine for Spotter Truck Routing.

Implements risk classification for wind, rain, and snow based on standard safety
thresholds and commercial load weight overrides.
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from enum import IntEnum
from typing import Any, Optional


class RiskLevel(IntEnum):
    """
    Risk severity levels and their corresponding numeric weights (1 to 5).
    Numeric ordering allows direct arithmetic comparison (e.g. LOW < SEVERE).
    """
    LOW = 1
    MODERATE = 2
    HIGH = 3
    SEVERE = 4
    NO_TRAVEL = 5

    @property
    def label(self) -> str:
        return self.name

    @classmethod
    def from_value(cls, val: Any) -> RiskLevel:
        if isinstance(val, RiskLevel):
            return val
        if isinstance(val, int):
            return cls(val)
        if isinstance(val, str):
            clean = val.strip().upper()
            if clean in cls.__members__:
                return cls[clean]
        raise ValueError(f"Cannot convert {val!r} to RiskLevel")


def classify_wind_risk(
    wind_speed_mph: float,
    load_weight_lbs: float = 0.0,
) -> tuple[RiskLevel, Optional[str]]:
    """
    Classify wind speed risk including commercial load weight override rules.

    Thresholds:
      - Low: < 25.0 mph
      - Moderate: >= 25.0 and < 35.0 mph (25-34 mph)
      - High: >= 35.0 and < 45.0 mph (35-44 mph)
      - Severe: >= 45.0 and < 55.0 mph (45-54 mph)
      - No Travel: >= 55.0 mph

    Load Weight Overrides:
      - Wind >= 55.0 mph -> NO_TRAVEL for any load
      - Wind in [45.0, 55.0) and load_weight_lbs > 30000 -> escalates to NO_TRAVEL
      - Wind in [35.0, 45.0) and load_weight_lbs > 40000 -> escalates to SEVERE

    Returns (RiskLevel, optional human-readable explanation if elevated).
    """
    wind = float(wind_speed_mph)
    weight = float(load_weight_lbs or 0.0)

    # 1. Extreme wind: >= 55.0 mph -> NO_TRAVEL regardless of load
    if wind >= 55.0:
        return (
            RiskLevel.NO_TRAVEL,
            f"Wind speed {wind:.1f} mph exceeds critical threshold (>= 55.0 mph) -> NO_TRAVEL for any load.",
        )

    # 2. Severe wind tier: 45.0 <= wind < 55.0 mph
    if wind >= 45.0:
        if weight > 30000.0:
            return (
                RiskLevel.NO_TRAVEL,
                (
                    f"{wind:.1f} mph wind with heavy load ({weight:,.0f} lbs > 30,000 lbs) "
                    "escalates risk to NO_TRAVEL (extreme rollover risk)."
                ),
            )
        return (
            RiskLevel.SEVERE,
            f"Wind speed {wind:.1f} mph (45.0–54.9 mph) poses SEVERE crosswind hazard.",
        )

    # 3. High wind tier: 35.0 <= wind < 45.0 mph
    if wind >= 35.0:
        if weight > 40000.0:
            return (
                RiskLevel.SEVERE,
                (
                    f"{wind:.1f} mph wind with heavy load ({weight:,.0f} lbs > 40,000 lbs) "
                    "escalates risk to SEVERE."
                ),
            )
        return (
            RiskLevel.HIGH,
            f"Wind speed {wind:.1f} mph (35.0–44.9 mph) poses HIGH crosswind hazard.",
        )

    # 4. Moderate wind tier: 25.0 <= wind < 35.0 mph
    if wind >= 25.0:
        return (
            RiskLevel.MODERATE,
            f"Wind speed {wind:.1f} mph (25.0–34.9 mph) poses MODERATE wind risk.",
        )

    # 5. Low wind tier: < 25.0 mph
    return (RiskLevel.LOW, None)


def classify_rain_risk(rain_rate_in_hr: float) -> tuple[RiskLevel, Optional[str]]:
    """
    Classify precipitation (rain rate) risk.

    Thresholds:
      - Low: < 0.10 in/hr
      - Moderate: >= 0.10 and < 0.25 in/hr (0.10–0.25 in/hr)
      - High: >= 0.25 and < 0.50 in/hr (0.25–0.50 in/hr)
      - Severe: >= 0.50 and <= 1.00 in/hr (0.50–1.00 in/hr)
      - No Travel: > 1.00 in/hr

    Returns (RiskLevel, optional human-readable explanation if elevated).
    """
    rain = float(rain_rate_in_hr)

    if rain > 1.00:
        return (
            RiskLevel.NO_TRAVEL,
            f"Torrential rain rate {rain:.2f} in/hr (> 1.00 in/hr) -> NO_TRAVEL (flooding & zero visibility).",
        )
    if rain >= 0.50:
        return (
            RiskLevel.SEVERE,
            f"Heavy rain rate {rain:.2f} in/hr (0.50–1.00 in/hr) -> SEVERE hydroplaning risk.",
        )
    if rain >= 0.25:
        return (
            RiskLevel.HIGH,
            f"Moderate-to-heavy rain rate {rain:.2f} in/hr (0.25–0.49 in/hr) -> HIGH rain risk.",
        )
    if rain >= 0.10:
        return (
            RiskLevel.MODERATE,
            f"Light-to-moderate rain rate {rain:.2f} in/hr (0.10–0.24 in/hr) -> MODERATE rain risk.",
        )
    return (RiskLevel.LOW, None)


def classify_snow_risk(snow_rate_in_hr: float) -> tuple[RiskLevel, Optional[str]]:
    """
    Classify snowfall rate risk.

    Thresholds:
      - Low: < 0.5 in/hr
      - Moderate: >= 0.5 and < 1.0 in/hr (0.5–1.0 in/hr)
      - High: >= 1.0 and < 2.0 in/hr (1.0–2.0 in/hr)
      - Severe: >= 2.0 and <= 3.0 in/hr (2.0–3.0 in/hr)
      - No Travel: > 3.0 in/hr

    Returns (RiskLevel, optional human-readable explanation if elevated).
    """
    snow = float(snow_rate_in_hr)

    if snow > 3.0:
        return (
            RiskLevel.NO_TRAVEL,
            f"Blizzard snowfall rate {snow:.2f} in/hr (> 3.0 in/hr) -> NO_TRAVEL (impassable snow accumulation).",
        )
    if snow >= 2.0:
        return (
            RiskLevel.SEVERE,
            f"Heavy snowfall rate {snow:.2f} in/hr (2.0–3.0 in/hr) -> SEVERE road traction risk.",
        )
    if snow >= 1.0:
        return (
            RiskLevel.HIGH,
            f"Moderate snowfall rate {snow:.2f} in/hr (1.0–1.99 in/hr) -> HIGH winter driving risk.",
        )
    if snow >= 0.5:
        return (
            RiskLevel.MODERATE,
            f"Light snowfall rate {snow:.2f} in/hr (0.5–0.99 in/hr) -> MODERATE snow risk.",
        )
    return (RiskLevel.LOW, None)


@dataclass
class CheckpointWeatherInput:
    """Weather and spatial parameters observed or forecasted at a single route checkpoint."""
    distance_from_origin_miles: float
    segment_miles: float = 0.0
    wind_speed_mph: float = 0.0
    rain_rate_in_hr: float = 0.0
    snow_rate_in_hr: float = 0.0
    temperature_f: Optional[float] = None
    eta_iso: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    location_name: Optional[str] = None


@dataclass
class CheckpointRiskResult:
    """Evaluated risk classification and details for a route checkpoint."""
    distance_from_origin_miles: float
    segment_miles: float
    overall_risk: RiskLevel
    wind_risk: RiskLevel
    rain_risk: RiskLevel
    snow_risk: RiskLevel
    risk_reasons: list[str] = field(default_factory=list)
    wind_speed_mph: float = 0.0
    rain_rate_in_hr: float = 0.0
    snow_rate_in_hr: float = 0.0
    load_weight_lbs: float = 0.0
    temperature_f: Optional[float] = None
    eta_iso: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    location_name: Optional[str] = None
    index: int = 0
    milepost: float = 0.0
    hours_from_departure: float = 0.0
    segment_geometry: list[list[float]] = field(default_factory=list)
    weather_code: Optional[int] = None

    @property
    def overall_risk_label(self) -> str:
        return self.overall_risk.name

    @property
    def overall_risk_score(self) -> int:
        return int(self.overall_risk)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a JSON-compatible dictionary."""
        data = asdict(self)
        data["overall_risk"] = self.overall_risk.name
        data["overall_risk_score"] = int(self.overall_risk)
        data["wind_risk"] = self.wind_risk.name
        data["rain_risk"] = self.rain_risk.name
        data["snow_risk"] = self.snow_risk.name
        return data


def evaluate_checkpoint(
    wind_speed_mph: float,
    rain_rate_in_hr: float = 0.0,
    snow_rate_in_hr: float = 0.0,
    load_weight_lbs: float = 0.0,
    distance_from_origin_miles: float = 0.0,
    segment_miles: float = 0.0,
    eta_iso: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    location_name: Optional[str] = None,
    temperature_f: Optional[float] = None,
    index: int = 0,
    milepost: Optional[float] = None,
    hours_from_departure: float = 0.0,
    segment_geometry: Optional[list[list[float]]] = None,
    weather_code: Optional[int] = None,
) -> CheckpointRiskResult:
    """
    Evaluate weather conditions at a single checkpoint against risk thresholds
    and load weight rules.

    The overall checkpoint risk is the maximum severity among wind, rain, and snow.
    Returns a CheckpointRiskResult containing the classification and explanatory reasons.
    """
    wind_risk, wind_reason = classify_wind_risk(wind_speed_mph, load_weight_lbs)
    rain_risk, rain_reason = classify_rain_risk(rain_rate_in_hr)
    snow_risk, snow_reason = classify_snow_risk(snow_rate_in_hr)

    overall_risk = max(wind_risk, rain_risk, snow_risk)

    reasons: list[str] = []
    # Collect explanations for elevated risks (any factor contributing to risk)
    if wind_reason:
        reasons.append(wind_reason)
    if rain_reason:
        reasons.append(rain_reason)
    if snow_reason:
        reasons.append(snow_reason)

    if not reasons:
        reasons.append("All weather conditions are within normal safe thresholds (LOW risk).")

    mp = milepost if milepost is not None else distance_from_origin_miles

    return CheckpointRiskResult(
        distance_from_origin_miles=round(float(distance_from_origin_miles), 2),
        segment_miles=round(float(segment_miles), 2),
        overall_risk=overall_risk,
        wind_risk=wind_risk,
        rain_risk=rain_risk,
        snow_risk=snow_risk,
        risk_reasons=reasons,
        wind_speed_mph=round(float(wind_speed_mph), 2),
        rain_rate_in_hr=round(float(rain_rate_in_hr), 2),
        snow_rate_in_hr=round(float(snow_rate_in_hr), 2),
        load_weight_lbs=float(load_weight_lbs or 0.0),
        temperature_f=round(float(temperature_f), 1) if temperature_f is not None else None,
        eta_iso=eta_iso,
        lat=lat,
        lon=lon,
        location_name=location_name,
        index=index,
        milepost=round(float(mp), 2),
        hours_from_departure=round(float(hours_from_departure), 2),
        segment_geometry=list(segment_geometry or []),
        weather_code=weather_code,
    )
