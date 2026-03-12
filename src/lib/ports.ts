export interface MalaysianPort {
  id: string;
  name: string;
  unlocode: string;
  lat: number;
  lng: number;
  tradeShare: number; // approximate % of Malaysian trade
  type: string;
}

export const MALAYSIAN_PORTS: MalaysianPort[] = [
  {
    id: "port-klang",
    name: "Port Klang",
    unlocode: "MYPKG",
    lat: 3.0,
    lng: 101.4,
    tradeShare: 45,
    type: "Container hub",
  },
  {
    id: "tanjung-pelepas",
    name: "Tanjung Pelepas",
    unlocode: "MYTPP",
    lat: 1.363,
    lng: 103.551,
    tradeShare: 30,
    type: "Transshipment hub",
  },
  {
    id: "penang-port",
    name: "Penang Port",
    unlocode: "MYPEN",
    lat: 5.415,
    lng: 100.346,
    tradeShare: 8,
    type: "Northern gateway",
  },
  {
    id: "johor-port",
    name: "Johor Port",
    unlocode: "MYJHB",
    lat: 1.461,
    lng: 103.904,
    tradeShare: 5,
    type: "Palm oil & bulk",
  },
  {
    id: "kuantan-port",
    name: "Kuantan Port",
    unlocode: "MYKUA",
    lat: 3.978,
    lng: 103.428,
    tradeShare: 3,
    type: "East coast petrochemical",
  },
  {
    id: "bintulu-port",
    name: "Bintulu Port",
    unlocode: "MYBTU",
    lat: 3.167,
    lng: 113.033,
    tradeShare: 3,
    type: "LNG & Sarawak",
  },
  {
    id: "kemaman-port",
    name: "Kemaman Port",
    unlocode: "MYKEM",
    lat: 4.233,
    lng: 103.417,
    tradeShare: 1,
    type: "Petrochemical",
  },
];
