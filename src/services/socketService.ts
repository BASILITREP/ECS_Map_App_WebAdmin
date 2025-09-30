import * as signalR from '@microsoft/signalr';
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';
import { toast } from 'react-toastify';

// Use environment variable with fallback
//const API_URL ='https://sdstestwebservices.equicom.com/maps/hub';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5242';
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
  CoordinateUpdate: [],
  routeCompleted:[],
  
};

// SignalR connection
let connection: signalR.HubConnection | null = null;

// Initialize and start connection
export const initializeSocket = async (): Promise<void> => {
  if (connection) return;

  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_URL}/notificationHub`, {
      skipNegotiation: true,
      transport: signalR.HttpTransportType.WebSockets
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Information)
    .build();

  console.log('Attempting SignalR connection to:', `${API_URL}/notificationHub`);

  // Register event handlers
  connection.on('ReceiveFieldEngineerUpdate', (data: FieldEngineer) => {
    notifyEventHandlers('fieldEngineerUpdate', data);
  });

  connection.on('ReceiveServiceRequestUpdate', (data: ServiceRequest) => {
    console.log('Service request update received via SignalR:', data);
    notifyEventHandlers('serviceRequestUpdate', data);
  });

  connection.on('ReceiveNewServiceRequest', (data: ServiceRequest) => {
    // Show toast notification for new service requests
    toast.info(`New service request created: ${data.branchName} at ${data.branchName}`, {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
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

  connection.on('ReceiveNewFieldEngineer', (data: FieldEngineer) => {
  console.log('New field engineer received via SignalR:', data);
  notifyEventHandlers('ReceiveNewFieldEngineer', data);
});

connection.on('ReceiveNewBranch', (data: Branch) => {
  console.log('New branch received via SignalR:', data);
  notifyEventHandlers('newBranch', data);
});

  // Add this new event handler
  connection.on('CoordinateUpdate', (data: any) => {
    console.log('Boss coordinates received:', data);
    toast.success(`Boss location updated: ${data.description}`, {
      position: "top-right",
      autoClose: 3000,
    });
    notifyEventHandlers('CoordinateUpdate', data);
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

  connection.on('ReceiveRouteCompleted', (data: ServiceRequest) => {
  notifyEventHandlers('routeCompleted', data);
});

  // Add better error handling
  connection.onclose((error) => {
    console.log('SignalR connection closed:', error);
    notifyEventHandlers('disconnected', null);
  });

  try {
    await connection.start();
    console.log('SignalR connected successfully');
    notifyEventHandlers('connected', null);
  } catch (err) {
    console.error('SignalR connection failed:', err);
    notifyEventHandlers('error', err);
    throw err;
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

// Update SocketEvent type
export type SocketEvent = 
  'connected' | 'disconnected' | 'error' | 
  'fieldEngineerUpdate' | 'newFieldEngineer' |
  'serviceRequestUpdate' | 'newServiceRequest' |
  'newRoute' | 'routeUpdate' |
  'newBranch' | 'CoordinateUpdate'; // Add CoordinateUpdate