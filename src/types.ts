export interface Branch {
  _id?: string;
  name: string;
  location: string;
  image: string;
  lat: number;
  lng: number;
}

export interface FieldEngineer {
  id: number;
  lng: number;
  lat: number;
  name: string;
  status: string;
  lastUpdated: string;
  fcmToken: string;
}

export interface ServiceRequest {
  id: string;
  branchId: string;
  branchName: string;
  lat: number;
  lng: number;
  status: 'pending' | 'accepted' | 'cancelled' | 'expired';
  createdAt: string;
  acceptedAt?: string;
  acceptedByFeId?: number;
  acceptedByFeName?: string;
  currentRadiusKm: number;
}

export interface RouteStep {
  maneuver: string;
  roadName: string;
  distance: string;
}

export interface OngoingRoute {
  id: number;
  feId: number;
  feName: string;
  branchId: number;
  branchName: string;
  startTime: string;
  estimatedArrival: string;
  distance: string;
  duration: string;
  price: string;
  routeSteps?: RouteStep[];
  status: 'in-progress' | 'delayed' | 'arriving';
}

export interface ActivityHistory {
  id: number;
  feId: number;
  type: 'drive' | 'stop';
  distance?: string;
  timeRange: string;
  duration: string;
  topSpeed?: string;
  riskyEvents?: number;
  locationName?: string;
  address?: string;
  mapImage: string;
  lat?: number;
  lng?: number;
}

export interface LocationPoint {
  id: number;
  latitude: number;
  longitude: number;
  speed?: number;
  timestamp: string;
  fieldEngineerId: number;
}

export interface Trip {
  id: number;
  fieldEngineerId: number;
  startTime: string;
  endTime?: string;
  startAddress: string;
  endAddress?: string;
  distance: number;
  // ADD THESE NEW FIELDS:
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  startLocation: string;
  endLocation?: string;
  tripType: string; // "STATIONARY" or "MOVEMENT"
  totalDistance: number;
  path: LocationPoint[];
}
