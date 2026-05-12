import React from 'react';
import type { Video } from '../types';

interface LikedVideosGridProps {
    videos: Video[];
    onVideoSelect: (video: Video, index: number) => void;
}

export const LikedVideosGrid: React.FC<LikedVideosGridProps> = ({ videos, onVideoSelect }) => {
    return (
        <div className="w-full h-full overflow-y-auto p-4 bg-black">
            <div className="grid grid-cols-3 gap-1">
                {videos.map((video, index) => (
                    <div
                        key={video.id}
                        onClick={() => onVideoSelect(video, index)}
                        className="relative aspect-[9/16] bg-gray-900 cursor-pointer overflow-hidden group"
                    >
                        {video.thumbnail ? (
                            <img
                                src={video.thumbnail}
                                alt={`Video by ${video.author}`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-800">
                                <svg className="w-8 h-8 text-white/30" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z"/>
                                </svg>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all" />
                        <div className="absolute bottom-1 left-1 flex items-center text-white text-xs">
                            <svg className="w-3 h-3 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};