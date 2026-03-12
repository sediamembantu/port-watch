"use client";

interface AlertBannerProps {
  alerts: string[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-800 bg-red-900/30 p-4">
      <h3 className="mb-2 text-sm font-semibold text-red-400">
        Active Alerts
      </h3>
      <ul className="space-y-1">
        {alerts.map((alert, i) => (
          <li key={i} className="text-sm text-red-300">
            {alert}
          </li>
        ))}
      </ul>
    </div>
  );
}
