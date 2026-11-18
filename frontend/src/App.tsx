import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from './components/Sidebar';
import { RouteMap } from './components/RouteMap';
import { RouteComparisonDeck } from './components/RouteComparisonDeck';
import { ForecastSlider } from './components/ForecastSlider';
import { RulesModal } from './components/RulesModal';
import {
  RouteOption,
  Checkpoint,
  CorridorPreset,
  HeatmapData,
  HeatmapMetricMode,
  AnalyzeRequest,
} from './types/routing';
import { getRoutePresets, analyzeRoutes } from './api/routingApi';

export default function App() {
  // Input parameters
  const [origin, setOrigin] = useState<string>('Chicago, IL');
  const [destination, setDestination] = useState<string>('Denver, CO');
  const [departureTime, setDepartureTime] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 30) * 30, 0, 0);
    const offset = now.getTimezoneOffset();
    const local = new Date(now.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  });
  const [loadWeight, setLoadWeight] = useState<number>(42000);
  const [sampleInterval, setSampleInterval] = useState<10 | 25 | 50>(25);
  const [weatherMode, setWeatherMode] = useState<'live' | 'simulated_storm'>('live');

  // Response data
  const [presets, setPresets] = useState<CorridorPreset[]>([]);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [activeRouteId, setActiveRouteId] = useState<string>('route_1');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [recommendationReason, setRecommendationReason] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | undefined>(undefined);

  // Heatmap & Forecast Slider State
  const [forecastHour, setForecastHour] = useState<number>(0);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetricMode>('risk');

  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);
  const [isRightDeckOpen, setIsRightDeckOpen] = useState<boolean>(true);
  const [isBottomChartOpen, setIsBottomChartOpen] = useState<boolean>(true);

  const activeRoute = useMemo(
    () => routes.find((r) => r.route_id === activeRouteId) || routes[0],
    [routes, activeRouteId]
  );

  // Main Analyze Handler
  const handleAnalyze = useCallback(
    async (customOverrides?: Partial<AnalyzeRequest>) => {
      setIsLoading(true);
      setError(null);

      const req: AnalyzeRequest = {
        origin: customOverrides?.origin ?? origin,
        destination: customOverrides?.destination ?? destination,
        departure_time: customOverrides?.departure_time ?? (departureTime ? new Date(departureTime).toISOString() : undefined),
        load_weight_lbs: customOverrides?.load_weight_lbs ?? loadWeight,
        sample_interval_miles: customOverrides?.sample_interval_miles ?? sampleInterval,
        weather_mode: customOverrides?.weather_mode ?? weatherMode,
      };

      try {
        const resp = await analyzeRoutes(req);
        setRoutes(resp.routes);
        setActiveRouteId(resp.recommended_route_id || resp.routes[0]?.route_id || 'route_1');
        setRecommendationReason(resp.recommendation_reason || resp.decision_summary);
        setHeatmapData(resp.heatmap);
        setSelectedCheckpoint(null);
        setForecastHour(0);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to analyze routes';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [origin, destination, departureTime, loadWeight, sampleInterval, weatherMode]
  );

  // Preset Selection Handler
  const handleSelectPreset = (preset: CorridorPreset) => {
    setOrigin(preset.origin);
    setDestination(preset.destination);
    setLoadWeight(preset.default_load_weight_lbs);
    setSampleInterval(preset.default_interval_miles);

    handleAnalyze({
      origin: preset.origin,
      destination: preset.destination,
      load_weight_lbs: preset.default_load_weight_lbs,
      sample_interval_miles: preset.default_interval_miles,
    });
  };

  // Initial Load: Fetch presets and run initial Chicago -> Denver analysis in parallel
  useEffect(() => {
    let isMounted = true;

    async function init() {
      const presetsPromise = getRoutePresets()
        .then((pResp) => {
          if (isMounted && pResp?.presets) {
            setPresets(pResp.presets);
          }
        })
        .catch(() => {});

      const analyzePromise = handleAnalyze();

      await Promise.all([presetsPromise, analyzePromise]);
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex flex-col lg:flex-row w-screen h-screen overflow-hidden bg-[#070b11] font-sans antialiased">
      {/* Left Dispatch Control Panel & Checkpoint Telemetry Table */}
      <Sidebar
        origin={origin}
        setOrigin={setOrigin}
        destination={destination}
        setDestination={setDestination}
        departureTime={departureTime}
        setDepartureTime={setDepartureTime}
        loadWeight={loadWeight}
        setLoadWeight={setLoadWeight}
        sampleInterval={sampleInterval}
        setSampleInterval={setSampleInterval}
        weatherMode={weatherMode}
        setWeatherMode={setWeatherMode}
        presets={presets}
        onSelectPreset={handleSelectPreset}
        onAnalyze={handleAnalyze}
        isLoading={isLoading}
        error={error}
        routes={routes}
        activeRouteId={activeRouteId}
        selectedCheckpoint={selectedCheckpoint}
        onSelectCheckpoint={setSelectedCheckpoint}
        onOpenRulesModal={() => setIsRulesModalOpen(true)}
      />

      {/* Main Map View Area */}
      <main className="relative flex-1 h-full overflow-hidden bg-[#070b11]">
        <RouteMap
          routes={routes}
          activeRouteId={activeRouteId}
          onSelectRoute={setActiveRouteId}
          selectedCheckpoint={selectedCheckpoint}
          onSelectCheckpoint={setSelectedCheckpoint}
          forecastHour={forecastHour}
          showHeatmap={showHeatmap}
          heatmapMetric={heatmapMetric}
          heatmapData={heatmapData}
          isRightDeckOpen={isRightDeckOpen}
          isBottomChartOpen={isBottomChartOpen}
        />

        {/* Floating Top-Right 3-Route Comparison & Recommendation Deck */}
        <RouteComparisonDeck
          routes={routes}
          activeRouteId={activeRouteId}
          onSelectRoute={setActiveRouteId}
          recommendationReason={recommendationReason}
          isOpen={isRightDeckOpen}
          onToggleOpen={() => setIsRightDeckOpen((prev) => !prev)}
        />

        {/* Floating Bottom Corridor Timeline & Weather Profile Bar */}
        <ForecastSlider
          forecastHour={forecastHour}
          onForecastHourChange={setForecastHour}
          baseDepartureTime={heatmapData?.base_time_iso}
          showHeatmap={showHeatmap}
          onToggleHeatmap={setShowHeatmap}
          heatmapMetric={heatmapMetric}
          onMetricChange={setHeatmapMetric}
          checkpoints={activeRoute?.checkpoints || []}
          selectedCheckpoint={selectedCheckpoint}
          onSelectCheckpoint={setSelectedCheckpoint}
          isChartOpen={isBottomChartOpen}
          onToggleChartOpen={() => setIsBottomChartOpen((prev) => !prev)}
        />
      </main>

      {/* Modal: Official Risk Rules Reference */}
      <RulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} />
    </div>
  );
}
