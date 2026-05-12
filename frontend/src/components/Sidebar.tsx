import React from 'react';
import { Home, Heart } from 'lucide-react';

interface SidebarProps {
    activeTab: 'foryou' | 'likes';
    onTabChange: (tab: 'foryou' | 'likes') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange }) => {
    return (
        <div className="hidden md:flex flex-col w-16 h-full glass-panel border-r-0 border-r-white/10 z-50 justify-center items-center py-8">
            <div className="flex flex-col gap-4 items-center">
                <NavItem
                    icon={<Home size={24} />}
                    isActive={activeTab === 'foryou'}
                    onClick={() => onTabChange('foryou')}
                />
                <NavItem
                    icon={<Heart size={24} />}
                    isActive={activeTab === 'likes'}
                    onClick={() => onTabChange('likes')}
                />
            </div>
        </div>
    );
};

interface NavItemProps {
    icon: React.ReactNode;
    isActive: boolean;
    onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`p-3 rounded-xl transition-all duration-200 group
                ${isActive
                    ? 'bg-white/10 text-white shadow-lg shadow-black/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            <div className={`${isActive ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`}>
                {icon}
            </div>
        </button>
    );
};