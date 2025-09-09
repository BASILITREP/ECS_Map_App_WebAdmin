import type { Branch, FieldEngineer, ServiceRequest } from '../types';
import { isConnected } from './socketService';

// Use environment variable for API URL with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:7126/api';

// Define error handler
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error: ${response.status}`);
  }
  
  // Check if there's actual content before parsing JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  
  return null; // Return null for empty or non-JSON responses
};

// API Functions
export const fetchBranches = async (): Promise<Branch[]> => {
  const response = await fetch(`${API_URL}/Branches`);
  const data = await handleResponse(response);
  
  // Transform the data to match the frontend expected structure
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
    const response = await fetch(`${API_URL}/ServiceRequests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      // Only send the branchId in the request body
      body: JSON.stringify({
        branchId: parseInt(data.branchId)  // Convert string to number since the API expects an integer
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
