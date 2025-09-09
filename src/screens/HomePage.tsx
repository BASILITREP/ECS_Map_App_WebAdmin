import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import bg from '../assets/windowsyarn.jpg';
import Header from '../header/Header'; // Adjust the import path as necessary
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';
import {
  fetchBranches,
  fetchFieldEngineers,
  fetchServiceRequests,
  createServiceRequest as apiCreateServiceRequest,
  acceptServiceRequest as apiAcceptServiceRequest
} from '../services/api';
import { initializeSocket, subscribe, unsubscribe } from '../services/socketService';

function HomePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<{ [key: number]: mapboxgl.Marker }>({});
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
  const srLayers = useRef<Set<string>>(new Set());
  const routeLayerId = 'active-route-layer';

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
      const data = await fetchServiceRequests();
      setServiceRequests(data);
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
      id: Date.now(), // Generate unique ID using timestamp
      feId: fe.id,
      feName: fe.name,
      branchId: branchIndex >= 0 ? branchIndex : 0,
      branchName: branch.name,
      startTime,
      estimatedArrival: "Calculating...",
      distance: "Calculating...",
      duration: "Calculating...",
      price: "₱0",
      status: "in-progress"
    };
    
    // Add the new route to existing routes
    setOngoingRoutes(prev => [...prev, newRoute]);
    
    // Add this line to actually calculate the route info
    updateRouteInfo(newRoute);
    
    await fetchServiceRequestsData();
    await fetchFieldEngineersData();
  } catch (err) {
    console.error('Error accepting service request:', err);
  }
};

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
    const distance = (routeData.distance / 1000).toFixed(1) + ' km';
    const durationMinutes = Math.round(routeData.duration / 60);
    const duration = durationMinutes + ' min';

    // fare calculation
    const distanceValue = parseFloat((routeData.distance / 1000).toFixed(1));
    const baseFare = 45; // Base fare in PHP
    const ratePerKm = 15; // Rate per km in PHP
    const price = `₱${Math.round(baseFare + (distanceValue * ratePerKm))}`;

    // Calculate ETA
    const startTime = new Date();
    const etaTime = new Date(startTime.getTime() + (durationMinutes * 60 * 1000));
    const estimatedArrival = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    console.log(`Route calculated: ${distance}, ${duration}, ${price}, ETA: ${estimatedArrival}`);

    // Update the route with calculated information
    setOngoingRoutes(prevRoutes => {
      const updatedRoutes = prevRoutes.map(r =>
        r.id === route.id
          ? { ...r, distance, duration, price, estimatedArrival }
          : r
      );
      console.log('Routes updated:', updatedRoutes);
      return updatedRoutes;
    });
    
    // If this route is currently selected, update the display on the map
    if (selectedRoute && selectedRoute.id === route.id) {
      handleShowRoute({ ...route, distance, duration, price, estimatedArrival });
    }
  } catch (err) {
    console.error('Error updating route info:', err);
  }
};

 useEffect(()=>{
  const handleNewFieldEngineer = (fe: any) =>{
    console.log('New field engineer received:', fe);
    const transformedFE: FieldEngineer = {
      id: fe.id,
      name: fe.name,
      lng: fe.currentLongitude || 0,
      lat: fe.currentLatitude || 0,
      status: fe.status || 'Active',
      lastUpdated: fe.updatedAt || new Date().toISOString(),
    };
    setFieldEngineers(prev => [...prev, transformedFE]);
  };

  subscribe('newFieldEngineer', handleNewFieldEngineer);
  return () =>{
    unsubscribe('newFieldEngineer', handleNewFieldEngineer);
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
  setSelectedRoute(route);
  setShowRouteOnMap(true); // Set this to true when showing a route

  const fe = fieldEngineers.find(fe => fe.id === route.feId);
  const branch = branches[route.branchId];

  if (fe && branch && map.current) {
    // Clear any existing route first
    clearRouteFromMap();

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
          geometry: routeGeo
        }
      });

      map.current.addLayer({
        id: routeLayerId,
        type: 'line',
        source: routeLayerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': route.status === 'delayed' ? '#FF6B6B' : (route.status === 'arriving' ? '#4CAF50' : '#3887BE'),
          'line-width': 4,
          'line-opacity': 0.8,
          'line-dasharray': route.status === 'delayed' ? [2, 1] : [1]
        }
      });

      // Fit map to the route
      const coordinates = routeGeo.coordinates;
      const bounds = coordinates.reduce((b: mapboxgl.LngLatBounds, coord: [number, number]) => {
        return b.extend(coord);
      }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

      map.current.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14
      });

      console.log('Route displayed on map');
    } catch (err) {
      console.error('Error fetching route from Mapbox Directions API:', err);
    }
  } else {
    console.error('Missing data for route display:', { 
      fe: fe ? `Found FE ${fe.name}` : 'FE not found', 
      branch: branch ? `Found branch ${branch.name}` : 'Branch not found', 
      map: map.current ? 'Map exists' : 'Map not initialized' 
    });
  }
};

  // Function to clear route from map
  const clearRouteFromMap = () => {
    if (map.current && map.current.getLayer(routeLayerId)) {
      map.current.removeLayer(routeLayerId);
      map.current.removeSource(routeLayerId);
      setShowRouteOnMap(false);
      setSelectedRoute(null);
    }
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Floating header container */}
        <Header activePage="dashboard" />
        
        {/* Connection status indicator */}
        <div className={`fixed top-4 right-4 z-50 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
          socketConnected ? 'bg-green-500/80' : 'bg-red-500/80'
        }`}>
          <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-200 animate-pulse' : 'bg-red-200'}`}></div>
          <span className="text-white">{socketConnected ? 'Live' : 'Offline'}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* Filter panel */}
          <div className="p-4 pt-0">
            <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-3">
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
          </div>

          <div className="p-4 pt-1 relative">
            
            <div
              ref={mapContainer}
              className="w-full h-[28rem] lg:h-[34rem] rounded-2xl overflow-hidden bg-base-200"
            />

            {/* Map Legend goes here */}

            {/* Map Legend */}
            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg text-sm ml-3.5">
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
            </div>

            {loading && (
              <div className="flex justify-center mt-4">
                <span className="loading loading-spinner loading-lg text-primary"></span>
              </div>
            )}
            {error && (
              <div className="alert alert-error mt-4">
                <span>{error}</span>
              </div>
            )}
          </div>



          

          {/* Ongoing Routes panel */}
          <div className="p-4 pt-0">
            <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-3">
              <div className="flex justify-between items-center mb-2">
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
                        <div className="flex items-center gap-1 text-xs text-white/90">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                          </svg>
                          View Details
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Route details panel - only shows when a route is selected */}
              {selectedRoute && (
                <div className="mt-3 bg-white/10 rounded-lg p-3 text-white">
                  <div className="flex items-center justify-between mb-2">
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
                  <div className="grid grid-cols-3 gap-4 text-center h-18 ">
                    <ul className="timeline timeline-horizontal text-white">

                      <li>
                        <div className="timeline-start timeline-box bg-white/20 border-none flex">
                          <div className="font-bold">Route Started</div>
                          <div className="text-xs">{selectedRoute.startTime}</div>
                        </div>
                        <div className="timeline-middle">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-5 w-5 text-green-400"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <hr className="bg-white/20" />
                      </li>
                      <li>
                        <hr className="bg-white/20" />
                        <div className="timeline-start timeline-box bg-white/20 border-none flex">
                          <div className="font-bold">Departed Base</div>
                          <div className="text-xs">{new Date(new Date(selectedRoute.startTime).getTime() + 5 * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                        <div className="timeline-middle">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-5 w-5 text-green-400"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <hr className="bg-white/20" />
                      </li>
                      <li>
                        <hr className="bg-white/20" />
                        <div className="timeline-start timeline-box bg-white/20 border-none flex">
                          <div className="font-bold">In Transit</div>
                          <div className="text-xs text-yellow-300">Current Location</div>
                        </div>
                        <div className="timeline-middle">
                          {selectedRoute.status === 'delayed' ? (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-5 w-5 text-red-400"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-5 w-5 text-blue-400 animate-pulse"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                        <hr className="bg-white/20" />
                      </li>
                      {/* <li>
                        <hr className="bg-white/20" />
                        <div className="timeline-start timeline-box bg-white/20 border-none flex">
                          <div className="font-bold">Approaching Destination</div>
                          <div className="text-xs text-gray-300">Estimated</div>
                        </div>
                        <div className="timeline-middle">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-5 w-5 text-gray-400"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <hr className="bg-white/20" />
                      </li> */}
                      <li>
                        <hr className="bg-white/20" />
                        <div className="timeline-start timeline-box bg-white/20 border-none flex">
                          <div className="font-bold">Arrival at {selectedRoute.branchName}</div>
                          <div className="text-xs">{selectedRoute.estimatedArrival}</div>
                        </div>
                        <div className="timeline-middle">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-5 w-5 text-gray-400"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </li>
                    </ul>
                    </div>


                    

                    <div className=" flex items-center justify-between">
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
                  <div className="mt-2 space-y-2">
                    {serviceRequests.filter(s => s.status === 'pending').length === 0 ? (
                      <div className="bg-black/10 rounded-lg p-3 text-white/80">No pending service requests</div>
                    ) : (
                      serviceRequests.filter(s => s.status === 'pending').map(sr => {
                        // find nearest FE within radius
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
                        const best = inRange[0];
                        
                        // Check if this service request is already assigned to a route
                        const isAssigned = ongoingRoutes.some(route => 
                          route.branchId === branches.findIndex(b => b._id === sr.branchId)
                        );
                        
                        return (
                          <div key={sr.id} className="bg-black/20 p-3 rounded-lg flex items-center justify-between">
                            <div>
                              <div className="font-medium">{sr.branchName}</div>
                              <div className="text-xs text-white/70">Radius: {sr.currentRadiusKm}km • Created {new Date(sr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              {isAssigned ? (
                                <div className="text-xs text-green-300 mt-1">✓ Assigned to an engineer</div>
                              ) : best ? (
                                <div className="text-xs text-green-300 mt-1">Nearest FE in range: {best.fe.name} ({best.km.toFixed(2)} km)</div>
                              ) : (
                                <div className="text-xs text-yellow-300 mt-1">No FE within radius yet</div>
                              )}
                            </div>
                            <button
                              className="btn btn-xs btn-accent"
                              disabled={!best || isAssigned}
                              onClick={() => best && !isAssigned && handleAcceptServiceRequest(sr, best.fe)}
                            >
                              {isAssigned ? 'Assigned' : (best ? 'Accept' : 'Waiting')}
                            </button>
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



      {/* Right sidebar, Branches list */}
      <aside className="bg-[#6b6f1d] hidden md:flex w-80 shrink-0 flex-col backdrop-blur p-4 gap-4 overflow-y-auto">
        <div className="hidden sm:block ">
          <div className="form-control">
            <div className="input-group">
              <input
                type="text"
                placeholder="Search..."
                className="input input-sm input-bordered w-24 md:w-auto bg-white/30 text-black placeholder-white/70"
              />
              <button className="btn btn-sm btn-square bg-white/20 border-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </div>
          </div>
        </div>

        <h1 className="text-2xl text-white">Branches</h1>

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

        {/* Dynamically display branches from database */}
        {branches.map(branch => (
          <div key={branch._id} className="rounded-2xl bg-[#c8c87e] p-3 shadow-xl text-black mb-4">
            {/* Title + subtitle */}
            <div className="px-1">
              <h2 className="text-base font-semibold">{branch.name}</h2>
              <p className="text-xs opacity-70">
                {branch.location}
              </p>
            </div>

            {/* Image with overlay badge */}
            <div className="relative mt-3 overflow-hidden rounded-xl">
              <img
                src={bg}
                alt={branch.name}
                className="h-32 w-full object-cover"
                onError={(e) => {
                  // Fallback image if the URL fails to load
                  e.currentTarget.src = "https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop";
                }}
              />
              <span className={`badge ${Math.random() > 1000 ? 'badge-success' : 'badge-error'} text-white font-medium absolute top-2 left-2 shadow`}>
                {Math.random() > 1000 ? 'Assigned' : 'Not assigned'}
              </span>
            </div>

            {/* Add Service Request Button directly to each branch card */}
            <button 
              className="btn btn-xs btn-warning w-full mt-3" 
              onClick={() => handleCreateServiceRequest(branch)}
            >
              Request Service
            </button>
          </div>
        ))}

        {/* Empty state */}
        {!loading && branches.length === 0 && !error && (
          <div className="text-center py-8 text-white/80">
            <p>No branches found</p>
            <button
              className="btn btn-sm btn-outline mt-2 text-white"
              onClick={() => fetchBranches()}
            >
              Refresh
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export default HomePage;