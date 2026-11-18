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
import { getRiskBadgeClass } from './utils/riskColors';
import { Truck, Map as MapIcon, Sliders, Navigation, ChevronRight } from 'lucide-react';

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
  const [mobileTab, setMobileTab] = useState<'map' | 'dispatch' | 'routes'>('map');

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
    <div className="flex flex-col w-screen h-screen overflow-hidden bg-[#070b11] font-sans antialiased">
      {/* Mobile Top App Bar with 3-Segmented Switcher (visible only on screens < lg) */}
      <header className="lg:hidden h-11 bg-[#0b0f17] border-b border-slate-800 flex items-center justify-between px-3 shrink-0 z-40 select-none">
        <div className="flex items-center gap-1.5">
          <div className="bg-sky-500/10 border border-sky-500/20 p-1 rounded text-sky-400">
            <Truck className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs text-white tracking-tight">SPOTTER</span>
        </div>

        {/* Mobile Tab Control */}
        <div className="flex bg-[#070b11] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
          <button
            onClick={() => setMobileTab('map')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              mobileTab === 'map'
                ? 'bg-sky-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapIcon className="w-3 h-3" />
            <span>Map</span>
          </button>
          <button
            onClick={() => setMobileTab('dispatch')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              mobileTab === 'dispatch'
                ? 'bg-sky-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3 h-3" />
            <span>Dispatch</span>
          </button>
          <button
            onClick={() => setMobileTab('routes')}
            className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer ${
              mobileTab === 'routes'
                ? 'bg-sky-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Navigation className="w-3 h-3" />
            <span>Routes</span>
          </button>
        </div>
      </header>

      {/* Main Responsive Body Container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full h-[calc(100vh-44px)] lg:h-full overflow-hidden">
        {/* Left Dispatch Control Panel & Checkpoint Telemetry Table */}
        <div
          className={`h-full ${
            mobileTab === 'dispatch'
              ? 'flex flex-col w-full h-full'
              : 'hidden lg:flex lg:w-[360px]'
          }`}
        >
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
            onSelectPreset={(p) => {
              handleSelectPreset(p);
              setMobileTab('map');
            }}
            onAnalyze={(customOverrides) => {
              handleAnalyze(customOverrides);
              setMobileTab('map');
            }}
            isLoading={isLoading}
            error={error}
            routes={routes}
            activeRouteId={activeRouteId}
            selectedCheckpoint={selectedCheckpoint}
            onSelectCheckpoint={(cp) => {
              setSelectedCheckpoint(cp);
              setMobileTab('map');
            }}
            onOpenRulesModal={() => setIsRulesModalOpen(true)}
          />
        </div>

        {/* Main Map View Area */}
        <main
          className={`relative flex-1 h-full overflow-hidden bg-[#070b11] ${
            mobileTab === 'map' ? 'block' : 'hidden lg:block'
          }`}
        >
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
            mobileTab={mobileTab}
          />

          {/* Floating Top-Right 3-Route Comparison Deck (Desktop only) */}
          <div className="hidden lg:block">
            <RouteComparisonDeck
              routes={routes}
              activeRouteId={activeRouteId}
              onSelectRoute={setActiveRouteId}
              recommendationReason={recommendationReason}
              isOpen={isRightDeckOpen}
              onToggleOpen={() => setIsRightDeckOpen((prev) => !prev)}
            />
          </div>

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

        {/* Mobile Full-Screen Routes Deck (Visible only when mobileTab === 'routes' on screens < lg) */}
        {mobileTab === 'routes' && (
          <div className="lg:hidden flex-1 h-full w-full bg-[#070b11] p-3 overflow-y-auto z-30">
            <div className="max-w-md mx-auto space-y-3 pb-8">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Navigation className="w-4 h-4 text-sky-400" />
                  <span>CORRIDOR COMPARISON (3 ROUTES)</span>
                </div>
                <button
                  onClick={() => setMobileTab('map')}
                  className="px-2.5 py-1 rounded bg-sky-600 text-white font-mono text-xs font-semibold cursor-pointer"
                >
                  View on Map
                </button>
              </div>

              {recommendationReason && (
                <div className="p-2.5 rounded bg-sky-950/40 border border-sky-800/60 text-xs text-sky-200 leading-relaxed">
                  <span className="font-bold text-sky-400">Recommendation: </span>
                  {recommendationReason}
                </div>
              )}

              {routes.map((route, idx) => {
                const isSelected = route.route_id === activeRouteId;
                const isRec = route.is_recommended;
                return (
                  <div
                    key={route.route_id}
                    onClick={() => {
                      setActiveRouteId(route.route_id);
                      setMobileTab('map');
                    }}
                    className={`p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0f172a] border-sky-400 ring-2 ring-sky-400/40'
                        : 'bg-[#0b0f17] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sky-400 font-mono font-bold text-xs">#{idx + 1}</span>
                        {isRec && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold uppercase">
                            Recommended
                          </span>
                        )}
                        <span className="font-bold text-xs text-white">{route.name}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${getRiskBadgeClass(route.overall_route_risk)}`}>
                        {route.overall_route_risk}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono text-slate-300 mb-2">
                      <span>{route.total_distance_miles.toFixed(1)} mi</span>
                      <span>•</span>
                      <span>{route.travel_time_formatted}</span>
                      <span>•</span>
                      <span className="text-slate-400">Risk: {route.average_risk_score.toFixed(2)}/5.0</span>
                    </div>

                    {/* Mileage breakdown bar */}
                    <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-800">
                      {route.low_miles > 0 && (
                        <div style={{ width: `${(route.low_miles / route.total_distance_miles) * 100}%` }} className="bg-emerald-500" />
                      )}
                      {route.moderate_miles > 0 && (
                        <div style={{ width: `${(route.moderate_miles / route.total_distance_miles) * 100}%` }} className="bg-amber-500" />
                      )}
                      {route.high_miles > 0 && (
                        <div style={{ width: `${(route.high_miles / route.total_distance_miles) * 100}%` }} className="bg-orange-500" />
                      )}
                      {route.severe_miles > 0 && (
                        <div style={{ width: `${(route.severe_miles / route.total_distance_miles) * 100}%` }} className="bg-rose-500" />
                      )}
                      {route.no_travel_miles > 0 && (
                        <div style={{ width: `${(route.no_travel_miles / route.total_distance_miles) * 100}%` }} className="bg-fuchsia-600" />
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveRouteId(route.route_id);
                        setMobileTab('map');
                      }}
                      className="mt-2.5 w-full py-1 text-center rounded bg-slate-800 hover:bg-slate-700 text-sky-400 font-mono text-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Select & View on Map</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Official Risk Rules Reference */}
      <RulesModal isOpen={isRulesModalOpen} onClose={() => setIsRulesModalOpen(false)} />
    </div>
  );
}
