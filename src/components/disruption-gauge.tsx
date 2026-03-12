"use client";

interface DisruptionGaugeProps {
  score: number; // 0 to 1
  label: string;
}

export function DisruptionGauge({ score, label }: DisruptionGaugeProps) {
  const percentage = Math.round(score * 100);
  const color =
    score < 0.3
      ? "text-green-500"
      : score < 0.6
        ? "text-yellow-500"
        : "text-red-500";
  const bgColor =
    score < 0.3
      ? "bg-green-500"
      : score < 0.6
        ? "bg-yellow-500"
        : "bg-red-500";
  const statusText =
    score < 0.3 ? "Normal" : score < 0.6 ? "Elevated" : "High Disruption";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-2 text-sm text-gray-400">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{percentage}%</div>
      <div className="mt-2 h-2 w-full rounded-full bg-gray-700">
        <div
          className={`h-2 rounded-full ${bgColor} transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className={`mt-1 text-xs ${color}`}>{statusText}</div>
    </div>
  );
}
