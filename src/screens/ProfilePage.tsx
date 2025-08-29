import React from 'react';
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaEdit } from 'react-icons/fa';
import basil from '../assets/FE.jpg';
import { FaAnchor } from 'react-icons/fa6';

const ProfilePage: React.FC = () => {
    return (
        <div className="min-h-screen  p-4 bg-[#6b6f1d]">
            
            <div className="max-w-4xl mx-auto">
                <div className="relative mb-8">
            {/* Back Button - positioned on the left */}
            <button 
                className="btn btn-outline btn-sm absolute left-0 " 
                onClick={() => window.history.back()}
            >
                Back
            </button>
            
            {/* Centered Heading */}
            <h1 className="text-3xl font-bold text-center">User Profile</h1>
        </div>
                
                <div className="card bg-base-100 shadow-xl">
                    <div className="card-body">
                        <div className="flex flex-col md:flex-row gap-8">
                            {/* Profile Picture Section */}
                            <div className="flex flex-col items-center">
                                <div className="avatar">
                                    <div className="w-48 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2">
                                        <img src={basil} alt="Profile" />
                                    </div>
                                </div>
                                <button className="btn btn-outline btn-sm mt-4">
                                    <FaEdit className="mr-2" /> Change Photo
                                </button>
                            </div>
                            
                            {/* Profile Info Section */}
                            <div className="flex-1">
                                <div className="stats stats-vertical w-full bg-base-200 text-base-content">
                                    <div className="stat">
                                        <div className="stat-title flex items-center">
                                            <FaUser className="mr-2" /> Name
                                        </div>
                                        <div className="stat-value text-xl">Basil Santiago</div>
                                        <div className="stat-actions">
                                            <button className="btn btn-xs">Edit</button>
                                        </div>
                                    </div>

                                     <div className="stat">
                                        <div className="stat-title flex items-center">
                                            <FaAnchor className="mr-2" /> Position
                                        </div>
                                        <div className="stat-value text-xl">Field Engineer</div>
                                        <div className="stat-actions">
                                            <button className="btn btn-xs">Edit</button>
                                        </div>
                                    </div>
                                    
                                    <div className="stat">
                                        <div className="stat-title flex items-center">
                                            <FaEnvelope className="mr-2" /> Email
                                        </div>
                                        <div className="stat-value text-xl">basantiago@equicom.com</div>
                                        <div className="stat-actions">
                                            <button className="btn btn-xs">Edit</button>
                                        </div>
                                    </div>
                                    
                                    <div className="stat">
                                        <div className="stat-title flex items-center">
                                            <FaPhone className="mr-2" /> Phone
                                        </div>
                                        <div className="stat-value text-xl">+639606818007</div>
                                        <div className="stat-actions">
                                            <button className="btn btn-xs">Edit</button>
                                        </div>
                                    </div>
                                    
                                    <div className="stat">
                                        <div className="stat-title flex items-center">
                                            <FaMapMarkerAlt className="mr-2" /> Location
                                        </div>
                                        <div className="stat-value text-xl">Imus, PH</div>
                                        <div className="stat-actions">
                                            <button className="btn btn-xs">Edit</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                         <div className="stats shadow">
                        <div className="stat">
                            <div className="stat-figure text-primary">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                className="inline-block h-8 w-8 stroke-green-300"
                            >
                                <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                                ></path>
                            </svg>
                            </div>
                            <div className="stat-title">Rating</div>
                            <div className="stat-value text-green-300 ">8/10</div>
                            <div className="stat-desc">1% increase since last month</div>
                        </div>

                        <div className="stat">
                            <div className="stat-figure text-secondary">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill="none"
                                viewBox="0 0 24 24"
                                className="inline-block h-8 w-8 stroke-current"
                            >
                                <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M13 10V3L4 14h7v7l9-11h-7z"
                                ></path>
                            </svg>
                            </div>
                            <div className="stat-title">Service Request</div>
                            <div className="stat-value text-secondary">98</div>
                            <div className="stat-desc">21% more than last month</div>
                        </div>

                        <div className="stat">
                            <div className="stat-figure text-secondary">
                            <div className="avatar avatar-online">
                                <div className="w-16 rounded-full">
                                <img src={basil} />
                                </div>
                            </div>
                            </div>
                            <div className="stat-value">86%</div>
                            <div className="stat-title">Tasks done</div>
                            <div className="stat-desc text-secondary">31 tasks remaining</div>
                        </div>
                        </div>
                        
                        {/* Additional Profile Sections */}
                        <div className="divider">Bio</div>
                        <div className="bg-base-200 p-4 rounded-lg">
                            <p>Pinaka malupet na FE sa buong kasaysayan ng FE sa ECS.</p>
                            <button className="btn btn-outline btn-xs mt-2">Edit Bio</button>
                        </div>
                       
                        
                        <div className="divider">Account Settings</div>
                        <div className="flex flex-col gap-2">
                            <button className="btn btn-outline">Change Password</button>
                            <button className="btn btn-outline">Privacy Settings</button>
                            
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;