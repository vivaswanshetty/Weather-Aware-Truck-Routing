import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Flame, Wind, CloudRain, Eye, EyeOff } from 'lucide-react';
import { HeatmapMetricMode } from '../types/routing';
import { RISK_COLORS, formatTimestamp } from '../utils/riskColors';

interface ForecastSliderProps {
  forecastHour: number;
  onForecastHourChange: (action: number | ((prev: number) => number)) => void;
  baseDepartureTime?: string;
  showHeatmap: boolean;
  onToggleHeatmap: (show: boolean) => void;
  heatmapMetric: HeatmapMetricMode;
  onMetricChange: (metric: HeatmapMetricMode) => void;
}

export const ForecastSlider: React.FC<ForecastSliderProps> = ({
  forecastHour,
  onForecastHourChange,
  baseDepartureTime,
  showHeatmap,
  onToggleHeatmap,
  heatmapMetric,
  onMetricChange,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);

  // Compute timestamp at selected forecastHour
  const currentTimestamp = React.useMemo(() => {
    try {
      const base = baseDepartureTime ? new Date(baseDepartureTime) : new Date();
      const current = new Date(base.getTime() + forecastHour * 3600 * 1000);
      return formatTimestamp(current.toISOString());
    } catch {
      return `Hour +${forecastHour}`;
    }
  }, [baseDepartureTime, forecastHour]);

  // Handle Play/Pause animation loop
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(() => {
        onForecastHourChange((prev) => {
          if (prev >= 48) return 0;
          return prev + 1;
        });
      }, 260); // 260ms per hour = ~12s per full 48h cycle
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, onForecastHourChange]);

  const togglePlay = () => setIsPlaying((p) => !p);
  const handleReset = () => {
    setIsPlaying(false);
    onForecastHourChange(0);
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-4xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-4 shadow-2xl text-slate-100 flex flex-col gap-3">
      {/* Top Row: Playback Controls, Forecast Hour Display, and Layer Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Play/Pause/Reset & Hour Badge */}
        <div className="flex items-center gap-2">
          <button
            onClick={togglePlay}
            className={`p-2 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-900/40'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/40'
            }`}
            title={isPlaying ? 'Pause animation' : 'Play 0-48h forecast'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Play Storm'}</span>
          </button>

          <button
            onClick={handleReset}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Reset to Departure (+0h)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="bg-slate-800 border border-slate-700/80 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="font-bold text-sky-400 text-sm">+{forecastHour}h</span>
            <span className="text-slate-400 hidden md:inline">•</span>
            <span className="text-slate-200 hidden md:inline font-mono">{currentTimestamp}</span>
          </div>
        </div>

        {/* Right: Heatmap Toggle & Metric Switcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggleHeatmap(!showHeatmap)}
            className={`px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border transition-all ${
              showHeatmap
                ? 'bg-sky-950/80 border-sky-500/80 text-sky-300 font-semibold shadow-sm'
                : 'bg-slate-800/80 border-slate-700 text-slate-400'
            }`}
            title="Toggle Corridor Heatmap Layer"
          >
            {showHeatmap ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>Heatmap</span>
          </button>

          {showHeatmap && (
            <div className="flex bg-slate-800/90 border border-slate-700 rounded-lg p-0.5">
              <button
                onClick={() => onMetricChange('risk')}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${
                  heatmapMetric === 'risk'
                    ? 'bg-emerald-600 text-white font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Heatmap by Weather Risk Level"
              >
                <Flame className="w-3 h-3" />
                <span className="hidden sm:inline">Risk</span>
              </button>
              <button
                onClick={() => onMetricChange('wind')}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${
                  heatmapMetric === 'wind'
                    ? 'bg-amber-600 text-white font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Heatmap by Wind Speed (mph)"
              >
                <Wind className="w-3 h-3" />
                <span className="hidden sm:inline">Wind</span>
              </button>
              <button
                onClick={() => onMetricChange('precip')}
                className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all ${
                  heatmapMetric === 'precip'
                    ? 'bg-sky-600 text-white font-semibold shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Heatmap by Precipitation (Rain/Snow)"
              >
                <CloudRain className="w-3 h-3" />
                <span className="hidden sm:inline">Precip</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Middle Row: 0-48 Hour Range Slider */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-slate-400 font-mono w-10 text-right">+0h</span>
        <input
          type="range"
          min={0}
          max={48}
          step={1}
          value={forecastHour}
          onChange={(e) => onForecastHourChange(Number(e.target.value))}
          className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none"
        />
        <span className="text-[11px] text-slate-400 font-mono w-10">+48h</span>
      </div>

      {/* Bottom Row: Compact Color Legend */}
      <div className="flex flex-wrap items-center justify-between pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
        <span className="hidden sm:inline text-slate-400 font-medium">Weather Risk Legend:</span>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS.LOW }} />
            <span>Low (&lt;25 mph)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS.MODERATE }} />
            <span>Mod (25–34)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS.HIGH }} />
            <span>High (35–44)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RISK_COLORS.SEVERE }} />
            <span>Severe (45–54)</span>
          </div>
          <div className="flex items-center gap-1.5 font-semibold text-rose-300">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 animate-pulse" />
            <span>No Travel (≥55)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
