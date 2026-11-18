"""
Automated Unit Tests for Spotter Truck Routing Risk Engine & Recommender.

Tests:
1. All boundary values for Wind, Rain, and Snow thresholds.
2. Load weight overrides at <= 30,000 lb, 35,000 lb, and 45,000 lb.
3. Checkpoint risk aggregation (max severity among conditions).
4. Route recommendation tie-breaking across all 5 priority tiers:
   - Priority 1: Fewest No Travel miles
   - Priority 2: Fewest Severe miles
   - Priority 3: Fewest High miles
   - Priority 4: Lowest Average Risk score
   - Priority 5: Shortest Travel Time
5. Recommendation reason explanation clarity.
"""

from django.test import TestCase

from routing.services.risk_engine import (
    RiskLevel,
    classify_wind_risk,
    classify_rain_risk,
    classify_snow_risk,
    evaluate_checkpoint,
    CheckpointRiskResult,
)
from routing.services.recommender import (
    RouteSummary,
    summarize_route,
    rank_and_recommend_routes,
    generate_recommendation_reason,
)


class WindRiskThresholdTests(TestCase):
    """Test boundary values for wind speed classification without and with base load."""

    def test_low_wind_boundaries(self):
        # Low: < 25.0 mph
        for speed in [0.0, 10.0, 24.9, 24.99]:
            risk, reason = classify_wind_risk(speed, load_weight_lbs=20000)
            self.assertEqual(risk, RiskLevel.LOW, f"Failed at speed {speed}")
            self.assertIsNone(reason)

    def test_moderate_wind_boundaries(self):
        # Moderate: >= 25.0 and < 35.0 mph (25–34 mph)
        for speed in [25.0, 25.1, 30.0, 34.9, 34.99]:
            risk, reason = classify_wind_risk(speed, load_weight_lbs=20000)
            self.assertEqual(risk, RiskLevel.MODERATE, f"Failed at speed {speed}")
            self.assertIsNotNone(reason)
            self.assertIn("MODERATE", reason)

    def test_high_wind_boundaries_unloaded(self):
        # High: >= 35.0 and < 45.0 mph (35–44 mph) with load <= 40,000 lbs
        for speed in [35.0, 35.1, 40.0, 44.9, 44.99]:
            risk, reason = classify_wind_risk(speed, load_weight_lbs=35000)
            self.assertEqual(risk, RiskLevel.HIGH, f"Failed at speed {speed}")
            self.assertIsNotNone(reason)
            self.assertIn("HIGH", reason)

    def test_severe_wind_boundaries_unloaded(self):
        # Severe: >= 45.0 and < 55.0 mph (45–54 mph) with load <= 30,000 lbs
        for speed in [45.0, 45.1, 50.0, 54.9, 54.99]:
            risk, reason = classify_wind_risk(speed, load_weight_lbs=25000)
            self.assertEqual(risk, RiskLevel.SEVERE, f"Failed at speed {speed}")
            self.assertIsNotNone(reason)
            self.assertIn("SEVERE", reason)

    def test_no_travel_wind_boundaries(self):
        # No Travel: >= 55.0 mph for any load
        for speed in [55.0, 55.1, 65.0, 80.0]:
            for load in [0, 15000, 30000, 45000]:
                risk, reason = classify_wind_risk(speed, load_weight_lbs=load)
                self.assertEqual(
                    risk,
                    RiskLevel.NO_TRAVEL,
                    f"Failed at speed {speed} with load {load}",
                )
                self.assertIsNotNone(reason)
                self.assertIn("NO_TRAVEL", reason)


class LoadWeightOverrideTests(TestCase):
    """
    Test commercial load weight overrides:
    - Wind in [45.0, 55.0) and load > 30,000 lbs -> NO_TRAVEL
    - Wind in [35.0, 45.0) and load > 40,000 lbs -> SEVERE
    - Wind >= 55.0 -> NO_TRAVEL for any load
    """

    def test_45_to_54_mph_at_or_below_30k_lbs(self):
        # At or below 30,000 lbs, remains SEVERE
        for load in [0, 15000, 25000, 30000]:
            risk, reason = classify_wind_risk(48.0, load_weight_lbs=load)
            self.assertEqual(risk, RiskLevel.SEVERE, f"Expected SEVERE at load {load}")

    def test_45_to_54_mph_above_30k_lbs_escalates_to_no_travel(self):
        # Over 30,000 lbs (e.g. 30,001, 35,000, 45,000), escalates to NO_TRAVEL
        for load in [30001, 35000, 40000, 45000]:
            risk, reason = classify_wind_risk(48.0, load_weight_lbs=load)
            self.assertEqual(risk, RiskLevel.NO_TRAVEL, f"Expected NO_TRAVEL at load {load}")
            self.assertIn("escalates risk to NO_TRAVEL", reason)

    def test_35_to_44_mph_at_or_below_40k_lbs(self):
        # At or below 40,000 lbs, remains HIGH
        for load in [0, 20000, 30000, 35000, 40000]:
            risk, reason = classify_wind_risk(40.0, load_weight_lbs=load)
            self.assertEqual(risk, RiskLevel.HIGH, f"Expected HIGH at load {load}")

    def test_35_to_44_mph_above_40k_lbs_escalates_to_severe(self):
        # Over 40,000 lbs (e.g. 40,001, 45,000), escalates to SEVERE
        for load in [40001, 42000, 45000, 50000]:
            risk, reason = classify_wind_risk(40.0, load_weight_lbs=load)
            self.assertEqual(risk, RiskLevel.SEVERE, f"Expected SEVERE at load {load}")
            self.assertIn("escalates risk to SEVERE", reason)

    def test_low_and_moderate_winds_do_not_escalate_with_heavy_load(self):
        # Heavy load should not escalate wind < 35 mph
        risk_mod, _ = classify_wind_risk(30.0, load_weight_lbs=45000)
        self.assertEqual(risk_mod, RiskLevel.MODERATE)

        risk_low, _ = classify_wind_risk(20.0, load_weight_lbs=45000)
        self.assertEqual(risk_low, RiskLevel.LOW)


class RainRiskThresholdTests(TestCase):
    """Test continuous boundary values for rain rate (in/hr)."""

    def test_low_rain_boundaries(self):
        # Low: < 0.10 in/hr
        for rate in [0.0, 0.05, 0.09, 0.099]:
            risk, reason = classify_rain_risk(rate)
            self.assertEqual(risk, RiskLevel.LOW, f"Failed at rain {rate}")
            self.assertIsNone(reason)

    def test_moderate_rain_boundaries(self):
        # Moderate: >= 0.10 and < 0.25 in/hr
        for rate in [0.10, 0.15, 0.24, 0.249]:
            risk, reason = classify_rain_risk(rate)
            self.assertEqual(risk, RiskLevel.MODERATE, f"Failed at rain {rate}")
            self.assertIn("MODERATE", reason)

    def test_high_rain_boundaries(self):
        # High: >= 0.25 and < 0.50 in/hr
        for rate in [0.25, 0.35, 0.49, 0.499]:
            risk, reason = classify_rain_risk(rate)
            self.assertEqual(risk, RiskLevel.HIGH, f"Failed at rain {rate}")
            self.assertIn("HIGH", reason)

    def test_severe_rain_boundaries(self):
        # Severe: >= 0.50 and <= 1.00 in/hr
        for rate in [0.50, 0.75, 0.99, 1.00]:
            risk, reason = classify_rain_risk(rate)
            self.assertEqual(risk, RiskLevel.SEVERE, f"Failed at rain {rate}")
            self.assertIn("SEVERE", reason)

    def test_no_travel_rain_boundaries(self):
        # No Travel: > 1.00 in/hr
        for rate in [1.001, 1.01, 1.50, 2.50]:
            risk, reason = classify_rain_risk(rate)
            self.assertEqual(risk, RiskLevel.NO_TRAVEL, f"Failed at rain {rate}")
            self.assertIn("NO_TRAVEL", reason)


class SnowRiskThresholdTests(TestCase):
    """Test continuous boundary values for snow rate (in/hr)."""

    def test_low_snow_boundaries(self):
        # Low: < 0.5 in/hr
        for rate in [0.0, 0.2, 0.49, 0.499]:
            risk, reason = classify_snow_risk(rate)
            self.assertEqual(risk, RiskLevel.LOW, f"Failed at snow {rate}")
            self.assertIsNone(reason)

    def test_moderate_snow_boundaries(self):
        # Moderate: >= 0.5 and < 1.0 in/hr
        for rate in [0.5, 0.75, 0.99, 0.999]:
            risk, reason = classify_snow_risk(rate)
            self.assertEqual(risk, RiskLevel.MODERATE, f"Failed at snow {rate}")
            self.assertIn("MODERATE", reason)

    def test_high_snow_boundaries(self):
        # High: >= 1.0 and < 2.0 in/hr
        for rate in [1.0, 1.5, 1.99, 1.999]:
            risk, reason = classify_snow_risk(rate)
            self.assertEqual(risk, RiskLevel.HIGH, f"Failed at snow {rate}")
            self.assertIn("HIGH", reason)

    def test_severe_snow_boundaries(self):
        # Severe: >= 2.0 and <= 3.0 in/hr
        for rate in [2.0, 2.5, 2.99, 3.0]:
            risk, reason = classify_snow_risk(rate)
            self.assertEqual(risk, RiskLevel.SEVERE, f"Failed at snow {rate}")
            self.assertIn("SEVERE", reason)

    def test_no_travel_snow_boundaries(self):
        # No Travel: > 3.0 in/hr
        for rate in [3.001, 3.01, 3.50, 5.0]:
            risk, reason = classify_snow_risk(rate)
            self.assertEqual(risk, RiskLevel.NO_TRAVEL, f"Failed at snow {rate}")
            self.assertIn("NO_TRAVEL", reason)


class CheckpointEvaluationTests(TestCase):
    """Test checkpoint aggregation: maximum severity rule and reason generation."""

    def test_max_severity_wind_dominates(self):
        # Wind is SEVERE (48 mph, 25k lbs), Rain is MODERATE (0.15), Snow is LOW (0.1)
        res = evaluate_checkpoint(
            wind_speed_mph=48.0,
            rain_rate_in_hr=0.15,
            snow_rate_in_hr=0.1,
            load_weight_lbs=25000,
        )
        self.assertEqual(res.overall_risk, RiskLevel.SEVERE)
        self.assertEqual(res.wind_risk, RiskLevel.SEVERE)
        self.assertEqual(res.rain_risk, RiskLevel.MODERATE)
        self.assertEqual(res.snow_risk, RiskLevel.LOW)
        self.assertEqual(len(res.risk_reasons), 2)  # wind reason + rain reason

    def test_max_severity_snow_dominates(self):
        # Snow is NO_TRAVEL (3.5 in/hr), Wind is MODERATE (28 mph), Rain is LOW
        res = evaluate_checkpoint(
            wind_speed_mph=28.0,
            rain_rate_in_hr=0.0,
            snow_rate_in_hr=3.5,
            load_weight_lbs=40000,
        )
        self.assertEqual(res.overall_risk, RiskLevel.NO_TRAVEL)
        self.assertEqual(res.snow_risk, RiskLevel.NO_TRAVEL)
        self.assertEqual(res.wind_risk, RiskLevel.MODERATE)

    def test_all_clear_checkpoint(self):
        res = evaluate_checkpoint(
            wind_speed_mph=12.0,
            rain_rate_in_hr=0.02,
            snow_rate_in_hr=0.0,
            load_weight_lbs=35000,
        )
        self.assertEqual(res.overall_risk, RiskLevel.LOW)
        self.assertEqual(res.overall_risk_score, 1)
        self.assertTrue(any("LOW risk" in r for r in res.risk_reasons))


class RouteSummaryAndTieBreakingTests(TestCase):
    """
    Test route summarization and exact 5-tier recommendation tie-breaking:
      1. Fewest no_travel_miles
      2. Fewest severe_miles
      3. Fewest high_miles
      4. Lowest average_risk_score
      5. Shortest travel_time_seconds
    """

    def _make_dummy_checkpoints(self, risk_miles_map: dict[RiskLevel, float]) -> list[CheckpointRiskResult]:
        """Helper to create dummy evaluated checkpoints matching exact mileage per risk."""
        checkpoints: list[CheckpointRiskResult] = []
        cum_dist = 0.0
        for risk, miles in risk_miles_map.items():
            if miles > 0:
                checkpoints.append(
                    CheckpointRiskResult(
                        distance_from_origin_miles=cum_dist,
                        segment_miles=miles,
                        overall_risk=risk,
                        wind_risk=risk,
                        rain_risk=RiskLevel.LOW,
                        snow_risk=RiskLevel.LOW,
                        risk_reasons=[f"Simulated {risk.name}"],
                    )
                )
                cum_dist += miles
        return checkpoints

    def test_priority_1_no_travel_miles_dominates(self):
        """
        Route with 0 No Travel miles MUST beat a route with any No Travel miles,
        even if the 0 No Travel route has more severe miles and longer travel time.
        """
        # Route A: 10 miles No Travel, 0 Severe miles, 3 hours
        cp_a = self._make_dummy_checkpoints({RiskLevel.NO_TRAVEL: 10.0, RiskLevel.LOW: 90.0})
        # Route B: 0 miles No Travel, 25 Severe miles, 4.5 hours
        cp_b = self._make_dummy_checkpoints({RiskLevel.SEVERE: 25.0, RiskLevel.LOW: 75.0})

        route_a = {
            "route_id": "route_a",
            "name": "Route A (Direct with Blizzard)",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 10800,  # 3 hrs
            "checkpoints": cp_a,
        }
        route_b = {
            "route_id": "route_b",
            "name": "Route B (Detour with Severe Rain)",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 16200,  # 4.5 hrs
            "checkpoints": cp_b,
        }

        res = rank_and_recommend_routes([route_a, route_b])
        # Route B must win because 0 No Travel miles beats 10 No Travel miles
        self.assertEqual(res.recommended_route.route_id, "route_b")
        self.assertTrue(res.recommended_route.is_travel_advised)
        self.assertFalse(res.ranked_routes[1].is_travel_advised)
        self.assertIn("NO_TRAVEL", res.decision_summary)

    def test_priority_2_severe_miles_tie_breaker(self):
        """
        When No Travel miles are tied (both 0), route with FEWEST severe miles wins,
        even if it has more High miles or takes longer.
        """
        # Route A: 0 No Travel, 30 Severe miles, 0 High miles, 2 hours
        cp_a = self._make_dummy_checkpoints({RiskLevel.SEVERE: 30.0, RiskLevel.LOW: 70.0})
        # Route B: 0 No Travel, 5 Severe miles, 40 High miles, 2.5 hours
        cp_b = self._make_dummy_checkpoints({RiskLevel.SEVERE: 5.0, RiskLevel.HIGH: 40.0, RiskLevel.LOW: 55.0})

        route_a = {
            "route_id": "route_a",
            "name": "Route A",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 7200,
            "checkpoints": cp_a,
        }
        route_b = {
            "route_id": "route_b",
            "name": "Route B",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 9000,
            "checkpoints": cp_b,
        }

        res = rank_and_recommend_routes([route_a, route_b])
        # Route B wins because 5.0 severe miles < 30.0 severe miles
        self.assertEqual(res.recommended_route.route_id, "route_b")
        self.assertEqual(res.recommended_route.severe_miles, 5.0)
        self.assertIn("severe weather", res.decision_summary.lower())

    def test_priority_3_high_miles_tie_breaker(self):
        """
        When No Travel and Severe miles are tied (both 0), route with FEWEST high miles wins.
        """
        # Route A: 0 NT, 0 Severe, 40 High miles, 3 hours
        cp_a = self._make_dummy_checkpoints({RiskLevel.HIGH: 40.0, RiskLevel.LOW: 60.0})
        # Route B: 0 NT, 0 Severe, 10 High miles, 3.5 hours
        cp_b = self._make_dummy_checkpoints({RiskLevel.HIGH: 10.0, RiskLevel.MODERATE: 40.0, RiskLevel.LOW: 50.0})

        route_a = {
            "route_id": "route_a",
            "name": "Route A",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 10800,
            "checkpoints": cp_a,
        }
        route_b = {
            "route_id": "route_b",
            "name": "Route B",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 12600,
            "checkpoints": cp_b,
        }

        res = rank_and_recommend_routes([route_a, route_b])
        # Route B wins: 10 High miles < 40 High miles
        self.assertEqual(res.recommended_route.route_id, "route_b")
        self.assertEqual(res.recommended_route.high_miles, 10.0)

    def test_priority_4_average_risk_score_tie_breaker(self):
        """
        When No Travel, Severe, and High miles are tied, route with LOWEST average risk score wins.
        """
        # Route A: 0 NT, 0 Severe, 0 High, 60 Moderate (score 2.0), 40 Low (score 1.0) -> avg = 1.6
        cp_a = self._make_dummy_checkpoints({RiskLevel.MODERATE: 60.0, RiskLevel.LOW: 40.0})
        # Route B: 0 NT, 0 Severe, 0 High, 20 Moderate (score 2.0), 80 Low (score 1.0) -> avg = 1.2
        cp_b = self._make_dummy_checkpoints({RiskLevel.MODERATE: 20.0, RiskLevel.LOW: 80.0})

        route_a = {
            "route_id": "route_a",
            "name": "Route A",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 10800,
            "checkpoints": cp_a,
        }
        route_b = {
            "route_id": "route_b",
            "name": "Route B",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 11500,  # slightly longer
            "checkpoints": cp_b,
        }

        res = rank_and_recommend_routes([route_a, route_b])
        # Route B wins: avg risk 1.2 < 1.6
        self.assertEqual(res.recommended_route.route_id, "route_b")
        self.assertLess(res.recommended_route.average_risk_score, res.ranked_routes[1].average_risk_score)

    def test_priority_5_travel_time_tie_breaker(self):
        """
        When all weather risk metrics are identical, the fastest route (shortest travel time) wins.
        """
        # Both routes have identical 100% LOW risk
        cp_a = self._make_dummy_checkpoints({RiskLevel.LOW: 100.0})
        cp_b = self._make_dummy_checkpoints({RiskLevel.LOW: 100.0})

        route_a = {
            "route_id": "route_a",
            "name": "Route A (Fast Interstate)",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 5400,  # 1.5 hrs
            "checkpoints": cp_a,
        }
        route_b = {
            "route_id": "route_b",
            "name": "Route B (Scenic Highway)",
            "total_distance_miles": 100.0,
            "travel_time_seconds": 7200,  # 2.0 hrs
            "checkpoints": cp_b,
        }

        res = rank_and_recommend_routes([route_a, route_b])
        # Route A wins: 5400s < 7200s
        self.assertEqual(res.recommended_route.route_id, "route_a")
        self.assertIn("Fastest route", res.decision_summary)

    def test_three_routes_end_to_end_ranking(self):
        """
        Simulate 3 route options as requested in specification:
        Route 1 (North): Has 40 miles severe crosswind
        Route 2 (Central): Has 15 miles impassable blizzard (NO_TRAVEL)
        Route 3 (South): Has light rain/wind, only 10 miles high risk, slightly longer
        Route 3 must be selected as the recommended route.
        """
        route_north = {
            "route_id": "r1_north",
            "name": "I-80 North",
            "total_distance_miles": 450.0,
            "travel_time_seconds": 25200,  # 7h
            "checkpoints": [
                {"wind_speed_mph": 48.0, "rain_rate_in_hr": 0.0, "snow_rate_in_hr": 0.0, "segment_miles": 40.0},
                {"wind_speed_mph": 20.0, "rain_rate_in_hr": 0.0, "snow_rate_in_hr": 0.0, "segment_miles": 410.0},
            ],
        }
        route_central = {
            "route_id": "r2_central",
            "name": "I-70 Central",
            "total_distance_miles": 430.0,
            "travel_time_seconds": 23400,  # 6.5h
            "checkpoints": [
                {"wind_speed_mph": 30.0, "rain_rate_in_hr": 0.0, "snow_rate_in_hr": 3.5, "segment_miles": 15.0},
                {"wind_speed_mph": 15.0, "rain_rate_in_hr": 0.0, "snow_rate_in_hr": 0.0, "segment_miles": 415.0},
            ],
        }
        route_south = {
            "route_id": "r3_south",
            "name": "I-40 South",
            "total_distance_miles": 475.0,
            "travel_time_seconds": 27000,  # 7.5h
            "checkpoints": [
                {"wind_speed_mph": 36.0, "rain_rate_in_hr": 0.1, "snow_rate_in_hr": 0.0, "segment_miles": 10.0},
                {"wind_speed_mph": 18.0, "rain_rate_in_hr": 0.0, "snow_rate_in_hr": 0.0, "segment_miles": 465.0},
            ],
        }

        # Test with heavy load (42,000 lbs):
        # On Route North: 48 mph wind + 42k lbs (>30k lbs) escalates to NO_TRAVEL!
        # On Route South: 36 mph wind + 42k lbs (>40k lbs) escalates to SEVERE!
        # Both North and Central now have NO_TRAVEL. South has 0 NO_TRAVEL (only 10 mi severe).
        # South must win decisively!
        result = rank_and_recommend_routes([route_north, route_central, route_south], load_weight_lbs=42000)

        self.assertEqual(result.recommended_route.route_id, "r3_south")
        self.assertTrue(result.recommended_route.is_travel_advised)
        self.assertEqual(result.recommended_route.no_travel_miles, 0.0)

        # Ranked list should have South first, followed by routes with NO_TRAVEL
        self.assertEqual(result.ranked_routes[0].route_id, "r3_south")
        self.assertFalse(result.ranked_routes[1].is_travel_advised)
        self.assertFalse(result.ranked_routes[2].is_travel_advised)

        # Ensure JSON serialization works seamlessly
        result_dict = result.to_dict()
        self.assertIn("recommended_route", result_dict)
        self.assertIn("ranked_routes", result_dict)
        self.assertEqual(len(result_dict["ranked_routes"]), 3)
        self.assertEqual(result_dict["recommended_route"]["route_id"], "r3_south")
