import React from 'react';

export const SkeletonFeed: React.FC = () => {
    return (
        <div className="h-full w-full bg-[#0f0f15] relative overflow-hidden flex items-center justify-center">
            {/* Main Video Area Skeleton */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full skeleton-pulse opacity-50"></div>
            </div>

            {/* Right Sidebar Action Buttons */}
            <div className="absolute right-4 bottom-24 flex flex-col items-center gap-6 z-10">
                {[1, 2, 3, 4].map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                        <div className="w-12 h-12 rounded-full skeleton-pulse bg-white/10" />
                        <div className="w-8 h-3 rounded-md skeleton-pulse bg-white/10" />
                    </div>
                ))}
            </div>

            {/* Bottom Info Area */}
            <div className="absolute bottom-6 left-4 right-20 z-10 space-y-3">
                <div className="w-32 h-5 rounded-md skeleton-pulse bg-white/10" />
                <div className="w-64 h-4 rounded-md skeleton-pulse bg-white/10" />
                <div className="w-48 h-4 rounded-md skeleton-pulse bg-white/10 opacity-70" />

                {/* Music Skeleton */}
                <div className="flex items-center gap-2 mt-2">
                    <div className="w-6 h-6 rounded-full skeleton-pulse bg-white/10" />
                    <div className="w-40 h-4 rounded-md skeleton-pulse bg-white/10" />
                </div>
            </div>

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 pointer-events-none" />
        </div>
    );
};
