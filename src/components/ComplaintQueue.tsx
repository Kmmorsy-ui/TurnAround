import { useState } from "react";
import { Complaint, ComplaintStatus } from "../types";
import { Camera, Clipboard, Tag, ChevronRight, CornerDownRight, Frown } from "lucide-react";
import RecoveryArc from "./RecoveryArc";

interface ComplaintQueueProps {
  complaints: Complaint[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  id?: string;
}

type FilterType = "All" | "Open" | "Recovered";

export default function ComplaintQueue({
  complaints,
  selectedId,
  onSelect,
  id,
}: ComplaintQueueProps) {
  const [filter, setFilter] = useState<FilterType>("All");

  // Filtering criteria
  const filtered = complaints.filter((c) => {
    if (filter === "Open") return c.status !== "Recovered";
    if (filter === "Recovered") return c.status === "Recovered";
    return true; // "All"
  });

  // Helper formatting for dates
  const formatTimeAgo = (isoDateStr: string) => {
    try {
      const date = new Date(isoDateStr);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return "Recently";
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131627] border border-slate-800/80 rounded-2xl overflow-hidden" id={id || "queue-panel"}>
      {/* Search & Tabs Header */}
      <div className="p-4 border-b border-slate-800/80 bg-[#161a30]/30" id="queue-header">
        <h2 className="text-sm font-mono tracking-wider text-slate-400 uppercase mb-3">
          Complaints Registry
        </h2>
        
        {/* Toggle Filters */}
        <div className="bg-[#1b1f3c] p-1 rounded-xl flex gap-1" id="filter-tabs">
          {(["All", "Open", "Recovered"] as FilterType[]).map((tab) => {
            const count = complaints.filter((c) => {
              if (tab === "Open") return c.status !== "Recovered";
              if (tab === "Recovered") return c.status === "Recovered";
              return true;
            }).length;

            const isActive = filter === tab;
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
                  isActive
                    ? "bg-[#252a50] text-amber-400 shadow-sm font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                id={`filter-tab-${tab}`}
              >
                {tab}
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  isActive ? "bg-amber-400/10 text-amber-300" : "bg-slate-800 text-slate-500"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Registry Queue list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[580px]" id="queue-scroll-container">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4" id="queue-empty">
            <Frown className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm font-medium">No complaints in this set.</p>
            <p className="text-slate-500 text-xs mt-1">Change filters or log a new complaint to get started.</p>
          </div>
        ) : (
          filtered.map((c) => {
            const isSelected = selectedId === c.id;
            return (
              <div
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`group relative border rounded-xl p-3.5 transition duration-200 cursor-pointer text-left flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? "bg-[#1f2445]/60 border-amber-500/80 shadow-md shadow-amber-500/5"
                    : "bg-[#171b31]/40 border-slate-800 hover:border-slate-700/60 hover:bg-[#1a1f3a]/30"
                }`}
                id={`complaint-card-${c.id}`}
              >
                {/* Left accent border by severity */}
                <div
                  className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-md transition-all ${
                    c.status === "Recovered"
                      ? "bg-emerald-500/80"
                      : c.severity && c.severity >= 4
                      ? "bg-red-500/80"
                      : "bg-amber-500/80"
                  }`}
                />

                {/* Top Metas Row */}
                <div className="flex items-start justify-between gap-2 pl-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-bold text-sm text-white group-hover:text-amber-300 transition-colors truncate">
                      {c.customerName || "Valued Customer"}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {/* Arrival Source Tag */}
                      <span className="inline-flex items-center gap-1 bg-slate-800/60 text-slate-400 text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-slate-700/40">
                        {c.source === "Photo" ? (
                          <Camera className="w-2.5 h-2.5 text-amber-500" />
                        ) : (
                          <span className="w-2.5 text-center font-bold">⌨</span>
                        )}
                        {c.source}
                      </span>

                      {/* Display severity dots or badge */}
                      {c.severity && (
                        <span className="inline-flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span
                              key={i}
                              className={`w-1 h-1 rounded-full ${
                                i < (c.severity || 1)
                                  ? c.severity >= 4
                                    ? "bg-red-400"
                                    : "bg-amber-400"
                                  : "bg-slate-800"
                              }`}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap shrink-0">
                    {formatTimeAgo(c.receivedAt)}
                  </span>
                </div>

                {/* Complaint Preview Text */}
                <p className="text-xs text-slate-300 leading-snug line-clamp-2 pl-2">
                  {c.summary || c.text}
                </p>

                {/* Bottom line: Recovery Status & Recovery Arc representation */}
                <div className="flex items-center justify-between border-t border-slate-800/60 pt-2 pl-2">
                  {/* Status Badge */}
                  <span
                    className={`text-[9px] font-mono tracking-wider uppercase font-semibold px-2 py-0.5 rounded-full ${
                      c.status === "Recovered"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : c.status === "In Progress"
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                  >
                    {c.status}
                  </span>

                  {/* MINI SVG RECOVERY ARC */}
                  <div className="pointer-events-none scale-90 translate-x-3">
                    <RecoveryArc status={c.status} size="sm" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
