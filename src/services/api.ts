import type { Branch, FieldEngineer, ServiceRequest, ActivityHistory, Trip} from '../types';
import image from '../assets/History.png';
import { isConnected } from './socketService';

// Use environment variable for API URL with fallback
const API_URL = import.meta.env.VITE_DB_URL || 'http://localhost:5242/api';

// Define error handler
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text();
    console.error('API Error:', response.status, text);
    throw new Error(text || `Error: ${response.status}`);
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  
  return null;
};

// API Functions
export const fetchBranches = async (): Promise<Branch[]> => {
  const response = await fetch(`${API_URL}/Branches`);
  const data = await handleResponse(response);
  return data.map((branch: any) => ({
    _id: branch.id.toString(),
    name: branch.name,
    location: branch.address,
    image: branch.image || 'https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop',
    lat: branch.latitude,
    lng: branch.longitude,
  }));
};

export const fetchFieldEngineers = async (): Promise<FieldEngineer[]> => {
  // Fixed URL to match controller name
  const response = await fetch(`${API_URL}/FieldEngineer`);
  const data = await handleResponse(response);
  
  // Transform the data to match the frontend expected structure
  return data.map((fe: any) => ({
    id: fe.id,
    name: fe.name,
    lng: fe.currentLongitude || 0,
    lat: fe.currentLatitude || 0,
    status: fe.status || 'Active',
    lastUpdated: fe.updatedAt || new Date().toISOString(),
  }));
};

export const fetchServiceRequests = async (): Promise<ServiceRequest[]> => {
  const response = await fetch(`${API_URL}/ServiceRequests`);
  const data = await handleResponse(response);
  
  // Transform the data to match the frontend expected structure
  return data.map((sr: any) => ({
    id: String(sr.id ?? sr.Id),
    branchId: String(sr.branchId ?? sr.BranchId),
    branchName: sr.branchName ?? sr.BranchName ?? (sr.branch?.name ?? 'Unknown Branch'),
    lat: sr.lat ?? sr.Lat ?? (sr.branch?.latitude ?? 0),
    lng: sr.lng ?? sr.Lng ?? (sr.branch?.longitude ?? 0),
    status: (sr.status ?? '').toLowerCase(),
    createdAt: sr.createdAt ?? sr.CreatedAt,
    acceptedAt: sr.acceptedAt ?? sr.AcceptedAt,
    acceptedByFeId: sr.fieldEngineerId ?? sr.FieldEngineerId,
    acceptedByFeName: sr.fieldEngineerName ?? sr.FieldEngineerName ?? sr.fieldEngineer?.name,
    currentRadiusKm: sr.currentRadiusKm ?? sr.CurrentRadiusKm ?? 5,
  }));
};

export const createServiceRequest = async (data: { branchId: string, branch: Branch }) => {
  try {
    const branchId = parseInt(data.branchId);
    
    // We need to map our frontend Branch model to match the backend's expected structure
    const response = await fetch(`${API_URL}/ServiceRequests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        branchId: branchId,
        status: "pending",
        createdAt: new Date().toISOString(),
        lat: data.branch.lat,
        lng: data.branch.lng,
        branchName: data.branch.name,
        title: `Service Request for ${data.branch.name}`,
        description: `Service required at ${data.branch.location}`,
        priority: "Medium",
        branch: {
          id: branchId,
          name: data.branch.name,
          address: data.branch.location,
          latitude: data.branch.lat,
          longitude: data.branch.lng
        }
      }),
    });
    
    return await handleResponse(response);
  } catch (error) {
    console.error('Error creating service request:', error);
    throw error;
  }
}
export const acceptServiceRequest = async (
  serviceRequestId: string, 
  fieldEngineerId: number
): Promise<void> => {
  const response = await fetch(`${API_URL}/ServiceRequests/${serviceRequestId}/accept`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldEngineerId })
  });
  
  await handleResponse(response);

  // With sockets, we don't need to manually refresh data after operations
  // The server will broadcast the changes and our socket subscriptions will update the UI
};

export const loginUser = async (username: string, password: string) => {
  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error("Login failed");
  }

  return response.json();
};

export const isAuthenticated = () => {
  return localStorage.getItem("token") !== null;
};

export const getAuthToken = () => {
  return localStorage.getItem("token");
};

export const logout = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  localStorage.removeItem("role");
};

export const startFieldEngineerNavigation = async (
  fieldEngineerId: number,
  fieldEngineerName: string,
  routeCoordinates: number[][]
) => {
  const response = await fetch(`${API_URL}/Test/startNavigation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fieldEngineerId,
      fieldEngineerName,
      routeCoordinates
    }),
  });
  
  return await handleResponse(response);
};

export const stopFieldEngineerNavigation = async (fieldEngineerId: number) => {
  const response = await fetch(`${API_URL}/Test/stopNavigation/${fieldEngineerId}`, {
    method: 'POST',
  });
  
  return await handleResponse(response);
};

// Add this new function to fetch trips for a specific engineer
export const fetchTrips = async (feId: number): Promise<Trip[]> => {
  try {
    // CHANGE THE ENDPOINT to match your LocationController:
    const response = await fetch(`${API_URL}/Location/trips/${feId}`);
    if (!response.ok) {
      throw new Error("Failed to fetch trips");
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching trips:", error);
    return [];
  }
};

export const fetchActivityHistory = async (fieldEngineerId: number): Promise<ActivityHistory[]> => {
  const response = await fetch(`${API_URL}/FieldEngineer/${fieldEngineerId}/activity`);
  const data = await handleResponse(response);
  
  // Transform the backend data to match the frontend component's expected structure
  return data.map((event: any) => {
    const startTime = new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(event.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (event.type === 1) { // 1 corresponds to the 'Drive' enum in C#
      return {
        id: event.id,
        feId: event.fieldEngineerId,
        type: 'drive',
        distance: `${event.distanceKm.toFixed(1)} km`,
        timeRange: `${startTime} - ${endTime}`,
        duration: `${event.durationMinutes} min`,
        topSpeed: `${event.topSpeedKmh.toFixed(0)} km/h`,
        riskyEvents: 0, // Placeholder
        mapImage: image,
      };
    } else { // 0 corresponds to the 'Stop' enum
      return {
        id: event.id,
        feId: event.fieldEngineerId,
        type: 'stop',
        locationName: event.locationName,
        address: event.address,
        timeRange: `${startTime} - ${endTime}`,
        duration: `${event.durationMinutes} min`,
        mapImage: image,
        lat: event.latitude,
        lng: event.longitude,
      };
    }
  });
};
