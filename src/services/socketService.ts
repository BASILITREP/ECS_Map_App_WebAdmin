import * as signalR from '@microsoft/signalr';
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';

// Use environment variable with fallback
const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:7126';

// Event callback types
type EventCallback<T> = (data: T) => void;

// Event handler storage
const eventHandlers: {
  [key: string]: EventCallback<any>[];
} = {
  fieldEngineerUpdate: [],
  serviceRequestUpdate: [],
  newServiceRequest: [],
  branchUpdate: [],
  newRoute: [],
  routeUpdate: [],
  connected: [],
  disconnected: [],
  error: [],
};

// SignalR connection
let connection: signalR.HubConnection | null = null;

// Initialize and start connection
export const initializeSocket = async (): Promise<void> => {
  if (connection) return;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_URL}/notificationHub`)
    .withAutomaticReconnect()
    .build();

  // Register event handlers
  connection.on('ReceiveFieldEngineerUpdate', (data: FieldEngineer) => {
    notifyEventHandlers('fieldEngineerUpdate', data);
  });

  connection.on('ReceiveServiceRequestUpdate', (data: ServiceRequest) => {
    notifyEventHandlers('serviceRequestUpdate', data);
  });

  connection.on('ReceiveNewServiceRequest', (data: ServiceRequest) => {
    notifyEventHandlers('newServiceRequest', data);
  });

  connection.on('ReceiveBranchUpdate', (data: Branch) => {
    notifyEventHandlers('branchUpdate', data);
  });

  connection.on('ReceiveNewRoute', (data: OngoingRoute) => {
    notifyEventHandlers('newRoute', data);
  });

  connection.on('ReceiveRouteUpdate', (data: OngoingRoute) => {
    notifyEventHandlers('routeUpdate', data);
  });

  // Connection lifecycle events
  connection.onreconnected(() => {
    console.log('SignalR reconnected');
    notifyEventHandlers('connected', null);
  });

  connection.onclose(() => {
    console.log('SignalR disconnected');
    notifyEventHandlers('disconnected', null);
  });

  try {
    await connection.start();
    console.log('SignalR connected');
    notifyEventHandlers('connected', null);
  } catch (err) {
    console.error('SignalR connection error:', err);
    notifyEventHandlers('error', err);
  }
};

// Notify all event handlers for a specific event
const notifyEventHandlers = <T>(event: string, data: T): void => {
  if (eventHandlers[event]) {
    eventHandlers[event].forEach(callback => callback(data));
  }
};

// Subscribe to events
export const subscribe = <T>(event: string, callback: EventCallback<T>): void => {
  if (!eventHandlers[event]) {
    eventHandlers[event] = [];
  }
  eventHandlers[event].push(callback as EventCallback<any>);
};

// Unsubscribe from events
export const unsubscribe = <T>(event: string, callback: EventCallback<T>): void => {
  if (!eventHandlers[event]) return;
  const index = eventHandlers[event].indexOf(callback as EventCallback<any>);
  if (index !== -1) {
    eventHandlers[event].splice(index, 1);
  }
};

// Stop connection
export const stopConnection = async (): Promise<void> => {
  if (connection) {
    await connection.stop();
    connection = null;
  }
};

// Get connection state
export const isConnected = (): boolean => {
  return connection?.state === signalR.HubConnectionState.Connected;
};

// Add these new event types to your existing socketService
export type SocketEvent = 
  'connected' | 'disconnected' | 'error' | 
  'fieldEngineerUpdate' | 'newFieldEngineer' |  // Add newFieldEngineer
  'serviceRequestUpdate' | 'newServiceRequest' |
  'newRoute' | 'routeUpdate' |
  'newBranch';  // Add newBranch