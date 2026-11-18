import React, { useState } from 'react';
import {
  Truck,
  ArrowRightLeft,
  Navigation,
  Calendar,
  Weight,
  Layers,
  CloudSun,
  ShieldAlert,
  Clock,
  Sparkles,
  Info,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  RouteOption,
  Checkpoint,
  CorridorPreset,
  AnalyzeRequest,
} from '../types/routing';
import {
  getRiskHex,
  getRiskBadgeClass,
  formatHoursElapsed,
} from '../utils/riskColors';

interface SidebarProps {
  origin: string;
  setOrigin: (val: string) => void;
  destination: string;
  setDestination: (val: string) => void;
  departureTime: string;
  setDepartureTime: (val: string) => void;
  loadWeight: number;
  setLoadWeight: (val: number) => void;
  sampleInterval: 10 | 25 | 50;
  setSampleInterval: (val: 10 | 25 | 50) => void;
  weatherMode: 'live' | 'simulated_storm';
  setWeatherMode: (val: 'live' | 'simulated_storm') => void;
  presets: CorridorPreset[];
  onSelectPreset: (preset: CorridorPreset) => void;
  onAnalyze: (customParams?: Partial<AnalyzeRequest>) => void;
  isLoading: boolean;
  error: string | null;
  routes: RouteOption[];
  activeRouteId: string;
  onSelectRoute: (id: string) => void;
  selectedCheckpoint: Checkpoint | null;
  onSelectCheckpoint: (cp: Checkpoint | null) => void;
  recommendationReason: string | null;
  onOpenRulesModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  origin,
  setOrigin,
  destination,
  setDestination,
  departureTime,
  setDepartureTime,
  loadWeight,
  setLoadWeight,
  sampleInterval,
  setSampleInterval,
  weatherMode,
  setWeatherMode,
  presets,
  onSelectPreset,
  onAnalyze,
  isLoading,
  error,
  routes,
  activeRouteId,
  onSelectRoute,
  selectedCheckpoint,
  onSelectCheckpoint,
  recommendationReason,
  onOpenRulesModal,
}) => {
  const [showCheckpointsList, setShowCheckpointsList] = useState<boolean>(true);

  const activeRoute = routes.find((r) => r.route_id === activeRouteId) || routes[0];

  const handleSwapLocations = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const handleWeightPillClick = (weight: number) => {
    setLoadWeight(weight);
    onAnalyze({ load_weight_lbs: weight });
  };

  const handleIntervalChange = (val: 10 | 25 | 50) => {
    setSampleInterval(val);
    onAnalyze({ sample_interval_miles: val });
  };

  const handleWeatherModeChange = (val: 'live' | 'simulated_storm') => {
    setWeatherMode(val);
    onAnalyze({ weather_mode: val });
  };

  return (
    <aside className="w-full lg:w-[460px] xl:w-[500px] h-full bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto text-slate-100 shadow-2xl z-20">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-30 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-sky-500/10 border border-sky-500/30 p-2 rounded-xl text-sky-400">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
              Spotter Routing
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800">
                Telemetry
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">Weather-Aware Safe Heavy Truck Dispatch</p>
          </div>
        </div>

        <button
          onClick={onOpenRulesModal}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
          title="View Official Wind, Rain, Snow & Weight Rules"
        >
          <Info className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Risk Rules</span>
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Quick Corridor Presets Bar */}
        <div>
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>High-Traffic Corridor Presets</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => onSelectPreset(preset)}
                className="text-left px-2.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-750 hover:border-slate-600 border border-slate-800 text-xs transition-all group"
              >
                <div className="font-semibold text-slate-200 group-hover:text-sky-300 truncate">
                  {preset.title}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {preset.default_load_weight_lbs.toLocaleString()} lb • {preset.default_interval_miles}mi
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dispatch Parameters Form */}
        <div className="bg-slate-950/40 rounded-xl p-3.5 border border-slate-800/80 space-y-3.5 text-xs">
          {/* Origin & Destination Inputs */}
          <div className="space-y-2">
            <div className="relative flex items-center">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" />
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Origin City, State (e.g. Chicago, IL)"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs"
              />
            </div>

            <div className="flex items-center justify-center my-0.5">
              <button
                onClick={handleSwapLocations}
                className="p-1 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors"
                title="Swap Origin and Destination"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
              </button>
            </div>

            <div className="relative flex items-center">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-500" />
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Destination City, State (e.g. Denver, CO)"
                className="w-full bg-slate-800/90 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 text-xs"
              />
            </div>
          </div>

          {/* Departure Date/Time */}
          <div>
            <label className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              <span>Departure Time</span>
            </label>
            <input
              type="datetime-local"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 text-xs"
            />
          </div>

          {/* Commercial Load Weight */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <Weight className="w-3.5 h-3.5 text-amber-400" />
                <span>Load Weight:</span>
                <span className="font-mono font-bold text-slate-100">
                  {loadWeight.toLocaleString()} lbs
                </span>
              </label>
            </div>

            <input
              type="range"
              min={10000}
              max={80000}
              step={1000}
              value={loadWeight}
              onChange={(e) => setLoadWeight(Number(e.target.value))}
              onMouseUp={() => onAnalyze()}
              onTouchEnd={() => onAnalyze()}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />

            {/* Instant Test Pills for Load Rules */}
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <button
                onClick={() => handleWeightPillClick(25000)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium border text-center transition-all ${
                  loadWeight === 25000
                    ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold'
                    : 'bg-slate-800/80 border-slate-750 text-slate-400 hover:text-slate-200'
                }`}
                title="Standard Load: Normal Wind Thresholds"
              >
                25k lb (Std)
              </button>
              <button
                onClick={() => handleWeightPillClick(35000)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium border text-center transition-all ${
                  loadWeight === 35000
                    ? 'bg-rose-950 border-rose-500 text-rose-300 font-bold'
                    : 'bg-slate-800/80 border-slate-750 text-slate-400 hover:text-slate-200'
                }`}
                title="Heavy Load: 45-54 mph winds escalate to NO_TRAVEL"
              >
                35k lb (&gt;30k)
              </button>
              <button
                onClick={() => handleWeightPillClick(45000)}
                className={`px-2 py-1.5 rounded text-[11px] font-medium border text-center transition-all ${
                  loadWeight === 45000
                    ? 'bg-orange-950 border-orange-500 text-orange-300 font-bold'
                    : 'bg-slate-800/80 border-slate-750 text-slate-400 hover:text-slate-200'
                }`}
                title="Max Load: 35-44 mph winds escalate to SEVERE"
              >
                45k lb (&gt;40k)
              </button>
            </div>
          </div>

          {/* Checkpoint Interval & Weather Mode Selector */}
          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
            {/* Interval */}
            <div>
              <label className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
                <Layers className="w-3 h-3 text-sky-400" />
                <span>Sampling</span>
              </label>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                {([10, 25, 50] as const).map((interval) => (
                  <button
                    key={interval}
                    onClick={() => handleIntervalChange(interval)}
                    className={`flex-1 py-1 text-[11px] rounded transition-all ${
                      sampleInterval === interval
                        ? 'bg-sky-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {interval}m
                  </button>
                ))}
              </div>
            </div>

            {/* Weather Mode */}
            <div>
              <label className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
                <CloudSun className="w-3 h-3 text-amber-400" />
                <span>Weather Feed</span>
              </label>
              <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                <button
                  onClick={() => handleWeatherModeChange('live')}
                  className={`flex-1 py-1 text-[11px] rounded transition-all ${
                    weatherMode === 'live'
                      ? 'bg-sky-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Real-time hourly Open-Meteo forecasts"
                >
                  Live
                </button>
                <button
                  onClick={() => handleWeatherModeChange('simulated_storm')}
                  className={`flex-1 py-1 text-[11px] rounded transition-all ${
                    weatherMode === 'simulated_storm'
                      ? 'bg-amber-600 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Deterministic 48h storm front to test load weight rule escalations"
                >
                  Storm
                </button>
              </div>
            </div>
          </div>

          {/* Analyze Dispatch Button */}
          <button
            onClick={() => onAnalyze()}
            disabled={isLoading}
            className="w-full mt-2 py-2.5 px-4 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-sky-900/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Evaluating Corridors & Weather...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4" />
                <span>Analyze Weather Routes</span>
              </>
            )}
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500 text-rose-300 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Recommendation Banner */}
        {recommendationReason && (
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-1 shadow-md ${
              activeRoute && !activeRoute.is_travel_advised
                ? 'bg-rose-950/80 border-rose-500/80 text-rose-200'
                : 'bg-emerald-950/80 border-emerald-500/80 text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {activeRoute && !activeRoute.is_travel_advised ? (
                <>
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span className="uppercase text-rose-300">Hazard Warning</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="uppercase text-emerald-300">Dispatch Recommendation</span>
                </>
              )}
            </div>
            <p className="font-medium text-slate-100">{recommendationReason}</p>
          </div>
        )}

        {/* 3 Route Comparison Cards */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
              Generated Route Alternatives ({routes.length})
            </label>
            <span className="text-[10px] text-slate-500 font-mono">Ranked by Safety Priority</span>
          </div>

          {routes.map((route, idx) => {
            const isSelected = route.route_id === activeRouteId;
            const totalMiles = route.total_distance_miles || 1;

            const pNoTravel = (route.no_travel_miles / totalMiles) * 100;
            const pSevere = (route.severe_miles / totalMiles) * 100;
            const pHigh = (route.high_miles / totalMiles) * 100;
            const pModerate = (route.moderate_miles / totalMiles) * 100;
            const pLow = (route.low_miles / totalMiles) * 100;

            return (
              <div
                key={route.route_id}
                onClick={() => onSelectRoute(route.route_id)}
                className={`rounded-xl p-3 border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800/95 border-sky-500 shadow-lg shadow-sky-950/50 ring-1 ring-sky-500/50'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                {/* Header: Name, Rank Badge, Advised Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-sky-400">
                        #{idx + 1}
                      </span>
                      <h3 className="font-bold text-slate-100 text-xs truncate max-w-[210px]">
                        {route.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                      <span>{route.total_distance_miles.toFixed(1)} mi</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {route.travel_time_formatted}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {route.is_recommended ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                        Recommended
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                        Alt #{idx + 1}
                      </span>
                    )}

                    {!route.is_travel_advised && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-600 animate-pulse">
                        NO TRAVEL
                      </span>
                    )}
                  </div>
                </div>

                {/* Horizontal Stacked Mileage Risk Bar */}
                <div className="mt-3">
                  <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-800">
                    {pNoTravel > 0 && (
                      <div style={{ width: `${pNoTravel}%`, backgroundColor: getRiskHex('NO_TRAVEL') }} title={`${route.no_travel_miles} mi No Travel`} />
                    )}
                    {pSevere > 0 && (
                      <div style={{ width: `${pSevere}%`, backgroundColor: getRiskHex('SEVERE') }} title={`${route.severe_miles} mi Severe`} />
                    )}
                    {pHigh > 0 && (
                      <div style={{ width: `${pHigh}%`, backgroundColor: getRiskHex('HIGH') }} title={`${route.high_miles} mi High`} />
                    )}
                    {pModerate > 0 && (
                      <div style={{ width: `${pModerate}%`, backgroundColor: getRiskHex('MODERATE') }} title={`${route.moderate_miles} mi Moderate`} />
                    )}
                    {pLow > 0 && (
                      <div style={{ width: `${pLow}%`, backgroundColor: getRiskHex('LOW') }} title={`${route.low_miles} mi Low`} />
                    )}
                  </div>

                  {/* Mileage Breakdown Stats */}
                  <div className="grid grid-cols-5 gap-1 mt-2 text-[10px] text-center font-mono">
                    <div className="bg-slate-900/80 rounded py-1 border border-slate-800">
                      <span className="block text-emerald-400 font-bold">{route.low_miles}</span>
                      <span className="text-slate-500 text-[9px]">Low</span>
                    </div>
                    <div className="bg-slate-900/80 rounded py-1 border border-slate-800">
                      <span className="block text-amber-400 font-bold">{route.moderate_miles}</span>
                      <span className="text-slate-500 text-[9px]">Mod</span>
                    </div>
                    <div className="bg-slate-900/80 rounded py-1 border border-slate-800">
                      <span className="block text-orange-400 font-bold">{route.high_miles}</span>
                      <span className="text-slate-500 text-[9px]">High</span>
                    </div>
                    <div className="bg-slate-900/80 rounded py-1 border border-slate-800">
                      <span className="block text-red-400 font-bold">{route.severe_miles}</span>
                      <span className="text-slate-500 text-[9px]">Sev</span>
                    </div>
                    <div className="bg-slate-900/80 rounded py-1 border border-slate-800">
                      <span className={`block font-bold ${route.no_travel_miles > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-600'}`}>
                        {route.no_travel_miles}
                      </span>
                      <span className="text-slate-500 text-[9px]">NoTrvl</span>
                    </div>
                  </div>
                </div>

                {/* Footer: Avg Score */}
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Risk Score:</span>
                  <div className="flex items-center gap-1.5 font-bold font-mono">
                    <span className="text-slate-200">{route.average_risk_score.toFixed(2)}</span>
                    <span className="text-slate-500">/ 5.0</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${getRiskBadgeClass(route.overall_route_risk)}`}>
                      {route.overall_route_risk}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Checkpoint Timeline Strip / Inspector for Active Route */}
        {activeRoute && (
          <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800 text-xs">
            <button
              onClick={() => setShowCheckpointsList(!showCheckpointsList)}
              className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Checkpoints Timeline ({activeRoute.checkpoints.length} sampled @ {sampleInterval} mi)
                </span>
              </div>
              {showCheckpointsList ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {showCheckpointsList && (
              <div className="mt-2.5 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {activeRoute.checkpoints.map((cp) => {
                  const isCpSelected = selectedCheckpoint?.index === cp.index;
                  return (
                    <div
                      key={cp.index}
                      onClick={() => onSelectCheckpoint(cp)}
                      className={`p-2 rounded-lg border flex items-center justify-between text-[11px] transition-all cursor-pointer ${
                        isCpSelected
                          ? 'bg-slate-800 border-sky-400 text-white'
                          : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-bold">
                          <span>Mile {cp.milepost.toFixed(1)}</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            ({formatHoursElapsed(cp.hours_from_departure)})
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 font-mono">
                          {cp.wind_speed_mph.toFixed(0)}mph wind •{' '}
                          {cp.snow_rate_in_hr > 0
                            ? `${cp.snow_rate_in_hr.toFixed(1)}" snow`
                            : `${cp.rain_rate_in_hr.toFixed(2)}" rain`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${getRiskBadgeClass(cp.overall_risk)}`}>
                          {cp.overall_risk}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
