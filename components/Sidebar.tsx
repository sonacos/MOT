import React from 'react';

type View = 'entry' | 'report' | 'management';

interface SidebarProps {
    currentView: View;
    onViewChange: (view: View) => void;
}

const SonacosLogo = () => (
    <div className="flex items-center gap-3 px-4 py-6">
        <div className="bg-white p-2 rounded-full shadow">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-sonacos-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">
            SONACOS
        </h1>
    </div>
);

const NavButton: React.FC<{view: View, label: string, icon: React.ReactNode, isActive: boolean, onClick: () => void}> = ({ label, icon, isActive, onClick }) => {
    const baseClasses = "w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-sonacos-green focus:ring-sonacos-yellow";
    const activeClasses = "bg-white/10 text-white";
    const inactiveClasses = "text-green-100 hover:bg-white/5 hover:text-white";
    return (
        <button onClick={onClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  return (
    <aside className="w-64 bg-sonacos-green flex-shrink-0 flex flex-col print:hidden">
        <SonacosLogo />
        <nav className="flex-1 px-4 space-y-2">
            <NavButton 
                view="entry"
                label="Saisie Journalière"
                isActive={currentView === 'entry'}
                onClick={() => onViewChange('entry')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>}
            />
            <NavButton 
                view="report"
                label="Générer un Rapport"
                isActive={currentView === 'report'}
                onClick={() => onViewChange('report')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>}
            />
            <NavButton 
                view="management"
                label="Gestion"
                isActive={currentView === 'management'}
                onClick={() => onViewChange('management')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm-1.542 4.032a3.484 3.484 0 00-2.916 0 6.002 6.002 0 00-4.431 5.51V18h12.778v-2.458a6.002 6.002 0 00-4.43-5.51zM16.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM19 14.5a4.5 4.5 0 00-9 0V18h9v-3.5z" /></svg>}
            />
        </nav>
    </aside>
  );
};

export default Sidebar;
