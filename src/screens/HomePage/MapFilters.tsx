import type { Branch } from "../../types";

// Define the component's props
interface MapFiltersProps {
  branches: Branch[];
  fieldEngineers: {
    id: number;
    name: string;
    lat: number;
    lng: number;
    status: string;
    lastUpdated: string;
  }[];
  sidebarCollapsed: boolean;

  // Props for filter values
  showFieldEngineers: boolean;
  showBranches: boolean;
  statusFilter: string | null;
  showMapFilter: boolean;

  // Props for functions to change the state in the parent
  setShowFieldEngineers: (value: boolean) => void;
  setShowBranches: (value: boolean) => void;
  setStatusFilter: (value: string | null) => void;
  setShowMapFilter: (value: boolean) => void;
}

function MapFilters({
  branches,
  fieldEngineers,
  sidebarCollapsed,
  showFieldEngineers,
  showBranches,
  statusFilter,
  showMapFilter,
  setShowFieldEngineers,
  setShowBranches,
  setStatusFilter,
  setShowMapFilter,
}: MapFiltersProps) {
 

  return (
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
                    checked={showFieldEngineers} // Use prop
                    onChange={(e) => setShowFieldEngineers(e.target.checked)} // Call prop function
                  />
                  <span className="text-white">Field Engineers</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-warning"
                    checked={showBranches} // Use prop
                    onChange={(e) => setShowBranches(e.target.checked)} // Call prop function
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
                  className={`btn btn-xs ${statusFilter === null ? "btn-primary" : "btn-outline btn-primary"}`}
                  onClick={() => setStatusFilter(null)} // Call prop function
                >
                  All
                </button>
                <button
                  className={`btn btn-xs ${statusFilter === "Active" ? "bg-green-600 border-green-600 text-white" : "btn-outline border-green-600 text-green-600 hover:bg-green-600 hover:text-white"}`}
                  onClick={() => setStatusFilter("Active")} // Call prop function
                >
                  Active
                </button>
                <button
                  className={`btn btn-xs ${statusFilter === "On Assignment" ? "bg-amber-500 border-amber-500 text-white" : "btn-outline border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white"}`}
                  onClick={() => setStatusFilter("On Assignment")} // Call prop function
                >
                  On Assignment
                </button>
                <button
                  className={`btn btn-xs ${statusFilter === "Inactive" ? "bg-gray-600 border-gray-600 text-white" : "btn-outline border-gray-600 text-gray-600 hover:bg-gray-600 hover:text-white"}`}
                  onClick={() => setStatusFilter("Inactive")} // Call prop function
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          {/* Filter stats */}
          <div className="mt-3 text-white/70 text-xs">
            Showing:{" "}
            {showFieldEngineers
              ? statusFilter
                ? fieldEngineers.filter((fe) => fe.status === statusFilter).length
                : fieldEngineers.length
              : 0}{" "}
            Engineers, {showBranches ? branches.length : 0} Branches
          </div>
        </div>
      )}

      {/* Map Legend */}
      <div className={`absolute top-4 z-30 bg-white/90 backdrop-blur-sm rounded-lg p-2 shadow-lg text-sm transition-all duration-300 ${sidebarCollapsed ? "right-16" : "right-4"}`}>
        {/* ... Legend UI remains the same ... */}
        <div className="font-medium mb-1">Legend</div>
        <div className="flex items-center gap-1 mb-1"><div className="w-3 h-3 rounded-full bg-green-500"></div><span>Active Engineer</span></div>
        <div className="flex items-center gap-1 mb-1"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span>On Assignment</span></div>
        <div className="flex items-center gap-1 mb-1"><div className="w-3 h-3 rounded-full bg-gray-500"></div><span>Inactive Engineer</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3"><img src="https://img.icons8.com/color/48/bank-building.png" className="w-4 h-4" alt="Branch" /></div><span>Branch</span></div>

        <button
          className="btn btn-sm btn-primary mt-2 w-full"
          onClick={() => setShowMapFilter(!showMapFilter)} // Call prop function
        >
          {showMapFilter ? "Hide Filters" : "Show Filters"}
        </button>
      </div>
    </div>
  );
}

export default MapFilters;