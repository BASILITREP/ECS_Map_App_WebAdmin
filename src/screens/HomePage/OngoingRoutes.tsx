import type { OngoingRoute } from "../../types";

interface OngoingRoutesProps {
  ongoingRoutes: OngoingRoute[];
  selectedRoute: OngoingRoute | null;
  showRouteOnMap: boolean;
  loading: boolean;
  handleShowRoute: (route: OngoingRoute) => void;
  clearRouteFromMap: () => void;
  handleStopNavigation: (feId: number) => void;
}


function OngoingRoutes({
  ongoingRoutes,
  selectedRoute,
  showRouteOnMap,
  loading,
  handleShowRoute,
  clearRouteFromMap,
  handleStopNavigation,
}: OngoingRoutesProps) {
  return (
            <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-white font-medium">
                  Ongoing Field Engineer Routes
                </h3>
                {showRouteOnMap && (
                  <button
                    onClick={clearRouteFromMap}
                    className="btn btn-xs btn-ghost text-white/90"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
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
                  {ongoingRoutes.map((route) => (
                    <div
                      key={route.id}
                      className={`bg-white/10 rounded-lg p-3 cursor-pointer transition-all hover:bg-white/20 
                        ${
                          selectedRoute?.id === route.id
                            ? "ring-2 ring-yellow-400 bg-white/20"
                            : ""
                        }`}
                      onClick={() => handleShowRoute(route)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-white">
                            {route.feName}
                          </div>
                          <div className="text-xs text-white/70 mt-0.5">
                            to {route.branchName}
                          </div>
                        </div>

                        <div
                          className={`px-2 py-1 rounded-full text-xs font-medium
                          ${
                            route.status === "in-progress"
                              ? "bg-blue-500/80"
                              : route.status === "delayed"
                              ? "bg-red-500/80"
                              : "bg-green-500/80"
                          }`}
                        >
                          {route.status === "in-progress"
                            ? "In Progress"
                            : route.status === "delayed"
                            ? "Delayed"
                            : "Arriving Soon"}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <div className="text-center">
                          <div className="text-xs text-white/60">Distance</div>
                          <div className="text-sm font-medium text-white">
                            {route.distance}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-white/60">ETA</div>
                          <div className="text-sm font-medium text-white">
                            {route.estimatedArrival}
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-white/60">Fare</div>
                          <div className="text-sm font-medium text-white">
                            {route.price}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between">
                        <div className="text-xs text-white/70">
                          Started: {route.startTime}
                        </div>
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
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth={1.5}
                              stroke="currentColor"
                              className="w-3.5 h-3.5"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z"
                              />
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
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="w-5 h-5 text-yellow-400"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z"
                        />
                      </svg>
                      <span className="font-medium">Route Details</span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium
                      ${
                        selectedRoute.status === "in-progress"
                          ? "bg-blue-500/80"
                          : selectedRoute.status === "delayed"
                          ? "bg-red-500/80"
                          : "bg-green-500/80"
                      }`}
                    >
                      {selectedRoute.status === "in-progress"
                        ? "In Progress"
                        : selectedRoute.status === "delayed"
                        ? "Delayed"
                        : "Arriving Soon"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="avatar">
                        <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                          {selectedRoute.feName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">
                          {selectedRoute.feName}
                        </div>
                        <div className="text-xs text-white/70">
                          Field Engineer
                        </div>
                      </div>
                    </div>

                    <div className="text-2xl px-2">→</div>

                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                        <img
                          src="https://img.icons8.com/color/48/bank-building.png"
                          className="w-6 h-6"
                          alt="Branch"
                        />
                      </div>
                      <div>
                        <div className="font-medium">
                          {selectedRoute.branchName}
                        </div>
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
                            <div className="text-xs">
                              {selectedRoute.startTime}
                            </div>
                          </div>
                        </li>

                        {/* Route steps from Mapbox directions */}
                        {selectedRoute.routeSteps?.map((step, index) => (
                          <li key={index} className="step step-primary">
                            <div className="text-center max-w-[150px]">
                              <div className="font-bold">{step.maneuver}</div>
                              <div className="text-xs whitespace-normal">
                                {step.roadName || "Unnamed road"}
                              </div>
                              <div className="text-xs text-yellow-200">
                                {step.distance}
                              </div>
                            </div>
                          </li>
                        ))}

                        <li className="step">
                          <div className="text-center">
                            <div className="font-bold">Arrival</div>
                            <div className="text-xs">
                              {selectedRoute.estimatedArrival}
                            </div>
                          </div>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <div className="bg-white/10 rounded-md px-2 py-1 text-sm">
                        <span className="text-white/70 mr-1">Fare:</span>
                        <span className="font-medium">
                          {selectedRoute.price}
                        </span>
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
    );
  }
  
  export default OngoingRoutes;
  
