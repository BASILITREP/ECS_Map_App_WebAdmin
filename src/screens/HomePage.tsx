import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import bg from '../assets/BDOBG.jpg';
import Header from '../header/Header'; // Adjust the import path as necessary
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';
import { startFieldEngineerNavigation, stopFieldEngineerNavigation } from '../services/api';


import {
  fetchBranches,
  fetchFieldEngineers,
  fetchServiceRequests,
  createServiceRequest as apiCreateServiceRequest,
  acceptServiceRequest as apiAcceptServiceRequest
} from '../services/api';
import { initializeSocket, subscribe, unsubscribe } from '../services/socketService';

// Define the RouteStep interface
interface RouteStep {
  maneuver: string;
  roadName: string;
  distance: string;
}

function HomePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ [key: string | number]: mapboxgl.Marker }>({});
  const branchMarkers = useRef<{ [key: number]: mapboxgl.Marker }>({});
  const [fieldEngineers, setFieldEngineers] = useState<FieldEngineer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showFieldEngineers, setShowFieldEngineers] = useState<boolean>(true);
  const [showBranches, setShowBranches] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [ongoingRoutes, setOngoingRoutes] = useState<OngoingRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<OngoingRoute | null>(null);
  const [showRouteOnMap, setShowRouteOnMap] = useState(false);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [showMapFilter, setShowMapFilter] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false); // Add sidebar state
  const [searchQuery, setSearchQuery] = useState<string>(''); // Add search state
  const srLayers = useRef<Set<string>>(new Set());
  const routeLayerId = 'active-route-layer';
  
  // Filter branches based on search query
  const filteredBranches = branches.filter(branch => 
    searchQuery === '' || 
    branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    branch.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  
  // circle radius in SR
  const makeCircle = (lng: number, lat: number, radiusKm: number, points = 64) => {
    const coords: [number, number][] = [];
    const radiusRad = radiusKm / 6371;
    const centerLat = lat * Math.PI / 180;
    const centerLng = lng * Math.PI / 180;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const latRad = Math.asin(Math.sin(centerLat) * Math.cos(radiusRad) + Math.cos(centerLat) * Math.sin(radiusRad) * Math.cos(angle));
      const lngRad = centerLng + Math.atan2(
        Math.sin(angle) * Math.sin(radiusRad) * Math.cos(centerLat),
        Math.cos(radiusRad) - Math.sin(centerLat) * Math.sin(latRad)
      );
      coords.push([lngRad * 180 / Math.PI, latRad * 180 / Math.PI]);
    }
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'Polygon' as const,
        coordinates: [coords],
      },
    };
  };

  // Fetch field engineers from API
  const fetchFieldEngineersData = async () => {
    try {
      const data = await fetchFieldEngineers();
      setFieldEngineers(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching field engineers:', err);
      setError('Failed to fetch field engineers data.');
      setLoading(false);
    }
  };

  //fetch branches
  const fetchBranchesData = async () => {
    try {
      const data = await fetchBranches();
      setBranches(data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching branches:', err);
      setError('Failed to fetch branches data.');
      setLoading(false);
    }
  };

  // Service Requests API
  const fetchServiceRequestsData = async () => {
    try {
      const requests: ServiceRequest[] = await fetchServiceRequests();
      // Initialize radius for pending requests
      const now = Date.now();
      const updatedRequests = requests.map(sr => {
        if (sr.status === 'pending') {
          const minutesSinceCreation = (now - new Date(sr.createdAt).getTime()) / 60000;
          // Assuming base radius is 1km and it grows 1km per minute, max 10km.
          const radius = Math.min(10, 1 + Math.floor(minutesSinceCreation));
          return { ...sr, currentRadiusKm: radius };
        }
        return { ...sr, currentRadiusKm: 0 };
      });
      setServiceRequests(updatedRequests);
    } catch (err) {
      console.error('Error fetching service requests:', err);
    }
  };

  const handleCreateServiceRequest = async (branch: Branch) => {
  if (!branch._id) {
    console.error('Branch id missing');
    return;
  }
  try {
    await apiCreateServiceRequest({
      branchId: branch._id,
      branch: branch  // This is only used for TypeScript typing, not sent to the API
    });
    await fetchServiceRequestsData();
  } catch (err) {
    console.error('Error creating service request:', err);
  }
};

  const handleAcceptServiceRequest = async (sr: ServiceRequest, fe: FieldEngineer) => {
  try {
    await apiAcceptServiceRequest(sr.id, fe.id);
    
    // Create a new route when a service request is accepted
    const branch = branches.find(b => b._id === sr.branchId);
    if (!branch) {
      console.error("Branch not found for service request:", sr);
      return;
    }
    
    // Get branch index
    const branchIndex = branches.findIndex(b => b._id === sr.branchId);
    
    // Calculate start time as now
    const startTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create new route object
    const newRoute: OngoingRoute = {
      id: Date.now(), 
      feId: fe.id,
      feName: fe.name,
      branchId: branchIndex >= 0 ? branchIndex : 0,
      branchName: branch.name,
      startTime,
      estimatedArrival: "Calculating...",
      distance: "Calculating...",
      duration: "Calculating...",
      price: "₱0",
      status: "in-progress",
      routeSteps: []
    };
    
    // Add the new route to existing routes
    setOngoingRoutes(prev => [...prev, newRoute]);
    
    // Get the route from Mapbox and start navigation
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fe.lng},${fe.lat};${branch.lng},${branch.lat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const routeData = data.routes[0];
      const coordinates = routeData.geometry.coordinates;
      
      // Start the field engineer navigation along the polyline
      console.log(`Starting navigation for ${fe.name} with ${coordinates.length} coordinates`);
      await startFieldEngineerNavigation(fe.id, fe.name, coordinates);
      
      // Update route info with calculated data
      updateRouteInfo(newRoute);
    } else {
      console.error('Failed to get route from Mapbox:', data);
    }
    
    await fetchServiceRequestsData();
    await fetchFieldEngineersData();
  } catch (err) {
    console.error('Error accepting service request:', err);
  }
};

// Add a function to stop navigation if needed
const handleStopNavigation = async (feId: number) => {
  try {
    await stopFieldEngineerNavigation(feId);
    console.log(`Navigation stopped for FE ${feId}`);
  } catch (err) {
    console.error('Error stopping navigation:', err);
  }
};

const formatDistance = (distanceInMeters: number): string =>{
  if (distanceInMeters < 1000) {
    return `${Math.round(distanceInMeters)} m`;
  } else{
    return `${(distanceInMeters / 1000).toFixed(1)} km`;
  }
}

  // Add this new function to calculate real route information
 const updateRouteInfo = async (route: OngoingRoute) => {
  try {
    // Get the most current data
    const currentFE = fieldEngineers.find(fe => fe.id === route.feId);
    const currentBranch = branches[route.branchId];

    if (!currentFE || !currentBranch) {
      console.error('Could not find field engineer or branch for route:', route);
      console.log('Field engineer ID:', route.feId, 'Available FEs:', fieldEngineers.map(fe => fe.id));
      console.log('Branch index:', route.branchId, 'Available branches:', branches.length);
      return;
    }

    console.log(`Updating route info for ${currentFE.name} to ${currentBranch.name}`);
    console.log(`FE location: ${currentFE.lat}, ${currentFE.lng}`);
    console.log(`Branch location: ${currentBranch.lat}, ${currentBranch.lng}`);

    // Call Mapbox Directions API
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentFE.lng},${currentFE.lat};${currentBranch.lng},${currentBranch.lat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      console.error('Error getting directions:', data.message || 'Unknown error', data);
      return;
    }

    // route info
    const routeData = data.routes[0];
    const distanceValue = routeData.distance;
    const distance = formatDistance(distanceValue);
    const durationMinutes = Math.round(routeData.duration / 60);
    const duration = durationMinutes + ' min';

    //Extract route steps(max 5)
    const routeSteps: RouteStep[] = [];
    if (routeData.legs && routeData.legs.length > 0) {
      const steps = routeData.legs[0].steps;

      //get sig steps
      const significantSteps = steps.length <= 5
      ? steps
      : [...steps.slice(0, 2), ...steps.slice(steps.length - 3)];

      // Define step interface
      interface MapboxStep {
        maneuver: {
          type: string;
          modifier?: string;
        };
        name?: string;
        distance: number;
      }

      significantSteps.forEach((step: MapboxStep) => {
        routeSteps.push({
          maneuver: step.maneuver.type === 'arrive'
        ? 'Arrive at destination'
        : getManeuverDescription(step.maneuver.type, step.maneuver.modifier),
          roadName: step.name || 'Unnamed road',
          distance: formatDistance(step.distance),
        });
      });
    }

    // fare calculation
    const distanceInKm = parseFloat((routeData.distance / 1000).toFixed(1));
    const baseFare = 45; // Base fare in PHP
    const ratePerKm = 15; // Rate per km in PHP
    const price = `₱${Math.round(baseFare + (distanceInKm * ratePerKm))}`;

    // Calculate ETA
    const startTime = new Date();
    const etaTime = new Date(startTime.getTime() + (durationMinutes * 60 * 1000));
    const estimatedArrival = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    console.log(`Route calculated: ${distance}, ${duration}, ${price}, ETA: ${estimatedArrival}`);

    // Update the route with calculated information
    setOngoingRoutes(prevRoutes => {
      const updatedRoutes = prevRoutes.map(r =>
        r.id === route.id
          ? { ...r, distance, duration, price, estimatedArrival, routeSteps }
          : r
      );
      console.log('Routes updated:', updatedRoutes);
      return updatedRoutes;
    });
    
    // If this route is currently selected, update the display on the map
    if (selectedRoute && selectedRoute.id === route.id) {
      handleShowRoute({ ...route, distance, duration, price, estimatedArrival, routeSteps });// Update the map display with new info
    }
  } catch (err) {
    console.error('Error updating route info:', err);
  }
};

const getManeuverDescription = (type: string, modifier?: string): string => {
  switch (type) {
    case 'turn':
      return `Turn ${modifier || ''}`;
    case 'depart':
      return 'Depart from origin';
    case 'arrive':
      return 'Arrive at destination';
    case 'roundabout':
    case 'rotary':
      return 'Enter roundabout';
    case 'fork':
      return `Take ${modifier || ''} fork`;
    case 'merge':
      return 'Merge';
    case 'ramp':
      return `Take ${modifier || ''} ramp`;
    case 'on ramp':
      return 'Take on ramp';
    case 'off ramp':
      return 'Take off ramp';
    case 'end of road':
      return 'End of road';
    case 'new name':
      return 'Continue onto';
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
};

// Add this useEffect to handle branch updates
useEffect(() => {
  const handleBranchUpdate = (branch: any) => {
    console.log('Branch update received:', branch);
    // Update existing branch or add new one
    setBranches(prev => {
      const index = prev.findIndex(b => b._id === branch.id.toString());
      if (index >= 0) {
        // Update existing branch
        const newBranches = [...prev];
        newBranches[index] = {
          ...newBranches[index],
          name: branch.name,
          location: branch.address,
          lat: branch.latitude,
          lng: branch.longitude,
          image: branch.image || newBranches[index].image
        };
        return newBranches;
      }
      return prev;
    });
  };
  
  subscribe('ReceiveBranchUpdate', handleBranchUpdate);
  return () => {
    unsubscribe('ReceiveBranchUpdate', handleBranchUpdate);
  };
}, []);

   useEffect(() => {
    if (map.current) {
      // Small delay to allow CSS transition to complete
      setTimeout(() => {
        map.current?.resize();
      }, 300);
    }
  }, [sidebarCollapsed]);

  // Replace the existing handleBossCoordinates useEffect with this:

useEffect(() => {
  const handleBossCoordinates = (data: any) => {
    console.log('Boss coordinates received:', data);
    
    if (!map.current || !data.latitude || !data.longitude) return;

    const bossMarkerId = 'boss-marker';
    const color = '#ff4444'; // Red color for boss

    if (markers.current[bossMarkerId]) {
      // Update existing marker position and make visible
      markers.current[bossMarkerId].setLngLat([data.longitude, data.latitude]);
      markers.current[bossMarkerId].getElement().style.display = 'block';
      
      // Update marker color (in case it changes)
      const markerElement = markers.current[bossMarkerId].getElement();
      markerElement.style.backgroundColor = color;
      
      // Update popup content
      const timeString = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="padding: 10px; text-align: center;">
            <strong style="color: #ff4444;">👑 Boss Location</strong><br/>
            <span style="color: #666; font-size: 12px;">${data.description || 'Boss is here'}</span><br/>
            <span style="color: #888; font-size: 11px;">
              Updated: ${timeString}
            </span><br/>
            <span style="color: #999; font-size: 10px;">
              ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}
            </span>
          </div>
        `);
      
      markers.current[bossMarkerId].setPopup(popup);
    } else {
      // Create a new boss marker
      const el = document.createElement('div');
      el.className = 'boss-marker';
      el.style.width = '25px';
      el.style.height = '25px';
      el.style.backgroundColor = color;
      el.style.border = '3px solid white';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 0 15px rgba(255, 68, 68, 0.8)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '12px';
      el.innerHTML = '👑'; // Crown for boss

      // Add animation ping effect (same as field engineers)
      const ping = document.createElement('div');
      ping.style.width = '100%';
      ping.style.height = '100%';
      ping.style.borderRadius = '50%';
      ping.style.backgroundColor = `${color}80`; // Add transparency
      ping.style.animation = 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite';
      ping.style.position = 'absolute';
      ping.style.top = '0';
      ping.style.left = '0';
      ping.style.zIndex = '-1';
      el.style.position = 'relative';
      el.appendChild(ping);

      // Format the timestamp
      const timeString = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Add a popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="padding: 10px; text-align: center;">
            <strong style="color: #ff4444;">👑 Boss Location</strong><br/>
            <span style="color: #666; font-size: 12px;">${data.description || 'Boss is here'}</span><br/>
            <span style="color: #888; font-size: 11px;">
              Updated: ${timeString}
            </span><br/>
            <span style="color: #999; font-size: 10px;">
              ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}
            </span>
          </div>
        `);

      // Create and store the marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([data.longitude, data.latitude])
        .setPopup(popup)
        .addTo(map.current);

      markers.current[bossMarkerId] = marker;
    }

    // Fly to boss location with animation (keep this part)
    map.current.flyTo({
      center: [data.longitude, data.latitude],
      zoom: 15,
      duration: 2000
    });
  };

  // Subscribe to boss coordinate updates
  subscribe('CoordinateUpdate', handleBossCoordinates);
  
  return () => {
    unsubscribe('CoordinateUpdate', handleBossCoordinates);
  };
}, []);



 useEffect(() => {
  const handleNewFieldEngineer = (fe: any) => {
    console.log('New field engineer received:', fe);
    const transformedFE: FieldEngineer = {
      id: fe.id,
      name: fe.name,
      lng: fe.currentLongitude || 0,
      lat: fe.currentLatitude || 0,
      status: fe.status || 'Active',
      lastUpdated: fe.updatedAt || new Date().toISOString(),
      fcmToken: fe.fcmToken || '',
    };
    console.log('Adding new field engineer to state:', transformedFE);
    
    // Update existing FE if it exists, otherwise add new one
    setFieldEngineers(prev => {
      const existingIndex = prev.findIndex(engineer => engineer.id === transformedFE.id);
      if (existingIndex >= 0) {
        // Update existing field engineer
        const updated = [...prev];
        updated[existingIndex] = transformedFE;
        return updated;
      } else {
        // Add new field engineer
        return [...prev, transformedFE];
      }
    });
  };

  subscribe('ReceiveNewFieldEngineer', handleNewFieldEngineer); // Changed from 'newFieldEngineer'
  return () => {
    unsubscribe('ReceiveNewFieldEngineer', handleNewFieldEngineer);
  }
}, []);

 useEffect(() =>{
  const handleNewBranch = (branch: any) =>{
    console.log('New branch received:', branch);
    const transformedBranch: Branch = {
      _id: branch.id.toString(),
      name: branch.name,
      location: branch.address,
      image: branch.image || 'https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop',
      lat: branch.latitude,
      lng: branch.longitude,
    };
    console.log('Adding new branch to state:', transformedBranch);
    setBranches(prev => [...prev, transformedBranch]);
  };
  subscribe('newBranch', handleNewBranch);
  return () =>{
    unsubscribe('newBranch', handleNewBranch);
  }
 }, []);

  // useEffect(() => {
  //   if (!map.current || branches.length === 0) return;

  //   const m = map.current;
  //   const branchRadiusIntervals: { [key: number]: ReturnType<typeof setTimeout> } = {};
  //   const expansionSteps = [
  //     { radius: 1, duration: 0 }, // Start at 1km
  //     { radius: 5, duration: 60000 }, // Reach 5km after 60 seconds
  //     { radius: 10, duration: 120000 } // Reach 10km after 120 seconds
  //   ];

  //   // Function to update the radius dynamically
  //   const updateBranchRadius = (branch: Branch, index: number, radius: number) => {
  //     const sourceId = `branch-radius-${index}`;
  //     const fillId = `branch-radius-fill-${index}`;
  //     const outlineId = `branch-radius-outline-${index}`;
  //     const circle = makeCircle(branch.lng, branch.lat, radius);

  //     if (m.getSource(sourceId)) {
  //       // Update existing circle data
  //       (m.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(circle as any);
  //     } else {
  //       // Add new circle source and layers
  //       m.addSource(sourceId, { type: 'geojson', data: circle });
  //       m.addLayer({
  //         id: fillId,
  //         type: 'fill',
  //         source: sourceId,
  //         paint: {
  //           'fill-color': '#2563eb',
  //           'fill-opacity': 0.2,
  //         },
  //       });
  //       m.addLayer({
  //         id: outlineId,
  //         type: 'line',
  //         source: sourceId,
  //         paint: {
  //           'line-color': '#2563eb',
  //           'line-width': 2,
  //           'line-dasharray': [2, 2],
  //         },
  //       });
  //     }
  //   };

  //   // Initialize and expand radius for each branch
  //   branches.forEach((branch, index) => {
  //     let currentStep = 0;
  //     let startTime = Date.now();

  //     updateBranchRadius(branch, index, expansionSteps[currentStep].radius);

  //     branchRadiusIntervals[index] = setTimeout(() => {
  //       const elapsed = Date.now() - startTime;
  //       if (currentStep < expansionSteps.length - 1 && elapsed >= expansionSteps[currentStep + 1].duration) {
  //         currentStep++;
  //         updateBranchRadius(branch, index, expansionSteps[currentStep].radius);
  //         startTime = Date.now(); // Reset for next step
  //       } else if (currentStep >= expansionSteps.length - 1) {
  //         clearInterval(branchRadiusIntervals[index]); // Stop after final step
  //       }
  //     }, 1000); // Check every second for smooth updates
  //   });

  //   // Cleanup on unmount
  //   return () => {
  //     Object.values(branchRadiusIntervals).forEach(clearInterval);
  //     branches.forEach((_, index) => {
  //       const sourceId = `branch-radius-${index}`;
  //       const fillId = `branch-radius-fill-${index}`;
  //       const outlineId = `branch-radius-outline-${index}`;
  //       if (m.getLayer(fillId)) m.removeLayer(fillId);
  //       if (m.getLayer(outlineId)) m.removeLayer(outlineId);
  //       if (m.getSource(sourceId)) m.removeSource(sourceId);
  //     });
  //   };
  // }, [branches]);


  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setServiceRequests((prevRequests) =>
        prevRequests.map((sr) => {
          if (sr.status === 'pending') {
            const minutesSinceCreation = (now - new Date(sr.createdAt).getTime()) / 60000;
            // Assuming base radius is 1km and it grows 1km per minute, max 10km.
            const radius = Math.min(10, 1 + Math.floor(minutesSinceCreation));
            return { ...sr, currentRadiusKm: radius };
          }
          return sr;
        })
      );
    }, 60000); // Update radius every minute

  return () => clearInterval(interval); // Cleanup interval
}, []);


  useEffect(() => {

    mapboxgl.accessToken = 'pk.eyJ1IjoiYmFzaWwxLTIzIiwiYSI6ImNtZWFvNW43ZTA0ejQycHBtd3dkMHJ1bnkifQ.Y-IlM-vQAlaGr7pVQnug3Q';

    if (mapContainer.current && !map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [121.774017, 12.879721],
        zoom: 5.5
      });

      // Add navigation controls (optional)
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Wait for map to load
      map.current.on('load', () => {
        // Add keyframes for ping animation to document head
        if (!document.getElementById('ping-animation')) {
          const style = document.createElement('style');
          style.id = 'ping-animation';
          style.innerHTML = `
          @keyframes ping {
            75%, 100% {
              transform: scale(2);
              opacity: 0;
            }
          }
        `;
          document.head.appendChild(style);
        }


        fetchFieldEngineersData();
        fetchBranchesData();
        fetchServiceRequestsData();

      },);
    }


    return () => {
      if (map.current) {
        if (map.current.getLayer(routeLayerId)) {
          map.current.removeLayer(routeLayerId);
          map.current.removeSource(routeLayerId);
        }
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Sync SR radius circles on the map
  useEffect(() => {
    if (!map.current) return;
    const m = map.current;

    // Remove circles for SRs that are no longer pending or removed
    const activeIds = new Set(serviceRequests.filter(s => s.status === 'pending').map(s => s.id));
    Array.from(srLayers.current).forEach((prefix) => {
      if (!activeIds.has(prefix)) {
        const fillId = `sr-${prefix}-fill`;
        const outlineId = `sr-${prefix}-outline`;
        const sourceId = `sr-${prefix}-source`;
        if (m.getLayer(fillId)) m.removeLayer(fillId);
        if (m.getLayer(outlineId)) m.removeLayer(outlineId);
        if (m.getSource(sourceId)) m.removeSource(sourceId);
        srLayers.current.delete(prefix);
      }
    });

    // Add/update pending SR circles
    serviceRequests.filter(s => s.status === 'pending').forEach(sr => {
      const prefix = sr.id;
      const sourceId = `sr-${prefix}-source`;
      const fillId = `sr-${prefix}-fill`;
      const outlineId = `sr-${prefix}-outline`;
      const data = makeCircle(sr.lng, sr.lat, sr.currentRadiusKm);

      if (m.getSource(sourceId)) {
        // @ts-ignore
        (m.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(data as any);
      } else {
        m.addSource(sourceId, { type: 'geojson', data });
        m.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.2,
          }
        });
        m.addLayer({
          id: outlineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#f59e0b',
            'line-width': 2,
            'line-dasharray': [2, 2],
          }
        });
        srLayers.current.add(prefix);
      }
    });
  }, [serviceRequests]);

const handleShowRoute = async (route: OngoingRoute) => {
  // Clear the previous route from the map
  clearRouteFromMap();

  // Update the selected route state
  setSelectedRoute(route);
  setShowRouteOnMap(true);

  const fe = fieldEngineers.find(fe => fe.id === route.feId);
  const branch = branches[route.branchId];

  if (fe && branch && map.current) {
    console.log(`Showing route from FE (${fe.lat}, ${fe.lng}) to branch (${branch.lat}, ${branch.lng})`);

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fe.lng},${fe.lat};${branch.lng},${branch.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        console.error('No route found:', data);
        throw new Error('No route found');
      }
      const routeGeo = data.routes[0].geometry;

      // Add route to map
      map.current.addSource(routeLayerId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: routeGeo,
        },
      });

      map.current.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': route.status === 'delayed' ? '#FF6B6B' : route.status === 'arriving' ? '#4CAF50' : '#3887BE',
          'line-width': 4,
          'line-opacity': 0.8,
          'line-dasharray': route.status === 'delayed' ? [2, 1] : [1],
        },
      });

      // Fit map to the route
      const coordinates = routeGeo.coordinates;
      const bounds = coordinates.reduce(
        (b: mapboxgl.LngLatBounds, coord: [number, number]) => b.extend(coord),
        new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
      );

      map.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
      });

      console.log('Route displayed on map');
    } catch (err) {
      console.error('Error fetching route from Mapbox Directions API:', err);
    }
  } else {
    console.error('Missing data for route display:', {
      fe: fe ? `Found FE ${fe.name}` : 'FE not found',
      branch: branch ? `Found branch ${branch.name}` : 'Branch not found',
      map: map.current ? 'Map exists' : 'Map not initialized',
    });
  }
};

  // Function to clear route from map
  const clearRouteFromMap = () => {
  if (map.current && map.current.getLayer(routeLayerId)) {
    map.current.removeLayer(routeLayerId);
    map.current.removeSource(routeLayerId);
  }
  setShowRouteOnMap(false);
  setSelectedRoute(null);
};



  useEffect(() => {
    if (!map.current || loading || branches.length === 0) return;

    // Hide all existing branch markers
    Object.values(branchMarkers.current).forEach(marker => {
      marker.getElement().style.display = 'none';
    });

    // Skip processing if branches are hidden
    if (!showBranches) return;

    // Update existing markers and add new ones
    branches.forEach((branch, index) => {
      if (branchMarkers.current[index]) {
        // Update existing marker position and make visible
        branchMarkers.current[index].setLngLat([branch.lng, branch.lat]);
        branchMarkers.current[index].getElement().style.display = 'block';
      } else {
        // Create a new marker
        const el = document.createElement('div');
        el.className = 'branch-marker';
        el.style.width = '30px';
        el.style.height = '30px';
        el.style.backgroundImage = 'url("https://img.icons8.com/color/48/bank-building.png")';
        el.style.backgroundSize = 'cover';
        el.style.cursor = 'pointer';

        // Add a popup
        const popup = new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
          <div style="padding: 8px;">
            <strong>${branch.name}</strong><br/>
            <span style="font-size: 12px;">${branch.location}</span><br/>
            <img src="${branch.image}" alt="${branch.name}" style="width: 100%; height: 80px; object-fit: cover; margin-top: 8px; border-radius: 4px;">
          </div>
        `);

        // Create and store the marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([branch.lng, branch.lat])
          .setPopup(popup)
          .addTo(map.current!);

        branchMarkers.current[index] = marker;
      }
    });
  }, [branches, loading, showBranches]);


  // Update the field engineers useEffect

  // Update markers when field engineers data changes or filters change
useEffect(() => {
  if (!map.current || loading || fieldEngineers.length === 0) return;

  // First, hide all existing markers
  Object.values(markers.current).forEach(marker => {
    marker.getElement().style.display = 'none';
  });

  // Skip processing if field engineers are hidden
  if (!showFieldEngineers) return;

  // Filter engineers based on status if filter is set
  const filteredEngineers = statusFilter
    ? fieldEngineers.filter(eng => eng.status === statusFilter)
    : fieldEngineers;

  // Update existing markers and add new ones
  filteredEngineers.forEach(engineer => {
    // Status color mapping
    const statusColors = {
      'Active': '#4CAF50', // Green
      'On Assignment': '#FFA500', // Orange
      'Inactive': '#9E9E9E', // Grey
    };

    const color = statusColors[engineer.status as keyof typeof statusColors] || '#ff4d4f';

    if (markers.current[engineer.id]) {
      // Update existing marker position and make visible
      markers.current[engineer.id].setLngLat([engineer.lng, engineer.lat]);
      markers.current[engineer.id].getElement().style.display = 'block';
      
      // Update marker color
      const markerElement = markers.current[engineer.id].getElement();
      markerElement.style.backgroundColor = color;
      
      // Update popup content
      const lastUpdated = new Date(engineer.lastUpdated);
      const timeString = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
        <div style="padding: 8px;">
          <strong>${engineer.name}</strong><br/>
          <span class="text-xs">Status: ${engineer.status}</span><br/>
          <span class="text-xs">Last Updated: ${timeString}</span>
        </div>
      `);
      
      markers.current[engineer.id].setPopup(popup);
    } else {
      // Create a new marker
      const el = document.createElement('div');
      el.className = 'field-engineer-marker';
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.backgroundColor = color;
      el.style.border = '2px solid white';
      el.style.borderRadius = '50%';
      el.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
      el.style.cursor = 'pointer';

      // Add animation ping effect
      const ping = document.createElement('div');
      ping.style.width = '100%';
      ping.style.height = '100%';
      ping.style.borderRadius = '50%';
      ping.style.backgroundColor = `${color}80`; // Add transparency
      ping.style.animation = 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite';
      el.appendChild(ping);

      // Format the last updated time
      const lastUpdated = new Date(engineer.lastUpdated);
      const timeString = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Add a popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
        <div style="padding: 8px;">
          <strong>${engineer.name}</strong><br/>
          <span class="text-xs">Status: ${engineer.status}</span><br/>
          <span class="text-xs">Last Updated: ${timeString}</span>
        </div>
      `);

      // Create and store the marker
      const marker = new mapboxgl.Marker(el)
        .setLngLat([engineer.lng, engineer.lat])
        .setPopup(popup)
        .addTo(map.current!);

      markers.current[engineer.id] = marker;
    }
  });
}, [fieldEngineers, loading, showFieldEngineers, statusFilter]);

  // Initialize socket connection
  useEffect(() => {
    const initSocket = async () => {
      await initializeSocket();
      
    };
    
    initSocket();
    
    // Subscribe to connection events
    const handleConnected = () => {
      setSocketConnected(true);
      console.log('Socket connected successfully');
    };
    
    const handleDisconnected = () => {
      setSocketConnected(false);
      console.log('Socket disconnected');
    };
    
    const handleError = (err: any) => {
      console.error('Socket error:', err);
      setSocketConnected(false);
    };
    
    subscribe('connected', handleConnected);
    subscribe('disconnected', handleDisconnected);
    subscribe('error', handleError);
    
    return () => {
      unsubscribe('connected', handleConnected);
      unsubscribe('disconnected', handleDisconnected);
      unsubscribe('error', handleError);
    };
  }, []);

  // Subscribe to field engineer updates
  useEffect(() => {
    const handleFieldEngineerUpdate = (fe: FieldEngineer) => {
      // Update a single field engineer in the state
      setFieldEngineers(prev => 
        prev.map(engineer => 
          engineer.id === fe.id ? { ...engineer, ...fe } : engineer
        )
      );
    };
    
    subscribe('fieldEngineerUpdate', handleFieldEngineerUpdate);
    
    return () => {
      unsubscribe('fieldEngineerUpdate', handleFieldEngineerUpdate);
    };
  }, []);

  // Subscribe to service request updates
  useEffect(() => {
    const handleServiceRequestUpdate = (sr: ServiceRequest) => {
      setServiceRequests(prev => 
        prev.map(request => 
          request.id === sr.id ? { ...request, ...sr } : request
        )
      );
    };
    
    const handleNewServiceRequest = (sr: ServiceRequest) => {
      setServiceRequests(prev => [...prev, sr]);
    };
    
    subscribe('serviceRequestUpdate', handleServiceRequestUpdate);
    subscribe('newServiceRequest', handleNewServiceRequest);
    
    return () => {
      unsubscribe('serviceRequestUpdate', handleServiceRequestUpdate);
      unsubscribe('newServiceRequest', handleNewServiceRequest);
    };
  }, []);

  // Subscribe to route updates
  useEffect(() => {
    const handleNewRoute = (route: OngoingRoute) => {
      setOngoingRoutes(prev => [...prev, route]);
    };
    
    const handleRouteUpdate = (route: OngoingRoute) => {
      setOngoingRoutes(prev => 
        prev.map(r => r.id === route.id ? { ...r, ...route } : r)
      );
    };
    
    subscribe('newRoute', handleNewRoute);
    subscribe('routeUpdate', handleRouteUpdate);
    
    return () => {
      unsubscribe('newRoute', handleNewRoute);
      unsubscribe('routeUpdate', handleRouteUpdate);
    };
  }, []);

  // Initial data fetch on component mount
  useEffect(() => {
    // Still keep initial fetch to populate data when the page loads
    fetchFieldEngineersData();
    fetchBranchesData();
    fetchServiceRequestsData();
    
    // Remove polling intervals since we're using sockets now
    // (The old polling code can be removed)
  }, []);
  

  // Add a small connection indicator in your UI
  return (
    <div className="h-screen flex overflow-hidden bg-[#c8c87e]">
      {/* Main content */}
      <main className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
        sidebarCollapsed ? 'lg:mr-12' : 'lg:mr-80'
      }`}>
        {/* Header */}
        <Header activePage="dashboard" />
        
        {/* Connection status indicator */}
        <div className={`fixed top-4 z-50 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all duration-300 ${
          sidebarCollapsed ? 'right-16' : 'right-4'
        } ${
          socketConnected ? 'bg-green-500/80' : 'bg-red-500/80'
        }`}>
          <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-200 animate-pulse' : 'bg-red-200'}`}></div>
          <span className="text-white">{socketConnected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Main content area with proper spacing */}
        <div className="flex-1 overflow-y-auto relative">
          
          {/* Map Container - Full width */}
          <div className="relative">
            {/* Map Filter Toggle - Positioned over map */}
            {showMapFilter && (
              <div className="absolute top-4 left-4 z-30 bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-3 max-w-sm">
                <h3 className="text-white font-medium mb-2">Map Filters</h3>

                <div className="flex flex-wrap gap-4">
                  {/* Item type filters */}
                  <div className="flex flex-col gap-2">
                    <div className="text-white/80 text-sm">Show on Map:</div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-success"
                          checked={showFieldEngineers}
                          onChange={(e) => setShowFieldEngineers(e.target.checked)}
                        />
                        <span className="text-white">Field Engineers</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-warning"
                          checked={showBranches}
                          onChange={(e) => setShowBranches(e.target.checked)}
                        />
                        <span className="text-white">Branches</span>
                      </label>
                    </div>
                  </div>

                  {/* Status filters */}
                  <div className="flex flex-col gap-2">
                    <div className="text-white/80 text-sm">Engineer Status:</div>
                    <div className="flex gap-2">
                      <button
                        className={`btn btn-xs ${statusFilter === null ? 'btn-primary' : 'btn-outline btn-primary'}`}
                        onClick={() => setStatusFilter(null)}
                      >
                        All
                      </button>
                      <button
                        className={`btn btn-xs ${statusFilter === 'Active' ? 'bg-green-600 border-green-600 text-white' : 'btn-outline border-green-600 text-green-600 hover:bg-green-600 hover:text-white'}`}
                        onClick={() => setStatusFilter('Active')}
                      >
                        Active
                      </button>
                      <button
                        className={`btn btn-xs ${statusFilter === 'On Assignment' ? 'bg-amber-500 border-amber-500 text-white' : 'btn-outline border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white'}`}
                        onClick={() => setStatusFilter('On Assignment')}
                      >
                        On Assignment
                      </button>
                      <button
                        className={`btn btn-xs ${statusFilter === 'Inactive' ? 'bg-gray-600 border-gray-600 text-white' : 'btn-outline border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white'}`}
                        onClick={() => setStatusFilter('Inactive')}
                      >
                        Inactive
                      </button>
                    </div>
                  </div>
                </div>

                {/* Filter stats */}
                <div className="mt-3 text-white/70 text-xs">
                  Showing: {showFieldEngineers ? (statusFilter ? fieldEngineers.filter(fe => fe.status === statusFilter).length : fieldEngineers.length) : 0} Engineers, {showBranches ? branches.length : 0} Branches
                </div>
              </div>
            )}

            {/* Map Legend - Positioned over map with dynamic positioning */}
            <div className={`absolute top-4 z-30 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg text-sm transition-all duration-300 ${
              sidebarCollapsed ? 'right-16' : 'right-4'
            }`}>
              <div className="font-medium mb-1">Legend</div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span>Active Engineer</span>
              </div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span>On Assignment</span>
              </div>
              <div className="flex items-center gap-1 mb-1">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span>Inactive Engineer</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3">
                  <img src="https://img.icons8.com/color/48/bank-building.png" className="w-4 h-4" alt="Branch" />
                </div>
                <span>Branch</span>
              </div>
              <button
                className="btn btn-sm btn-primary mt-2 w-full"
                onClick={() => setShowMapFilter(!showMapFilter)}
              >
                {showMapFilter ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>

            {/* Map */}
            <div
              ref={mapContainer}
              className="w-full h-[400px] lg:h-[500px] bg-base-200"
            />

            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20">
                <span className="loading loading-spinner loading-lg text-primary"></span>
              </div>
            )}
            {error && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20">
                <div className="alert alert-error">
                  <span>{error}</span>
                </div>
              </div>
            )}
          </div>

          {/* Content below map */}
          <div className="p-4 space-y-4">
            {/* Ongoing Routes panel */}
            <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-medium">Ongoing Field Engineer Routes</h3>
                {showRouteOnMap && (
                  <button
                    onClick={clearRouteFromMap}
                    className="btn btn-xs btn-ghost text-white/90"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear Route
                  </button>
                )}
              </div>

              {ongoingRoutes.length === 0 ? (
                <div className="bg-white/10 rounded-lg p-4 text-center text-white/70">
                  {loading ? (
                    <div className="flex flex-col items-center">
                      <span className="loading loading-spinner loading-md text-white mb-2"></span>
                      <span>Loading routes...</span>
                    </div>
                  ) : (
                    "No active routes at the moment"
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ongoingRoutes.map(route => (
                    <div
                      key={route.id}
                      className={`bg-white/10 rounded-lg p-3 cursor-pointer transition-all hover:bg-white/20 
                        ${selectedRoute?.id === route.id ? 'ring-2 ring-yellow-400 bg-white/20' : ''}`}
                      onClick={() => handleShowRoute(route)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-white">{route.feName}</div>
                          <div className="text-xs text-white/70 mt-0.5">to {route.branchName}</div>
                        </div>

                        <div className={`px-2 py-1 rounded-full text-xs font-medium
                          ${route.status === 'in-progress' ? 'bg-blue-500/80' :
                            route.status === 'delayed' ? 'bg-red-500/80' : 'bg-green-500/80'}`}>
                          {route.status === 'in-progress' ? 'In Progress' :
                            route.status === 'delayed' ? 'Delayed' : 'Arriving Soon'}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="text-center">
                          <div className="text-xs text-white/60">Distance</div>
                          <div className="text-sm font-medium text-white">{route.distance}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-white/60">ETA</div>
                          <div className="text-sm font-medium text-white">{route.estimatedArrival}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-white/60">Fare</div>
                          <div className="text-sm font-medium text-white">{route.price}</div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between">
                        <div className="text-xs text-white/70">Started: {route.startTime}</div>
                        <div className="flex items-center gap-2">
                          <button
                            className="btn btn-xs btn-error"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStopNavigation(route.feId);
                            }}
                          >
                            Stop
                          </button>
                          <div className="flex items-center gap-1 text-xs text-white/90">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                            </svg>
                            View Details
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Route details panel - only shows when a route is selected */}
              {selectedRoute && (
                <div className="mt-4 bg-white/10 rounded-lg p-4 text-white">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-yellow-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                      </svg>
                      <span className="font-medium">Route Details</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                      ${selectedRoute.status === 'in-progress' ? 'bg-blue-500/80' :
                        selectedRoute.status === 'delayed' ? 'bg-red-500/80' : 'bg-green-500/80'}`}>
                      {selectedRoute.status === 'in-progress' ? 'In Progress' :
                        selectedRoute.status === 'delayed' ? 'Delayed' : 'Arriving Soon'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="avatar">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                          {selectedRoute.feName.split(' ').map(n => n[0]).join('')}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">{selectedRoute.feName}</div>
                        <div className="text-xs text-white/70">Field Engineer</div>
                      </div>
                    </div>

                    <div className="text-2xl px-2">→</div>

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <img src="https://img.icons8.com/color/48/bank-building.png" className="w-6 h-6" alt="Branch" />
                      </div>
                      <div>
                        <div className="font-medium">{selectedRoute.branchName}</div>
                        <div className="text-xs text-white/70">Destination</div>
                      </div>
                    </div>
                  </div>
                  {/* Route timeline - horizontal version */}
<div className="mt-3 pb-4 overflow-x-auto">
  <div className="min-w-[700px]">
    <ul className="steps steps-horizontal w-full">
      <li className="step step-success">
        <div className="text-center">
          <div className="font-bold">Route Started</div>
          <div className="text-xs">{selectedRoute.startTime}</div>
        </div>
      </li>
      
      {/* Route steps from Mapbox directions */}
      {selectedRoute.routeSteps?.map((step, index) => (
        <li key={index} className="step step-primary">
          <div className="text-center max-w-[150px]">
            <div className="font-bold">{step.maneuver}</div>
            <div className="text-xs whitespace-normal">{step.roadName || 'Unnamed road'}</div>
            <div className="text-xs text-yellow-200">{step.distance}</div>
          </div>
        </li>
      ))}
      
      <li className="step">
        <div className="text-center">
          <div className="font-bold">Arrival</div>
          <div className="text-xs">{selectedRoute.estimatedArrival}</div>
        </div>
      </li>
    </ul>
  </div>
</div>

<div className="flex items-center justify-between mt-4">
  <div className="flex items-center gap-2">
    <div className="bg-white/10 rounded-md px-2 py-1 text-sm">
      <span className="text-white/70 mr-1">Fare:</span>
      <span className="font-medium">{selectedRoute.price}</span>
    </div>
    <div className="bg-white/10 rounded-md px-2 py-1 text-sm">
      <span className="text-white/70 mr-1">Mode:</span>
      <span className="font-medium">Car</span>
    </div>
  </div>

  <button className="btn btn-sm btn-primary">
    Contact Engineer
  </button>
</div>


                    

                   
                  </div>
    )}
                </div>
</div>


{/* Service requests card */}
                <div className="rounded-xl bg-gradient-to-br from-[#c8c87e]/80 to-[#6b6f1d]/60 p-6 shadow-lg backdrop-blur-md border border-white/10 text-white">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Service Requests</h2>
                    <span className="badge bg-yellow-300/90 text-black">{serviceRequests.filter(s => s.status === 'pending').length} Pending</span>
                  </div>

                  {/* Pending requests list */}
                  <div className="mt-2 space-y-3">
                    {serviceRequests.filter(s => s.status === 'pending').length === 0 ? (
                      <div className="bg-black/10 rounded-lg p-3 text-white/80">No pending service requests</div>
                    ) : (
                      serviceRequests.filter(s => s.status === 'pending').map(sr => {
                        // find all FEs within radius
                        const inRange = fieldEngineers
                          .filter(fe => fe.status !== 'Inactive')
                          .map(fe => {
                            // simple haversine
                            const toRad = (d: number) => d * Math.PI / 180;
                            const R = 6371;
                            const dLat = toRad(fe.lat - sr.lat);
                            const dLng = toRad(fe.lng - sr.lng);
                            const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sr.lat)) * Math.cos(toRad(fe.lat)) * Math.sin(dLng / 2) ** 2;
                            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                            const km = R * c;
                            return { fe, km };
                          })
                          .filter(x => x.km <= sr.currentRadiusKm)
                          .sort((a, b) => a.km - b.km);
                        
                        // Check if this service request is already assigned to a route
                        const isAssigned = ongoingRoutes.some(route => 
                          route.branchId === branches.findIndex(b => b._id === sr.branchId)
                        );
                        
                        return (
                          <div key={sr.id} className="bg-black/20 p-3 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="font-medium">{sr.branchName}</div>
                                <div className="text-xs text-white/70">Radius: {sr.currentRadiusKm}km • Created {new Date(sr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              </div>
                              {isAssigned && (
                                <div className="badge badge-success badge-sm text-black">✓ Assigned</div>
                              )}
                            </div>
                            
                            <div className="mt-2">
                              {isAssigned ? (
                                <div className="text-xs text-green-300 mt-1">This request has been assigned to an engineer.</div>
                              ) : inRange.length > 0 ? (
                                <div className="space-y-2">
                                  <div className="text-xs text-green-300">{inRange.length} engineer(s) in range:</div>
                                  {inRange.map(({ fe, km }) => (
                                    <div key={fe.id} className="flex items-center justify-between bg-black/20 p-2 rounded-md">
                                      <div>
                                        <div className="text-sm font-medium">{fe.name}</div>
                                        <div className="text-xs text-white/60">{km.toFixed(2)} km away • Status: {fe.status}</div>
                                      </div>
                                      <button
                                        className="btn btn-xs btn-accent"
                                        onClick={() => handleAcceptServiceRequest(sr, fe)}
                                      >
                                        Assign
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-xs text-yellow-300 mt-1">No FE within radius yet.</div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>


            <div className="overflow-x-auto">
              
            </div>
          </div>
      </main>



      {/* Navigation Rail Sidebar */}
      <aside className={`fixed right-0 top-0 h-full bg-[#6b6f1d] backdrop-blur transition-all duration-300 z-40 flex flex-col shadow-2xl ${
        sidebarCollapsed ? 'w-12' : 'w-80'
      }`}>
        
        {/* Sidebar Toggle Button */}
        <div className="p-2 border-b border-white/10">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              fill="none" 
              viewBox="0 0 24 24" 
              strokeWidth={1.5} 
              stroke="currentColor" 
              className={`w-5 h-5 text-white transition-transform duration-300 ${
                sidebarCollapsed ? 'rotate-180' : ''
              }`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
            </svg>
            {!sidebarCollapsed && (
              <span className="ml-2 text-white text-sm">Collapse</span>
            )}
          </button>
        </div>

        {/* Navigation Icons (always visible) */}
        <div className="p-2 border-b border-white/10">
          <div className="flex flex-col gap-2">
            {/* Branches Icon */}
            <div className={`flex items-center p-2 rounded-lg bg-white/10 ${
              !sidebarCollapsed ? 'justify-start' : 'justify-center'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15l-.75 18H5.25L4.5 3z" />
              </svg>
              {!sidebarCollapsed && (
                <span className="ml-2 text-white text-sm font-medium">Branches</span>
              )}
              {!sidebarCollapsed && (
                <span className="ml-auto bg-yellow-300/90 text-black text-xs px-2 py-1 rounded-full">
                  {branches.length}
                </span>
              )}
            </div>

            {/* Pending Requests Icon */}
            <div className={`flex items-center p-2 rounded-lg bg-orange-500/20 ${
              !sidebarCollapsed ? 'justify-start' : 'justify-center'
            }`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-300">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              {!sidebarCollapsed && (
                <span className="ml-2 text-orange-300 text-sm font-medium">Pending</span>
              )}
              {!sidebarCollapsed && (
                <span className="ml-auto bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                  {serviceRequests.filter(s => s.status === 'pending').length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        <div className={`flex-1 overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          
          {/* Search Bar */}
          <div className="p-3 border-b border-white/10">
            <div className="form-control">
              <div className="input-group">
                <input
                  type="text"
                  placeholder="Search branches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-sm input-bordered w-full bg-white/20 text-white placeholder-white/70 border-white/30 focus:border-white/50"
                />
                {/* <button className="btn btn-sm btn-square bg-white/20 border-white/30 hover:bg-white/30">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button> */}
              </div>
            </div>
            
            {/* Search Results Count */}
            {searchQuery && (
              <div className="mt-2 text-xs text-white/70">
                Found {filteredBranches.length} of {branches.length} branches
              </div>
            )}
          </div>

          {/* Branches List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            
            {/* Loading state */}
            {loading && branches.length === 0 && (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-md text-white"></span>
              </div>
            )}

            {/* Error state */}
            {error && branches.length === 0 && (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            )}

            {/* No search results */}
            {searchQuery && filteredBranches.length === 0 && branches.length > 0 && (
              <div className="text-center py-8 text-white/80">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto mb-2 text-white/50">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <p>No branches found</p>
                <p className="text-sm">Try a different search term</p>
              </div>
            )}

            {/* Branches */}
            {filteredBranches.map(branch => (
              <div key={branch._id} className="rounded-xl bg-[#c8c87e] p-3 shadow-lg text-black hover:shadow-xl transition-shadow">
                {/* Title + subtitle */}
                <div className="px-1">
                  <h2 className="text-sm font-semibold truncate" title={branch.name}>{branch.name}</h2>
                  <p className="text-xs opacity-70 truncate" title={branch.location}>
                    {branch.location}
                  </p>
                </div>

                {/* Image with overlay badge */}
                <div className="relative mt-2 overflow-hidden rounded-lg">
                  <img
                    src={bg}
                    alt={branch.name}
                    className="h-24 w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop";
                    }}
                  />
                  
                  {/* Status Badge */}
                  {(() => {
                    const hasActiveRoute = ongoingRoutes.some(route => route.branchId === branches.indexOf(branch));
                    const hasPendingRequest = serviceRequests.some(sr => 
                      sr.branchId === branch._id && sr.status === 'pending'
                    );
                    
                    if (hasActiveRoute) {
                      return (
                        <span className="badge badge-error text-white font-medium absolute top-1 left-1 shadow text-xs">
                          Assigned
                        </span>
                      );
                    } else if (hasPendingRequest) {
                      return (
                        <span className="badge badge-warning text-white font-medium absolute top-1 left-1 shadow text-xs">
                          Pending
                        </span>
                      );
                    } else {
                      return (
                        <span className="badge badge-success text-white font-medium absolute top-1 left-1 shadow text-xs">
                          Available
                        </span>
                      );
                    }
                  })()}
                </div>

                {/* Request Service Button */}
                <button 
                  className="btn btn-xs btn-warning w-full mt-2 text-xs" 
                  onClick={() => handleCreateServiceRequest(branch)}
                >
                  Request Service
                </button>
              </div>
            ))}

            {/* Empty state */}
            {!loading && branches.length === 0 && !error && (
              <div className="text-center py-8 text-white/80">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto mb-2 text-white/50">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15l-.75 18H5.25L4.5 3z" />
                </svg>
                <p>No branches found</p>
                <button
                  className="btn btn-sm btn-outline mt-2 text-white border-white/30 hover:bg-white/10"
                  onClick={() => fetchBranchesData()}
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Collapsed State Indicators - Fixed positioning */}
        {sidebarCollapsed && (
          <div className="absolute top-40 left-1/2 transform -translate-x-1/2 space-y-2 z-10">
            {/* Branch count indicator */}
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
              <span className="text-white text-xs font-bold">{branches.length}</span>
            </div>
            
            {/* Pending requests indicator */}
            {serviceRequests.filter(s => s.status === 'pending').length > 0 && (
              <div className="w-8 h-8 bg-orange-500/80 rounded-full flex items-center justify-center">
                <span className="text-white text-xs font-bold">
                  {serviceRequests.filter(s => s.status === 'pending').length}
                </span>
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Overlay for mobile when sidebar is open */}
      {!sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
    </div>
  );
}

export default HomePage;