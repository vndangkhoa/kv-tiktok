import React from 'react';
import { Home, Search, Heart, LogOut } from 'lucide-react';

interface SidebarProps {
    activeTab: 'foryou' | 'search' | 'profile';
    onTabChange: (tab: 'foryou' | 'search' | 'profile') => void;
    onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, onLogout }) => {
    return (
        <div className="hidden md:flex flex-col w-20 lg:w-64 h-full glass-panel border-r-0 border-r-white/10 z-50 transition-all duration-300">
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex-shrink-0" />
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden lg:block">
                    PureStream
                </h1>
            </div>

            {/* Nav Items */}
            <div className="flex-1 flex flex-col gap-2 px-3 py-4">
                <NavItem
                    icon={<Home size={24} />}
                    label="For You"
                    isActive={activeTab === 'foryou'}
                    onClick={() => onTabChange('foryou')}
                />
                <NavItem
                    icon={<Search size={24} />}
                    label="Search"
                    isActive={activeTab === 'search'}
                    onClick={() => onTabChange('search')}
                />
                {/* Placeholder for future features */}
                <NavItem
                    icon={<Heart size={24} />}
                    label="Likes"
                    isActive={false}
                    onClick={() => { }}
                />
            </div>

            {/* Bottom Actions */}
            <div className="p-4 border-t border-white/10 space-y-2">
                <button
                    onClick={onLogout}
                    className="flex items-center gap-4 w-full p-3 rounded-xl text-gray-400 hover:bg-white/5 hover:text-red-400 transition-all group"
                >
                    <LogOut size={22} className="group-hover:scale-110 transition-transform" />
                    <span className="hidden lg:block font-medium">Log Out</span>
                </button>
            </div>
        </div>
    );
};

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, isActive, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-4 w-full p-3 rounded-xl transition-all duration-200 group
                ${isActive
                    ? 'bg-white/10 text-white shadow-lg shadow-black/20'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            <div className={`${isActive ? 'scale-110' : 'group-hover:scale-110'} transition-transform duration-200`}>
                {icon}
            </div>
            <span className={`hidden lg:block font-medium ${isActive ? 'text-white' : ''}`}>
                {label}
            </span>
        </button>
    );
};
