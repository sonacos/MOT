import React from 'react';

interface TopBarProps {
    title: string;
}

const TopBar: React.FC<TopBarProps> = ({ title }) => {
    return (
        <header className="bg-white/80 backdrop-blur-lg sticky top-0 z-20 print:hidden border-b border-slate-200">
            <div className="flex items-center justify-between p-4 h-16">
                <h1 className="text-xl font-bold text-slate-800">{title}</h1>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-600">Utilisateur</span>
                    <img
                        className="h-9 w-9 rounded-full object-cover ring-2 ring-white"
                        src="https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1361&q=80"
                        alt="User avatar"
                    />
                </div>
            </div>
        </header>
    );
};

export default TopBar;
