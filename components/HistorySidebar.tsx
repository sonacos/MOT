import React, { useMemo } from 'react';
import { DailyLog } from '../types';

interface HistorySidebarProps {
    logs: DailyLog[];
    finalizedDates: string[];
    currentDate: string;
    onDateSelect: (date: string) => void;
}

const HistorySidebar: React.FC<HistorySidebarProps> = ({ logs, finalizedDates, currentDate, onDateSelect }) => {
    const uniqueSortedDates = useMemo(() => {
        const dateSet = new Set(logs.map(log => log.date));
        return Array.from(dateSet).sort((a: string, b: string) => b.localeCompare(a)); // Sort descending (most recent first)
    }, [logs]);

    return (
        <aside className="bg-white p-4 rounded-lg shadow-lg border border-slate-100 h-full flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-4 border-b pb-2 flex-shrink-0">Historique des Saisies</h3>
            {uniqueSortedDates.length === 0 ? (
                 <div className="flex-grow flex items-center justify-center">
                    <p className="text-sm text-slate-500 text-center py-4">Aucun historique disponible.</p>
                 </div>
            ) : (
                <ul className="space-y-1.5 overflow-y-auto flex-grow -mr-2 pr-2">
                    {uniqueSortedDates.map(date => {
                        const isSelected = date === currentDate;
                        const isFinalized = finalizedDates.includes(date);
                        const dateObj = new Date(date + 'T00:00:00');
                        const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'long',
                        });

                        return (
                            <li key={date}>
                                <button 
                                    onClick={() => onDateSelect(date)}
                                    className={`w-full text-left p-3 rounded-lg transition-colors duration-200 flex justify-between items-center ${
                                        isSelected 
                                            ? 'bg-sonacos-green text-white font-semibold shadow-sm' 
                                            : 'bg-white hover:bg-slate-100 text-slate-700'
                                    }`}
                                >
                                    <span className="text-sm">{formattedDate}</span>
                                    {isFinalized && (
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isSelected ? 'text-green-200' : 'text-sonacos-yellow'}`} viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                        </svg>
                                    )}
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </aside>
    );
};

export default HistorySidebar;