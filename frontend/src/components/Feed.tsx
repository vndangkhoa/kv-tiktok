import React, { useState, useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { SkeletonFeed } from './SkeletonFeed';
import { Sidebar } from './Sidebar';
import type { Video } from '../types';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { videoPrefetcher } from '../utils/videoPrefetch';
import { feedLoader } from '../utils/feedLoader';

type ViewState = 'login' | 'loading' | 'feed';
type TabType = 'foryou' | 'likes';

export const Feed: React.FC = () => {
    const [viewState, setViewState] = useState<ViewState>('login');
    const [activeTab, setActiveTab] = useState<TabType>('foryou');
    const [videos, setVideos] = useState<Video[]>([]);
    const [likesVideos, setLikesVideos] = useState<Video[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [jsonInput, setJsonInput] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [isFetching, setIsFetching] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const likesContainerRef = useRef<HTMLDivElement>(null);
    const [likesCurrentIndex, setLikesCurrentIndex] = useState(0);

    useEffect(() => {
        checkAuthStatus();
    }, []);

    useEffect(() => {
        const prefetch = async () => {
            await videoPrefetcher.init();
            const currentVideos = activeTab === 'foryou' ? videos : likesVideos;
            const currentIdx = activeTab === 'foryou' ? currentIndex : likesCurrentIndex;
            videoPrefetcher.prefetchNext(currentVideos, currentIdx);
        };
        prefetch();
    }, [currentIndex, likesCurrentIndex, videos, likesVideos, activeTab]);

    useEffect(() => {
        const ref = activeTab === 'foryou' ? containerRef : likesContainerRef;
        if (ref.current) {
            const targetScroll = (activeTab === 'foryou' ? currentIndex : likesCurrentIndex) * ref.current.clientHeight;
            if (Math.abs(ref.current.scrollTop - targetScroll) > 50) {
                ref.current.scrollTo({ top: targetScroll, behavior: 'auto' });
            }
        }
    }, [videos, likesVideos, activeTab]);

    const checkAuthStatus = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/auth/status`);
            if (res.data.authenticated) {
                loadFeed();
                loadLikesFeed();
            }
        } catch (err) {
            console.log('Not authenticated');
        }
    };

    const handleBrowserLogin = async () => {
        setViewState('loading');
        setError(null);
        try {
            const res = await axios.post(`${API_BASE_URL}/auth/browser-login`);
            if (res.data.status === 'success') {
                loadFeed();
                loadLikesFeed();
            } else {
                setError(res.data.message || 'Login failed');
                setViewState('login');
            }
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Login failed');
            setViewState('login');
        }
    };

    const handleJsonLogin = async () => {
        if (!jsonInput.trim()) {
            setError('Please paste your credentials');
            return;
        }
        setViewState('loading');
        setError(null);
        try {
            const credentials = JSON.parse(jsonInput);
            await axios.post(`${API_BASE_URL}/auth/credentials`, { credentials });
            loadFeed();
            loadLikesFeed();
        } catch (err: any) {
            setError(err.message || 'Invalid JSON format');
            setViewState('login');
        }
    };

    const loadFeed = async () => {
        setViewState('loading');
        setError(null);
        try {
            const videos = await feedLoader.loadFeedWithOptimization(
                false,
                (loaded: Video[]) => {
                    if (loaded.length > 0) {
                        setVideos(loaded);
                        setViewState('feed');
                        videoPrefetcher.prefetchInitialBatch(loaded, 3);
                    }
                }
            );
            if (videos.length === 0) {
                console.warn('Feed empty, but authenticated.');
                setViewState('feed');
                setError('No videos found. Pull to refresh.');
            }
        } catch (err: any) {
            console.error('Feed load failed:', err);
            if (err.response?.status === 401) {
                setError('Session expired. Please login again.');
                setViewState('login');
            } else {
                setError(err.response?.data?.detail || 'Failed to load feed');
                setViewState('feed');
            }
        }
    };

    const loadLikesFeed = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/following`);
            const followingList = res.data || [];
            if (followingList.length > 0) {
                const username = followingList[0];
                const videosRes = await axios.get(`${API_BASE_URL}/user/liked?username=${username}&limit=30`);
                if (videosRes.data.videos) {
                    setLikesVideos(videosRes.data.videos);
                }
            }
        } catch (err) {
            console.error('Failed to load likes:', err);
        }
    };

    const handleScroll = () => {
        if (containerRef.current) {
            const { scrollTop, clientHeight } = containerRef.current;
            const index = Math.round(scrollTop / clientHeight);
            if (index !== currentIndex) {
                setCurrentIndex(index);
            }
            const watchedPercent = videos.length > 0 ? (index + 1) / videos.length : 0;
            if (watchedPercent >= 0.6 && hasMore && !isFetching && videos.length > 0) {
                loadMoreVideos();
            }
        }
    };

    const handleLikesScroll = () => {
        if (likesContainerRef.current) {
            const { scrollTop, clientHeight } = likesContainerRef.current;
            const index = Math.round(scrollTop / clientHeight);
            if (index !== likesCurrentIndex) {
                setLikesCurrentIndex(index);
            }
        }
    };

    const loadMoreVideos = async () => {
        if (isFetching || !hasMore) return;
        setIsFetching(true);
        try {
            const newVideos = await feedLoader.loadFeedWithOptimization(false, undefined, true);
            setVideos(prev => {
                const existingIds = new Set(prev.map(v => v.id));
                const unique = newVideos.filter((v: Video) => !existingIds.has(v.id));
                if (unique.length === 0) setHasMore(false);
                return [...prev, ...unique];
            });
        } catch (err) {
            console.error('Failed to load more:', err);
        } finally {
            setIsFetching(false);
        }
    };

    const handleLogout = async () => {
        await axios.post(`${API_BASE_URL}/auth/logout`);
        setVideos([]);
        setLikesVideos([]);
        setViewState('login');
    };

    if (viewState === 'login') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex flex-col">
                <div className="flex-shrink-0 pt-12 pb-6 px-6 text-center">
                    <div className="relative inline-block mb-4">
                        <div className="w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-300 rounded-2xl rotate-12 absolute -inset-1 blur-lg opacity-50" />
                        <div className="relative w-16 h-16 bg-gradient-to-r from-gray-400 to-gray-300 rounded-2xl flex items-center justify-center">
                            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-1">PureStream</h1>
                    <p className="text-gray-500 text-sm">Ad-free TikTok viewing</p>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-8">
                    <div className="max-w-sm mx-auto">
                        {error && (
                            <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center">
                                {error}
                            </div>
                        )}

                        <div className="mb-6">
                            <h2 className="text-white font-semibold text-lg mb-4 text-center">How to Login</h2>
                            <div className="space-y-3">
                                <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
                                    <div className="w-7 h-7 bg-gray-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">1</div>
                                    <div>
                                        <p className="text-white text-sm font-medium">Open TikTok in browser</p>
                                        <p className="text-gray-500 text-xs mt-0.5">Use Chrome/Safari on your phone or computer</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
                                    <div className="w-7 h-7 bg-gray-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">2</div>
                                    <div>
                                        <p className="text-white text-sm font-medium">Export your cookies</p>
                                        <p className="text-gray-500 text-xs mt-0.5">Use "Cookie-Editor" extension (Chrome/Firefox)</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3 p-3 bg-white/5 rounded-xl">
                                    <div className="w-7 h-7 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-sm">3</div>
                                    <div>
                                        <p className="text-white text-sm font-medium">Paste cookies below</p>
                                        <p className="text-gray-500 text-xs mt-0.5">Copy the JSON and paste it here</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mb-4">
                            <textarea
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                placeholder='Paste your cookie JSON here...'
                                className="w-full h-32 bg-black/60 border-2 border-white/10 rounded-2xl p-4 text-white text-sm font-mono resize-none focus:outline-none focus:border-gray-400/50 placeholder:text-gray-600"
                            />
                        </div>

                        <button
                            onClick={handleJsonLogin}
                            disabled={!jsonInput.trim()}
                            className={`w-full py-4 text-white font-semibold rounded-2xl transition-all transform active:scale-[0.98] shadow-lg text-base ${jsonInput.trim()
                                ? 'bg-gradient-to-r from-gray-500 to-gray-400 hover:from-gray-400 hover:to-gray-300 shadow-gray-500/20'
                                : 'bg-gray-700 cursor-not-allowed'
                                }`}
                        >
                            Connect to TikTok
                        </button>

                        <div className="mt-6 text-center">
                            <a
                                href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white/70 text-sm underline"
                            >
                                Get Cookie-Editor Extension
                            </a>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/10">
                            <button
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="w-full text-gray-500 hover:text-gray-400 text-sm py-2 flex items-center justify-center gap-2"
                            >
                                <span>{showAdvanced ? '▲' : '▼'}</span>
                                <span>Desktop Browser Login</span>
                            </button>

                            {showAdvanced && (
                                <div className="mt-3 p-4 bg-white/5 rounded-xl">
                                    <p className="text-gray-400 text-xs text-center mb-3">
                                        Only works on local machines with a display
                                    </p>
                                    <button
                                        onClick={handleBrowserLogin}
                                        className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all text-sm"
                                    >
                                        Open TikTok Login Window
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (viewState === 'loading') {
        return <SkeletonFeed />;
    }

    return (
        <div className="flex w-full h-screen bg-[#0f0f15] text-white overflow-hidden">
            <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => {
                    setActiveTab(tab);
                    if (tab === 'foryou' && videos.length === 0) loadFeed();
                    if (tab === 'likes' && likesVideos.length === 0) loadLikesFeed();
                }}
            />

            <div className="flex-1 relative w-full h-full overflow-hidden">
                <button
                    onClick={handleLogout}
                    className="absolute top-6 right-6 z-50 w-10 h-10 flex items-center justify-center bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-all duration-300"
                    title="Logout"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                        <polyline points="16,17 21,12 16,7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </button>

                <div className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${activeTab === 'foryou' ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
                    <div className={`absolute bottom-6 right-4 z-40 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-white/10 transition-all ${isFetching ? 'animate-pulse border-gray-400/50' : ''}`}>
                        <span className="text-xs text-white/60 font-medium">
                            {isFetching ? (
                                <span className="text-white/70">Loading {currentIndex + 1}/{videos.length}...</span>
                            ) : (
                                <>
                                    {currentIndex + 1} / {videos.length}
                                    {hasMore && <span className="text-white/70 ml-1">+</span>}
                                </>
                            )}
                        </span>
                    </div>

                    <div
                        ref={containerRef}
                        onScroll={handleScroll}
                        className="w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {videos.map((video, index) => (
                            <div key={video.id} className="w-full h-screen-safe snap-start snap-always bg-black">
                                {Math.abs(index - currentIndex) <= 1 ? (
                                    <VideoPlayer
                                        video={video}
                                        isActive={activeTab === 'foryou' && index === currentIndex}
                                        isMuted={isMuted}
                                        onMuteToggle={() => setIsMuted(prev => !prev)}
                                    />
                                ) : (
                                    <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
                                        {video.thumbnail ? (
                                            <>
                                                <img
                                                    src={video.thumbnail}
                                                    className="w-full h-full object-cover opacity-30 blur-xl scale-110"
                                                    loading="lazy"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <div className="w-10 h-10 border-4 border-white/10 border-t-white/30 rounded-full animate-spin" />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-10 h-10 border-4 border-white/10 border-t-white/30 rounded-full animate-spin" />
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${activeTab === 'likes' ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'}`}>
                    <div className="absolute bottom-6 right-4 z-40 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-white/10">
                        <span className="text-xs text-white/60 font-medium">
                            {likesCurrentIndex + 1} / {likesVideos.length}
                        </span>
                    </div>

                    <div
                        ref={likesContainerRef}
                        onScroll={handleLikesScroll}
                        className="w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {likesVideos.length > 0 ? (
                            likesVideos.map((video, index) => (
                                <div key={video.id} className="w-full h-screen-safe snap-start snap-always bg-black">
                                    {Math.abs(index - likesCurrentIndex) <= 1 ? (
                                        <VideoPlayer
                                            video={video}
                                            isActive={activeTab === 'likes' && index === likesCurrentIndex}
                                            isMuted={isMuted}
                                            onMuteToggle={() => setIsMuted(prev => !prev)}
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-black flex items-center justify-center relative overflow-hidden">
                                            {video.thumbnail ? (
                                                <>
                                                    <img
                                                        src={video.thumbnail}
                                                        className="w-full h-full object-cover opacity-30 blur-xl scale-110"
                                                        loading="lazy"
                                                    />
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <div className="w-10 h-10 border-4 border-white/10 border-t-white/30 rounded-full animate-spin" />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="w-10 h-10 border-4 border-white/10 border-t-white/30 rounded-full animate-spin" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-black">
                                <svg className="w-16 h-16 text-white/20 mb-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                <p className="text-white/40 text-sm">No liked videos yet</p>
                                <p className="text-white/20 text-xs mt-2">Double-tap videos to like them</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};