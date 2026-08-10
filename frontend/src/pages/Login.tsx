import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config';

export const Login: React.FC = () => {
    const [isChecking, setIsChecking] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/auth/status`);
            if (res.data.authenticated) {
                // Authenticated - redirect to feed
                setIsAuthenticated(true);
                navigate('/');
            } else {
                setIsAuthenticated(false);
            }
        } catch (err) {
            setIsAuthenticated(false);
        } finally {
            setIsChecking(false);
        }
    };

    // Loading state - brief, no spinner needed
    if (isChecking) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950" />
        );
    }

    // Already authenticated - this shouldn't show (redirect happens), but just in case
    if (isAuthenticated) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 bg-gradient-to-r from-cyan-400 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                    </div>
                    <p className="text-white mb-4">Already logged in!</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-full text-white font-medium"
                    >
                        Go to Feed
                    </button>
                </div>
            </div>
        );
    }

    // Not authenticated - show "not configured" message
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center p-6">
            <div className="max-w-sm w-full text-center">
                {/* Logo */}
                <div className="relative inline-block mb-6">
                    <div className="w-20 h-20 bg-gradient-to-r from-cyan-400 to-pink-500 rounded-2xl rotate-12 absolute -inset-1 blur-lg opacity-50" />
                    <div className="relative w-20 h-20 bg-gradient-to-r from-cyan-400 to-pink-500 rounded-2xl flex items-center justify-center">
                        <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">kv-tiktok</h1>
                <p className="text-gray-500 text-sm mb-8">Ad-free TikTok viewing</p>

                {/* Not Configured Message */}
                <div className="bg-white/5 rounded-2xl p-6 mb-6">
                    <div className="w-12 h-12 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-6 h-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                        </svg>
                    </div>
                    <h2 className="text-white font-medium mb-2">Not Configured</h2>
                    <p className="text-gray-400 text-sm">
                        This app needs TikTok cookies to work. Please contact the administrator.
                    </p>
                </div>

                {/* Admin Link (subtle) */}
                <a
                    href="/admin"
                    className="text-white/30 text-xs hover:text-white/50 transition-colors"
                >
                    Admin Access →
                </a>
            </div>
        </div>
    );
};
