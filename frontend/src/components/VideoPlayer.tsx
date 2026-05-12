import React, { useRef, useState, useEffect } from 'react';
import { Download, UserPlus, Check, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import type { Video } from '../types';
import { API_BASE_URL } from '../config';
import { videoCache } from '../utils/videoCache';



interface HeartParticle {
    id: number;
    x: number;
    y: number;
}

interface VideoPlayerProps {
    video: Video;
    isActive: boolean;
    isFollowing?: boolean;
    onFollow?: (author: string) => void;
    onAuthorClick?: (author: string) => void;  // In-app navigation to creator
    isMuted?: boolean;  // Global mute state from parent
    onMuteToggle?: () => void;  // Callback to toggle parent mute state
    onPauseChange?: (isPaused: boolean) => void;  // Notify parent when play/pause state changes
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    video,
    isActive,
    isFollowing = false,
    onFollow,
    onAuthorClick,
    isMuted: externalMuted,
    onMuteToggle,
    onPauseChange
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [isPaused, setIsPaused] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [objectFit] = useState<'cover' | 'contain'>('cover');
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);
    const [useFallback, setUseFallback] = useState(false);
    const [localMuted, setLocalMuted] = useState(true);
    const isMuted = externalMuted !== undefined ? externalMuted : localMuted;
    const [hearts, setHearts] = useState<HeartParticle[]>([]);
    const [isLoading, setIsLoading] = useState(true);  // Show loading spinner until video is ready
    const [cachedUrl, setCachedUrl] = useState<string | null>(null);
    const [codecError, setCodecError] = useState(false);  // True if video codec not supported
    const lastTapRef = useRef<number>(0);


    const fullProxyUrl = `${API_BASE_URL}/feed/proxy?url=${encodeURIComponent(video.url)}`;
    const thinProxyUrl = video.cdn_url ? `${API_BASE_URL}/feed/thin-proxy?cdn_url=${encodeURIComponent(video.cdn_url)}` : null;
    const proxyUrl = cachedUrl ? cachedUrl : (thinProxyUrl && !useFallback) ? thinProxyUrl : fullProxyUrl;
    const downloadUrl = `${API_BASE_URL}/feed/proxy?url=${encodeURIComponent(video.url)}&download=true`;

    useEffect(() => {
        if (isActive && videoRef.current) {
            // Auto-play when becoming active
            if (videoRef.current.paused) {
                videoRef.current.currentTime = 0;
                videoRef.current.muted = isMuted;  // Use current mute state
                videoRef.current.play().catch((err) => {
                    // If autoplay fails even muted, show paused state
                    console.log('Autoplay blocked:', err.message);
                    setIsPaused(true);
                });
                setIsPaused(false);
            }
        } else if (!isActive && videoRef.current) {
            videoRef.current.pause();
        }
    }, [isActive]);  // Only trigger on isActive change

    // Sync video muted property when isMuted state changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.muted = isMuted;
        }
    }, [isMuted]);

    // Spacebar to pause/play when this video is active
    useEffect(() => {
        if (!isActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Only handle spacebar when not typing
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.code === 'Space') {
                e.preventDefault();
                if (videoRef.current) {
                    if (videoRef.current.paused) {
                        videoRef.current.play();
                        setIsPaused(false);
                    } else {
                        videoRef.current.pause();
                        setIsPaused(true);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isActive]);

    const [showSidebar, setShowSidebar] = useState(false);

    // Reset fallback and loading state when video changes
    useEffect(() => {
        setUseFallback(false);
        setIsLoading(true);  // Show loading for new video
        setCodecError(false);  // Reset codec error for new video
        setCachedUrl(null);
        setShowSidebar(false); // Reset sidebar for new video

        const checkCache = async () => {
            const cached = await videoCache.get(video.url);
            if (cached) {
                const blob_url = URL.createObjectURL(cached);
                setCachedUrl(blob_url);
            }
        };

        checkCache();
    }, [video.id]);

    // Progress tracking
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => {
            setProgress(video.currentTime);
        };

        const handleLoadedMetadata = () => {
            setDuration(video.duration);
        };

        // Fallback on error - if thin proxy fails, switch to full proxy
        // Also detect codec errors for graceful fallback UI
        const handleError = (e: Event) => {
            const videoEl = e.target as HTMLVideoElement;
            const error = videoEl?.error;

            // Check if this is a codec/decode error (MEDIA_ERR_DECODE = 3, MEDIA_ERR_SRC_NOT_SUPPORTED = 4)
            if (error?.code === 3 || error?.code === 4) {
                console.log(`Codec error detected (code ${error.code}):`, error.message);

                // Always fall back to full proxy which will transcode to H.264
                if (!useFallback) {
                    console.log('Codec not supported, falling back to full proxy (will transcode to H.264)...');
                    setUseFallback(true);
                    return;
                }

                // If even full proxy failed, show error
                setCodecError(true);
                setIsLoading(false);
                return;
            }

            if (thinProxyUrl && !useFallback) {
                console.log('Thin proxy failed, falling back to full proxy...');
                setUseFallback(true);
            }
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('error', handleError);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('error', handleError);
        };
    }, [thinProxyUrl, useFallback, cachedUrl]);

    useEffect(() => {
        const cacheVideo = async () => {
            if (!cachedUrl || !proxyUrl || proxyUrl === cachedUrl) return;

            try {
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const blob = await response.blob();
                    await videoCache.set(video.url, blob);
                }
            } catch (error) {
                console.debug('Failed to cache video:', error);
            }
        };

        if (isActive && !isLoading) {
            cacheVideo();
        }
    }, [isActive, isLoading, proxyUrl, cachedUrl, video.url]);

    const togglePlayPause = () => {
        if (!videoRef.current) return;

        if (videoRef.current.paused) {
            videoRef.current.play();
            setIsPaused(false);
            onPauseChange?.(false);
        } else {
            videoRef.current.pause();
            setIsPaused(true);
            onPauseChange?.(true);
        }
    };


    const toggleMute = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();  // Prevent video tap
        if (!videoRef.current) return;

        // Use external toggle if provided, otherwise use local state
        if (onMuteToggle) {
            onMuteToggle();
        } else {
            setLocalMuted(prev => !prev);
        }
    };

    // Handle tap - double tap shows heart, single tap toggles play
    const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Touch handler for multi-touch support
    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        setShowControls(true); // Ensure controls show on touch

        const now = Date.now();
        const touches = Array.from(e.changedTouches);

        // Use container rect for stable coordinates vs e.target
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();

        const isMultiTouch = e.touches.length > 1; // Any simultaneous touches = hearts

        // Check if this is a rapid tap sequence (potential hearts)
        let isRapid = false;

        touches.forEach((touch, index) => {
            const timeSinceLastTap = now - lastTapRef.current;

            // Swipe Left from right edge check (to open sidebar)
            const rectWidth = rect.width;
            const startX = touch.clientX - rect.left;

            // If touch starts near right edge (last 15% of screen)
            if (startX > rectWidth * 0.85 && touches.length === 1) {
                // We'll handle the actual swipe logic in touchMove/End, 
                // but setting a flag or using the existing click logic might be easier.
                // For now, let's allow a simple tap on the edge to toggle too, as per existing click logic.
            }

            // Show heart if:
            // 1. Double tap (< 400ms)
            // 2. OR Multi-touch (2+ fingers)
            // 3. OR Secondary touch in this event
            if (timeSinceLastTap < 400 || isMultiTouch || index > 0) {
                isRapid = true;

                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                // Add heart
                const heartId = Date.now() + index + Math.random(); // Unique ID
                setHearts(prev => [...prev, { id: heartId, x, y }]);

                setTimeout(() => {
                    setHearts(prev => prev.filter(h => h.id !== heartId));
                }, 1000);
            }
        });

        if (isRapid) {
            // It was a heart tap - prevent default click (toggle pause)
            if (tapTimeoutRef.current) {
                clearTimeout(tapTimeoutRef.current);
                tapTimeoutRef.current = null;
            }
        }

        lastTapRef.current = now;
    };

    // Click handler (Mouse / Single Touch fallback)
    const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
        // If we recently parsed a rapid touch (heart), ignore this click
        const now = Date.now();
        if (now - lastTapRef.current < 100) return;

        // Check for double-click (for hearts)
        if (tapTimeoutRef.current) {
            // Double click detected - show heart instead of toggle
            clearTimeout(tapTimeoutRef.current);
            tapTimeoutRef.current = null;

            // Add heart at click position
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                // If clicked on the right edge, toggle sidebar
                if (x > rect.width * 0.9) {
                    setShowSidebar(prev => !prev);
                    return;
                }

                const heartId = Date.now() + Math.random();
                setHearts(prev => [...prev, { id: heartId, x, y }]);
                setTimeout(() => {
                    setHearts(prev => prev.filter(h => h.id !== heartId));
                }, 1000);
            }
        } else {
            // First click - set timeout for double-click detection
            tapTimeoutRef.current = setTimeout(() => {
                togglePlayPause();
                tapTimeoutRef.current = null;
            }, 250);
        }

        lastTapRef.current = now;
    };

    const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        if (!videoRef.current || !duration || !progressBarRef.current) return;

        const rect = progressBarRef.current.getBoundingClientRect();
        let clientX: number;

        if ('touches' in e) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = e.clientX;
        }

        const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const percent = clickX / rect.width;
        videoRef.current.currentTime = percent * duration;
        setProgress(percent * duration);
    };

    const handleSeekStart = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        setIsSeeking(true);
        handleSeek(e);
    };

    const handleSeekEnd = () => {
        setIsSeeking(false);
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
            onClick={handleVideoClick}
            onTouchStart={handleTouchStart}
        >
            {/* Video Element - preload="metadata" for instant player readiness */}
            <video
                ref={videoRef}
                src={proxyUrl}
                loop
                playsInline
                preload="metadata"
                muted={isMuted}
                className="w-full h-full"
                style={{ objectFit }}
                onCanPlay={() => setIsLoading(false)}
                onWaiting={() => setIsLoading(true)}
                onPlaying={() => setIsLoading(false)}
            />

            {/* Loading Overlay - Subtle pulsing logo */}
            {isLoading && !codecError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
                    <div className="w-16 h-16 bg-gradient-to-r from-gray-400/80 to-gray-300/80 rounded-2xl flex items-center justify-center animate-pulse">
                        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Codec Error Fallback - Graceful UI for unsupported video codecs */}
            {codecError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
                    <h3 className="text-white font-semibold text-lg mb-2">Video Format Not Supported</h3>
                    <p className="text-white/60 text-sm mb-4 max-w-xs">
                        This video uses HEVC codec. Try Safari, Chrome 107+, or download to watch.
                    </p>
                    <a
                        href={downloadUrl}
                        download
                        className="px-4 py-2 bg-gradient-to-r from-gray-500 to-gray-400 text-white text-sm font-medium rounded-full hover:opacity-90 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                    >
                        Download Video
                    </a>
                </div>
            )}

            {/* Heart Animation Particles */}
            {hearts.map(heart => (
                <div
                    key={heart.id}
                    className="absolute z-50 pointer-events-none animate-heart-float"
                    style={{
                        left: heart.x - 24,
                        top: heart.y - 24,
                    }}
                >
                    <svg className="w-16 h-16 text-white drop-shadow-xl filter drop-shadow-lg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                </div>
            ))}

            {/* Pause Icon Overlay */}
            {isPaused && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <div className="w-20 h-20 flex items-center justify-center bg-white/20 backdrop-blur-sm rounded-full">
                        <svg className="w-10 h-10 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            )}

            {/* Video Timeline/Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 z-30">
                <div
                    ref={progressBarRef}
                    className={`h-2 bg-white/20 cursor-pointer group ${isSeeking ? 'h-3' : ''}`}
                    onClick={handleSeek}
                    onMouseDown={handleSeekStart}
                    onMouseMove={(e) => isSeeking && handleSeek(e)}
                    onMouseUp={handleSeekEnd}
                    onMouseLeave={handleSeekEnd}
                    onTouchStart={handleSeekStart}
                    onTouchMove={(e) => isSeeking && handleSeek(e)}
                    onTouchEnd={handleSeekEnd}
                >
                    <div
                        className="h-full bg-gradient-to-r from-gray-400 to-gray-300 transition-all pointer-events-none"
                        style={{ width: duration ? `${(progress / duration) * 100}%` : '0%' }}
                    />
                    {/* Scrubber Thumb (always visible when seeking or on hover) */}
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-opacity pointer-events-none ${isSeeking ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
                            }`}
                        style={{ left: duration ? `calc(${(progress / duration) * 100}% - 8px)` : '0' }}
                    />
                </div>
                {/* Time Display */}
                {showControls && duration > 0 && (
                    <div className="flex justify-between px-4 py-1 text-xs text-white/60">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                )}
            </div>

            {/* Side Controls - Always visible on hover or when paused */}
            <div
                className={`absolute bottom-36 right-4 flex flex-col gap-3 transition-all duration-300 transform ${showControls || isPaused ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0'
                    }`}
            >
                {/* Follow Button */}
                {onFollow && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onFollow(video.author); }}
                        className={`w-12 h-12 flex items-center justify-center backdrop-blur-xl border border-white/10 rounded-full transition-all ${isFollowing
                            ? 'bg-gray-500 text-white'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                            }`}
                        title={isFollowing ? 'Following' : 'Follow'}
                    >
                        {isFollowing ? <Check size={20} /> : <UserPlus size={20} />}
                    </button>
                )}

                {/* Download Button */}
                <a
                    href={downloadUrl}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full text-white transition-all"
                    title="Download"
                >
                    <Download size={20} />
                </a>

                {/* Mute Toggle */}
                <button
                    onClick={toggleMute}
                    className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-xl border border-white/10 rounded-full text-white transition-all"
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
            </div>

            {/* Author Info - Only show when video is paused */}
            <div className={`absolute bottom-10 left-4 right-20 z-10 transition-opacity duration-300 ${isPaused ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAuthorClick?.(video.author);
                        }}
                        className="text-white font-semibold text-sm truncate hover:text-white/70 transition-colors inline-flex items-center gap-1"
                    >
                        @{video.author}
                        <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                        </svg>
                    </button>
                    {video.views && (
                        <span className="text-white/40 text-xs">
                            {video.views >= 1000000
                                ? `${(video.views / 1000000).toFixed(1)}M views`
                                : video.views >= 1000
                                    ? `${(video.views / 1000).toFixed(0)}K views`
                                    : `${video.views} views`
                            }
                        </span>
                    )}
                </div>
                {video.description && (
                    <p className="text-white/70 text-xs line-clamp-2 mt-1">
                        {video.description}
                    </p>
                )}
            </div>

            {/* Bottom Gradient - Only show when video is paused */}
            <div className={`absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black/80 to-transparent pointer-events-none transition-opacity duration-300 ${isPaused ? 'opacity-100' : 'opacity-0'}`} />

            {/* Right Sidebar Hint - Only show when video is paused */}
            <div
                className={`absolute top-0 right-0 w-6 h-full z-40 flex items-center justify-end cursor-pointer transition-opacity duration-300 ${isPaused ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${showSidebar ? 'pointer-events-none' : ''}`}
                onClick={(e) => { e.stopPropagation(); setShowSidebar(true); }}
                onTouchEnd={() => {
                    // Check if it was a swipe logic here or just rely on the click/tap
                    setShowSidebar(true);
                }}
            >
                {/* Visual Hint */}
                <div className="w-1 h-12 bg-white/20 rounded-full mr-1 shadow-[0_0_10px_rgba(255,255,255,0.3)] animate-pulse" />
            </div>
        </div>
    );
};
