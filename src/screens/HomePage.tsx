import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import Header from '../header/Header'; // Adjust the import path as necessary
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';
import {
  fetchBranches,
  fetchFieldEngineers,
  fetchServiceRequests,
  createServiceRequest as apiCreateServiceRequest,
  acceptServiceRequest as apiAcceptServiceRequest
} from '../services/api';

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
      console.warn('Branch id missing');
      return;
    }
    try {
      await apiCreateServiceRequest(branch._id);
      await fetchServiceRequestsData();
    } catch (err) {
      console.error('Error creating service request:', err);
    }
  };

  const handleAcceptServiceRequest = async (sr: ServiceRequest, fe: FieldEngineer) => {
    try {
      await apiAcceptServiceRequest(sr.id, fe.id);
      await fetchServiceRequestsData();
      await fetchFieldEngineersData();
    } catch (err) {
      console.error('Error accepting service request:', err);
    }
  };

  const generateSampleRoute = async () => {
    // Wait for field engineers and branches to be loaded
    if (fieldEngineers.length === 0 || branches.length === 0) {
      return;
    }

    // Create routes between actual FEs and branches
    const actualRoutes: OngoingRoute[] = [
      {
        id: 1,
        feId: fieldEngineers[0]?.id || 1, // Use first FE from database
        feName: fieldEngineers[0]?.name || "John Santos",
        branchId: 0, // First branch
        branchName: branches[0]?.name || "BDO Makati",
        startTime: "10:15 AM",
        estimatedArrival: "10:55 AM",
        distance: "Calculating...",
        duration: "Calculating...",
        price: "₱350",
        status: "in-progress"
      },
      {
        id: 2,
        feId: fieldEngineers[1]?.id || 3, // Use second FE from database
        feName: fieldEngineers[1]?.name || "Maria Cruz",
        branchId: 1, // Second branch
        branchName: branches[1]?.name || "BDO BGC",
        startTime: "09:30 AM",
        estimatedArrival: "10:15 AM",
        distance: "Calculating...",
        duration: "Calculating...",
        price: "₱420",
        status: "delayed"
      },
      {
        id: 3,
        feId: fieldEngineers[2]?.id || 7, // Use third FE from database
        feName: fieldEngineers[2]?.name || "Alex Garcia",
        branchId: 2, // Third branch
        branchName: branches[4]?.name || "BDO Alabang",
        startTime: "10:00 AM",
        estimatedArrival: "10:20 AM",
        distance: "Calculating...",
        duration: "Calculating...",
        price: "₱220",
        status: "arriving"
      },
    ];

    setOngoingRoutes(actualRoutes);

    // Calculate actual distances and durations for each route
    actualRoutes.forEach(route => {
      updateRouteInfo(route);
    });
  };

  // Add this new function to calculate real route information
  const updateRouteInfo = async (route: OngoingRoute) => {
    try {
      const fe = fieldEngineers.find(fe => fe.id === route.feId);
      const branch = branches[route.branchId];

      if (!fe || !branch) {
        console.error('Could not find field engineer or branch for route:', route);
        return;
      }

      // Call Mapbox Directions API
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fe.lng},${fe.lat};${branch.lng},${branch.lat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        console.error('Error getting directions:', data.message || 'Unknown error');
        return;
      }

      // route info
      const routeData = data.routes[0];
      const distance = (routeData.distance / 1000).toFixed(1) + ' km';
      const durationMinutes = Math.round(routeData.duration / 60);
      const duration = durationMinutes + ' min';

      // fare matrix (grab fare computation for now hahaha)
      const distanceValue = parseFloat(distance);
      const baseFare = 45; // Base fare in PHP
      const ratePerKm = 15; // Rate per km in PHP
      const price = `₱${Math.round(baseFare + (distanceValue * ratePerKm))}`;

      // Calculate ETA based on start time and duration
      const startTime = new Date();
      startTime.setHours(
        parseInt(route.startTime.split(':')[0]),
        parseInt(route.startTime.split(':')[1].split(' ')[0]),
        0
      );
      const etaTime = new Date(startTime.getTime() + (durationMinutes * 60 * 1000));
      const estimatedArrival = etaTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Update the route with calculated information
      setOngoingRoutes(prevRoutes =>
        prevRoutes.map(r =>
          r.id === route.id
            ? { ...r, distance, duration, price, estimatedArrival }
            : r
        )
      );

    } catch (err) {
      console.error('Error updating route info:', err);
    }
  };



  useEffect(() => {
    if (fieldEngineers.length > 0 && branches.length > 0) {
      generateSampleRoute();
    }
  }, [fieldEngineers, branches]);


  useEffect(() => {
    if (!map.current || branches.length === 0) return;

    const m = map.current;
    const branchRadiusIntervals: { [key: number]: ReturnType<typeof setTimeout> } = {};
    const expansionSteps = [
      { radius: 1, duration: 0 }, // Start at 1km
      { radius: 5, duration: 60000 }, // Reach 5km after 60 seconds
      { radius: 10, duration: 120000 } // Reach 10km after 120 seconds
    ];

    // Function to update the radius dynamically
    const updateBranchRadius = (branch: Branch, index: number, radius: number) => {
      const sourceId = `branch-radius-${index}`;
      const fillId = `branch-radius-fill-${index}`;
      const outlineId = `branch-radius-outline-${index}`;
      const circle = makeCircle(branch.lng, branch.lat, radius);

      if (m.getSource(sourceId)) {
        // Update existing circle data
        (m.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(circle as any);
      } else {
        // Add new circle source and layers
        m.addSource(sourceId, { type: 'geojson', data: circle });
        m.addLayer({
          id: fillId,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': '#2563eb',
            'fill-opacity': 0.2,
          },
        });
        m.addLayer({
          id: outlineId,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': '#2563eb',
            'line-width': 2,
            'line-dasharray': [2, 2],
          },
        });
      }
    };

    // Initialize and expand radius for each branch
    branches.forEach((branch, index) => {
      let currentStep = 0;
      let startTime = Date.now();

      updateBranchRadius(branch, index, expansionSteps[currentStep].radius);

      branchRadiusIntervals[index] = setTimeout(() => {
        const elapsed = Date.now() - startTime;
        if (currentStep < expansionSteps.length - 1 && elapsed >= expansionSteps[currentStep + 1].duration) {
          currentStep++;
          updateBranchRadius(branch, index, expansionSteps[currentStep].radius);
          startTime = Date.now(); // Reset for next step
        } else if (currentStep >= expansionSteps.length - 1) {
          clearInterval(branchRadiusIntervals[index]); // Stop after final step
        }
      }, 1000); // Check every second for smooth updates
    });

    // Cleanup on unmount
    return () => {
      Object.values(branchRadiusIntervals).forEach(clearInterval);
      branches.forEach((_, index) => {
        const sourceId = `branch-radius-${index}`;
        const fillId = `branch-radius-fill-${index}`;
        const outlineId = `branch-radius-outline-${index}`;
        if (m.getLayer(fillId)) m.removeLayer(fillId);
        if (m.getLayer(outlineId)) m.removeLayer(outlineId);
        if (m.getSource(sourceId)) m.removeSource(sourceId);
      });
    };
  }, [branches]);



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

    const fe = fieldEngineers.find(fe => fe.id === route.feId);
    const branch = branches[route.branchId];

    if (fe && branch && map.current) {
      // Remove any existing route
      if (map.current.getLayer(routeLayerId)) {
        map.current.removeLayer(routeLayerId);
        map.current.removeSource(routeLayerId);
      }

      // Fetch route from Mapbox Directions API (walking mode)
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${fe.lng},${fe.lat};${branch.lng},${branch.lat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
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

        setShowRouteOnMap(true);
      } catch (err) {
        console.error('Error fetching route from Mapbox Directions API:', err);
        // fallback: do nothing or show error
      }
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
            <span style="font-size: 12px;">Status: ${engineer.status}</span><br/>
            <span style="font-size: 12px;">Last Updated: ${timeString}</span>
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

  // Poll for updates every 30 seconds; SRs every 5 seconds for smoother radius growth
  useEffect(() => {
    const interval = setInterval(() => {
      fetchFieldEngineersData();
      fetchBranchesData(); // Fetch branches periodically as well
      fetchServiceRequestsData();
    }, 30000);
    const srInterval = setInterval(() => {
      fetchServiceRequestsData();
    }, 5000);

    return () => { clearInterval(interval); clearInterval(srInterval); };
  }, []);


  return (
    <div className="h-screen flex overflow-hidden bg-[#c8c87e]">
      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Floating header container */}
        <Header activePage="dashboard" />

        <div className="flex-1 overflow-y-auto">

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
                  <div className="grid grid-cols-3 gap-4 text-center mb-4">
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


                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-white/10 rounded-md p-2">
                        <div className="text-white/70 text-xs">Distance</div>
                        <div className="font-medium">{selectedRoute.distance}</div>
                      </div>
                      <div className="bg-white/10 rounded-md p-2">
                        <div className="text-white/70 text-xs">Duration</div>
                        <div className="font-medium">{selectedRoute.duration}</div>
                      </div>
                      <div className="bg-white/10 rounded-md p-2">
                        <div className="text-white/70 text-xs">Start Time</div>
                        <div className="font-medium">{selectedRoute.startTime}</div>
                      </div>
                      <div className="bg-white/10 rounded-md p-2">
                        <div className="text-white/70 text-xs">ETA</div>
                        <div className="font-medium">{selectedRoute.estimatedArrival}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
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


            <div className="overflow-x-auto">
              <div>
                <h1 className="text-2xl font-bold text-olive-900 p-4">Top Performing Field Engineers</h1>
                <p className="text-olive-700 p-4">These engineers have completed the most service requests this month.</p>
              </div>
              {fieldEngineers.length >= 4 ? (
                <table className="table">
                  {/* head */}
                  <thead>
                    <tr>
                      <th>

                      </th>
                      <th>Name</th>
                      <th>Job</th>
                      <th>Service Request</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* row 1 */}
                    <tr>
                      <th>
                        <label>
                          <h3>1st</h3>
                        </label>
                      </th>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar">
                            <div className="mask mask-squircle h-12 w-12">
                              <img
                                src="https://img.daisyui.com/images/profile/demo/2@94.webp"
                                alt="Avatar Tailwind CSS Component" />
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{fieldEngineers[3].name}</div>
                            <div className="text-sm opacity-50">Pasay</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        ECS Binondo
                        <br />
                        <span className="badge badge-ghost badge-sm">Field Engineer</span>
                      </td>
                      <td>250</td>
                      <th>
                        <button className="btn btn-ghost btn-xs">details</button>
                      </th>
                    </tr>
                    {/* row 2 */}
                    <tr>
                      <th>
                        <label>
                          <h3>2nd</h3>
                        </label>
                      </th>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar">
                            <div className="mask mask-squircle h-12 w-12">
                              <img
                                src="https://img.daisyui.com/images/profile/demo/3@94.webp"
                                alt="Avatar Tailwind CSS Component" />
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{fieldEngineers[0].name}</div>
                            <div className="text-sm opacity-50">Manila</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        ECS Binondo
                        <br />
                        <span className="badge badge-ghost badge-sm">Asst. Manager</span>
                      </td>
                      <td>220</td>
                      <th>
                        <button className="btn btn-ghost btn-xs">details</button>
                      </th>
                    </tr>
                    {/* row 3 */}
                    <tr>
                      <th>
                        <label>
                          <h3>3rd</h3>
                        </label>
                      </th>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar">
                            <div className="mask mask-squircle h-12 w-12">
                              <img
                                src="https://img.daisyui.com/images/profile/demo/4@94.webp"
                                alt="Avatar Tailwind CSS Component" />
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{fieldEngineers[2].name}</div>
                            <div className="text-sm opacity-50">Makati</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        Equicom Center
                        <br />
                        <span className="badge badge-ghost badge-sm">Chairman</span>
                      </td>
                      <td>170</td>
                      <th>
                        <button className="btn btn-ghost btn-xs">details</button>
                      </th>
                    </tr>
                    {/* row 4 */}
                    <tr>
                      <th>
                        <label>
                          <h3>4th</h3>
                        </label>
                      </th>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar">
                            <div className="mask mask-squircle h-12 w-12">
                              <img
                                src="https://img.daisyui.com/images/profile/demo/5@94.webp"
                                alt="Avatar Tailwind CSS Component" />
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{fieldEngineers[1].name}</div>
                            <div className="text-sm opacity-50">Bulacan</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        ECS Binondo
                        <br />
                        <span className="badge badge-ghost badge-sm">DB Admin</span>
                      </td>
                      <td>120</td>
                      <th>
                        <button className="btn btn-ghost btn-xs">details</button>
                      </th>
                    </tr>
                  </tbody>
                  {/* foot */}

                </table>

              ) : (
                <div className="p-4 text-center">
                  <span className="loading loading-spinner loading-md"></span>
                  <p>Loading field engineers data...</p>
                </div>
              )}






              {/* cards */}
              <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">


                {/* Field engineers card */}
                <div className="rounded-xl bg-gradient-to-br from-[#c8c87e]/80 to-[#6b6f1d]/60 p-6 shadow-lg backdrop-blur-md border border-white/10 text-white">
                  <div className="flex flex-col h-full">
                    {/* Top section with field engineer stats */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-5xl font-bold text-yellow-300">{fieldEngineers.length}</h1>
                        <div className="text-lg mt-1">Field Engineers</div>
                        <div className="flex items-center mt-2 text-white/90 text-sm gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                          </svg>
                          Active Personnel
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-white/90 text-sm">August 18, 2025 | 10:15 AM</div>
                        <div className="flex flex-col gap-1 mt-2">
                          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            28 Available
                          </div>
                          <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-lg text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                            </svg>
                            14 On Assignment
                          </div>
                          <div className="flex items-center gap-1 bg-yellow-500/40 px-2 py-1 rounded-lg text-xs">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                            7 Urgent Requests
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Branch coverage stats */}
                    <div className="grid grid-cols-4 gap-2 mt-6">
                      <div className="text-center">
                        <div className="text-xs text-white/70">Branches</div>
                        <div className="text-lg font-medium">{branches.length}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-white/70">ATM Sites</div>
                        <div className="text-lg font-medium">36</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-white/70">Service Centers</div>
                        <div className="text-lg font-medium">12</div>
                      </div>
                    </div>

                    {/* Branch coverage chart */}
                    <div className="mt-5 relative h-20">
                      {/* Coverage bar chart */}
                      <div className="absolute inset-0 grid grid-cols-4 gap-1">
                        <div className="flex flex-col justify-end">
                          <div className="bg-green-500/70 rounded-t-md h-[80%]"></div>
                        </div>

                        <div className="flex flex-col justify-end">
                          <div className="bg-yellow-500/70 rounded-t-md h-[90%]"></div>
                        </div>
                        <div className="flex flex-col justify-end">
                          <div className="bg-red-500/70 rounded-t-md h-[40%]"></div>
                        </div>
                      </div>

                      {/* Region labels */}
                      <div className="absolute bottom-0 w-full flex justify-between text-xs text-white/70">
                        <div>NCR</div>
                        <div>North Luzon</div>
                        <div>South Luzon</div>
                        <div>Visayas & Mindanao</div>
                      </div>
                    </div>
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
                        return (
                          <div key={sr.id} className="bg-black/20 p-3 rounded-lg flex items-center justify-between">
                            <div>
                              <div className="font-medium">{sr.branchName}</div>
                              <div className="text-xs text-white/70">Radius: {sr.currentRadiusKm}km • Created {new Date(sr.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                              {best ? (
                                <div className="text-xs text-green-300 mt-1">Nearest FE in range: {best.fe.name} ({best.km.toFixed(2)} km)</div>
                              ) : (
                                <div className="text-xs text-yellow-300 mt-1">No FE within radius yet</div>
                              )}
                            </div>
                            <button
                              className="btn btn-xs btn-accent"
                              disabled={!best}
                              onClick={() => best && handleAcceptServiceRequest(sr, best.fe)}
                            >
                              {best ? 'Accept' : 'Waiting'}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
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
        {branches.map((branch) => (
          <div key={branch.name} className="rounded-2xl bg-[#c8c87e] p-3 shadow-xl text-black">
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
                src={branch.image}
                alt={branch.name}
                className="h-32 w-full object-cover"
                onError={(e) => {
                  // Fallback image if the URL fails to load
                  e.currentTarget.src = "https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop";
                }}
              />
              <span className={`badge ${Math.random() > 0.5 ? 'badge-success' : 'badge-error'} text-white font-medium absolute top-2 left-2 shadow`}>
                {Math.random() > 0.5 ? 'Assigned' : 'Not assigned'}
              </span>
            </div>

            {/* Bottom pills */}
            <div className="mt-3 flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-xl bg-black/70 px-2 py-1 text-xs text-white">
                {/* map icon */}
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
                {(Math.random() * 10).toFixed(1)} km/h
              </div>

              <div className="inline-flex items-center gap-1 rounded-xl bg-black/70 px-2 py-1 text-xs text-white">
                {/* activity icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 4.75zm0 5A.75.75 0 013.75 9h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 9.75zm0 5A.75.75 0 013.75 14h8.5a.75.75 0 010 1.5h-8.5A.75.75 0 013 14.75z" clipRule="evenodd" />
                </svg>
                {Math.floor(Math.random() * 10) + 1} Activity
              </div>
            </div>
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

        {/* Quick create SR from sidebar branches */}
        {branches.map((branch) => (
          <div key={`${branch.name}-sr-btn`} className="mt-1">
            <button className="btn btn-xs btn-warning w-full" onClick={() => handleCreateServiceRequest(branch)}>
              Request Service at {branch.name}
            </button>
          </div>
        ))}
      </aside>
    </div>
  );
}

export default HomePage;