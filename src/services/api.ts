import type { Branch, FieldEngineer, ServiceRequest } from '../types';

// Use environment variable for API URL with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:7126/api';

// Define error handler
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error: ${response.status}`);
  }
  return response.json();
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

export const createServiceRequest = async (branchId: string): Promise<void> => {
  const response = await fetch(`${API_URL}/ServiceRequests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      branchId: parseInt(branchId),
      title: 'New Service Request',
      description: 'Service required at branch',
      status: 'pending',
      priority: 'Medium'
    })
  });
  const created = await handleResponse(response);

  // Immediately auto-assign nearest FE server-side for simplified flow
  try {
    await fetch(`${API_URL}/ServiceRequests/${created.id || created.Id}/auto-assign`, { method: 'POST' });
  } catch (err) {
    console.error('Auto-assign failed:', err);
  }
};

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
};
