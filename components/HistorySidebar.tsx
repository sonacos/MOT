import React, { useMemo, useState, useEffect } from 'react';
import { DailyLog } from '../types';

interface HistorySidebarProps {
    logs: DailyLog[];
    finalizedDates: string[];
    currentDate: string;
    onDateSelect: (date: string) => void;
}

const getPeriodKey = (dateStr: string): string => {
    const date = new Date(dateStr + 'T00:00:00');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const period = day <= 15 ? 'first' : 'second';
    return `${year}-${month}-${period}`;
};

const formatPeriodKey = (key: string): string => {
    const [year, month, period] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthName = date.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    if (period === 'first') {
        return `1 - 15 ${capitalizedMonthName}`;
    } else {
        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
        return `16 - ${lastDay} ${capitalizedMonthName}`;
    }
};


const HistorySidebar: React.FC<HistorySidebarProps> = ({ logs, finalizedDates, currentDate, onDateSelect }) => {
    const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());

    const groupedAndSortedPeriods = useMemo(() => {
        const dateSet = new Set(logs.map(log => log.date));
        const uniqueDates = Array.from(dateSet);

        const groups = new Map<string, string[]>();
        uniqueDates.forEach(date => {
            const key = getPeriodKey(date);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(date);
        });
        
        // Sort dates within each group
        groups.forEach((dates) => dates.sort((a, b) => b.localeCompare(a)));

        // Sort the period keys themselves in reverse chronological order
        // FIX: Explicitly type the sort callback parameters 'a' and 'b' as strings to resolve TS error.
        const sortedKeys = Array.from(groups.keys()).sort((a: string, b: string) => {
            const [yearA, monthA, periodA] = a.split('-');
            const [yearB, monthB, periodB] = b.split('-');
            if (yearA !== yearB) return Number(yearB) - Number(yearA);
            if (monthA !== monthB) return Number(monthB) - Number(monthA);
            return periodB === 'second' ? 1 : -1;
        });

        return sortedKeys.map(key => ({ key, dates: groups.get(key)! }));

    }, [logs]);
    
    useEffect(() => {
        // Automatically expand the period corresponding to the currently selected date
        const currentPeriodKey = getPeriodKey(currentDate);
        setExpandedPeriods(new Set([currentPeriodKey]));
    }, [currentDate]);

    const togglePeriod = (periodKey: string) => {
        setExpandedPeriods(prev => {
            const newSet = new Set(prev);
            if (newSet.has(periodKey)) {
                newSet.delete(periodKey);
            } else {
                newSet.add(periodKey);
            }
            return newSet;
        });
    };

    return (
        <div className="flex-1 min-h-0">
            {groupedAndSortedPeriods.length === 0 ? (
                 <div className="flex-grow flex items-center justify-center">
                    <p className="text-sm text-slate-500 text-center py-4">Aucun historique disponible.</p>
                 </div>
            ) : (
                <ul className="space-y-1 overflow-y-auto h-full -mr-2 pr-2">
                    {groupedAndSortedPeriods.map(({ key, dates }) => {
                        const isExpanded = expandedPeriods.has(key);
                        return (
                            <li key={key} className="bg-green-300/40 rounded-lg">
                                <button 
                                    onClick={() => togglePeriod(key)}
                                    className="w-full text-left p-3 font-bold text-sm text-green-900 flex justify-between items-center"
                                >
                                    <span>{formatPeriodKey(key)}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`} viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                    </svg>
                                </button>
                                {isExpanded && (
                                    <ul className="space-y-1.5 p-2 pt-0">
                                        {dates.map(date => {
                                            const isSelected = date === currentDate;
                                            const isFinalized = finalizedDates.includes(date);
                                            const dateObj = new Date(date + 'T00:00:00');
                                            const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                                                weekday: 'long',
                                                day: 'numeric',
                                                month: 'long',
                                            });
                                            
                                            const buttonClass = isSelected
                                                ? 'bg-sonacos-brown text-white font-semibold shadow-sm'
                                                : isFinalized
                                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                                                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200';
                                            
                                            const lockIconClass = isSelected ? 'text-yellow-200' : 'text-sonacos-yellow';

                                            return (
                                                <li key={date}>
                                                    <button 
                                                        onClick={() => onDateSelect(date)}
                                                        className={`w-full text-left p-3 rounded-lg transition-colors duration-200 flex justify-between items-center ${buttonClass}`}
                                                    >
                                                        <span className="text-sm">{formattedDate}</span>
                                                        {isFinalized && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${lockIconClass}`} viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default HistorySidebar;