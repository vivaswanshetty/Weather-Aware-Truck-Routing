import { Truck, ShieldCheck, CloudRain } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full bg-slate-800 border border-slate-700 rounded-xl p-8 shadow-2xl text-center space-y-4">
        <div className="flex justify-center items-center gap-3 text-emerald-400">
          <Truck className="w-10 h-10" />
          <CloudRain className="w-8 h-8 text-sky-400" />
          <ShieldCheck className="w-8 h-8 text-amber-400" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Spotter Weather-Aware Truck Routing</h1>
        <p className="text-slate-400">
          Scaffold initialized. Backend risk & recommendation engines ready for integration.
        </p>
      </div>
    </div>
  );
}
