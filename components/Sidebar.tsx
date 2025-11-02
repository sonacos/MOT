import React from 'react';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple } from '../utils/effects';
import HistorySidebar from './HistorySidebar';
import { DailyLog, User } from '../types';

type View = 'entry' | 'report' | 'management' | 'payroll' | 'workerDays' | 'transferOrder' | 'userManagement';

interface SidebarProps {
    currentView: View;
    onViewChange: (view: View) => void;
    logs: DailyLog[];
    finalizedDates: string[];
    entryDate: string;
    onHistoryDateSelect: (date: string) => void;
    currentUser: User;
}

const SonacosLogo = () => (
    <div className="flex items-center justify-center px-4 py-6 border-b border-green-300">
        <h1 className="text-3xl font-montserrat font-extrabold tracking-tight bg-gradient-to-r from-red-600 to-green-600 bg-clip-text text-transparent">
            SONACOS
        </h1>
    </div>
);

const NavButton: React.FC<{view: View, label: string, icon: React.ReactNode, isActive: boolean, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void}> = ({ label, icon, isActive, onClick }) => {
    const baseClasses = "w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-sonacos-green";
    const activeClasses = "bg-sonacos-green text-white shadow-md";
    const inactiveClasses = "text-green-900 hover:bg-green-300/50";
    return (
        <button onClick={onClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`} onMouseEnter={playHoverSound}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, logs, finalizedDates, entryDate, onHistoryDateSelect, currentUser }) => {
  
  const handleNavClick = (e: React.MouseEvent<HTMLButtonElement>, view: View) => {
    createRipple(e);
    onViewChange(view);
  };
    
  return (
    <aside className="w-64 bg-green-200 border-r border-green-300 flex-shrink-0 flex flex-col print:hidden">
        <SonacosLogo />
        <nav className="p-4 space-y-2">
            <NavButton 
                view="entry"
                label="Saisie Journalière"
                isActive={currentView === 'entry'}
                onClick={(e) => handleNavClick(e, 'entry')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>}
            />
             <NavButton 
                view="workerDays"
                label="Gestion des Jours"
                isActive={currentView === 'workerDays'}
                onClick={(e) => handleNavClick(e, 'workerDays')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>}
            />
            <NavButton 
                view="report"
                label="Rapport d'Activité"
                isActive={currentView === 'report'}
                onClick={(e) => handleNavClick(e, 'report')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" /></svg>}
            />
            <NavButton 
                view="payroll"
                label="Décompte Paie"
                isActive={currentView === 'payroll'}
                onClick={(e) => handleNavClick(e, 'payroll')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm3 1a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>}
            />
            <NavButton 
                view="transferOrder"
                label="Ordre de Virement"
                isActive={currentView === 'transferOrder'}
                onClick={(e) => handleNavClick(e, 'transferOrder')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>}
            />
            <NavButton 
                view="management"
                label="Gestion Ouvriers"
                isActive={currentView === 'management'}
                onClick={(e) => handleNavClick(e, 'management')}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zm-1.542 4.032a3.484 3.484 0 00-2.916 0 6.002 6.002 0 00-4.431 5.51V18h12.778v-2.458a6.002 6.002 0 00-4.43-5.51zM16.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM19 14.5a4.5 4.5 0 00-9 0V18h9v-3.5z" /></svg>}
            />
             {currentUser.role === 'superadmin' && (
                <NavButton 
                    view="userManagement"
                    label="Gestion Utilisateurs"
                    isActive={currentView === 'userManagement'}
                    onClick={(e) => handleNavClick(e, 'userManagement')}
                    icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 8a6 6 0 11-12 0 6 6 0 0112 0zM7 8a4 4 0 118 0 4 4 0 01-8 0zM4 15a1 1 0 001 1h10a1 1 0 100-2H5a1 1 0 00-1 1z" clipRule="evenodd" /></svg>}
                />
            )}
        </nav>
        <div className="p-4 border-t border-green-300 flex-1 flex flex-col min-h-0">
            <h3 className="text-sm font-bold text-green-900/80 uppercase tracking-wider mb-3">
                Historique des Saisies
            </h3>
            <HistorySidebar 
                logs={logs}
                finalizedDates={finalizedDates}
                currentDate={entryDate}
                onDateSelect={onHistoryDateSelect}
            />
        </div>
    </aside>
  );
};

export default Sidebar;
