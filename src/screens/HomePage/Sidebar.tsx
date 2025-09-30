import { useState, useEffect } from "react";
import type { Branch, ServiceRequest, OngoingRoute } from "../../types";
import bg from "../../assets/BDOBG.jpg";

// Interface for the component's props
interface SidebarProps {
  branches: Branch[];
  serviceRequests: ServiceRequest[];
  ongoingRoutes: OngoingRoute[];
  loading: boolean;
  error: string | null;
  handleCreateServiceRequest: (branch: Branch) => void;
  fetchBranchesData: () => void;
}

// The component now accepts props
function Sidebar({
  branches,
  serviceRequests,
  ongoingRoutes,
  loading,
  error,
  handleCreateServiceRequest,
  fetchBranchesData,
}: SidebarProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (branches.length === 0) {
        fetchBranchesData();
    }
  }, []);

  const filteredBranches = branches.filter(
    (branch) =>
      searchQuery === "" ||
      branch.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      branch.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside
      className={`fixed right-0 top-0 h-full bg-[#6b6f1d] backdrop-blur transition-all duration-300 z-40 flex flex-col shadow-2xl ${
        sidebarCollapsed ? "w-12" : "w-80"
      }`}
    >
      {/* Sidebar Toggle Button */}
      <div className="p-2 border-b border-white/10">
        {/* ... button code ... */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={`w-5 h-5 text-white transition-transform duration-300 ${
              sidebarCollapsed ? "rotate-180" : ""
            }`}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"
            />
          </svg>
          {!sidebarCollapsed && (
            <span className="ml-2 text-white text-sm">Collapse</span>
          )}
        </button>
      </div>

      {/* Navigation Icons */}
      <div className="p-2 border-b border-white/10">
        <div className="flex flex-col gap-2">
          {/* Branches Icon */}
          <div className={`flex items-center p-2 rounded-lg bg-white/10 ${!sidebarCollapsed ? "justify-start" : "justify-center"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15l-.75 18H5.25L4.5 3z" />
              </svg>
              {!sidebarCollapsed && <span className="ml-2 text-white text-sm font-medium">Branches</span>}
              {!sidebarCollapsed && <span className="ml-auto bg-yellow-300/90 text-black text-xs px-2 py-1 rounded-full">{branches.length}</span>}
          </div>

            {/* Ongoing Routes Icon */}
          <div className={`flex items-center p-2 rounded-lg bg-orange-500/20 ${!sidebarCollapsed ? "justify-start" : "justify-center"}`}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            {!sidebarCollapsed && <span className="ml-2 text-orange-300 text-sm font-medium">Pending</span>}
            {!sidebarCollapsed && (
              <span className="ml-auto bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
                {serviceRequests.filter((s) => s.status === "pending").length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <div className={`flex-1 overflow-hidden transition-all duration-300 ${sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        {/* Search Bar */}
        <div className="p-3 border-b border-white/10">
            <input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-sm input-bordered w-full bg-white/20 text-white placeholder-white/70 border-white/30 focus:border-white/50"
            />
            {searchQuery && <div className="mt-2 text-xs text-white/70">Found {filteredBranches.length} of {branches.length} branches</div>}
        </div>

        {/* Branches List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && branches.length === 0 && <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-white"></span></div>}
          {error && branches.length === 0 && <div className="alert alert-error"><span>{error}</span></div>}
          
          {filteredBranches.map((branch) => (
            <div key={branch._id} className="rounded-xl bg-[#c8c87e] p-3 shadow-lg text-black hover:shadow-xl transition-shadow">
              <div className="px-1">
                  <h2 className="text-sm font-semibold truncate" title={branch.name}>{branch.name}</h2>
                  <p className="text-xs opacity-70 truncate" title={branch.location}>{branch.location}</p>
              </div>
              <div className="relative mt-2 overflow-hidden rounded-lg">
                  <img src={bg} alt={branch.name} className="h-24 w-full object-cover" onError={(e) => { e.currentTarget.src = "https://images.unsplash.com/photo-1554469384-e58fac937bb4?q=80&w=1000&auto=format&fit=crop"; }} />
                  
                  {/* === FIX #2: STATUS BADGE ADDED BACK === */}
                  {(() => {
                    const hasActiveRoute = ongoingRoutes.some(
                      (route) => route.branchId.toString() === branch._id
                    );
                    const hasPendingRequest = serviceRequests.some(
                      (sr) => sr.branchId === branch._id && sr.status === "pending"
                    );

                    if (hasActiveRoute) {
                      return <span className="badge badge-error text-white font-medium absolute top-1 left-1 shadow text-xs">Assigned</span>;
                    } else if (hasPendingRequest) {
                      return <span className="badge badge-warning text-black font-medium absolute top-1 left-1 shadow text-xs">Pending</span>;
                    } else {
                      return <span className="badge badge-success text-white font-medium absolute top-1 left-1 shadow text-xs">Available</span>;
                    }
                  })()}
 
              </div>
              <button
                className="btn btn-xs btn-warning w-full mt-2 text-xs"
                onClick={() => handleCreateServiceRequest(branch)}
              >
                Request Service
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;