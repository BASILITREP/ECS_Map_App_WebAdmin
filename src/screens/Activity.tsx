import { useState, useEffect } from 'react';
import Header from '../header/Header';
import type { Branch, FieldEngineer, ServiceRequest, OngoingRoute } from '../types';
import {
  fetchBranches,
  fetchFieldEngineers,
  fetchServiceRequests,
  createServiceRequest as apiCreateServiceRequest,
  acceptServiceRequest as apiAcceptServiceRequest
} from '../services/api';

// Define interfaces for activity data
interface Activity {
  id: number;
  type: 'assignment' | 'completion' | 'alert' | 'login' | 'update' | 'service';
  description: string;
  timestamp: string;
  user?: string;
  feId?: number;
  feName?: string;
  branchId?: number;
  branchName?: string;
  status?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
}

function ActivityPage() {
  // State variables
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [fieldEngineers, setFieldEngineers] = useState<FieldEngineer[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
      const [showFieldEngineers, setShowFieldEngineers] = useState<boolean>(true);
  const [showBranches, setShowBranches] = useState<boolean>(true);
    const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10)
  });


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


  // Fetch activities from API or generate sample data
  const fetchActivities = async () => {
    setLoading(true);
    try {
      // For demo purposes, generate sample activities
      const sampleActivities: Activity[] = [
        {
          id: 1,
          type: 'assignment',
          description: 'Field Engineer assigned to BDO Makati',
          timestamp: '2025-08-20T08:30:00',
          user: 'Admin',
          feId: 1,
          feName: 'John Santos',
          branchId: 1,
          branchName: 'BDO Makati',
          status: 'assigned',
          priority: 'medium'
        },
        {
          id: 2,
          type: 'alert',
          description: 'Network issue detected at BDO Ortigas',
          timestamp: '2025-08-20T09:15:00',
          branchId: 2,
          branchName: 'BDO Ortigas',
          status: 'open',
          priority: 'high'
        },
        {
          id: 3,
          type: 'login',
          description: 'User login from new location',
          timestamp: '2025-08-20T07:45:00',
          user: 'Maria Cruz',
          status: 'completed',
          priority: 'low'
        },
        {
          id: 4,
          type: 'completion',
          description: 'Service request completed at BDO BGC',
          timestamp: '2025-08-19T16:30:00',
          feId: 2,
          feName: 'Alex Garcia',
          branchId: 3,
          branchName: 'BDO BGC',
          status: 'completed',
          priority: 'medium'
        },
        {
          id: 5,
          type: 'service',
          description: 'New service request: ATM maintenance',
          timestamp: '2025-08-19T14:20:00',
          branchId: 4,
          branchName: 'BDO Alabang',
          status: 'pending',
          priority: 'medium'
        },
        {
          id: 6,
          type: 'update',
          description: 'System software updated to v2.3.4',
          timestamp: '2025-08-18T23:15:00',
          user: 'System',
          status: 'completed',
          priority: 'low'
        },
        {
          id: 7,
          type: 'alert',
          description: 'Critical server error at data center',
          timestamp: '2025-08-18T18:45:00',
          status: 'resolved',
          priority: 'critical'
        },
        {
          id: 8,
          type: 'assignment',
          description: 'Field Engineer reassigned from BDO Makati to BDO MOA',
          timestamp: '2025-08-18T10:30:00',
          user: 'Admin',
          feId: 3,
          feName: 'Daniel Lee',
          branchId: 5,
          branchName: 'BDO MOA',
          status: 'reassigned',
          priority: 'low'
        },
        {
          id: 9,
          type: 'service',
          description: 'Urgent service request: Security system failure',
          timestamp: '2025-08-17T16:10:00',
          branchId: 2,
          branchName: 'BDO Ortigas',
          status: 'in-progress',
          priority: 'critical'
        },
        {
          id: 10,
          type: 'update',
          description: 'Field Engineer status changed to inactive',
          timestamp: '2025-08-17T09:05:00',
          user: 'Admin',
          feId: 4,
          feName: 'Sarah Smith',
          status: 'completed',
          priority: 'low'
        }
      ];

      // Sort activities by timestamp (newest first)
      const sortedActivities = sampleActivities.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setActivities(sortedActivities);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching activities:', err);
      setError('Failed to load activity data');
      setLoading(false);
    }
  };

  // Load activities on component mount
  useEffect(() => {
    fetchActivities();
  }, []);

  // Filter activities based on selected filters and search query
  const filteredActivities = activities.filter(activity => {
    // Apply type filter
    if (typeFilter && activity.type !== typeFilter) {
      return false;
    }
    
    // Apply priority filter
    if (priorityFilter && activity.priority !== priorityFilter) {
      return false;
    }
    
    // Apply date range filter
    const activityDate = new Date(activity.timestamp);
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    endDate.setHours(23, 59, 59); // Set end date to end of day
    
    if (activityDate < startDate || activityDate > endDate) {
      return false;
    }
    
    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return activity.description.toLowerCase().includes(query) || 
             (activity.feName && activity.feName.toLowerCase().includes(query)) ||
             (activity.branchName && activity.branchName.toLowerCase().includes(query)) ||
             (activity.user && activity.user.toLowerCase().includes(query));
    }
    
    return true;
  });

  // Get activity counts by type
  const getActivityCountByType = (type: string) => {
    return activities.filter(activity => activity.type === type).length;
  };

  // Get activity counts by priority
  const getActivityCountByPriority = (priority: string) => {
    return activities.filter(activity => activity.priority === priority).length;
  };

  // Format timestamp to readable format
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Group activities by date for better display
  const groupActivitiesByDate = (activities: Activity[]) => {
    const groups: { [key: string]: Activity[] } = {};
    
    activities.forEach(activity => {
      const date = new Date(activity.timestamp);
      const dateString = date.toLocaleDateString();
      
      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      
      groups[dateString].push(activity);
    });
    
    return groups;
  };

  const groupedActivities = groupActivitiesByDate(filteredActivities);

  // Get icon for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'assignment':
        return (
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
            </svg>
          </div>
        );
      case 'completion':
        return (
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'alert':
        return (
          <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
        );
      case 'login':
        return (
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </div>
        );
      case 'update':
        return (
          <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </div>
        );
      case 'service':
        return (
          <div className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-full bg-gray-500 flex items-center justify-center text-white">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
        );
    }
  };

  // Get color for priority
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-blue-100 text-blue-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'critical':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#c8c87e]">
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header activePage="activity" />

        <div className="flex-1 overflow-y-auto">
          {/* Page header */}
          <div className="p-4 pb-0">
            <div className="flex flex-wrap justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-olive-900">Activity Log</h1>
                <p className="text-olive-700">Monitor all system activities and events</p>
              </div>
              
              <div className="flex gap-2 mt-2 md:mt-0">
                <button 
                  className="btn btn-outline btn-sm"
                  onClick={fetchActivities}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Activity Overview */}
          <div className="p-4 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white/90 rounded-lg p-3 shadow">
                <div className="text-sm text-gray-500">Total Activities</div>
                <div className="text-2xl font-bold">{activities.length}</div>
                <div className="mt-2 text-xs text-gray-400">Last 7 days</div>
              </div>
              
              <div className="bg-white/90 rounded-lg p-3 shadow">
                <div className="text-sm text-gray-500">Alerts</div>
                <div className="text-2xl font-bold">{getActivityCountByType('alert')}</div>
                <div className="mt-2 flex items-center text-xs">
                  <span className="text-red-500 font-medium">{getActivityCountByPriority('critical')} critical</span>
                  <span className="mx-1">•</span>
                  <span className="text-orange-500">{getActivityCountByPriority('high')} high</span>
                </div>
              </div>
              
              <div className="bg-white/90 rounded-lg p-3 shadow">
                <div className="text-sm text-gray-500">Service Requests</div>
                <div className="text-2xl font-bold">{getActivityCountByType('service')}</div>
                <div className="mt-2 text-xs text-gray-400">
                  {activities.filter(a => a.type === 'service' && a.status === 'in-progress').length} in progress
                </div>
              </div>
              
              <div className="bg-white/90 rounded-lg p-3 shadow">
                <div className="text-sm text-gray-500">Completed</div>
                <div className="text-2xl font-bold">{getActivityCountByType('completion')}</div>
                <div className="mt-2 text-xs text-green-500">
                  All tasks completed
                </div>
              </div>
            </div>
          </div>

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

                
              </div>

          {/* Filters */}
          <div className="p-4 pt-2">
            <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-xl p-3">
              <h3 className="text-white font-medium mb-2">Filter Activities</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-white/80 text-sm">Search:</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-white/70">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                      </svg>
                    </div>
                    <input 
                      type="text" 
                      className="input input-sm bg-white/20 text-white border-white/30 w-full ps-10"
                      placeholder="Search activities..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-white/80 text-sm">Type:</label>
                  <select 
                    className="select select-sm bg-white/20 text-white border-white/30 w-full"
                    value={typeFilter || ''}
                    onChange={(e) => setTypeFilter(e.target.value || null)}
                  >
                    <option value="">All Types</option>
                    <option value="assignment">Assignment</option>
                    <option value="completion">Completion</option>
                    <option value="alert">Alert</option>
                    <option value="login">Login</option>
                    <option value="update">Update</option>
                    <option value="service">Service</option>
                  </select>
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-white/80 text-sm">Priority:</label>
                  <select 
                    className="select select-sm bg-white/20 text-white border-white/30 w-full"
                    value={priorityFilter || ''}
                    onChange={(e) => setPriorityFilter(e.target.value || null)}
                  >
                    <option value="">All Priorities</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-white/80 text-sm">From:</label>
                  <input
                    type="date"
                    className="input input-sm bg-white/20 text-white border-white/30 w-full"
                    value={dateRange.start}
                    onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                  />
                </div>
                
                <div className="flex flex-col gap-1">
                  <label className="text-white/80 text-sm">To:</label>
                  <input
                    type="date"
                    className="input input-sm bg-white/20 text-white border-white/30 w-full"
                    value={dateRange.end}
                    onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="p-4 pt-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-lg text-primary"></span>
              </div>
            ) : error ? (
              <div className="alert alert-error">
                <span>{error}</span>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className=" backdrop-blur-sm rounded-xl p-8 text-center">
                <div className="text-gray-500 mb-2">
                  {typeFilter || priorityFilter || searchQuery ? 'No activities match your filters' : 'No activities found'}
                </div>
                {(typeFilter || priorityFilter || searchQuery) && (
                  <button 
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      setTypeFilter(null);
                      setPriorityFilter(null);
                      setSearchQuery('');
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
              
            ) : (
              <div className="space-y-6">
                {Object.keys(groupedActivities).map(date => (
                  <div key={date}>
                    <div className="relative flex items-center">
                      <div className="flex-grow border-t border-gray-300"></div>
                      <span className="flex-shrink mx-4 text-gray-600 bg-[#c8c87e] px-2 py-1 rounded-full text-sm font-medium">
                        {date}
                      </span>
                      <div className="flex-grow border-t border-gray-300"></div>
                    </div>
                    
                    <div className="mt-3 space-y-4">
                      {groupedActivities[date].map(activity => (
                        <div key={activity.id} className="bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow">
                          <div className="flex items-start gap-4">
                            {/* Activity icon */}
                            {getActivityIcon(activity.type)}
                            
                            {/* Activity details */}
                            <div className="flex-1">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h3 className="font-medium">{activity.description}</h3>
                                  <div className="text-sm text-gray-500 mt-1">
                                    {activity.user && <span className="mr-2">By: {activity.user}</span>}
                                    {activity.feName && <span className="mr-2">Engineer: {activity.feName}</span>}
                                    {activity.branchName && <span>Branch: {activity.branchName}</span>}
                                  </div>
                                </div>
                                
                                <div className="flex flex-col items-end">
                                  <div className="text-xs text-gray-500">
                                    {new Date(activity.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                  </div>
                                  {activity.priority && (
                                    <span className={`text-xs px-2 py-1 rounded-full mt-1 ${getPriorityColor(activity.priority)}`}>
                                      {activity.priority.charAt(0).toUpperCase() + activity.priority.slice(1)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              
                              {activity.status && (
                                <div className="mt-2 flex items-center">
                                  <span className={`px-2 py-1 text-xs rounded-full 
                                    ${activity.status === 'completed' || activity.status === 'resolved' ? 'bg-green-100 text-green-800' : 
                                      activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                                        activity.status === 'in-progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                    {activity.status.charAt(0).toUpperCase() + activity.status.slice(1)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
          </div>
        </div>
      </main>

      {/* Right sidebar - Activity Stats */}
      <aside className="bg-[#6b6f1d] hidden lg:flex w-80 shrink-0 flex-col backdrop-blur p-4 gap-4 overflow-y-auto">
        <h2 className="text-xl text-white font-semibold">Activity Statistics</h2>
        
        {/* Activity by Type Chart */}
        <div className="bg-white/90 rounded-xl p-4">
          <h3 className="font-medium mb-3">Activities by Type</h3>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Assignment</span>
                <span className="font-medium">{getActivityCountByType('assignment')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${(getActivityCountByType('assignment') / activities.length) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Alert</span>
                <span className="font-medium">{getActivityCountByType('alert')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-red-500 h-2.5 rounded-full" style={{ width: `${(getActivityCountByType('alert') / activities.length) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Service</span>
                <span className="font-medium">{getActivityCountByType('service')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-cyan-500 h-2.5 rounded-full" style={{ width: `${(getActivityCountByType('service') / activities.length) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Completion</span>
                <span className="font-medium">{getActivityCountByType('completion')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${(getActivityCountByType('completion') / activities.length) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Other</span>
                <span className="font-medium">{activities.length - 
                  (getActivityCountByType('assignment') + 
                   getActivityCountByType('alert') + 
                   getActivityCountByType('service') + 
                   getActivityCountByType('completion'))}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div className="bg-gray-500 h-2.5 rounded-full" style={{ width: `${((activities.length - 
                  (getActivityCountByType('assignment') + 
                   getActivityCountByType('alert') + 
                   getActivityCountByType('service') + 
                   getActivityCountByType('completion'))) / activities.length) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Activity by Priority */}
        <div className="bg-white/90 rounded-xl p-4">
          <h3 className="font-medium mb-3">Activities by Priority</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-100 rounded-lg p-3 text-center">
              <div className="text-blue-800 text-sm">Low</div>
              <div className="text-2xl font-bold text-blue-900">{getActivityCountByPriority('low')}</div>
            </div>
            <div className="bg-yellow-100 rounded-lg p-3 text-center">
              <div className="text-yellow-800 text-sm">Medium</div>
              <div className="text-2xl font-bold text-yellow-900">{getActivityCountByPriority('medium')}</div>
            </div>
            <div className="bg-orange-100 rounded-lg p-3 text-center">
              <div className="text-orange-800 text-sm">High</div>
              <div className="text-2xl font-bold text-orange-900">{getActivityCountByPriority('high')}</div>
            </div>
            <div className="bg-red-100 rounded-lg p-3 text-center">
              <div className="text-red-800 text-sm">Critical</div>
              <div className="text-2xl font-bold text-red-900">{getActivityCountByPriority('critical')}</div>
            </div>
          </div>
        </div>
        
        {/* Recent User Activity */}
        <div className="bg-white/90 rounded-xl p-4">
          <h3 className="font-medium mb-3">Recent User Activity</h3>
          <div className="space-y-3">
            {activities
              .filter(a => a.user)
              .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
              .slice(0, 4)
              .map((activity, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="avatar">
                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium">
                      {activity.user?.charAt(0)}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{activity.user}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(activity.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
        
        {/* Export Options */}
        <div className="mt-auto">
          <div className="bg-white/90 rounded-xl p-4">
            <h3 className="font-medium mb-3">Export Data</h3>
            <div className="flex gap-2">
              <button className="btn btn-sm flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13.5l3 3m0 0l3-3m-3 3v-6m1.06-4.19l2.12-2.12a1.5 1.5 0 112.11 2.12l-3.18 3.18M6 18L3 21m3-3l-3 3m0 0l3 3m-3-3h18" />
                </svg>
                CSV
              </button>
              <button className="btn btn-sm flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 mr-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                PDF
              </button>
            </div>
            
          </div>
        </div>
      </aside>
    </div>
  );
}

export default ActivityPage;