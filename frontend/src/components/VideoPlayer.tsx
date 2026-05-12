import React, { useRef, useState, useEffect } from 'react';
import { Download, Volume2, VolumeX, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';
import type { Video } from '../types';
import { API_BASE_URL } from '../config';
import { videoCache } from '../utils/videoCache';

interface VideoPlayerProps {
    video: Video;
    isActive: boolean;
    isMuted?: boolean;
    onMuteToggle?: () => void;
    onPauseChange?: (isPaused: boolean) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    video,
    isActive,
    isMuted: externalMuted,
    onMuteToggle,
    onPauseChange
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [isSeeking, setIsSeeking] = useState(false);
    const [localMuted, setLocalMuted] = useState(true);
    const isMuted = externalMuted !== undefined ? externalMuted : localMuted;
    const [isLoading, setIsLoading] = useState(true);
    const [cachedUrl, setCachedUrl] = useState<string | null>(null);
    const [codecError, setCodecError] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const lastTapRef = useRef<number>(0);

    const [zoomLevel, setZoomLevel] = useState(1);
    const [showZoomIndicator, setShowZoomIndicator] = useState(false);
    const initialPinchDistance = useRef<number | null>(null);
    const initialZoom = useRef<number>(1);

    const fullProxyUrl = `${API_BASE_URL}/feed/proxy?url=${encodeURIComponent(video.url)}`;
    const thinProxyUrl = video.cdn_url ? `${API_BASE_URL}/feed/thin-proxy?cdn_url=${encodeURIComponent(video.cdn_url)}` : null;
    const proxyUrl = cachedUrl || (thinProxyUrl || fullProxyUrl);
    const downloadUrl = `${API_BASE_URL}/feed/proxy?url=${encodeURIComponent(video.url)}&download=true`;

    const videoSrc = isActive ? proxyUrl : '';

    useEffect(() => {
        if (!isActive) return;
        const handleKeyDown = (e: KeyboardEvent) => {
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

    useEffect(() => {
        if (!videoRef.current) return;
        videoRef.current.muted = isMuted;
    }, [isMuted]);

    useEffect(() => {
        setZoomLevel(1);
        setIsLoading(true);
        setCodecError(false);
        setCachedUrl(null);

        const checkCache = async () => {
            const cached = await videoCache.get(video.url);
            if (cached) {
                const blob_url = URL.createObjectURL(cached);
                setCachedUrl(blob_url);
            }
        };
        checkCache();
    }, [video.id]);

    useEffect(() => {
        if (!videoRef.current || !isActive) return;
        videoRef.current.currentTime = 0;
        videoRef.current.muted = isMuted;
        videoRef.current.play().catch(() => {
            setIsPaused(true);
        });
        setIsPaused(false);
    }, [isActive, proxyUrl]);

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
        e.stopPropagation();
        if (!videoRef.current) return;

        if (onMuteToggle) {
            onMuteToggle();
        } else {
            setLocalMuted(prev => !prev);
        }
    };

    const zoomIn = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.min(prev + 0.25, 3));
        setShowZoomIndicator(true);
    };

    const zoomOut = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
        setShowZoomIndicator(true);
    };

    const resetZoom = (e: React.MouseEvent) => {
        e.stopPropagation();
        setZoomLevel(1);
        setShowZoomIndicator(true);
    };

    useEffect(() => {
        if (showZoomIndicator) {
            const timer = setTimeout(() => setShowZoomIndicator(false), 1500);
            return () => clearTimeout(timer);
        }
    }, [showZoomIndicator]);

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );

            if (initialPinchDistance.current === null) {
                initialPinchDistance.current = currentDistance;
                initialZoom.current = zoomLevel;
            }

            const scale = currentDistance / initialPinchDistance.current;
            const newZoom = Math.max(0.5, Math.min(3, initialZoom.current * scale));
            setZoomLevel(newZoom);
            setShowZoomIndicator(true);
        }
    };

    const handleTouchEnd = () => {
        initialPinchDistance.current = null;
    };

    const tapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        setShowControls(true);
        lastTapRef.current = Date.now();
    };

    const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const now = Date.now();
        if (now - lastTapRef.current < 250) {
            if (tapTimeoutRef.current) {
                clearTimeout(tapTimeoutRef.current);
                tapTimeoutRef.current = null;
            }
        } else {
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
            className="relative w-full h-full bg-black overflow-hidden flex items-center justify-center"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
            onClick={handleVideoClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                loop
                playsInline
                preload="auto"
                muted={isMuted}
                className="absolute inset-0 w-full h-full"
                style={{ objectFit: 'contain', transform: `scale(${zoomLevel})`, transition: zoomLevel !== 1 ? 'none' : 'transform 0.2s ease-out' }}
                onCanPlay={() => setIsLoading(false)}
                onWaiting={() => setIsLoading(true)}
                onPlaying={() => setIsLoading(false)}
                onLoadedMetadata={() => {
                    if (videoRef.current) {
                        setDuration(videoRef.current.duration);
                    }
                }}
            />

            {isLoading && !codecError && (
                <div className="absolute top-4 right-4 z-20">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                </div>
            )}

            {codecError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-20 p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
                    <h3 className="text-white font-semibold text-lg mb-2">Video Format Not Supported</h3>
                    <p className="text-white/60 text-sm mb-4 max-w-xs">This video uses HEVC codec. Try Safari, Chrome 107+, or download to watch.</p>
                    <a href={downloadUrl} download className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-full hover:bg-gray-400" onClick={(e) => e.stopPropagation()}>Download Video</a>
                </div>
            )}

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
                    <div
                        className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg transition-opacity pointer-events-none ${isSeeking ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
                            }`}
                        style={{ left: duration ? `calc(${(progress / duration) * 100}% - 8px)` : '0' }}
                    />
                </div>
                {showControls && duration > 0 && (
                    <div className="flex justify-between px-4 py-1 text-xs text-white/60">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>
                )}
            </div>

            <div className={`absolute bottom-20 left-0 right-0 flex justify-center z-40 transition-all duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex flex-col items-center gap-2">
                    <div
                        className={`transition-all duration-200 ${showZoomIndicator ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
                    >
                        <div className="bg-black/70 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
                            <span className="text-white font-semibold text-sm tabular-nums">{zoomLevel.toFixed(2)}x</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xl rounded-full px-4 py-2 border border-white/10">
                        <button
                            onClick={zoomIn}
                            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all"
                            title="Zoom In"
                        >
                            <ZoomIn size={20} />
                        </button>

                        <button
                            onClick={zoomOut}
                            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all"
                            title="Zoom Out"
                        >
                            <ZoomOut size={20} />
                        </button>

                        {zoomLevel !== 1 && (
                            <button
                                onClick={resetZoom}
                                className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all text-xs font-bold"
                                title="Reset Zoom"
                            >
                                1x
                            </button>
                        )}

                        <div className="w-px h-6 bg-white/20 mx-1" />

                        <a
                            href={downloadUrl}
                            download
                            onClick={(e) => e.stopPropagation()}
                            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all"
                            title="Download"
                        >
                            <Download size={20} />
                        </a>

                        <button
                            onClick={(e) => { e.stopPropagation(); toggleMute(e); }}
                            className="w-10 h-10 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-all"
                            title={isMuted ? 'Unmute' : 'Mute'}
                        >
                            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className={`absolute bottom-6 left-4 right-4 z-10 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="flex items-center gap-2">
                    <span className="text-white font-semibold text-sm truncate">@{video.author}</span>
                    {video.views && <span className="text-white/40 text-xs">{video.views >= 1000000 ? `${(video.views / 1000000).toFixed(1)}M views` : video.views >= 1000 ? `${(video.views / 1000).toFixed(0)}K views` : `${video.views} views`}</span>}
                </div>
                {video.description && <p className="text-white/70 text-xs line-clamp-2 mt-1">{video.description}</p>}
            </div>
        </div>
    );
};