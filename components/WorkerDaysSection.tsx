import React, { useState, useMemo } from 'react';
import { Worker, WorkerGroup, WorkedDays } from '../types';

interface WorkerDaysSectionProps {
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    onSave: (data: WorkedDays) => void;
}

const WorkerDaysSection: React.FC<WorkerDaysSectionProps> = ({ workerGroups, workedDays, onSave }) => {
    const [currentDate, setCurrentDate] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() + 1 };
    });

    const activeWorkers = useMemo(() => 
        workerGroups
            .filter(g => !g.isArchived)
            .flatMap(g => g.workers.filter(w => !w.isArchived))
            .sort((a, b) => a.name.localeCompare(b.name)),
        [workerGroups]
    );
    
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [year, month] = e.target.value.split('-').map(Number);
        setCurrentDate({ year, month });
    };

    const handleDaysChange = (workerId: number, period: 'first' | 'second', value: string) => {
        const days = parseInt(value, 10);
        onSave({
            workerId,
            year: currentDate.year,
            month: currentDate.month,
            period,
            days: isNaN(days) ? 0 : days
        });
    };
    
    const getWorkedDays = (workerId: number, period: 'first' | 'second'): number | '' => {
        const entry = workedDays.find(d =>
            d.workerId === workerId &&
            d.year === currentDate.year &&
            d.month === currentDate.month &&
            d.period === period
        );
        return entry ? entry.days : '';
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800 mb-4">Saisie des Jours de Travail</h2>
            <div className="mb-6 max-w-xs">
                <label htmlFor="month-picker" className="block text-sm font-medium text-slate-700 mb-1.5">Mois et Année</label>
                <input
                    type="month"
                    id="month-picker"
                    value={`${currentDate.year}-${String(currentDate.month).padStart(2, '0')}`}
                    onChange={handleDateChange}
                    className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600">
                        <tr>
                            <th className="text-left p-3 font-semibold">Ouvrier</th>
                            <th className="text-center p-3 font-semibold w-48">Jours Travaillés (Période 1-15)</th>
                            <th className="text-center p-3 font-semibold w-48">Jours Travaillés (Période 16-Fin)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeWorkers.map(worker => (
                            <tr key={worker.id} className="odd:bg-white even:bg-slate-50 border-t">
                                <td className="p-3 font-medium text-slate-800">{worker.name}</td>
                                <td className="p-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="15"
                                        value={getWorkedDays(worker.id, 'first')}
                                        onChange={e => handleDaysChange(worker.id, 'first', e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm text-center focus:ring-sonacos-green focus:border-sonacos-green"
                                        placeholder="0"
                                    />
                                </td>
                                <td className="p-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="16"
                                        value={getWorkedDays(worker.id, 'second')}
                                        onChange={e => handleDaysChange(worker.id, 'second', e.target.value)}
                                        className="w-full p-2 border border-slate-300 rounded-md shadow-sm text-center focus:ring-sonacos-green focus:border-sonacos-green"
                                        placeholder="0"
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {activeWorkers.length === 0 && (
                    <p className="text-center text-slate-500 py-8">Aucun ouvrier actif à afficher. Veuillez en ajouter dans la section "Gestion".</p>
                )}
            </div>
        </div>
    );
};

export default WorkerDaysSection;
