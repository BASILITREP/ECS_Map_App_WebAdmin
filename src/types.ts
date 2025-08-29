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
  status: 'in-progress' | 'delayed' | 'arriving';
}
