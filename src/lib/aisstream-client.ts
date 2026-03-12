import { MALAYSIAN_PORTS } from "./ports";

/**
 * AISStream.io WebSocket client for real-time vessel tracking
 * around Malaysian port areas.
 *
 * Requires AISSTREAM_API_KEY environment variable.
 * Free tier: register at https://aisstream.io/
 */

const AISSTREAM_WS_URL = "wss://stream.aisstream.io/v0/stream";

// Bounding boxes around Malaysian ports (lat/lng with ~15nm radius)
// Format: [[latMin, lngMin], [latMax, lngMax]]
export const PORT_GEOFENCES: Record<string, [[number, number], [number, number]]> = {};

for (const port of MALAYSIAN_PORTS) {
  // ~0.25 degrees ≈ 15 nautical miles radius
  const R = 0.25;
  PORT_GEOFENCES[port.id] = [
    [port.lat - R, port.lng - R],
    [port.lat + R, port.lng + R],
  ];
}

// Strait of Malacca chokepoint bounding box (wide coverage)
export const MALACCA_STRAIT_GEOFENCE: [[number, number], [number, number]] = [
  [1.0, 100.0],
  [4.5, 104.5],
];

export interface VesselPosition {
  mmsi: number;
  name: string;
  shipType: number;
  lat: number;
  lng: number;
  speed: number; // knots
  heading: number;
  timestamp: string;
  portId: string | null; // which port geofence the vessel is in, if any
  inMalaccaStrait: boolean;
}

export interface PortVesselCount {
  portId: string;
  portName: string;
  vesselCount: number;
  arrivals: number; // vessels entering geofence (speed < 5 kts suggests berthing)
  transiting: number; // vessels > 5 kts (passing through)
  lastUpdated: string;
}

export interface AISMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;
  };
  Message: {
    PositionReport?: {
      Sog: number; // speed over ground
      TrueHeading: number;
      NavigationalStatus: number;
    };
    ShipStaticData?: {
      Type: number;
    };
  };
}

/**
 * Create the AISStream subscription message for Malaysian port areas.
 */
export function buildSubscriptionMessage(apiKey: string): string {
  // Combine all port geofences + Malacca Strait into bounding boxes
  const boundingBoxes = [
    ...Object.values(PORT_GEOFENCES),
    MALACCA_STRAIT_GEOFENCE,
  ];

  return JSON.stringify({
    APIKey: apiKey,
    BoundingBoxes: boundingBoxes,
    FilterMessageTypes: ["PositionReport"],
  });
}

/**
 * Parse an AIS message into a VesselPosition.
 */
export function parseAISMessage(msg: AISMessage): VesselPosition | null {
  const meta = msg.MetaData;
  const pos = msg.Message?.PositionReport;

  if (!meta || !pos) return null;

  const lat = meta.latitude;
  const lng = meta.longitude;

  // Determine which port geofence this vessel is in
  let portId: string | null = null;
  for (const [id, [[latMin, lngMin], [latMax, lngMax]]] of Object.entries(PORT_GEOFENCES)) {
    if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
      portId = id;
      break;
    }
  }

  // Check if in Malacca Strait
  const [[mLatMin, mLngMin], [mLatMax, mLngMax]] = MALACCA_STRAIT_GEOFENCE;
  const inMalaccaStrait =
    lat >= mLatMin && lat <= mLatMax && lng >= mLngMin && lng <= mLngMax;

  return {
    mmsi: meta.MMSI,
    name: (meta.ShipName || "").trim(),
    shipType: msg.Message?.ShipStaticData?.Type ?? 0,
    lat,
    lng,
    speed: pos.Sog ?? 0,
    heading: pos.TrueHeading ?? 0,
    timestamp: meta.time_utc,
    portId,
    inMalaccaStrait,
  };
}

/**
 * Aggregate vessel positions into per-port counts.
 * Uses a time window to count unique vessels.
 */
export function aggregatePortVessels(
  positions: VesselPosition[]
): PortVesselCount[] {
  const portVessels: Record<string, Set<number>> = {};
  const portArrivals: Record<string, Set<number>> = {};
  const portTransiting: Record<string, Set<number>> = {};

  for (const port of MALAYSIAN_PORTS) {
    portVessels[port.id] = new Set();
    portArrivals[port.id] = new Set();
    portTransiting[port.id] = new Set();
  }

  for (const pos of positions) {
    if (!pos.portId) continue;

    portVessels[pos.portId].add(pos.mmsi);

    if (pos.speed < 5) {
      portArrivals[pos.portId].add(pos.mmsi);
    } else {
      portTransiting[pos.portId].add(pos.mmsi);
    }
  }

  return MALAYSIAN_PORTS.map((port) => ({
    portId: port.id,
    portName: port.name,
    vesselCount: portVessels[port.id].size,
    arrivals: portArrivals[port.id].size,
    transiting: portTransiting[port.id].size,
    lastUpdated: new Date().toISOString(),
  }));
}

/**
 * Count vessels transiting the Strait of Malacca.
 */
export function countMalaccaTransits(positions: VesselPosition[]): {
  totalVessels: number;
  uniqueVessels: number;
  avgSpeed: number;
  lastUpdated: string;
} {
  const malaccaPositions = positions.filter((p) => p.inMalaccaStrait);
  const uniqueMMSIs = new Set(malaccaPositions.map((p) => p.mmsi));
  const avgSpeed =
    malaccaPositions.length > 0
      ? malaccaPositions.reduce((s, p) => s + p.speed, 0) /
        malaccaPositions.length
      : 0;

  return {
    totalVessels: malaccaPositions.length,
    uniqueVessels: uniqueMMSIs.size,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Snapshot of real-time AIS data for the API.
 * Since WebSocket connections are stateful and we're in a serverless environment,
 * this function performs a short polling session: connects, collects messages
 * for a brief window, then disconnects and returns aggregated data.
 */
export async function fetchRealtimeSnapshot(
  durationMs: number = 15000
): Promise<{
  portVessels: PortVesselCount[];
  malaccaTransits: ReturnType<typeof countMalaccaTransits>;
  messagesReceived: number;
}> {
  const apiKey = process.env.AISSTREAM_API_KEY;

  if (!apiKey) {
    // Return empty data if no API key configured
    return {
      portVessels: MALAYSIAN_PORTS.map((p) => ({
        portId: p.id,
        portName: p.name,
        vesselCount: 0,
        arrivals: 0,
        transiting: 0,
        lastUpdated: new Date().toISOString(),
      })),
      malaccaTransits: {
        totalVessels: 0,
        uniqueVessels: 0,
        avgSpeed: 0,
        lastUpdated: new Date().toISOString(),
      },
      messagesReceived: 0,
    };
  }

  const positions: VesselPosition[] = [];

  return new Promise((resolve) => {
    console.log(`[aisstream] Connecting to ${AISSTREAM_WS_URL}...`);
    const ws = new WebSocket(AISSTREAM_WS_URL);
    ws.binaryType = "arraybuffer";
    let messageCount = 0;
    let rawMessageCount = 0;

    const timeout = setTimeout(() => {
      console.log(`[aisstream] Timeout reached. ${messageCount} parsed, ${rawMessageCount} raw messages`);
      ws.close();
      resolve({
        portVessels: aggregatePortVessels(positions),
        malaccaTransits: countMalaccaTransits(positions),
        messagesReceived: messageCount,
      });
    }, durationMs);

    ws.onopen = () => {
      const subMsg = buildSubscriptionMessage(apiKey);
      console.log(`[aisstream] Connected. Sending subscription with ${Object.keys(PORT_GEOFENCES).length + 1} bounding boxes`);
      ws.send(subMsg);
    };

    ws.onmessage = (event) => {
      rawMessageCount++;
      try {
        // Handle ArrayBuffer, Buffer, or string data
        let text: string;
        if (event.data instanceof ArrayBuffer) {
          text = new TextDecoder().decode(event.data);
        } else if (typeof event.data === "string") {
          text = event.data;
        } else {
          // Buffer or other types
          text = new TextDecoder().decode(new Uint8Array(event.data as ArrayBuffer));
        }
        const data = JSON.parse(text) as AISMessage;
        if (rawMessageCount <= 3) {
          console.log(`[aisstream] Message ${rawMessageCount}: type=${data.MessageType}, MMSI=${data.MetaData?.MMSI}`);
        }
        const pos = parseAISMessage(data);
        if (pos) {
          positions.push(pos);
          messageCount++;
        }
      } catch (err) {
        if (rawMessageCount <= 3) {
          console.warn(`[aisstream] Parse error on message ${rawMessageCount}:`, typeof event.data, String(event.data).substring(0, 200));
        }
      }
    };

    ws.onerror = (err) => {
      console.error(`[aisstream] WebSocket error:`, err);
      clearTimeout(timeout);
      ws.close();
      resolve({
        portVessels: aggregatePortVessels(positions),
        malaccaTransits: countMalaccaTransits(positions),
        messagesReceived: messageCount,
      });
    };

    ws.onclose = (event) => {
      console.log(`[aisstream] Connection closed: code=${event.code}, reason=${event.reason}`);
    };
  });
}
