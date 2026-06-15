import { ComplaintStatus } from "../types";

interface RecoveryArcProps {
  status: ComplaintStatus;
  size?: "sm" | "md" | "lg";
  id?: string;
}

export default function RecoveryArc({ status, size = "md", id }: RecoveryArcProps) {
  // Dimension mappings
  const dims = {
    sm: { width: 80, height: 32, textY: 20 },
    md: { width: 120, height: 44, textY: 26 },
    lg: { width: 180, height: 60, textY: 36 },
  };

  const { width, height } = dims[size];

  // Starting point (muddy clay-red)
  const startX = size === "sm" ? 8 : size === "md" ? 12 : 16;
  const startY = height - (size === "sm" ? 8 : size === "md" ? 10 : 12);

  // Target endpoint (sage green at the top right)
  const endX = width - (size === "sm" ? 8 : size === "md" ? 12 : 16);
  const endY = size === "sm" ? 8 : size === "md" ? 12 : 14;

  // Midpoint behavior based on recovery stage
  let midX = width / 2;
  let midY = height; // default low bend
  let progressX = startX;
  let progressY = startY;
  let strokeColor = "#ef4444"; // clay-red
  let fillBg = "none";

  if (status === "New") {
    // Low flat arc, progress dot sits right after start
    midX = (startX + width / 4);
    midY = startY - 2;
    progressX = startX + (endX - startX) * 0.15;
    progressY = startY - 3;
    strokeColor = "#ec5c5c"; // clay red
  } else if (status === "In Progress") {
    // Rises up, halfway progress
    midY = (startY + endY) / 2 + 5;
    progressX = (startX + endX) / 2;
    progressY = ((startY + endY) / 2) + 2;
    strokeColor = "#f59e0b"; // honey amber
  } else if (status === "Recovered") {
    // Full arc, progress dot reaches the absolute top-right end
    midY = endY + 4;
    progressX = endX;
    progressY = endY;
    strokeColor = "#10b981"; // sage green
  }

  // Generate the Bezier path
  // If "New", keep path flat. If "In Progress", curve it. If "Recovered", elegant full arc.
  const pathD = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;

  // SVG parameters for drawing portion of path
  let strokeDasharray = "100 100";
  let strokeDashoffset = "0";

  if (status === "New") {
    strokeDasharray = "15 100";
  } else if (status === "In Progress") {
    strokeDasharray = "50 100";
  } else {
    strokeDasharray = "100 100";
  }

  return (
    <div className="flex flex-col items-center justify-center select-none" id={id || "recovery-arc"}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible"
      >
        {/* Definition for gradients and shadows */}
        <defs>
          <linearGradient id="arcGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ec5c5c" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>

        {/* Muted background guide curve */}
        <path
          d={pathD}
          fill="none"
          stroke="#1e293b"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="3 3"
        />

        {/* Dynamic highlighted active arc segment */}
        <path
          d={pathD}
          fill="none"
          stroke={status === "Recovered" ? "#10b981" : "url(#arcGradient)"}
          strokeWidth={status === "Recovered" ? "3" : "2.5"}
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />

        {/* Starting low anchor point (muted clay representing upset arrival) */}
        <circle
          cx={startX}
          cy={startY}
          r={size === "sm" ? 3 : size === "md" ? 4.5 : 5.5}
          fill="#f87171"
          className="shadow-sm animate-pulse"
        />

        {/* Target top-right anchor point (destination guideline) */}
        <circle
          cx={endX}
          cy={endY}
          r={size === "sm" ? 2.5 : 3.5}
          fill="#0f172a"
          stroke="#334155"
          strokeWidth="1.5"
        />

        {/* Current progress indicator point */}
        <circle
          cx={progressX}
          cy={progressY}
          r={size === "sm" ? 4 : size === "md" ? 5.5 : 7}
          fill={status === "Recovered" ? "#10b981" : status === "In Progress" ? "#f59e0b" : "#f87171"}
          stroke="#0d0f1a"
          strokeWidth="1.5"
          className="transition-all duration-700 ease-out shadow-lg shadow-black"
        />
      </svg>
    </div>
  );
}
