/**
 * TypeScript interfaces matching the Spotter Truck Routing backend API.
 */

export type RiskLevelName = 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' | 'NO_TRAVEL';

export interface LocationPoint {
  query: string;
  display_name: string;
  lat: number;
  lon: number;
}

export interface Checkpoint {
  index: number;
  milepost: number;
  distance_from_origin_miles: number;
  segment_miles: number;
  overall_risk: RiskLevelName;
  overall_risk_score: number;
  wind_risk: RiskLevelName;
  rain_risk: RiskLevelName;
  snow_risk: RiskLevelName;
  risk_reasons: string[];
  wind_speed_mph: number;
  rain_rate_in_hr: number;
  snow_rate_in_hr: number;
  load_weight_lbs: number;
  temperature_f?: number | null;
  weather_code?: number | null;
  eta_iso: string;
  hours_from_departure: number;
  lat: number;
  lon: number;
  location_name?: string | null;
  segment_geometry: [number, number][]; // [[lon, lat], ...]
}

export interface RouteGeometry {
  type: string;
  coordinates: [number, number][]; // [[lon, lat], ...]
}

export interface RouteOption {
  route_id: string;
  name: string;
  total_distance_miles: number;
  travel_time_seconds: number;
  travel_time_minutes: number;
  travel_time_formatted: string;
  no_travel_miles: number;
  severe_miles: number;
  high_miles: number;
  moderate_miles: number;
  low_miles: number;
  average_risk_score: number;
  overall_route_risk: RiskLevelName;
  overall_route_risk_score: number;
  is_travel_advised: boolean;
  is_recommended: boolean;
  recommendation_reason?: string | null;
  ranking_key: [number, number, number, number, number];
  checkpoints: Checkpoint[];
  geometry: RouteGeometry;
}

export interface HourlyWeatherMetric {
  hour: number;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  temperature_f?: number | null;
  risk_level: number; // 1 to 5
}

export interface HeatmapPoint {
  lat: number;
  lon: number;
  hourly: HourlyWeatherMetric[];
}

export interface HeatmapData {
  hours_count: number;
  base_time_iso: string;
  points: HeatmapPoint[];
}

export interface AnalyzeRequest {
  origin: string;
  destination: string;
  departure_time?: string;
  load_weight_lbs?: number;
  sample_interval_miles?: 10 | 25 | 50;
  weather_mode?: 'live' | 'simulated_storm';
}

export interface AnalyzeResponse {
  origin: LocationPoint;
  destination: LocationPoint;
  departure_time: string;
  load_weight_lbs: number;
  sample_interval_miles: number;
  weather_mode: 'live' | 'simulated_storm';
  recommended_route_id: string;
  recommendation_reason: string;
  decision_summary: string;
  routes: RouteOption[];
  heatmap: HeatmapData;
}

export interface CorridorPreset {
  id: string;
  title: string;
  origin: string;
  destination: string;
  default_load_weight_lbs: number;
  default_interval_miles: 10 | 25 | 50;
  description: string;
  highlights: string[];
}

export interface PresetsResponse {
  presets: CorridorPreset[];
  sample_intervals_available: number[];
  weather_modes_available: string[];
}

export type HeatmapMetricMode = 'risk' | 'wind' | 'precip';
