import React from 'react';
import { X, Scale, Trophy, CloudLightning } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0b0f17] border border-slate-800 rounded-lg shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto font-sans">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-sky-400 font-bold text-lg">
            <CloudLightning className="w-5 h-5 text-amber-400" />
            <span>Spotter Risk & Load Classification Engine</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-6 text-xs text-slate-300">
          {/* Section 1: Weather Thresholds Table */}
          <div>
            <h4 className="font-semibold text-slate-200 text-sm mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              1. Base Weather Thresholds (at each route checkpoint)
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-400 font-mono text-[11px]">
                    <th className="p-2.5 border-b border-slate-700">Condition</th>
                    <th className="p-2.5 border-b border-slate-700 text-emerald-400">Low (1)</th>
                    <th className="p-2.5 border-b border-slate-700 text-amber-400">Moderate (2)</th>
                    <th className="p-2.5 border-b border-slate-700 text-orange-400">High (3)</th>
                    <th className="p-2.5 border-b border-slate-700 text-red-400">Severe (4)</th>
                    <th className="p-2.5 border-b border-slate-700 text-rose-400">No Travel (5)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr>
                    <td className="p-2.5 font-bold text-slate-200">Wind</td>
                    <td className="p-2.5">&lt; 25 mph</td>
                    <td className="p-2.5">25–34 mph</td>
                    <td className="p-2.5">35–44 mph</td>
                    <td className="p-2.5">45–54 mph</td>
                    <td className="p-2.5 font-bold text-rose-300">≥ 55 mph</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-200">Rain</td>
                    <td className="p-2.5">&lt; 0.10 in/hr</td>
                    <td className="p-2.5">0.10–0.25</td>
                    <td className="p-2.5">0.25–0.50</td>
                    <td className="p-2.5">0.50–1.00</td>
                    <td className="p-2.5 font-bold text-rose-300">&gt; 1.00 in/hr</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-bold text-slate-200">Snow</td>
                    <td className="p-2.5">&lt; 0.5 in/hr</td>
                    <td className="p-2.5">0.5–1.0</td>
                    <td className="p-2.5">1.0–2.0</td>
                    <td className="p-2.5">2.0–3.0</td>
                    <td className="p-2.5 font-bold text-rose-300">&gt; 3.0 in/hr</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              * The overall checkpoint risk is the maximum severity among wind, rain, and snow.
            </p>
          </div>

          {/* Section 2: Load Weight Overrides */}
          <div>
            <h4 className="font-semibold text-slate-200 text-sm mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4 text-amber-400" />
              2. Commercial Load Weight Escalation Rules
            </h4>
            <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/80 space-y-2">
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <p>
                  <strong className="text-rose-300">≥ 55 mph Wind:</strong>{' '}
                  <span className="text-rose-200 font-bold">No Travel</span> for any commercial load.
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <p>
                  <strong className="text-amber-300">45–54 mph Wind + &gt; 30,000 lb:</strong>{' '}
                  Escalates wind risk from Severe to{' '}
                  <span className="text-rose-300 font-bold">No Travel</span> (high trailer rollover risk).
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                <p>
                  <strong className="text-amber-300">35–44 mph Wind + &gt; 40,000 lb:</strong>{' '}
                  Escalates wind risk from High to{' '}
                  <span className="text-orange-300 font-bold">Severe</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Route Recommendation Priority */}
          <div>
            <h4 className="font-semibold text-slate-200 text-sm mb-2 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-400" />
              3. Route Recommendation Priority Tuple (Safety-First)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-sky-400">1. Fewest No Travel Miles</span>
                <p className="text-slate-400 mt-0.5">Routes with 0 No Travel miles always beat routes with No Travel zones.</p>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-sky-400">2. Fewest Severe Miles</span>
                <p className="text-slate-400 mt-0.5">Minimizes exposure to severe crosswinds and heavy blizzard zones.</p>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-sky-400">3. Fewest High Miles</span>
                <p className="text-slate-400 mt-0.5">Tie-breaker for routes with equal severe miles.</p>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                <span className="font-bold text-sky-400">4. Lowest Average Risk Score</span>
                <p className="text-slate-400 mt-0.5">Distance-weighted risk severity (1.0 to 5.0 scale).</p>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-800 sm:col-span-2">
                <span className="font-bold text-emerald-400">5. Shortest Travel Times</span>
                <p className="text-slate-400 mt-0.5">When weather risk profiles are identical, the fastest route wins.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg text-xs transition-colors"
          >
            Close Reference
          </button>
        </div>
      </div>
    </div>
  );
};
