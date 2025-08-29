import { useState, useEffect } from 'react';
import Header from '../header/Header';

// Define the Field Engineer interface
interface FieldEngineer {
  id: number;
  name: string;
  lat: number;
  lng: number;
  status: string;
  lastUpdated: string;
  // Add additional fields if your API returns more data
  phone?: string;
  email?: string;
  assignedBranch?: string;
  currentTask?: string;
}

function FEPage() {
    // State variables
    const [fieldEngineers, setFieldEngineers] = useState<FieldEngineer[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    // Add this new state for the modal
    const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);

    // Fetch field engineers from API
    const fetchFieldEngineers = async () => {
      try {
        setLoading(true);
        const response = await fetch('http://localhost:5242/api/FieldEngineer');

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        setFieldEngineers(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching field engineers:', err);
        setError('Failed to fetch field engineers data.');
        setLoading(false);
      }
    };

    // Add new engineer function
    const addNewEngineer = async (engineer: Omit<FieldEngineer, 'id'>) => {
        try {
            const response = await fetch('http://localhost:5242/api/FieldEngineer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(engineer),
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            
            // Refresh the engineers list
            fetchFieldEngineers();
            // Close the modal
            setIsAddModalOpen(false);
        } catch (err) {
            console.error('Error adding field engineer:', err);
            // You could add error handling for the form here
        }
    };

    // Fetch data on component mount
    useEffect(() => {
      fetchFieldEngineers();
    }, []);

    // Apply filters to engineers
    const filteredEngineers = fieldEngineers.filter(engineer => {
      // Apply status filter if set
      if (statusFilter && engineer.status !== statusFilter) {
        return false;
      }
      
      // Apply search filter if query exists
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return engineer.name.toLowerCase().includes(query) || 
               (engineer.assignedBranch && engineer.assignedBranch.toLowerCase().includes(query));
      }
      
      return true;
    });

    // Get engineer status count for badges
    const getStatusCount = (status: string) => {
      return fieldEngineers.filter(fe => fe.status === status).length;
    };

    // Format timestamp to readable format
    const formatLastUpdated = (timestamp: string) => {
      const date = new Date(timestamp);
      return date.toLocaleString();
    };

    return (
        <div className="h-screen flex overflow-hidden bg-[#c8c87e]">
            <main className="flex-1 flex flex-col overflow-hidden">
                {/* Use the Header component with fieldEngineers as active */}
                <Header activePage="fieldEngineers" />

                <div className="flex-1 overflow-y-auto">
                    {/* Page header */}
                    <div className="p-4 pb-0">
                        <div className="flex flex-wrap justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-olive-900">Field Engineers</h1>
                                <p className="text-olive-700">Manage and monitor all field engineers</p>
                            </div>

                            <div className="flex gap-2 mt-2 md:mt-0">
                                <button 
                                    className="btn btn-primary btn-sm"
                                    onClick={() => setIsAddModalOpen(true)}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add Engineer
                                </button>
                                <button 
                                    className="btn btn-outline btn-sm"
                                    onClick={fetchFieldEngineers}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Filters and search */}
                    <div className="p-4 pt-3">
                        <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* Search input */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-white/80 text-sm">Search Engineers:</label>
                                    <div className="relative">
                                        <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-white/70">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                                            </svg>
                                        </div>
                                        <input 
                                            type="text" 
                                            className="input input-sm bg-white/20 text-white border-white/30 w-full ps-10"
                                            placeholder="Search by name or branch..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                                
                                {/* Status filter */}
                                <div className="flex flex-col gap-1">
                                    <label className="text-white/80 text-sm">Filter by Status:</label>
                                    <select 
                                        className="select select-sm bg-white/20 text-white border-white/30 w-full"
                                        value={statusFilter || ''}
                                        onChange={(e) => setStatusFilter(e.target.value || null)}
                                    >
                                        <option value="">All Statuses</option>
                                        <option value="active">Active</option>
                                        <option value="on assignment">On Assignment</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                
                                {/* Status summary */}
                                <div className="flex flex-col gap-1 lg:col-span-2">
                                    <label className="text-white/80 text-sm">Engineer Status:</label>
                                    <div className="flex gap-2">
                                        <div className="badge badge-success gap-1">
                                            <div className="w-2 h-2 rounded-full bg-white"></div>
                                            Active: {getStatusCount('active')}
                                        </div>
                                        <div className="badge badge-warning gap-1">
                                            <div className="w-2 h-2 rounded-full bg-white"></div>
                                            On Assignment: {getStatusCount('on assignment')}
                                        </div>
                                        <div className="badge badge-neutral gap-1">
                                            <div className="w-2 h-2 rounded-full bg-white"></div>
                                            Inactive: {getStatusCount('inactive')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Field engineers list */}
                    <div className="p-4 pt-2">
                        {loading ? (
                            <div className="flex justify-center py-8">
                                <span className="loading loading-spinner loading-lg text-primary"></span>
                            </div>
                        ) : error ? (
                            <div className="alert alert-error">
                                <span>{error}</span>
                            </div>
                        ) : filteredEngineers.length === 0 ? (
                            <div className="bg-white/90 backdrop-blur-sm rounded-xl p-8 text-center">
                                <div className="text-gray-500 mb-2">
                                    {searchQuery || statusFilter ? 'No engineers match your filters' : 'No engineers found'}
                                </div>
                                {(searchQuery || statusFilter) && (
                                    <button 
                                        className="btn btn-sm btn-outline"
                                        onClick={() => {
                                            setSearchQuery('');
                                            setStatusFilter(null);
                                        }}
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredEngineers.map(engineer => (
                                    <div key={engineer.id} className="bg-white/90 backdrop-blur-sm rounded-xl overflow-hidden shadow-md">
                                        <div className={`
                                            px-4 py-3 flex items-center justify-between
                                            ${engineer.status === 'active' ? 'bg-green-500' : 
                                              engineer.status === 'on assignment' ? 'bg-amber-500' : 'bg-gray-500'}
                                        `}>
                                            <h3 className="font-bold text-white">{engineer.name}</h3>
                                            <span className="badge badge-sm text-xs bg-white/30 text-white border-none">
                                                ID: {engineer.id}
                                            </span>
                                        </div>
                                        
                                        <div className="p-4">
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-gray-500">Status</span>
                                                    <span className={`
                                                        inline-flex items-center text-sm font-medium
                                                        ${engineer.status === 'active' ? 'text-green-700' : 
                                                          engineer.status === 'on assignment' ? 'text-amber-700' : 'text-gray-700'}
                                                    `}>
                                                        <span className={`
                                                            w-2 h-2 mr-1.5 rounded-full
                                                            ${engineer.status === 'active' ? 'bg-green-500' : 
                                                              engineer.status === 'on assignment' ? 'bg-amber-500' : 'bg-gray-500'}
                                                        `}></span>
                                                        {engineer.status.charAt(0).toUpperCase() + engineer.status.slice(1)}
                                                    </span>
                                                </div>
                                                
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-gray-500">Last Updated</span>
                                                    <span className="text-sm">{formatLastUpdated(engineer.lastUpdated)}</span>
                                                </div>
                                                
                                                {engineer.phone && (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-gray-500">Phone</span>
                                                        <span className="text-sm">{engineer.phone}</span>
                                                    </div>
                                                )}
                                                
                                                {engineer.email && (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-gray-500">Email</span>
                                                        <span className="text-sm truncate">{engineer.email}</span>
                                                    </div>
                                                )}
                                                
                                                {engineer.assignedBranch && (
                                                    <div className="flex flex-col col-span-2">
                                                        <span className="text-xs text-gray-500">Assigned Branch</span>
                                                        <span className="text-sm">{engineer.assignedBranch}</span>
                                                    </div>
                                                )}
                                                
                                                <div className="flex flex-col col-span-2">
                                                    <span className="text-xs text-gray-500">Location</span>
                                                    
                                                </div>
                                            </div>
                                            
                                            <div className="flex justify-between mt-2">
                                                <button className="btn btn-sm btn-outline btn-primary">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                                    </svg>
                                                    Edit
                                                </button>
                                                
                                                <button className="btn btn-sm">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                    </svg>
                                                    Locate
                                                </button>
                                                
                                                <button className="btn btn-sm btn-outline btn-error">
                                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                    </svg>
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Add Engineer Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl p-6 w-full max-w-md">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-olive-900">Add New Field Engineer</h3>
                            <button 
                                className="text-gray-500 hover:text-gray-700"
                                onClick={() => setIsAddModalOpen(false)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const newEngineer = {
                                name: formData.get('name') as string,
                                lat: parseFloat(formData.get('lat') as string),
                                lng: parseFloat(formData.get('lng') as string),
                                status: formData.get('status') as string,
                                lastUpdated: new Date().toISOString(),
                                phone: formData.get('phone') as string,
                                email: formData.get('email') as string,
                                assignedBranch: formData.get('assignedBranch') as string,
                                currentTask: formData.get('currentTask') as string,
                            };
                            addNewEngineer(newEngineer);
                        }}>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Name</span>
                                    </label>
                                    <input type="text" name="name" className="input input-bordered" required />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="form-control">
                                        <label className="label">
                                            <span className="label-text">Latitude</span>
                                        </label>
                                        <input type="number" name="lat" step="any" className="input input-bordered" required />
                                    </div>
                                    
                                    <div className="form-control">
                                        <label className="label">
                                            <span className="label-text">Longitude</span>
                                        </label>
                                        <input type="number" name="lng" step="any" className="input input-bordered" required />
                                    </div>
                                </div>
                                
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Status</span>
                                    </label>
                                    <select name="status" className="select select-bordered" required>
                                        <option value="active">Active</option>
                                        <option value="on assignment">On Assignment</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                                
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Phone</span>
                                    </label>
                                    <input type="tel" name="phone" className="input input-bordered" />
                                </div>
                                
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Email</span>
                                    </label>
                                    <input type="email" name="email" className="input input-bordered" />
                                </div>
                                
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Assigned Branch</span>
                                    </label>
                                    <input type="text" name="assignedBranch" className="input input-bordered" />
                                </div>
                                
                                <div className="form-control">
                                    <label className="label">
                                        <span className="label-text">Current Task</span>
                                    </label>
                                    <input type="text" name="currentTask" className="input input-bordered" />
                                </div>
                                
                                <div className="flex gap-3 justify-end mt-2">
                                    <button 
                                        type="button" 
                                        className="btn btn-outline"
                                        onClick={() => setIsAddModalOpen(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        Add Engineer
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default FEPage;