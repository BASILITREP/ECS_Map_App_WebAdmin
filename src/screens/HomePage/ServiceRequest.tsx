import type { FieldEngineer, Branch, ServiceRequest, OngoingRoute } from "../../types";

// Define the interface for the props this component needs from HomePage
interface ServiceRequestsProps {
  serviceRequests: ServiceRequest[];
  fieldEngineers: FieldEngineer[];
  ongoingRoutes: OngoingRoute[];
  branches: Branch[]; // Needed for the isAssigned check
  handleAcceptServiceRequest: (sr: ServiceRequest, fe: FieldEngineer) => void;
}

function ServiceRequests({
  serviceRequests,
  fieldEngineers,
  ongoingRoutes,
  branches, // Destructure branches here
  handleAcceptServiceRequest,
}: ServiceRequestsProps) {
  
  const pendingRequests = serviceRequests.filter((s) => s.status === "pending");

  return (
    <div className="mt-4">
      <div className="rounded-xl bg-gradient-to-br from-[#c8c87e]/80 to-[#6b6f1d]/60 p-6 shadow-lg backdrop-blur-md border border-white/10 text-white">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Service Requests</h2>
          <span className="badge bg-yellow-300/90 text-black">
            {pendingRequests.length} Pending
          </span>
        </div>

        {/* Pending requests list */}
        <div className="mt-2 space-y-3">
          {pendingRequests.length === 0 ? (
            <div className="bg-black/10 rounded-lg p-3 text-white/80">
              No pending service requests
            </div>
          ) : (
            pendingRequests.map((sr) => {
              // find all FEs within radius
              const inRange = fieldEngineers
                .filter((fe) => fe.status !== "Inactive")
                .map((fe) => {
                  const toRad = (d: number) => (d * Math.PI) / 180;
                  const R = 6371;
                  const dLat = toRad(fe.lat - sr.lat);
                  const dLng = toRad(fe.lng - sr.lng);
                  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(sr.lat)) * Math.cos(toRad(fe.lat)) * Math.sin(dLng / 2) ** 2;
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  const km = R * c;
                  return { fe, km };
                })
                .filter((x) => x.km <= sr.currentRadiusKm)
                .sort((a, b) => a.km - b.km);

              // BUG FIX: Compare the route's branchId directly with the service request's branchId.
              const isAssigned = ongoingRoutes.some(
                (route) => route.branchId.toString() === sr.branchId
              );

              return (
                <div key={sr.id} className="bg-black/20 p-3 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">{sr.branchName}</div>
                      <div className="text-xs text-white/70">
                        Radius: {sr.currentRadiusKm}km • Created{" "}
                        {new Date(sr.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                    {isAssigned && (
                      <div className="badge badge-success badge-sm text-black">
                        ✓ Assigned
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    {isAssigned ? (
                      <div className="text-xs text-green-300 mt-1">
                        This request has been assigned to an engineer.
                      </div>
                    ) : inRange.length > 0 ? (
                      <div className="space-y-2">
                        <div className="text-xs text-green-300">
                          {inRange.length} engineer(s) in range:
                        </div>
                        {inRange.map(({ fe, km }) => (
                          <div
                            key={fe.id}
                            className="flex items-center justify-between bg-black/20 p-2 rounded-md"
                          >
                            <div>
                              <div className="text-sm font-medium">{fe.name}</div>
                              <div className="text-xs text-white/60">
                                {km.toFixed(2)} km away • Status: {fe.status}
                              </div>
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
                      <div className="text-xs text-yellow-300 mt-1">
                        No FE within radius yet.
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default ServiceRequests;