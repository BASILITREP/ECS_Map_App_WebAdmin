import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Header from "../header/Header";
import Sidebar from "../screens/HomePage/Sidebar";



import type {
  Branch,
  FieldEngineer,
  ServiceRequest,
  OngoingRoute,
  ActivityHistory,
} from "../types";
import { toast } from "react-toastify";

import {

  stopFieldEngineerNavigation,
} from "../services/api";

import {
  fetchBranches,
  fetchFieldEngineers,
  fetchServiceRequests,
  fetchActivityHistory,
  createServiceRequest as apiCreateServiceRequest,
  acceptServiceRequest as apiAcceptServiceRequest,
} from "../services/api";
import {
  initializeSocket,
  subscribe,
  unsubscribe,
} from "../services/socketService";

// SET THE ACCESS TOKEN HERE, AT THE TOP LEVEL
mapboxgl.accessToken = "pk.eyJ1IjoiYmFzaWwxLTIzIiwiYSI6ImNtZWFvNW43ZTA0ejQycHBtd3dkMHJ1bnkifQ.Y-IlM-vQAlaGr7pVQnug3Q";

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
  const [searchQuery, setSearchQuery] = useState<string>(""); // Add search state
  const [selectedFEForHistory, setSelectedFEForHistory] = useState<FieldEngineer | null>(null);
  const [historyPanelCollapsed, setHistoryPanelCollapsed] = useState<boolean>(false);
  const srLayers = useRef<Set<string>>(new Set());
  const routeLayerId = "active-route-layer";

  // Filter branches based on search query
  const filteredBranches = branches.filter(
    (branch) =>
      searchQuery === "" ||
      branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      branch.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // circle radius in SR
  const makeCircle = (
    lng: number,
    lat: number,
    radiusKm: number,
    points = 64
  ) => {
    const coords: [number, number][] = [];
    const radiusRad = radiusKm / 6371;
    const centerLat = (lat * Math.PI) / 180;
    const centerLng = (lng * Math.PI) / 180;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * 2 * Math.PI;
      const latRad = Math.asin(
        Math.sin(centerLat) * Math.cos(radiusRad) +
          Math.cos(centerLat) * Math.sin(radiusRad) * Math.cos(angle)
      );
      const lngRad =
        centerLng +
        Math.atan2(
          Math.sin(angle) * Math.sin(radiusRad) * Math.cos(centerLat),
          Math.cos(radiusRad) - Math.sin(centerLat) * Math.sin(latRad)
        );
      coords.push([(lngRad * 180) / Math.PI, (latRad * 180) / Math.PI]);
    }
    return {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Polygon" as const,
        coordinates: [coords],
      },
    };
  };

  
  // Handle field engineer selection from sidebar
  const handleFieldEngineerSelect = (fe: FieldEngineer | null) => {
    if (fe && map.current) {
      // Fly to the selected field engineer's location
      map.current.flyTo({
        center: [fe.lng, fe.lat],
        zoom: 16,
        duration: 2000,
      });

      // Open the marker's popup if it exists
      if (markers.current[fe.id]) {
        markers.current[fe.id].togglePopup();
      }
    }
    
    // Set the selected FE for history panel
    setSelectedFEForHistory(fe);
    if (fe) {
      setHistoryPanelCollapsed(false); // Expand panel when selecting new FE
    }
  };

  // Fetch field engineers from API
  const fetchFieldEngineersData = async () => {
    try {
      const data = await fetchFieldEngineers();
      setFieldEngineers(data);
      // setLoading(false); // REMOVED: This is the cause of the race condition.
    } catch (err) {
      console.error("Error fetching field engineers:", err);
      setError("Failed to fetch field engineers data.");
      // setLoading(false); // REMOVED
    }
  };

  //fetch branches
  const fetchBranchesData = async () => {
    try {
      const data = await fetchBranches();
      setBranches(data);
      // setLoading(false); // REMOVED: This is the cause of the race condition.
    } catch (err) {
      console.error("Error fetching branches:", err);
      setError("Failed to fetch branches data.");
      // setLoading(false); // REMOVED
    }
  };

  // Service Requests API
  const fetchServiceRequestsData = async () => {
    try {
      const requests: ServiceRequest[] = await fetchServiceRequests();
      // Initialize radius for pending requests
      const now = Date.now();
      const updatedRequests = requests.map((sr) => {
        if (sr.status === "pending") {
          const minutesSinceCreation =
            (now - new Date(sr.createdAt).getTime()) / 60000;
          // Assuming base radius is 1km and it grows 1km per minute, max 10km.
          const radius = Math.min(10, 1 + Math.floor(minutesSinceCreation));
          return { ...sr, currentRadiusKm: radius };
        }
        return { ...sr, currentRadiusKm: 0 };
      });
      setServiceRequests(updatedRequests);
    } catch (err) {
      console.error("Error fetching service requests:", err);
    }
  };

  const handleCreateServiceRequest = async (branch: Branch) => {
    if (!branch._id) {
      console.error("Branch id missing");
      return;
    }
    try {
      await apiCreateServiceRequest({
        branchId: branch._id,
        branch: branch, // This is only used for TypeScript typing, not sent to the API
      });

      //SignalR will handle notifying clients of the new SR = BUG FIX
      //await fetchServiceRequestsData();
      toast.success(`✅ Service request created for ${branch.name}`);
    } catch (err) {
      console.error("Error creating service request:", err);
    }
  };

  const handleAcceptServiceRequest = async (
    sr: ServiceRequest,
    fe: FieldEngineer
  ) => {
    try {
      // The ONLY thing this function does now is call the API.
      // The backend will handle the rest and notify all clients via SignalR.
      await apiAcceptServiceRequest(sr.id, fe.id);

      // All other logic (creating new route, calling updateRouteInfo, etc.)
      // has been removed from here because it's now handled by the 'newRoute' useEffect.
    } catch (err) {
      console.error("Error accepting service request:", err);
    }
  };

  // Add a function to stop navigation if needed
  const handleStopNavigation = async (feId: number) => {
    try {
      await stopFieldEngineerNavigation(feId);
      console.log(`Navigation stopped for FE ${feId}`);
    } catch (err) {
      console.error("Error stopping navigation:", err);
    }
  };

  const formatDistance = (distanceInMeters: number): string => {
    if (distanceInMeters < 1000) {
      return `${Math.round(distanceInMeters)} m`;
    } else {
      return `${(distanceInMeters / 1000).toFixed(1)} km`;
    }
  };

  // Add this new function to calculate real route information
  const updateRouteInfo = async (route: OngoingRoute) => {
    try {
      // Get the most current data
      const currentFE = fieldEngineers.find((fe) => fe.id === route.feId);
      // FIX: Find the branch by its _id, comparing it to the route's branchId.
      const currentBranch = branches.find(
        (b) => b._id === route.branchId.toString()
      );

      if (!currentFE || !currentBranch) {
        console.error(
          "Could not find field engineer or branch for route:",
          route
        );
        console.log(
          "Field engineer ID:",
          route.feId,
          "Available FEs:",
          fieldEngineers.map((fe) => fe.id)
        );
        console.log(
          "Branch index:",
          route.branchId,
          "Available branches:",
          branches.length
        );
        return;
      }

      console.log(
        `Updating route info for ${currentFE.name} to ${currentBranch.name}`
      );
      console.log(`FE location: ${currentFE.lat}, ${currentFE.lng}`);
      console.log(
        `Branch location: ${currentBranch.lat}, ${currentBranch.lng}`
      );

      // Call Mapbox Directions API
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${currentFE.lng},${currentFE.lat};${currentBranch.lng},${currentBranch.lat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        console.error(
          "Error getting directions:",
          data.message || "Unknown error",
          data
        );
        return;
      }

      // route info
      const routeData = data.routes[0];
      const distanceValue = routeData.distance;
      const distance = formatDistance(distanceValue);
      const durationMinutes = Math.round(routeData.duration / 60);
      const duration = durationMinutes + " min";

      //Extract route steps(max 5)
      const routeSteps: RouteStep[] = [];
      if (routeData.legs && routeData.legs.length > 0) {
        const steps = routeData.legs[0].steps;

        //get sig steps
        const significantSteps =
          steps.length <= 5
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
            maneuver:
              step.maneuver.type === "arrive"
                ? "Arrive at destination"
                : getManeuverDescription(
                    step.maneuver.type,
                    step.maneuver.modifier
                  ),
            roadName: step.name || "Unnamed road",
            distance: formatDistance(step.distance),
          });
        });
      }

      // fare calculation
      const distanceInKm = parseFloat((routeData.distance / 1000).toFixed(1));
      const baseFare = 45; // Base fare in PHP
      const ratePerKm = 15; // Rate per km in PHP
      const price = `₱${Math.round(baseFare + distanceInKm * ratePerKm)}`;

      // Calculate ETA
      const startTime = new Date();
      const etaTime = new Date(
        startTime.getTime() + durationMinutes * 60 * 1000
      );
      const estimatedArrival = etaTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      console.log(
        `Route calculated: ${distance}, ${duration}, ${price}, ETA: ${estimatedArrival}`
      );

      // Update the route with calculated information
      setOngoingRoutes((prevRoutes) => {
        const updatedRoutes = prevRoutes.map((r) =>
          r.id === route.id
            ? { ...r, distance, duration, price, estimatedArrival, routeSteps }
            : r
        );
        console.log("Routes updated:", updatedRoutes);
        return updatedRoutes;
      });

      // If this route is currently selected, update the display on the map
      if (selectedRoute && selectedRoute.id === route.id) {
        handleShowRoute({
          ...route,
          distance,
          duration,
          price,
          estimatedArrival,
          routeSteps,
        }); // Update the map display with new info
      }
    } catch (err) {
      console.error("Error updating route info:", err);
    }
  };

  const getManeuverDescription = (type: string, modifier?: string): string => {
    switch (type) {
      case "turn":
        return `Turn ${modifier || ""}`;
      case "depart":
        return "Depart from origin";
      case "arrive":
        return "Arrive at destination";
      case "roundabout":
      case "rotary":
        return "Enter roundabout";
      case "fork":
        return `Take ${modifier || ""} fork`;
      case "merge":
        return "Merge";
      case "ramp":
        return `Take ${modifier || ""} ramp`;
      case "on ramp":
        return "Take on ramp";
      case "off ramp":
        return "Take off ramp";
      case "end of road":
        return "End of road";
      case "new name":
        return "Continue onto";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  // Add this new useEffect to handle new service requests in real-time
  useEffect(() =>{
    const handleNewServiceRequest = (sr : ServiceRequest) =>{
      console.log("New service request received:", sr);
      setServiceRequests(prev => [sr, ...prev]);
    };
    subscribe("newServiceRequest", handleNewServiceRequest);

    return () =>{
      unsubscribe("newServiceRequest", handleNewServiceRequest);
    }
  })

  //Toast for completed route
  useEffect(() => {
    const handleRouteCompleted = (completedSr: ServiceRequest) => {
      let completedRoute: OngoingRoute | undefined;

      // Remove the route from the state and get its details for the toast
      setOngoingRoutes((prev) => {
        const routeToRemove = prev.find(
          (route) => route.branchId === Number(completedSr.branchId)
        );
        completedRoute = routeToRemove;
        return prev.filter(
          (route) => route.branchId !== Number(completedSr.branchId)
        );
      });

      if (completedRoute) {
        toast.success(
          `✅ Route Complete: ${completedRoute.feName} has arrived at ${completedRoute.branchName}!`
        );
      }

      // Optional: Refresh service requests to show the new "completed" status if you have a history view
      fetchServiceRequestsData();
    };

    subscribe("routeCompleted", handleRouteCompleted);

    return () => {
      unsubscribe("routeCompleted", handleRouteCompleted);
    };
  }, [branches]);

  // Add this useEffect to handle branch updates
  useEffect(() => {
    const handleBranchUpdate = (branch: any) => {
      console.log("Branch update received:", branch);
      // Update existing branch or add new one
      setBranches((prev) => {
        const index = prev.findIndex((b) => b._id === branch.id.toString());
        if (index >= 0) {
          // Update existing branch
          const newBranches = [...prev];
          newBranches[index] = {
            ...newBranches[index],
            name: branch.name,
            location: branch.address,
            lat: branch.latitude,
            lng: branch.longitude,
            image: branch.image || newBranches[index].image,
          };
          return newBranches;
        }
        return prev;
      });
    };

    subscribe("ReceiveBranchUpdate", handleBranchUpdate);
    return () => {
      unsubscribe("ReceiveBranchUpdate", handleBranchUpdate);
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
      console.log("Boss coordinates received:", data);

      if (!map.current || !data.latitude || !data.longitude) return;

      const bossMarkerId = "boss-marker";
      const color = "#ff4444"; // Red color for boss

      if (markers.current[bossMarkerId]) {
        // Update existing marker position and make visible
        markers.current[bossMarkerId].setLngLat([
          data.longitude,
          data.latitude,
        ]);
        markers.current[bossMarkerId].getElement().style.display = "block";

        // Update marker color (in case it changes)
        const markerElement = markers.current[bossMarkerId].getElement();
        markerElement.style.backgroundColor = color;

        // Update popup content
        const timeString = new Date(data.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 10px; text-align: center;">
            <strong style="color: #ff4444;">👑 Boss Location</strong><br/>
            <span style="color: #666; font-size: 12px;">${
              data.description || "Boss is here"
            }</span><br/>
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
        const el = document.createElement("div");
        el.className = "boss-marker";
        el.style.width = "25px";
        el.style.height = "25px";
        el.style.backgroundColor = color;
        el.style.border = "3px solid white";
        el.style.borderRadius = "50%";
        el.style.boxShadow = "0 0 15px rgba(255, 68, 68, 0.8)";
        el.style.cursor = "pointer";
        el.style.display = "flex";
        el.style.alignItems = "center";
        el.style.justifyContent = "center";
        el.style.fontSize = "12px";
        el.innerHTML = "👑"; // Crown for boss

        // Add animation ping effect (same as field engineers)
        const ping = document.createElement("div");
        ping.style.width = "100%";
        ping.style.height = "100%";
        ping.style.borderRadius = "50%";
        ping.style.backgroundColor = `${color}80`; // Add transparency
        ping.style.animation = "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite";
        ping.style.position = "absolute";
        ping.style.top = "0";
        ping.style.left = "0";
        ping.style.zIndex = "-1";
        el.style.position = "relative";
        el.appendChild(ping);

        // Format the timestamp
        const timeString = new Date(data.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Add a popup
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div style="padding: 10px; text-align: center;">
            <strong style="color: #ff4444;">👑 Boss Location</strong><br/>
            <span style="color: #666; font-size: 12px;">${
              data.description || "Boss is here"
            }</span><br/>
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
        duration: 2000,
      });
    };

    // Subscribe to boss coordinate updates
    subscribe("CoordinateUpdate", handleBossCoordinates);

    return () => {
      unsubscribe("CoordinateUpdate", handleBossCoordinates);
    };
  }, []);

  useEffect(() => {
    const handleNewFieldEngineer = (fe: any) => {
      console.log("New field engineer received:", fe);
      const transformedFE: FieldEngineer = {
        id: fe.id,
        name: fe.name,
        lng: fe.currentLongitude || 0,
        lat: fe.currentLatitude || 0,
        status: fe.status || "Active",
        lastUpdated: fe.updatedAt || new Date().toISOString(),
        fcmToken: fe.fcmToken || "",
      };
      console.log("Adding new field engineer to state:", transformedFE);

      // Update existing FE if it exists, otherwise add new one
      setFieldEngineers((prev) => {
        const existingIndex = prev.findIndex(
          (engineer) => engineer.id === transformedFE.id
        );
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

    subscribe("ReceiveNewFieldEngineer", handleNewFieldEngineer); // Changed from 'newFieldEngineer'
    return () => {
      unsubscribe("ReceiveNewFieldEngineer", handleNewFieldEngineer);
    };
  }, []);

  useEffect(() => {
    const handleNewBranch = (branch: any) => {
      console.log("New branch received:", branch);
      const transformedBranch: Branch = {
        _id: branch.id.toString(),
        name: branch.name,
        location: branch.address,
        image:
          branch.image ||
          "https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop",
        lat: branch.latitude,
        lng: branch.longitude,
      };
      console.log("Adding new branch to state:", transformedBranch);
      setBranches((prev) => [...prev, transformedBranch]);
    };
    subscribe("newBranch", handleNewBranch);
    return () => {
      unsubscribe("newBranch", handleNewBranch);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setServiceRequests((prevRequests) =>
        prevRequests.map((sr) => {
          if (sr.status === "pending") {
            const minutesSinceCreation =
              (now - new Date(sr.createdAt).getTime()) / 60000;
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
    // REMOVE THE TOKEN ASSIGNMENT FROM HERE
    // mapboxgl.accessToken =
    //   "pk.eyJ1IjoiYmFzaWwxLTIzIiwiYSI6ImNtZWFvNW43ZTA0ejQycHBtd3dkMHJ1bnkifQ.Y-IlM-vQAlaGr7pVQnug3Q";

    if (mapContainer.current && !map.current) {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [121.774017, 12.879721],
        zoom: 5.5,
      });

      // Add navigation controls (optional)
      map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

      // Wait for map to load
      map.current.on("load", () => {
        // Add keyframes for ping animation to document head
        if (!document.getElementById("ping-animation")) {
          const style = document.createElement("style");
          style.id = "ping-animation";
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

        // DO NOT FETCH DATA HERE. This is causing a race condition.
        // The main useEffect at the bottom of the file handles all initial fetching.
        // fetchFieldEngineersData();
        // fetchBranchesData();
        // fetchServiceRequestsData();
      });
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
    const activeIds = new Set(
      serviceRequests.filter((s) => s.status === "pending").map((s) => s.id)
    );
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
    serviceRequests
      .filter((s) => s.status === "pending")
      .forEach((sr) => {
        const prefix = sr.id;
        const sourceId = `sr-${prefix}-source`;
        const fillId = `sr-${prefix}-fill`;
        const outlineId = `sr-${prefix}-outline`;
        const data = makeCircle(sr.lng, sr.lat, sr.currentRadiusKm);

        if (m.getSource(sourceId)) {
          // @ts-ignore
          (m.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(
            data as any
          );
        } else {
          m.addSource(sourceId, { type: "geojson", data });
          m.addLayer({
            id: fillId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": "#f59e0b",
              "fill-opacity": 0.2,
            },
          });
          m.addLayer({
            id: outlineId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": "#f59e0b",
              "line-width": 2,
              "line-dasharray": [2, 2],
            },
          });
          srLayers.current.add(prefix);
        }
      });
  }, [serviceRequests]);

  const handleShowRoute = async (route: OngoingRoute) => {
    clearRouteFromMap();
    setSelectedRoute(route);
    setShowRouteOnMap(true);

    const fe = fieldEngineers.find((fe) => fe.id === route.feId);

    const branch = branches.find((b) => b._id === route.branchId.toString());

    if (fe && branch && map.current) {
      console.log(`CORRECTLY showing route to: ${branch.name}`);
      console.log(
        `Showing route from FE (${fe.lat}, ${fe.lng}) to branch (${branch.lat}, ${branch.lng})`
      );

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fe.lng},${fe.lat};${branch.lng},${branch.lat}?steps=true&geometries=geojson&access_token=${mapboxgl.accessToken}`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
          console.error("No route found:", data);
          throw new Error("No route found");
        }
        const routeGeo = data.routes[0].geometry;

        // Add route to map (your existing logic here is correct)
        map.current.addSource(routeLayerId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: routeGeo,
          },
        });

        map.current.addLayer({
          id: routeLayerId,
          type: "line",
          source: routeLayerId,
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color":
              route.status === "delayed"
                ? "#FF6B6B"
                : route.status === "arriving"
                ? "#4CAF50"
                : "#3887BE",
            "line-width": 4,
            "line-opacity": 0.8,
          },
        });

        // Fit map to the route (your existing logic here is correct)
        const coordinates = routeGeo.coordinates;
        const bounds = coordinates.reduce(
          (b: mapboxgl.LngLatBounds, coord: [number, number]) =>
            b.extend(coord),
          new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
        );

        map.current.fitBounds(bounds, {
          padding: 80,
          maxZoom: 14,
        });

        console.log("Route displayed on map");
      } catch (err) {
        console.error("Error fetching route from Mapbox Directions API:", err);
      }
    } else {
      // Improved error logging
      console.error("Missing data for route display:", {
        fe: fe ? `Found FE ${fe.name}` : `FE with ID ${route.feId} not found`,
        branch: branch
          ? `Found branch ${branch.name}`
          : `Branch with ID ${route.branchId} not found`,
        map: map.current ? "Map exists" : "Map not initialized",
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
    Object.values(branchMarkers.current).forEach((marker) => {
      marker.getElement().style.display = "none";
    });

    // Skip processing if branches are hidden
    if (!showBranches) return;

    // Update existing markers and add new ones
    branches.forEach((branch, index) => {
      if (branchMarkers.current[index]) {
        // Update existing marker position and make visible
        branchMarkers.current[index].setLngLat([branch.lng, branch.lat]);
        branchMarkers.current[index].getElement().style.display = "block";
      } else {
        // Create a new marker
        const el = document.createElement("div");
        el.className = "branch-marker";
        el.style.width = "30px";
        el.style.height = "30px";
        el.style.backgroundImage =
          'url("https://img.icons8.com/color/48/bank-building.png")';
        el.style.backgroundSize = "cover";
        el.style.cursor = "pointer";

        // Add a popup
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
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
    Object.values(markers.current).forEach((marker) => {
      marker.getElement().style.display = "none";
    });

    // Skip processing if field engineers are hidden
    if (!showFieldEngineers) return;

    // Filter engineers based on status if filter is set
    const filteredEngineers = statusFilter
      ? fieldEngineers.filter((eng) => eng.status === statusFilter)
      : fieldEngineers;

    // Update existing markers and add new ones
    filteredEngineers.forEach((engineer) => {
      // Status color mapping
      const statusColors = {
        Active: "#4CAF50", // Green
        "On Assignment": "#FFA500", // Orange
        Inactive: "#9E9E9E", // Grey
      };

      const color =
        statusColors[engineer.status as keyof typeof statusColors] || "#ff4d4f";

      if (markers.current[engineer.id]) {
        // Update existing marker position and make visible
        markers.current[engineer.id].setLngLat([engineer.lng, engineer.lat]);
        markers.current[engineer.id].getElement().style.display = "block";

        // Update marker color
        const markerElement = markers.current[engineer.id].getElement();
        markerElement.style.backgroundColor = color;

        // Update popup content
        const lastUpdated = new Date(engineer.lastUpdated);
        const timeString = lastUpdated.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
        <div style="padding: 8px;">
          <strong>${engineer.name}</strong><br/>
          <span class="text-xs">Status: ${engineer.status}</span><br/>
          <span class="text-xs">Last Updated: ${timeString}</span>
        </div>
      `);

        markers.current[engineer.id].setPopup(popup);
      } else {
        // Create a new marker
        const el = document.createElement("div");
        el.className = "field-engineer-marker";
        el.style.width = "20px";
        el.style.height = "20px";
        el.style.backgroundColor = color;
        el.style.border = "2px solid white";
        el.style.borderRadius = "50%";
        el.style.boxShadow = "0 0 10px rgba(0, 0, 0, 0.5)";
        el.style.cursor = "pointer";

        // Add animation ping effect
        const ping = document.createElement("div");
        ping.style.width = "100%";
        ping.style.height = "100%";
        ping.style.borderRadius = "50%";
        ping.style.backgroundColor = `${color}80`; // Add transparency
        ping.style.animation = "ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite";
        el.appendChild(ping);

        // Format the last updated time
        const lastUpdated = new Date(engineer.lastUpdated);
        const timeString = lastUpdated.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

        // Add a popup
        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
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
      console.log("Socket connected successfully");
    };

    const handleDisconnected = () => {
      setSocketConnected(false);
      console.log("Socket disconnected");
    };

    const handleError = (err: any) => {
      console.error("Socket error:", err);
      setSocketConnected(false);
    };

    subscribe("connected", handleConnected);
    subscribe("disconnected", handleDisconnected);
    subscribe("error", handleError);

    return () => {
      unsubscribe("connected", handleConnected);
      unsubscribe("disconnected", handleDisconnected);
      unsubscribe("error", handleError);
    };
  }, []);

  // Subscribe to field engineer updates
  useEffect(() => {
    const handleFieldEngineerUpdate = (fe: any) => {
      // Changed type to any to handle backend model
      console.log("Real-time FE update received:", fe);

      // FIX: Transform the incoming backend data to match the frontend's FieldEngineer type
      const transformedFE: FieldEngineer = {
        id: fe.id,
        name: fe.name,
        lat: fe.currentLatitude, // Use currentLatitude
        lng: fe.currentLongitude, // Use currentLongitude
        status: fe.status,
        fcmToken: fe.fcmToken || "",
        lastUpdated: fe.updatedAt,
      };

      // Update a single field engineer in the state
      setFieldEngineers((prev) =>
        prev.map((engineer) =>
          engineer.id === transformedFE.id ? transformedFE : engineer
        )
      );
    };

    subscribe("fieldEngineerUpdate", handleFieldEngineerUpdate);

    return () => {
      unsubscribe("fieldEngineerUpdate", handleFieldEngineerUpdate);
    };
  }, []);

  // Subscribe to service request updates
  useEffect(() => {
    const handleServiceRequestUpdate = (sr: ServiceRequest) => {
      console.log("Service Request Update received via SignalR:", sr);

      setServiceRequests((prev) =>
        prev.filter((request) => request.id !== sr.id)
      );
    };

    subscribe("serviceRequestUpdate", handleServiceRequestUpdate);

    return () => {
      unsubscribe("serviceRequestUpdate", handleServiceRequestUpdate);
    };
  }, []);
  // Subscribe to route updates
  useEffect(() => {
    const handleNewRoute = (route: any) => {
      // 'route' now comes from the backend
      console.log("Received new route from backend:", route);

      // Add a check to prevent crash if route or branchId is missing
      if (!route || typeof route.branchId === "undefined") {
        console.error(
          "Received an invalid route object from the backend:",
          route
        );
        return; // Stop execution to prevent a crash
      }

      // The backend sends a C# object, we need to map it to our TypeScript OngoingRoute
      const newOngoingRoute: OngoingRoute = {
        id: route.id,
        feId: route.feId,
        feName: route.feName,
        branchId: route.branchId,
        branchName: route.branchName,
        startTime: route.startTime,
        estimatedArrival: route.estimatedArrival,
        distance: route.distance,
        duration: route.duration,
        price: route.price,
        status: route.status,
        routeSteps: route.routeSteps || [],
      };
      setOngoingRoutes((prev) => [...prev, newOngoingRoute]);
      updateRouteInfo(newOngoingRoute);
      //startFieldEngineerNavigation(route.feId, route.feName, [ [route.feLng, route.feLat], [route.branchLng, route.branchLat] ]);
    };

    const handleRouteUpdate = (route: OngoingRoute) => {
      setOngoingRoutes((prev) =>
        prev.map((r) => (r.id === route.id ? { ...r, ...route } : r))
      );
    };

    subscribe("newRoute", handleNewRoute);
    subscribe("routeUpdate", handleRouteUpdate);

    return () => {
      unsubscribe("newRoute", handleNewRoute);
      unsubscribe("routeUpdate", handleRouteUpdate);
    };
  }, [branches, fieldEngineers]);

  // Initial data fetch on component mount
  useEffect(() => {
    const fetchAllInitialData = async () => {
      setLoading(true); // Set loading to true at the very beginning.
      try {
        // Promise.all waits for all fetches to complete.
        await Promise.all([
          fetchFieldEngineersData(),
          fetchBranchesData(),
          fetchServiceRequestsData(),
        ]);
      } catch (error) {
        console.error("Error during initial data fetch:", error);
        setError("Failed to load initial application data.");
      } finally {
        // This will only run after ALL fetches are done.
        setLoading(false);
      }
    };

    fetchAllInitialData();
  }, []);

  const ActivityMapCard = ({ lat, lng }: { lat: number; lng: number }) => {
    // Use Mapbox Static Image API instead of creating a full map
    // FIX: Correctly format the URL to use 'auto' for the viewport.
    const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+ff4136(${lng},${lat})/auto/300x150@2x?padding=50&access_token=${mapboxgl.accessToken}`;

    return (
      <img
        src={staticMapUrl}
        alt="Location"
        className="mt-3 rounded-lg w-full h-24 object-cover"
        loading="lazy"
      />
    );
  };

  const ActivityDriveMapCard = ({
    startLat,
    startLng,
    endLat,
    endLng,
  }: {
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
  }) => {
    // Check if the drive is essentially zero distance
    if (startLat === endLat && startLng === endLng) {
      // If start and end are the same, just show a single marker like in ActivityMapCard
      return <ActivityMapCard lat={startLat} lng={startLng} />;
    }

    // Define markers for start (green 'A') and end (red 'B')
    const startMarker = `pin-s-a+4CAF50(${startLng},${startLat})`;
    const endMarker = `pin-s-b+F44336(${endLng},${endLat})`;

    // CORRECTLY format the coordinates as a GeoJSON LineString
    const geojson = {
      type: "LineString",
      coordinates: [
        [startLng, startLat],
        [endLng, endLat],
      ],
    };

    // URL-encode the GeoJSON object to be used in the path parameter
    const encodedPath = encodeURIComponent(JSON.stringify(geojson));

    // Define the path overlay with the correctly encoded GeoJSON
    // FIX: The parentheses around the encoded path are required by the API.
    const path = `path-5+3887BE-0.8(${encodedPath})`;

    // Construct the final URL. 'auto' will now correctly fit the bounds of the path and markers.
    const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${startMarker},${endMarker},${path}/auto/300x150@2x?padding=50&access_token=${mapboxgl.accessToken}`;

    return (
      <img
        src={staticMapUrl}
        alt="Route map"
        className="mt-2 rounded-lg w-full h-20 object-cover"
        loading="lazy"
      />
    );
  };

  const LocationHistoryPanel = ({
    selectedEngineer,
    onClose,
  }: {
    selectedEngineer: FieldEngineer;
    onClose: () => void;
  }) => {
    const [historyData, setHistoryData] = useState<ActivityHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [localCollapsed, setLocalCollapsed] = useState<boolean>(false);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // This useEffect will run whenever the selected engineer changes
    useEffect(() => {
      const loadHistory = async () => {
        setIsLoading(true);
        try {
          const data = await fetchActivityHistory(selectedEngineer.id);
          setHistoryData(data || []); // Simplified
        } catch (error) {
          console.error("Failed to fetch activity history:", error);
          setHistoryData([]);
        } finally {
          setIsLoading(false);
        }
      };
      loadHistory();
    }, [selectedEngineer]); // FIX: Change dependency from selectedEngineer.id to the whole object

    // Function to handle horizontal scrolling with mouse wheel
    const handleWheelScroll = (e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        e.preventDefault();
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    };

    return (
      <div className="bg-[#6b6f1d]/95 backdrop-blur-md shadow-2xl rounded-t-2xl border-t-2 border-white/20">
        {/* Header */}
        <div className="flex justify-between items-center p-3 border-b border-white/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
              {selectedEngineer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-white font-semibold text-sm">
                {selectedEngineer.name} - Activity Log
              </h3>
              <p className="text-white/70 text-xs">
                {selectedEngineer.status}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLocalCollapsed(!localCollapsed)}
              className="btn btn-sm btn-circle bg-white/10 hover:bg-white/20 border-none text-white"
              title={localCollapsed ? "Expand" : "Collapse"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className={`w-4 h-4 transition-transform duration-300 ${
                  localCollapsed ? "rotate-180" : ""
                }`}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="btn btn-sm btn-circle bg-white/10 hover:bg-red-500/50 border-none text-white"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="w-4 h-4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Collapsible Content */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            localCollapsed ? "max-h-0" : "max-h-[280px]"
          }`}
        >
          {/* Horizontal Scrollable Container */}
          <div
            ref={scrollContainerRef}
            onWheel={handleWheelScroll}
            className="flex overflow-x-auto space-x-4 p-4 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent min-h-[240px]"
          >
            {isLoading ? (
              <div className="flex-grow flex flex-col items-center justify-center">
                <span className="loading loading-spinner loading-lg text-white mb-2"></span>
                <p className="text-white/70 text-sm">Loading activities...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="flex-grow flex items-center justify-center bg-white/10 rounded-lg p-4 text-center text-white/70">
                <div>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-12 h-12 mx-auto mb-2 opacity-50"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                    />
                  </svg>
                  <p className="font-semibold">No activity data available</p>
                  <p className="text-xs mt-1">This engineer hasn't logged any activities yet.</p>
                </div>
              </div>
            ) : (
              historyData.map((item) => (
                <div
                  key={item.id}
                  className="bg-black/30 p-3 rounded-lg w-72 flex-shrink-0 border border-white/10"
                >
                  {/* Card Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        item.type === "drive"
                          ? "bg-blue-500/80"
                          : "bg-orange-500/80"
                      }`}
                    >
                      {item.type === "drive" ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-6 h-6 text-white"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          stroke="currentColor"
                          className="w-6 h-6 text-white"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-white text-sm">
                        {item.type === "drive"
                          ? `${item.distance} Drive`
                          : item.locationName}
                      </div>
                      <div className="text-xs text-white/70">
                        {item.timeRange} ({item.duration})
                      </div>
                    </div>
                  </div>

                  {/* Conditional Map/Image Display */}
                  {item.type === "stop" && item.lat && item.lng ? (
                    <ActivityMapCard lat={item.lat} lng={item.lng} />
                  ) : item.type === "drive" &&
                    item.startLat &&
                    item.startLng &&
                    item.endLat &&
                    item.endLng ? (
                    <ActivityDriveMapCard
                      startLat={item.startLat}
                      startLng={item.startLng}
                      endLat={item.endLat}
                      endLng={item.endLng}
                    />
                  ) : (
                    <img
                      src={item.mapImage}
                      alt="Map of the route"
                      className="mt-2 rounded-lg w-full h-20 object-cover"
                    />
                  )}

                  {/* Drive Details */}
                  {item.type === "drive" && (
                    <div className="mt-2 space-y-1.5 text-xs text-white/80">
                      <div className="flex items-start gap-2">
                        <span className="text-green-400 mt-0.5">●</span>
                        <div className="flex-1 truncate">
                          <strong>From:</strong> {item.startAddress}
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5">●</span>
                        <div className="flex-1 truncate">
                          <strong>To:</strong> {item.endAddress}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-white">
                        <div className="flex items-center gap-1">
                          <span className="text-red-400">🚗</span> Top speed:{" "}
                          <strong>{item.topSpeed}</strong>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-green-400">✓</span> Safe Drive
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  //Main return
  return (
    <div className="h-screen flex overflow-hidden relative">
      {/* Full-screen Map Background */}
      <div
        ref={mapContainer}
        className="absolute inset-0 w-full h-full bg-base-200 z-0"
      />

      {/* Overlay for loading/error states */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-50">
          <span className="loading loading-spinner loading-lg text-primary"></span>
        </div>
      )}
      {error && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Floating Header - Adjusts based on sidebar */}
      <div className={`absolute top-0 left-0 transition-all duration-300 z-40 ${
        sidebarCollapsed ? 'right-10' : 'right-[320px]'
      }`}>
        <Header activePage="dashboard" />
      </div>

      {/* Connection status indicator */}
      <div
        className={`fixed bottom-1 right-1 z-50 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
          socketConnected ? "bg-green-500/80" : "bg-red-500/80"
        } backdrop-blur-sm shadow-lg`}
      >
        <div
          className={`w-2 h-2 rounded-full ${
            socketConnected ? "bg-green-200 animate-pulse" : "bg-red-200"
          }`}
        ></div>
        <span className="text-white">
          {socketConnected ? "Live" : "Offline"}
        </span>
      </div>

      {/* Floating Activity Log Panel - Bottom (only when FE is selected) */}
      {selectedFEForHistory && (
        <div className={`fixed bottom-0 left-1/2 transform -translate-x-1/2 z-30 transition-all duration-300 ${
          sidebarCollapsed ? 'w-[calc(100%-80px)]' : 'w-[calc(100%-400px)]'
        } max-w-6xl`}>
          <LocationHistoryPanel 
            selectedEngineer={selectedFEForHistory}
            onClose={() => setSelectedFEForHistory(null)}
          />
        </div>
      )}

      {/* Floating Sidebar - Right side */}
      <div className="absolute top-0 right-0 bottom-0 z-40 h-full">
        <Sidebar
          branches={branches}
          serviceRequests={serviceRequests}
          ongoingRoutes={ongoingRoutes}
          fieldEngineers={fieldEngineers}
          loading={loading}
          error={error}
          handleCreateServiceRequest={handleCreateServiceRequest}
          fetchBranchesData={fetchBranchesData}
          onCollapseChange={setSidebarCollapsed}
          onFieldEngineerSelect={handleFieldEngineerSelect}
          ActivityMapCard={ActivityMapCard}
          ActivityDriveMapCard={ActivityDriveMapCard}
        />
      </div>
    </div>
  );
}

export default HomePage;
