import React, { useState, useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { SkeletonFeed } from './SkeletonFeed';
import { Sidebar } from './Sidebar';
import type { Video, UserProfile } from '../types';
import axios from 'axios';
import { API_BASE_URL } from '../config';
import { Search, X, Plus } from 'lucide-react';
import { videoPrefetcher } from '../utils/videoPrefetch';
import { feedLoader } from '../utils/feedLoader';

type ViewState = 'login' | 'loading' | 'feed';
type TabType = 'foryou' | 'search' | 'following' | 'profile';

// Suggested categories for Following tab
const SUGGESTED_CATEGORIES = [
    { id: 'hot_trend', name: '🔥 Hot Trend 2024', query: 'hot trend' },
    { id: 'dance_vn', name: '💃 Gái Xinh Nhảy', query: 'gai xinh nhay' },
    { id: 'sexy_dance', name: '✨ Sexy Dance', query: 'sexy dance vietnam' },
    { id: 'music_remix', name: '🎵 Nhạc Remix TikTok', query: 'nhac remix tiktok' },
    { id: 'kpop_cover', name: '🇰🇷 K-pop Cover', query: 'kpop dance cover' },
    { id: 'comedy', name: '😂 Hài Hước', query: 'hai huoc vietnam' },
];

// Famous Dance TikTokers - 50+ accounts from around the world
const SUGGESTED_ACCOUNTS = [
    // === GLOBAL STARS ===
    { username: '@charlidamelio', label: '👑 Charli D\'Amelio - Queen' },
    { username: '@addisonre', label: '✨ Addison Rae' },
    { username: '@bellapoarch', label: '🎵 Bella Poarch' },
    { username: '@khloekardashian', label: '💫 Khloé Kardashian' },
    { username: '@jfrancesch', label: '💃 Jason Derulo' },
    { username: '@justmaiko', label: '🔥 Michael Le' },
    { username: '@thereal.animations', label: '🎭 Dance Animations' },
    { username: '@willsmith', label: '🌟 Will Smith' },
    // === K-POP & ASIAN ===
    { username: '@lisa_blackpink', label: '🖤💖 LISA BLACKPINK' },
    { username: '@bfrancisco', label: '🇵🇭 Bella Francisco' },
    { username: '@niana_guerrero', label: '🌈 Niana Guerrero' },
    { username: '@ranz', label: '🎤 Ranz Kyle' },
    { username: '@1milliondance', label: '💯 1Million Dance' },
    { username: '@babymonsteryg', label: '🐾 BABYMONSTER' },
    { username: '@enhypen', label: '🎵 ENHYPEN' },
    { username: '@aespaficial', label: '✨ aespa' },
    { username: '@itzy.all.in.us', label: '💪 ITZY' },
    { username: '@straykids_official', label: '🔥 Stray Kids' },
    // === DANCE CREWS ===
    { username: '@thechipmunks', label: '🐿️ The Chipmunks' },
    { username: '@thekinjaz', label: '🎯 The Kinjaz' },
    { username: '@jabbawockeez', label: '🎭 Jabbawockeez' },
    { username: '@worldofdance', label: '🌍 World of Dance' },
    { username: '@dancemoms', label: '👯 Dance Moms' },
    // === VIRAL DANCERS ===
    { username: '@mikimakey', label: '🎀 Miki Makey' },
    { username: '@enola_bedard', label: '🇫🇷 Énola Bédard' },
    { username: '@lizzy_wurst', label: '😊 Lizzy Wurst' },
    { username: '@thepaigeniemann', label: '⭐ Paige Niemann' },
    { username: '@brentrivera', label: '😄 Brent Rivera' },
    { username: '@larray', label: '💅 Larray' },
    { username: '@avani', label: '🖤 Avani' },
    { username: '@noahbeck', label: '🏃 Noah Beck' },
    { username: '@lilhuddy', label: '🎸 Lil Huddy' },
    // === VIETNAMESE (Verified Usernames) ===
    { username: '@cciinnn', label: '👑 CiiN (Bùi Thảo Ly)' },
    { username: '@hoaa.hanassii', label: '💃 Hoa Hanassii' },
    { username: '@lebong95', label: '💪 Lê Bống' },
    { username: '@tieu_hy26', label: '👰 Tiểu Hý' },
    { username: '@hieuthuhai2222', label: '🎧 HIEUTHUHAI' },
    { username: '@mtp.fan', label: '🎤 Sơn Tùng M-TP' },
    { username: '@changmakeup', label: '💄 Changmakeup' },
    { username: '@theanh28entertainment', label: '🎬 Theanh28' },
    { username: '@quangdangofficial', label: '🕺 Quang Đăng' },
    { username: '@chipu88', label: '🎤 Chi Pu' },
    { username: '@minhhangofficial', label: '👑 Minh Hằng' },
    // === CHOREOGRAPHERS ===
    { username: '@chloearnold', label: '🎬 Chloe Arnold' },
    { username: '@alexis_beauregard', label: '🌟 Alexis Beauregard' },
    { username: '@mattiapolibio', label: '⭐ Mattia Polibio' },
    { username: '@jawsh685', label: '🎧 Jawsh 685' },
    { username: '@daviddooboy', label: '🕺 David Vu' },
    // === FUN & COMEDY DANCE ===
    { username: '@domainichael', label: '😂 Domaini Michael' },
    { username: '@jailifebymike', label: '💃 Jai Life' },
    { username: '@dancewithjulian', label: '🎭 Julian' },
    { username: '@leiasfanpage', label: '💖 Leia' },
    { username: '@taylerholder', label: '🔥 Tayler Holder' },
];

// NOTE: Keyword search is now handled by the backend /api/user/search endpoint

export const Feed: React.FC = () => {
    const [viewState, setViewState] = useState<ViewState>('login');
    const [activeTab, setActiveTab] = useState<TabType>('foryou');
    const [videos, setVideos] = useState<Video[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [searchCursor, setSearchCursor] = useState(0);
    const [searchHasMore, setSearchHasMore] = useState(true);
    const [isInSearchPlayback, setIsInSearchPlayback] = useState(false);
    const [originalVideos, setOriginalVideos] = useState<Video[]>([]);
    const [originalIndex, setOriginalIndex] = useState(0);
    const [jsonInput, setJsonInput] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    // Following state
    const [following, setFollowing] = useState<string[]>([]);
    const [newFollowInput, setNewFollowInput] = useState('');

    // Suggested profiles with real data
    const [suggestedProfiles, setSuggestedProfiles] = useState<UserProfile[]>([]);
    const [loadingProfiles, setLoadingProfiles] = useState(false);
    const [suggestedLimit, setSuggestedLimit] = useState(12);
    const [showHeader, setShowHeader] = useState(false);
    const [isFollowingFeed, setIsFollowingFeed] = useState(false);
    // Lazy load - start with 12

    // Search state
    const [searchInput, setSearchInput] = useState('');
    const [searchResults, setSearchResults] = useState<Video[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [searchMatchedUser, setSearchMatchedUser] = useState<UserProfile | null>(null);

    // Global mute state - persists across video scrolling
    const [isMuted, setIsMuted] = useState(true);

    // Profile View state - grid of videos from a specific user
    const [profileViewUsername, setProfileViewUsername] = useState<string | null>(null);
    const [profileVideos, setProfileVideos] = useState<Video[]>([]);
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileHasMore, setProfileHasMore] = useState(true);
    const [profileUserData, setProfileUserData] = useState<UserProfile | null>(null);
    const profileGridRef = useRef<HTMLDivElement>(null);

    // Loading timer state - shows elapsed time during video crawling
    const [loadingElapsed, setLoadingElapsed] = useState(0);
    const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Start/stop loading timer helper functions
    const startLoadingTimer = () => {
        setLoadingElapsed(0);
        loadingTimerRef.current = setInterval(() => {
            setLoadingElapsed(prev => prev + 1);
        }, 1000);
    };

    const stopLoadingTimer = () => {
        if (loadingTimerRef.current) {
            clearInterval(loadingTimerRef.current);
            loadingTimerRef.current = null;
        }
    };

    // ========== SWIPE LOGIC ==========
    const touchStart = useRef<number | null>(null);
    const touchEnd = useRef<number | null>(null);
    const minSwipeDistance = 50;

    // Touch Handling (Mobile)
    const onTouchStart = (e: React.TouchEvent) => {
        touchEnd.current = null;
        touchStart.current = e.targetTouches[0].clientX;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        touchEnd.current = e.targetTouches[0].clientX;
    };

    const onTouchEnd = () => {
        handleSwipeEnd();
    };

    // Mouse Handling (Desktop)
    const onMouseDown = (e: React.MouseEvent) => {
        touchEnd.current = null;
        touchStart.current = e.clientX;
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (e.buttons === 1) { // Only track if left button held
            touchEnd.current = e.clientX;
        }
    };

    const onMouseUp = () => {
        if (touchStart.current) {
            // Handle click vs swipe
            // If minimal movement, treat as click/tap (handled by onClick elsewhere, but for header toggle we need it here?)
            // Actually, onMouseUp is better for swipe end.
            handleSwipeEnd();
        }
        touchStart.current = null;
        touchEnd.current = null;
    };

    const handleSwipeEnd = () => {
        if (!touchStart.current || !touchEnd.current) return;

        const distanceX = touchStart.current - touchEnd.current;
        const isLeftSwipe = distanceX > minSwipeDistance;
        const isRightSwipe = distanceX < -minSwipeDistance;

        if (isLeftSwipe) {
            if (activeTab === 'foryou') { setActiveTab('search'); setShowHeader(true); }
        } else if (isRightSwipe) {
            if (activeTab === 'search') { setActiveTab('foryou'); setShowHeader(true); }
        } else {
            // Minor movement - Do nothing (Tap is handled by video click)
        }

        if (activeTab === 'foryou') {
            setTimeout(() => setShowHeader(false), 3000);
        }
    };

    // Check auth status on mount
    useEffect(() => {
        checkAuthStatus();
    }, []);

    // Load following list when authenticated
    useEffect(() => {
        if (viewState === 'feed') {
            loadFollowing();
        }
    }, [viewState]);

    // Load suggested profiles on first load
    useEffect(() => {
        if (suggestedProfiles.length === 0 && !loadingProfiles) {
            loadSuggestedProfiles();
        }
    }, []);

    // Keyboard arrow navigation for desktop
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle when in feed view and not typing in an input
            if (viewState !== 'feed') return;
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (activeTab === 'foryou') setActiveTab('search');
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (activeTab === 'search') setActiveTab('foryou');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTab, viewState]);

    useEffect(() => {
        const prefetch = async () => {
            await videoPrefetcher.init();
            if (activeTab === 'foryou') {
                videoPrefetcher.prefetchNext(videos, currentIndex);
            }
        };

        prefetch();
    }, [currentIndex, videos, activeTab]);

    // Scrolls to the current index when the videos list changes or when we enter/exit search playback
    // This fixes the "blur screen" bug where the previous scroll position persisted after swapping video lists
    useEffect(() => {
        if (activeTab === 'foryou' && containerRef.current && videos.length > 0) {
            const targetScroll = currentIndex * containerRef.current.clientHeight;
            // Only scroll if significantly off (allow small manual adjustments)
            if (Math.abs(containerRef.current.scrollTop - targetScroll) > 50) {
                containerRef.current.scrollTo({
                    top: targetScroll,
                    behavior: 'auto' // Instant jump to prevent weird visual sliding on list swap
                });
            }
        }
    }, [videos, activeTab, isInSearchPlayback]); // Dependencies needed to trigger on list swap

    const loadSuggestedProfiles = async () => {
        setLoadingProfiles(true);
        try {
            // Try the dynamic suggested API first (auto-updates from TikTok Vietnam)
            const res = await axios.get(`${API_BASE_URL}/user/suggested?limit=50`);
            const accounts = res.data.accounts || [];

            if (accounts.length > 0) {
                // Map API response to our profile format
                setSuggestedProfiles(accounts.map((acc: any) => ({
                    username: acc.username,
                    nickname: acc.nickname || acc.username,
                    avatar: acc.avatar || null,
                    followers: acc.followers || 0,
                    verified: acc.verified || false
                })));
            } else {
                // Fallback to static list if API returns empty
                setSuggestedProfiles(SUGGESTED_ACCOUNTS.map(a => ({
                    username: a.username.replace('@', ''),
                    nickname: a.label
                })));
            }
        } catch (err) {
            console.error('Failed to load profiles:', err);
            // Fallback to static list on error
            setSuggestedProfiles(SUGGESTED_ACCOUNTS.map(a => ({
                username: a.username.replace('@', ''),
                nickname: a.label
            })));
        } finally {
            setLoadingProfiles(false);
        }
    };

    const checkAuthStatus = async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/auth/status`);
            if (res.data.authenticated) {
                loadFeed();
            }
        } catch (err) {
            console.log('Not authenticated');
        }
    };

    const loadFollowing = async () => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/following`);
            setFollowing(data);
        } catch (error) {
            console.error('Error loading following list:', error);
        }
    };

    const handleFollow = async (username: string) => {
        const cleanUsername = username.replace('@', '');

        if (following.includes(cleanUsername)) {
            // Unfollow
            await axios.delete(`${API_BASE_URL}/following/${cleanUsername}`);
            setFollowing(prev => prev.filter(u => u !== cleanUsername));
        } else {
            // Follow
            await axios.post(`${API_BASE_URL}/following`, { username: cleanUsername });
            setFollowing(prev => [...prev, cleanUsername]);
        }
    };

    const handleAddFollow = async () => {
        if (!newFollowInput.trim()) return;
        await handleFollow(newFollowInput);
        setNewFollowInput('');
    };

    const handleBrowserLogin = async () => {
        setViewState('loading');
        setError(null);

        try {
            const res = await axios.post(`${API_BASE_URL}/auth/browser-login`);
            if (res.data.status === 'success') {
                loadFeed();
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

                        // Start prefetching first 3 videos immediately
                        videoPrefetcher.prefetchInitialBatch(loaded, 3);
                    }
                }
            );

            if (videos.length === 0) {
                // If authenticated but no videos, stay in feed view but show empty state
                // Do NOT go back to login, as that confuses the user (they are logged in)
                console.warn('Feed empty, but authenticated.');
                setViewState('feed');
                setError('No videos found. Pull to refresh or try searching.');
            }
        } catch (err: any) {
            console.error('Feed load failed:', err);
            // Only go back to login if it's explicitly an Auth error (401)
            if (err.response?.status === 401) {
                setError('Session expired. Please login again.');
                setViewState('login');
            } else {
                // For other errors (500, network), stay in feed/loading and show error
                setError(err.response?.data?.detail || 'Failed to load feed');
                setViewState('feed');
            }
        }
    };

    const [isFetching, setIsFetching] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    const handleScroll = () => {
        if (containerRef.current) {
            const { scrollTop, clientHeight } = containerRef.current;
            const index = Math.round(scrollTop / clientHeight);
            if (index !== currentIndex) {
                setCurrentIndex(index);
            }

            // Preemptive fetch at 60%
            const watchedPercent = videos.length > 0 ? (index + 1) / videos.length : 0;
            if (watchedPercent >= 0.6 && hasMore && !isFetching && videos.length > 0) {
                loadMoreVideos();
            }
        }
    };

    const loadMoreVideos = async () => {
        if (isFetching || !hasMore) return;
        setIsFetching(true);

        try {
            // Pass skipCache=true to force fetching fresh videos from backend
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
        setViewState('login');
    };

    // Direct username search
    const searchByUsername = async (username: string) => {
        setSearchInput(`@${username}`);
        setActiveTab('search');
        handleSearch(false, `@${username}`);
    };

    // Open profile view with video grid
    const openProfileView = async (username: string) => {
        const cleanUsername = username.replace('@', '');
        setProfileViewUsername(cleanUsername);
        setProfileVideos([]);
        setProfileLoading(true);
        setProfileHasMore(true);
        setProfileUserData(null);
        startLoadingTimer(); // Start countdown timer

        // Pause the currently playing video by switching active tab temporarily
        // This triggers VideoPlayer's isActive=false which pauses the video
        setActiveTab('search'); // Switch away from 'foryou' to pause video

        try {
            // Fetch user profile data first (show header ASAP)
            const profileRes = await axios.get(`${API_BASE_URL}/user/profile?username=${cleanUsername}`);
            setProfileUserData(profileRes.data);

            // Fetch videos progressively - load smaller batches and show immediately
            const batchSize = 5;
            let totalFetched = 0;
            const maxVideos = 20;

            while (totalFetched < maxVideos) {
                const videosRes = await axios.get(`${API_BASE_URL}/user/videos?username=${cleanUsername}&limit=${batchSize}&offset=${totalFetched}`);
                const newVideos = videosRes.data.videos || [];

                if (newVideos.length === 0) {
                    setProfileHasMore(false);
                    break;
                }

                // Append videos immediately as they load (progressive loading) - filter duplicates
                setProfileVideos(prev => {
                    const existingIds = new Set(prev.map(v => v.id));
                    const uniqueNewVideos = newVideos.filter((v: Video) => !existingIds.has(v.id));
                    return [...prev, ...uniqueNewVideos];
                });
                totalFetched += newVideos.length;

                // If we got less than batch size, no more videos
                if (newVideos.length < batchSize) {
                    setProfileHasMore(false);
                    break;
                }
            }

            // Check if there might be more videos beyond initial 20
            if (totalFetched >= maxVideos) {
                setProfileHasMore(true);
            }
        } catch (err) {
            console.error('Error loading profile:', err);
            setError('Failed to load profile');
        } finally {
            setProfileLoading(false);
            stopLoadingTimer(); // Stop countdown timer
        }
    };

    // Load more profile videos (lazy load)
    const loadMoreProfileVideos = async () => {
        if (!profileViewUsername || profileLoading || !profileHasMore) return;
        setProfileLoading(true);

        try {
            // Use offset/cursor for pagination
            const offset = profileVideos.length;
            const videosRes = await axios.get(`${API_BASE_URL}/user/videos?username=${profileViewUsername}&limit=20&offset=${offset}`);
            const newVideos = videosRes.data.videos || [];

            if (newVideos.length === 0) {
                setProfileHasMore(false);
            } else {
                setProfileVideos(prev => [...prev, ...newVideos]);
                setProfileHasMore(newVideos.length >= 20);
            }
        } catch (err) {
            console.error('Error loading more profile videos:', err);
        } finally {
            setProfileLoading(false);
        }
    };

    // Close profile view
    const closeProfileView = () => {
        setProfileViewUsername(null);
        setProfileVideos([]);
        setProfileUserData(null);
    };

    // Handle profile grid scroll for lazy loading
    const handleProfileGridScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 200 && profileHasMore && !profileLoading) {
            loadMoreProfileVideos();
        }
    };

    // Direct keyword search
    const searchByKeyword = async (keyword: string) => {
        setSearchInput(keyword);
        setActiveTab('search');
        handleSearch(false, keyword);
    };

    const handleSearch = async (isMore = false, overrideInput?: string) => {
        const inputToSearch = overrideInput || searchInput;
        if (!inputToSearch.trim() || isSearching) return;

        const cacheKey = `search_${inputToSearch.toLowerCase().trim()}`;

        // Check cache first (only for new searches, not "load more")
        if (!isMore) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const { results, timestamp } = JSON.parse(cached);
                    // Use cache if less than 5 minutes old
                    if (Date.now() - timestamp < 5 * 60 * 1000 && results.length > 0) {
                        setSearchResults(results);
                        setSearchHasMore(results.length >= 20);
                        console.log('Using cached results for:', inputToSearch);
                        return;
                    }
                } catch (e) {
                    console.log('Cache parse error, fetching fresh');
                }
            }
        }

        setIsSearching(true);
        setError(null);

        // Clear previous results immediately if starting a new search
        if (!isMore) {
            setSearchResults([]);
            setSearchMatchedUser(null);
        }

        try {
            const startCursor = isMore ? searchCursor : 0;
            const cleanQuery = inputToSearch.startsWith('@') ? inputToSearch.substring(1) : inputToSearch;

            // Step 1: Try to find a matching user profile (only on first search)
            if (!isMore) {
                try {
                    const profileRes = await axios.get(`${API_BASE_URL}/user/profile?username=${encodeURIComponent(cleanQuery)}`);
                    if (profileRes.data && profileRes.data.username) {
                        setSearchMatchedUser(profileRes.data);
                        console.log('Found matching user:', profileRes.data.username);
                    }
                } catch (profileErr) {
                    console.log('No matching user for:', cleanQuery);
                    setSearchMatchedUser(null);
                }
            }

            // Step 2: Fetch videos progressively - show immediately as they arrive
            const batchSize = 10;
            let totalFetched = 0;
            const maxVideos = 50;
            let allFetchedVideos: Video[] = [];

            while (totalFetched < maxVideos) {
                const endpoint = `${API_BASE_URL}/user/search?query=${encodeURIComponent(cleanQuery)}&limit=${batchSize}&cursor=${startCursor + totalFetched}`;
                const { data } = await axios.get(endpoint);
                const newVideos = data.videos || [];

                if (newVideos.length === 0) {
                    setSearchHasMore(false);
                    break;
                }

                // Filter out duplicates and add immediately (progressive display)
                setSearchResults(prev => {
                    const existingIds = new Set(prev.map(v => v.id));
                    const uniqueNewVideos = newVideos.filter((v: Video) => !existingIds.has(v.id));
                    allFetchedVideos = [...prev, ...uniqueNewVideos];
                    return allFetchedVideos;
                });
                totalFetched += newVideos.length;
                setSearchCursor(data.cursor || startCursor + totalFetched);

                if (newVideos.length < batchSize) {
                    setSearchHasMore(false);
                    break;
                }
            }

            if (totalFetched >= maxVideos) {
                setSearchHasMore(true);
            }

            // Cache the results
            if (!isMore && allFetchedVideos.length > 0) {
                localStorage.setItem(cacheKey, JSON.stringify({
                    results: allFetchedVideos,
                    timestamp: Date.now()
                }));
            }

        } catch (err) {
            console.error('Search failed:', err);
            setError('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleSearchScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && searchHasMore && !isSearching) {
            handleSearch(true);
        }
    };

    // ========== LOGIN VIEW ==========
    if (viewState === 'login') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex flex-col">
                {/* Header */}
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

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-5 pb-8">
                    <div className="max-w-sm mx-auto">
                        {error && (
                            <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm text-center">
                                {error}
                            </div>
                        )}

                        {/* How to Login - Step by Step */}
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

                        {/* Cookie Input */}
                        <div className="mb-4">
                            <textarea
                                value={jsonInput}
                                onChange={(e) => setJsonInput(e.target.value)}
                                placeholder='Paste your cookie JSON here...'
                                className="w-full h-32 bg-black/60 border-2 border-white/10 rounded-2xl p-4 text-white text-sm font-mono resize-none focus:outline-none focus:border-gray-400/50 placeholder:text-gray-600"
                            />
                        </div>

                        {/* Connect Button */}
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

                        {/* Help Link */}
                        <div className="mt-6 text-center">
                            <a
                                href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white/70 text-sm underline"
                            >
                                Get Cookie-Editor Extension →
                            </a>
                        </div>

                        {/* Desktop Browser Login - Hidden by default */}
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
                                        ⚠️ Only works on local machines with a display
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

    // ========== LOADING VIEW ==========
    if (viewState === 'loading') {
        return <SkeletonFeed />;
    }

    // ========== FEED VIEW WITH TABS ==========
    return (
        <div className="flex w-full h-screen bg-[#0f0f15] text-white overflow-hidden">
            {/* Desktop Sidebar */}
            <Sidebar
                activeTab={activeTab as any}
                onTabChange={(tab) => {
                    if (tab === 'profile') {
                        // Handle profile click if needed, or just open current user profile
                    } else {
                        setActiveTab(tab);
                        if (tab === 'foryou' && videos.length === 0) loadFeed();
                    }
                }}
                onLogout={handleLogout}
            />

            {/* Main Content Area */}
            <div
                className="flex-1 relative w-full h-full overflow-hidden"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
            >
                {/* Tab Navigation (Mobile Only) */}
                {/* Tab Navigation - Hidden by default, show on toggle/swipe */}
                <div className={`md:hidden absolute top-0 left-0 right-0 z-50 flex justify-center pt-4 pb-2 transition-all duration-300 ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
                    <div className="flex gap-1 bg-black/40 backdrop-blur-md rounded-full p-1 border border-white/5 shadow-2xl">
                        <button
                            onClick={() => {
                                setActiveTab('foryou');
                                setIsFollowingFeed(false);
                                if (videos.length === 0) loadFeed();
                            }}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'foryou' && !isFollowingFeed
                                ? 'bg-white/20 text-white shadow-sm'
                                : 'text-white/60 hover:text-white'
                                }`}
                            title="For You"
                        >
                            <span className="font-bold">For You</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'search'
                                ? 'bg-white/20 text-white shadow-sm'
                                : 'text-white/60 hover:text-white'
                                }`}
                            title="Search"
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </div>

                {/* Logout Button - Left Corner Icon */}
                {/* Logout Button / Back Button Logic */}
                {/* "make the go back button on the top right conner, replace, swith from the log out button" */}

                {!isInSearchPlayback ? (
                    <button
                        onClick={handleLogout}
                        className={`absolute top-6 right-6 z-50 w-10 h-10 flex items-center justify-center bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white/70 hover:text-white transition-all duration-300 ${showHeader ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0'}`}
                        title="Logout"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                            <polyline points="16,17 21,12 16,7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                    </button>
                ) : null}

                {/* FOR YOU TAB */}
                <div className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${activeTab === 'foryou'
                    ? 'translate-x-0 opacity-100'
                    : activeTab === 'following' || activeTab === 'search'
                        ? '-translate-x-full opacity-0 pointer-events-none'
                        : 'translate-x-full opacity-0 pointer-events-none'
                    }`}>
                    {/* Video Counter - Shows loading state with blink effect */}
                    <div className={`absolute bottom-6 right-4 z-40 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-full border border-white/10 transition-all ${isFetching ? 'animate-pulse border-gray-400/50' : ''}`}>
                        <span className="text-xs text-white/60 font-medium">
                            {isFetching ? (
                                <span className="text-white/70">
                                    Loading {currentIndex + 1}/{videos.length}...
                                </span>
                            ) : (
                                <>
                                    {currentIndex + 1} / {videos.length}
                                    {hasMore && <span className="text-white/70 ml-1">+</span>}
                                </>
                            )}
                        </span>
                    </div>

                    {/* Video Feed */}
                    <div
                        ref={containerRef}
                        onScroll={handleScroll}
                        className="w-full h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide pt-14"
                        style={{ scrollbarWidth: 'none' }}
                    >
                        {videos.map((video, index) => (
                            <div key={video.id} className="w-full h-screen-safe snap-start snap-always bg-black">
                                {Math.abs(index - currentIndex) <= 1 ? (
                                    <VideoPlayer
                                        video={video}
                                        isActive={activeTab === 'foryou' && index === currentIndex}
                                        isFollowing={following.includes(video.author)}
                                        onFollow={handleFollow}
                                        onAuthorClick={(author) => openProfileView(author)}
                                        isMuted={isMuted}
                                        onMuteToggle={() => setIsMuted(prev => !prev)}
                                        onPauseChange={(paused) => {
                                            setShowHeader(paused);  // Show top bar when video is paused
                                        }}
                                    />
                                ) : (
                                    /* Lightweight Placeholder */
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

                {/* FOLLOWING TAB - Minimal Style */}
                <div className={`absolute inset-0 w-full h-full pt-16 px-4 pb-6 overflow-y-auto transition-all duration-300 ease-out ${activeTab === 'following'
                    ? 'translate-x-0 opacity-100'
                    : activeTab === 'foryou'
                        ? 'translate-x-full opacity-0 pointer-events-none'
                        : '-translate-x-full opacity-0 pointer-events-none'
                    }`}>
                    <div className="max-w-lg mx-auto">

                        {/* Minimal Add Input */}
                        <div className="relative mb-8">
                            <input
                                type="text"
                                value={newFollowInput}
                                onChange={(e) => setNewFollowInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddFollow()}
                                placeholder="Add @username to follow..."
                                className="w-full bg-transparent border-b-2 border-white/20 focus:border-white/60 px-0 py-4 text-white text-lg focus:outline-none transition-colors placeholder:text-white/30"
                            />
                            <button
                                onClick={handleAddFollow}
                                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors"
                            >
                                <Plus size={24} />
                            </button>
                        </div>

                        {/* My Following - Minimal chips */}
                        {following.length > 0 && (
                            <div className="mb-10">
                                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Following</p>
                                <div className="flex flex-wrap gap-2">
                                    {following.map(user => (
                                        <div key={user} className="flex items-center gap-2 bg-white/5 rounded-full pl-3 pr-1 py-1">
                                            <button
                                                onClick={() => searchByUsername(user)}
                                                className="text-white/80 text-sm hover:text-white transition-colors"
                                            >
                                                @{user}
                                            </button>
                                            <button
                                                onClick={() => handleFollow(user)}
                                                className="p-1 text-white/30 hover:text-red-400 transition-colors"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Trending - 2 columns */}
                        <div className="mb-10">
                            <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Trending</p>
                            <div className="grid grid-cols-2 gap-2">
                                {SUGGESTED_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => searchByKeyword(cat.query)}
                                        className="bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2.5 text-left text-white/70 hover:text-white text-sm transition-colors"
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Suggested Accounts - Compact avatars */}
                        <div>
                            <p className="text-white/40 text-xs uppercase tracking-wider mb-4">Suggested</p>

                            {loadingProfiles && (
                                <div className="flex justify-center py-8">
                                    <div className="w-8 h-8 border-2 border-white/10 border-t-gray-400 rounded-full animate-spin"></div>
                                </div>
                            )}

                            <div className="grid grid-cols-4 gap-4">
                                {(suggestedProfiles.length > 0 ? suggestedProfiles : SUGGESTED_ACCOUNTS.map(a => ({ username: a.username.replace('@', ''), nickname: a.label }))).slice(0, suggestedLimit).map((profile: UserProfile | { username: string; nickname: string }) => {
                                    const username = 'username' in profile ? profile.username : '';

                                    return (
                                        <button
                                            key={username}
                                            onClick={() => searchByUsername(username)}
                                            className="flex flex-col items-center gap-2 group"
                                        >
                                            {'avatar' in profile && profile.avatar ? (
                                                <img
                                                    src={profile.avatar}
                                                    alt={username}
                                                    className="w-14 h-14 rounded-full object-cover border-2 border-transparent group-hover:border-gray-400/50 transition-colors"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-lg font-medium group-hover:bg-white/20 transition-colors">
                                                    {username.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-white/50 text-xs truncate w-full text-center group-hover:text-white/80">
                                                @{username.slice(0, 8)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Load More Button */}
                            {suggestedLimit < SUGGESTED_ACCOUNTS.length && (
                                <button
                                    onClick={() => setSuggestedLimit(prev => Math.min(prev + 12, SUGGESTED_ACCOUNTS.length))}
                                    className="w-full mt-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 text-sm transition-colors"
                                >
                                    Show More ({SUGGESTED_ACCOUNTS.length - suggestedLimit} remaining)
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* SEARCH TAB */}
                <div className={`absolute inset-0 w-full h-full pt-16 px-4 pb-6 overflow-y-auto transition-all duration-300 ease-out ${activeTab === 'search'
                    ? 'translate-x-0 opacity-100'
                    : activeTab === 'following' || activeTab === 'foryou'
                        ? 'translate-x-full opacity-0 pointer-events-none'
                        : '-translate-x-full opacity-0 pointer-events-none'
                    }`}
                    onScroll={handleSearchScroll}
                >
                    <div className="max-w-lg mx-auto">
                        {/* Minimal Search Input */}
                        <div className="relative mb-8">
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="Search..."
                                className="w-full bg-transparent border-b-2 border-white/20 focus:border-white/60 px-0 py-4 text-white text-lg focus:outline-none transition-colors placeholder:text-white/30"
                                disabled={isSearching}
                            />
                            <button
                                onClick={() => handleSearch()}
                                disabled={isSearching}
                                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white transition-colors disabled:opacity-50"
                            >
                                {isSearching ? (
                                    <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="32" strokeLinecap="round" />
                                    </svg>
                                ) : (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" />
                                        <path d="M21 21l-4.35-4.35" />
                                    </svg>
                                )}
                            </button>
                            <p className="text-white/20 text-xs mt-2">@username · video link · keyword</p>
                        </div>

                        {/* Loading Spinner - Simple, shown alongside results */}
                        {isSearching && (
                            <div className="flex items-center justify-center gap-2 py-4">
                                <div className="w-5 h-5 border-2 border-white/20 border-t-gray-400 rounded-full animate-spin" />
                                <span className="text-white/60 text-sm">Loading...</span>
                            </div>
                        )}

                        {/* Empty State / Suggestions */}
                        {!isSearching && searchResults.length === 0 && (
                            <>
                                {/* Trending */}
                                <div className="mb-10">
                                    <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Trending</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {SUGGESTED_CATEGORIES.map(cat => (
                                            <button
                                                key={cat.id}
                                                onClick={() => searchByKeyword(cat.query)}
                                                className="bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2.5 text-left text-white/70 hover:text-white text-sm transition-colors"
                                            >
                                                {cat.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Matched User Profile Card */}
                        {searchMatchedUser && (
                            <div className="mb-6 p-4 bg-gradient-to-r from-white/5 to-white/10 rounded-2xl border border-white/10">
                                <div className="flex items-center gap-4">
                                    {/* Avatar */}
                                    {searchMatchedUser.avatar ? (
                                        <img
                                            src={searchMatchedUser.avatar}
                                            alt={searchMatchedUser.username}
                                            className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-gray-500 to-gray-400 flex items-center justify-center text-white text-2xl font-bold">
                                            {searchMatchedUser.username.charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-white font-bold text-lg truncate flex items-center gap-2">
                                            @{searchMatchedUser.username}
                                            {searchMatchedUser.verified && (
                                                <svg className="w-4 h-4 text-white/70" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            )}
                                        </h3>
                                        {searchMatchedUser.nickname && (
                                            <p className="text-white/60 text-sm truncate">{searchMatchedUser.nickname}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1 text-white/50 text-xs">
                                            {searchMatchedUser.followers !== undefined && (
                                                <span>
                                                    {searchMatchedUser.followers >= 1000000
                                                        ? `${(searchMatchedUser.followers / 1000000).toFixed(1)}M`
                                                        : searchMatchedUser.followers >= 1000
                                                            ? `${(searchMatchedUser.followers / 1000).toFixed(0)}K`
                                                            : searchMatchedUser.followers} followers
                                                </span>
                                            )}
                                            {searchMatchedUser.likes !== undefined && (
                                                <span>
                                                    {searchMatchedUser.likes >= 1000000
                                                        ? `${(searchMatchedUser.likes / 1000000).toFixed(1)}M`
                                                        : searchMatchedUser.likes >= 1000
                                                            ? `${(searchMatchedUser.likes / 1000).toFixed(0)}K`
                                                            : searchMatchedUser.likes} likes
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* View Profile Button */}
                                    <button
                                        onClick={() => openProfileView(searchMatchedUser.username)}
                                        className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-400 rounded-full text-white text-sm font-medium hover:opacity-90 transition-opacity"
                                    >
                                        View Profile
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="mt-4">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-white/50 text-sm">{searchResults.length} videos</span>
                                    <div className="flex items-center gap-2">
                                        {searchInput.startsWith('@') && (
                                            <button
                                                onClick={() => handleFollow(searchInput.substring(1))}
                                                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${following.includes(searchInput.substring(1))
                                                    ? 'bg-white/10 text-white border border-white/20'
                                                    : 'bg-gray-500 text-white'
                                                    }`}
                                            >
                                                {following.includes(searchInput.substring(1)) ? 'Following' : 'Follow'}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                const playableVideos = searchResults.filter(v => v.url);
                                                if (playableVideos.length > 0) {
                                                    setVideos(playableVideos);
                                                    setCurrentIndex(0);
                                                    setActiveTab('foryou');
                                                }
                                            }}
                                            className="px-3 py-1 bg-gradient-to-r from-gray-500 to-gray-400 rounded-full text-xs font-medium text-white"
                                        >
                                            ▶ Play All
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-1">
                                    {searchResults.map((video) => (
                                        <div
                                            key={video.id}
                                            className="relative aspect-[9/16] overflow-hidden group cursor-pointer"
                                            onClick={() => {
                                                if (!video.url) return;
                                                setOriginalVideos(videos);
                                                setOriginalIndex(currentIndex);
                                                const playableVideos = searchResults.filter(v => v.url);
                                                setVideos(playableVideos);
                                                const newIndex = playableVideos.findIndex(v => v.id === video.id);
                                                setCurrentIndex(newIndex >= 0 ? newIndex : 0);
                                                setIsInSearchPlayback(true);
                                                setActiveTab('foryou');
                                            }}
                                        >
                                            {video.thumbnail ? (
                                                <img
                                                    src={video.thumbnail}
                                                    alt={video.author}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                                    <div className="w-6 h-6 border-2 border-white/20 border-t-gray-400 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                                <p className="text-white text-xs truncate">@{video.author}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* In-Search Back Button */}
                {isInSearchPlayback && (
                    <button
                        onClick={() => {
                            setVideos(originalVideos);
                            setCurrentIndex(originalIndex);
                            setIsInSearchPlayback(false);
                            setActiveTab('search');
                        }}
                        className="absolute top-6 right-6 z-[60] w-10 h-10 flex items-center justify-center bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-full text-white transition-all shadow-xl border border-white/10"
                        title="Back to Search"
                    >
                        <X size={20} />
                    </button>
                )}

                {/* Profile View Overlay */}
                {profileViewUsername && (
                    <div className="fixed inset-0 z-[70] bg-black/95 overflow-hidden">
                        {/* Profile Header */}
                        <div className="sticky top-0 z-10 bg-gradient-to-b from-black via-black/90 to-transparent pt-6 pb-8 px-4">
                            <div className="max-w-lg mx-auto">
                                <div className="flex items-center gap-4">
                                    {/* Back Button */}
                                    <button
                                        onClick={closeProfileView}
                                        className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
                                    >
                                        <X size={20} />
                                    </button>

                                    {/* Avatar */}
                                    {profileUserData?.avatar ? (
                                        <img
                                            src={profileUserData.avatar}
                                            alt={profileViewUsername}
                                            className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-gray-500 to-gray-400 flex items-center justify-center text-white text-2xl font-bold">
                                            {profileViewUsername.charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    {/* User Info */}
                                    <div className="flex-1 min-w-0">
                                        <h2 className="text-white font-bold text-base truncate">
                                            @{profileViewUsername}
                                        </h2>
                                        {profileUserData?.nickname && (
                                            <p className="text-white/60 text-xs truncate">{profileUserData.nickname}</p>
                                        )}
                                        <div className="flex items-center gap-3 mt-1">
                                            {profileUserData?.followers !== undefined && (
                                                <span className="text-white/50 text-[10px]">
                                                    {profileUserData.followers >= 1000000
                                                        ? `${(profileUserData.followers / 1000000).toFixed(1)}M`
                                                        : profileUserData.followers >= 1000
                                                            ? `${(profileUserData.followers / 1000).toFixed(0)}K`
                                                            : profileUserData.followers} followers
                                                </span>
                                            )}
                                            {profileVideos.length > 0 && (
                                                <span className="text-white/50 text-xs">
                                                    {profileVideos.length} videos
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Follow Button */}
                                    <button
                                        onClick={() => handleFollow(profileViewUsername)}
                                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${following.includes(profileViewUsername)
                                            ? 'bg-white/10 text-white border border-white/20'
                                            : 'bg-gradient-to-r from-gray-500 to-gray-400 text-white'
                                            }`}
                                    >
                                        {following.includes(profileViewUsername) ? 'Following' : 'Follow'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Video Grid */}
                        <div
                            ref={profileGridRef}
                            className="h-[calc(100vh-120px)] overflow-y-auto px-1"
                            onScroll={handleProfileGridScroll}
                        >
                            <div className="max-w-lg mx-auto">
                                {/* Loading Skeleton (Initial Load) with Timer */}
                                {profileLoading && profileVideos.length === 0 && (
                                    <div>
                                        {/* Loading Timer Display */}
                                        <div className="flex items-center justify-center gap-3 mb-6">
                                            <div className="w-5 h-5 border-2 border-white/20 border-t-gray-400 rounded-full animate-spin" />
                                            <span className="text-white/60 text-sm">
                                                Loading profile...
                                            </span>
                                            <span className="text-white/70 font-mono text-sm tabular-nums">
                                                {Math.floor(loadingElapsed / 60)}:{(loadingElapsed % 60).toString().padStart(2, '0')}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1 animate-pulse">
                                            {[...Array(12)].map((_, i) => (
                                                <div key={i} className="aspect-[9/16] bg-white/5 rounded-sm" />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Video Grid */}
                                {profileVideos.length > 0 && (
                                    <div className="grid grid-cols-3 gap-1">
                                        {profileVideos.map((video) => (
                                            <div
                                                key={video.id}
                                                className="relative aspect-[9/16] overflow-hidden group cursor-pointer"
                                                onClick={() => {
                                                    if (!video.url) return;
                                                    // Save current state for back navigation
                                                    setOriginalVideos(videos);
                                                    setOriginalIndex(currentIndex);
                                                    // Set videos to profile videos and play
                                                    const playableVideos = profileVideos.filter(v => v.url);
                                                    setVideos(playableVideos);
                                                    const newIndex = playableVideos.findIndex(v => v.id === video.id);
                                                    setCurrentIndex(newIndex >= 0 ? newIndex : 0);
                                                    setIsInSearchPlayback(true);
                                                    setActiveTab('foryou');
                                                    closeProfileView();
                                                }}
                                            >
                                                {video.thumbnail ? (
                                                    <img
                                                        src={video.thumbnail}
                                                        alt={video.description || video.author}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                                        <div className="w-6 h-6 border-2 border-white/20 border-t-gray-400 rounded-full animate-spin" />
                                                    </div>
                                                )}
                                                {/* Hover Overlay */}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                    <svg className="w-10 h-10 text-white opacity-0 group-hover:opacity-80 transition-opacity" viewBox="0 0 24 24" fill="currentColor">
                                                        <path d="M8 5v14l11-7z" />
                                                    </svg>
                                                </div>
                                                {/* Views Badge */}
                                                {video.views && (
                                                    <div className="absolute bottom-1 left-1 text-white/80 text-xs font-medium drop-shadow-lg">
                                                        {video.views >= 1000000
                                                            ? `${(video.views / 1000000).toFixed(1)}M`
                                                            : video.views >= 1000
                                                                ? `${(video.views / 1000).toFixed(0)}K`
                                                                : video.views}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Loading More Indicator */}
                                {profileLoading && profileVideos.length > 0 && (
                                    <div className="flex justify-center py-6">
                                        <div className="w-6 h-6 border-2 border-white/10 border-t-gray-400 rounded-full animate-spin" />
                                    </div>
                                )}

                                {/* No More Videos */}
                                {!profileHasMore && profileVideos.length > 0 && (
                                    <p className="text-center text-white/30 text-sm py-6">No more videos</p>
                                )}

                                {/* Empty State */}
                                {!profileLoading && profileVideos.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-16">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <rect x="2" y="2" width="20" height="20" rx="2" />
                                                <path d="M10 8l6 4-6 4V8z" />
                                            </svg>
                                        </div>
                                        <p className="text-white/50 text-sm">No videos found</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
