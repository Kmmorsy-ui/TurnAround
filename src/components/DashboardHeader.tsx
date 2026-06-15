import { Complaint } from "../types";
import { Smile, Inbox, Percent, AlertCircle } from "lucide-react";

interface DashboardHeaderProps {
  complaints: Complaint[];
  id?: string;
}

export default function DashboardHeader({ complaints, id }: DashboardHeaderProps) {
  const total = complaints.length;
  const recovered = complaints.filter((c) => c.status === "Recovered").length;
  const open = total - recovered;
  
  // Calculate recovery rate safely
  const recoveryRate = total > 0 ? Math.round((recovered / total) * 100) : 0;

  return (
    <div
      className="grid grid-cols-3 gap-3 sm:gap-4 w-full mb-6"
      id={id || "dashboard-stats-grid"}
    >
      {/* Open Complaints Card */}
      <div
        className="bg-[#131627] border border-slate-800/80 rounded-xl p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-300 hover:border-slate-700/50"
        id="stats-card-open"
      >
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-[10px] sm:text-xs font-mono tracking-wider text-slate-400 uppercase">
            Active Open
          </span>
          <AlertCircle className="w-4 h-4 text-amber-500/80 shrink-0" />
        </div>
        <div className="flex items-baseline gap-1" id="stats-count-open">
          <span className="font-display font-black text-2xl sm:text-3.5xl text-white tracking-tight">
            {open}
          </span>
          <span className="text-xs text-slate-500 font-sans hidden sm:inline">
            complaints
          </span>
        </div>
      </div>

      {/* Recovered Count Card */}
      <div
        className="bg-[#131627] border border-slate-800/80 rounded-xl p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-300 hover:border-slate-700/50"
        id="stats-card-recovered"
      >
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-[10px] sm:text-xs font-mono tracking-wider text-slate-400 uppercase">
            Recovered
          </span>
          <Smile className="w-4 h-4 text-emerald-500/80 shrink-0" />
        </div>
        <div className="flex items-baseline gap-1" id="stats-count-recovered">
          <span className="font-display font-black text-2xl sm:text-3.5xl text-emerald-400 tracking-tight">
            {recovered}
          </span>
          <span className="text-xs text-slate-500 font-sans hidden sm:inline">
            retained
          </span>
        </div>
      </div>

      {/* Recovery Rate percentage Card */}
      <div
        className="bg-[#131627] border border-slate-800/80 rounded-xl p-3.5 sm:p-5 flex flex-col justify-between transition-all duration-300 hover:border-slate-700/50"
        id="stats-card-rate"
      >
        <div className="flex items-center justify-between gap-1 mb-2">
          <span className="text-[10px] sm:text-xs font-mono tracking-wider text-slate-400 uppercase">
            Recovery Rate
          </span>
          <Percent className="w-4 h-4 text-indigo-400 shrink-0" />
        </div>
        <div className="flex items-baseline gap-1.5" id="stats-count-rate">
          <span className="font-mono font-bold text-2.5xl sm:text-3.5xl text-indigo-300 tracking-tight">
            {recoveryRate}
            <span className="text-lg text-slate-500 font-extralight">%</span>
          </span>
        </div>
      </div>
    </div>
  );
}
