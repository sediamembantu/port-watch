"use client";

interface PortScore {
  portId: string;
  portName: string;
  score: number;
  vesselCount: number;
  trend: "improving" | "stable" | "worsening";
}

interface PortTableProps {
  portScores: PortScore[];
}

const trendIcon = {
  improving: "\u2193",
  stable: "\u2192",
  worsening: "\u2191",
};

const trendColor = {
  improving: "text-green-400",
  stable: "text-gray-400",
  worsening: "text-red-400",
};

export function PortTable({ portScores }: PortTableProps) {
  const sorted = [...portScores].sort((a, b) => b.score - a.score);

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-800 text-xs uppercase text-gray-400">
          <tr>
            <th className="px-4 py-3">Port</th>
            <th className="px-4 py-3">Disruption</th>
            <th className="px-4 py-3">Vessels</th>
            <th className="px-4 py-3">7d Trend</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((port) => (
            <tr
              key={port.portId}
              className="border-t border-gray-700 bg-gray-900 hover:bg-gray-800"
            >
              <td className="px-4 py-3 font-medium text-white">
                {port.portName}
              </td>
              <td className="px-4 py-3">
                <span
                  className={
                    port.score < 0.3
                      ? "text-green-400"
                      : port.score < 0.6
                        ? "text-yellow-400"
                        : "text-red-400"
                  }
                >
                  {(port.score * 100).toFixed(0)}%
                </span>
              </td>
              <td className="px-4 py-3 text-gray-300">{port.vesselCount}</td>
              <td className={`px-4 py-3 ${trendColor[port.trend]}`}>
                {trendIcon[port.trend]} {port.trend}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
