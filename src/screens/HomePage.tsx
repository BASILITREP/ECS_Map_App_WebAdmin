import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import Header from "../header/Header";
import Sidebar from "../screens/HomePage/Sidebar";
import MapFilters from "../screens/HomePage/MapFilters";
import OngoingRoutesPanel from "../screens/HomePage/OngoingRoutes";
import ServiceRequests from "../screens/HomePage/ServiceRequest";


import type {
  Branch,
  FieldEngineer,
  ServiceRequest,
  OngoingRoute,
  ActivityHistory,
} from "../types";
import { toast } from "react-toastify";
import history from "../assets/History.png";
import {
  startFieldEngineerNavigation,
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

  const sampleLocationHistory = [
    {
      id: 1,
      feId: 1, // Make sure this ID matches an existing FE
      type: "Stop",
      locationName: "Jollibee Anabu",
      address: "Anabu Kostal, Imus, Cavite",
      arrivalTime: "02:30 PM",
      duration: "45 mins",
    },
    {
      id: 2,
      feId: 1,
      type: "Moving",
      locationName: "Driving along Aguinaldo Hwy",
      address: "Near Lumina Point Mall",
      arrivalTime: "02:15 PM",
      duration: "15 mins",
    },
    {
      id: 3,
      feId: 1,
      type: "Stop",
      locationName: "Petron Gas Station",
      address: "Centennial Rd, Kawit",
      arrivalTime: "01:55 PM",
      duration: "20 mins",
    },
    {
      id: 4,
      feId: 2, // History for a different FE
      type: "Stop",
      locationName: "SM City Bacoor",
      address: "Tirona Hwy, Bacoor, Cavite",
      arrivalTime: "03:10 PM",
      duration: "35 mins",
    },
  ];

  // Fetch field engineers from API
  const fetchFieldEngineersData = async () => {
    try {
      const data = await fetchFieldEngineers();
      setFieldEngineers(data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching field engineers:", err);
      setError("Failed to fetch field engineers data.");
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
      console.error("Error fetching branches:", err);
      setError("Failed to fetch branches data.");
      setLoading(false);
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
    mapboxgl.accessToken =
      "pk.eyJ1IjoiYmFzaWwxLTIzIiwiYSI6ImNtZWFvNW43ZTA0ejQycHBtd3dkMHJ1bnkifQ.Y-IlM-vQAlaGr7pVQnug3Q";

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

        fetchFieldEngineersData();
        fetchBranchesData();
        fetchServiceRequestsData();
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
    // Still keep initial fetch to populate data when the page loads
    fetchFieldEngineersData();
    fetchBranchesData();
    fetchServiceRequestsData();

    // Remove polling intervals since we're using sockets now
    // (The old polling code can be removed)
  }, []);

  const ActivityMapCard = ({ lat, lng }: { lat: number; lng: number }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);

    useEffect(() => {
      if (mapRef.current || !mapContainerRef.current) return; // Initialize map only once

      mapboxgl.accessToken =
        "pk.eyJ1IjoiYmFzaWwxLTIzIiwiYSI6ImNtZWFvNW43ZTA0ejQycHBtd3dkMHJ1bnkifQ.Y-IlM-vQAlaGr7pVQnug3Q";

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: 15,
        interactive: false, // IMPORTANT: Disable interaction for performance
      });

      mapRef.current = map;

      map.on("load", () => {
        // Add a marker to the center
        new mapboxgl.Marker().setLngLat([lng, lat]).addTo(map);
      });

      // Cleanup function to remove map on component unmount
      return () => {
        map.remove();
        mapRef.current = null;
      };
    }, [lat, lng]); 

    return (
      <div ref={mapContainerRef} className="mt-3 rounded-lg w-full h-24" />
    );
  };

  const LocationHistoryPanel = ({
    fieldEngineers,
  }: {
    fieldEngineers: FieldEngineer[];
  }) => {
    const [selectedFeId, setSelectedFeId] = useState(
      fieldEngineers[0]?.id || 0
    );
    const [historyData, setHistoryData] = useState<ActivityHistory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // This useEffect will run whenever the selected engineer changes
    useEffect(() => {
      if (selectedFeId > 0) {
        const loadHistory = async () => {
          setIsLoading(true);
          try {
            const data = await fetchActivityHistory(selectedFeId);
            setHistoryData(data);
          } catch (error) {
            console.error("Failed to fetch activity history:", error);
            setHistoryData([]); // Clear data on error
          } finally {
            setIsLoading(false);
          }
        };
        loadHistory();
      }
    }, [selectedFeId]); // Re-run when selectedFeId changes

    // Function to handle horizontal scrolling with mouse wheel
    const handleWheelScroll = (e: React.WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft += e.deltaY;
      }
    };

    return (
      <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-medium">
            Field Engineer Activity Log
          </h3>
          <select
            className="select select-sm bg-white/20 text-white border-white/30"
            value={selectedFeId}
            onChange={(e) => setSelectedFeId(Number(e.target.value))}
          >
            {fieldEngineers.map((fe) => (
              <option key={fe.id} value={fe.id} className="text-black">
                {fe.name}
              </option>
            ))}
          </select>
        </div>

        {/* Horizontal Scrollable Container */}
        <div
          ref={scrollContainerRef}
          onWheel={handleWheelScroll}
          className="flex overflow-x-auto space-x-4 pb-4 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent min-h-[220px]"
        >
          {isLoading ? (
            <div className="flex-grow flex items-center justify-center">
              <span className="loading loading-spinner loading-md text-white"></span>
            </div>
          ) : historyData.length === 0 ? (
            <div className="flex-grow flex items-center justify-center bg-white/10 rounded-lg p-4 text-center text-white/70">
              No activity data available for this engineer.
            </div>
          ) : (
            historyData.map((item) => (
              // The card rendering logic is the same as before
              <div
                key={item.id}
                className="bg-black/20 p-3 rounded-lg w-80 flex-shrink-0"
              >
                {/* ... The rest of your card UI from the previous step ... */}
                {/* Card Header */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center ${
                      item.type === "drive"
                        ? "bg-blue-500/80"
                        : "bg-orange-500/80"
                    }`}
                  >
                    {/* ... SVG Icons ... */}
                  </div>
                  <div>
                    <div className="font-bold text-white text-lg">
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
                ) : (
                  <img
                    src={item.mapImage}
                    alt="Map of the route"
                    className="mt-3 rounded-lg w-full h-24 object-cover"
                  />
                )}

                {/* Drive Details */}
                {item.type === "drive" && (
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-white">
                    <div className="flex items-center gap-1.5">
                      <span className="text-red-400">🚗</span> Top speed:{" "}
                      <strong>{item.topSpeed}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-green-400">✓</span> Crash Detection:{" "}
                      <strong>ON</strong>
                    </div>
                    {/* <div className="flex items-center gap-1.5 col-span-2">
                    <span className="text-yellow-400">⚠️</span> Risky events: <strong>{item.riskyEvents > 0 ? `${item.riskyEvents} event(s)` : 'None'}</strong>
                  </div> */}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  //Main return
  // Add a small connection indicator in your UI
  return (
    <div className="h-screen flex overflow-hidden bg-[#c8c87e]">
      {/* Main content */}
      <main
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? "lg:mr-12" : "lg:mr-80"
        }`}
      >
        {/* Header */}
        <Header activePage="dashboard" />

        {/* Connection status indicator */}
        <div
          className={`fixed top-4 z-50 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all duration-300 ${
            sidebarCollapsed ? "right-16" : "right-4"
          } ${socketConnected ? "bg-green-500/80" : "bg-red-500/80"}`}
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

        {/* Main content area with proper spacing */}
        <div className="flex-1 overflow-y-auto relative">
          {/* Map Container - Full width */}
          <div className="relative">
            <MapFilters
            branches={branches}
            fieldEngineers={fieldEngineers}
            sidebarCollapsed={sidebarCollapsed}
            showBranches={showBranches}
            showFieldEngineers={showFieldEngineers}
            statusFilter={statusFilter}
            showMapFilter={showMapFilter}
            setShowBranches={setShowBranches}
            setShowFieldEngineers={setShowFieldEngineers}
            setStatusFilter={setStatusFilter}
            setShowMapFilter={setShowMapFilter}
          />

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
            <OngoingRoutesPanel
            ongoingRoutes={ongoingRoutes}
            selectedRoute={selectedRoute}
            showRouteOnMap={showRouteOnMap}
            loading={loading}
            handleShowRoute={handleShowRoute}
            clearRouteFromMap={clearRouteFromMap}
            handleStopNavigation={handleStopNavigation}
          />
          </div>

          <LocationHistoryPanel fieldEngineers={fieldEngineers} />

          {/* Service requests card */}
           {/* <ServiceRequests
            serviceRequests={serviceRequests}
            fieldEngineers={fieldEngineers}
            ongoingRoutes={ongoingRoutes}
            branches={branches}
            handleAcceptServiceRequest={handleAcceptServiceRequest}
          /> */}

          <div className="overflow-x-auto"></div>
        </div>
      </main>

     {/* Render the Sidebar and pass down the props */}
      <Sidebar
        branches={branches}
        serviceRequests={serviceRequests}
        ongoingRoutes={ongoingRoutes}
        loading={loading}
        error={error}
        handleCreateServiceRequest={handleCreateServiceRequest}
        fetchBranchesData={fetchBranchesData}
      />

      
    </div>
  );
}

export default HomePage;
