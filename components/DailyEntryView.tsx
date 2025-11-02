import React, { useState, useMemo, useRef } from 'react';
// FIX: Import User type to use in props
import { DailyLog, WorkerGroup, User } from '../types';
import { TASK_GROUPS, TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import SearchableSelect from './SearchableSelect';
import DailySummaryTable from './DailySummaryTable';
import OverallSummaryTable from './OverallSummaryTable';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface DailyEntryViewProps {
    logs: DailyLog[];
    addLog: (log: Omit<DailyLog, 'id'>) => void;
    deleteLog: (logId: string) => void;
    finalizedDates: string[];
    onToggleFinalize: (date: string) => void;
    workerGroups: WorkerGroup[];
    entryDate: string;
    setEntryDate: (date: string) => void;
    // FIX: Add currentUser prop to fix type error from App.tsx
    currentUser: User;
}

const taskOptions = TASK_GROUPS.map(group => ({
    label: group.category,
    options: group.tasks.map(task => ({
        label: task.description,
        value: task.id,
        category: group.category
    }))
}));

const DailyEntryView: React.FC<DailyEntryViewProps> = ({ logs, addLog, deleteLog, finalizedDates, onToggleFinalize, workerGroups, entryDate, setEntryDate, currentUser }) => {
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState<number | ''>('');
    const [observation, setObservation] = useState('');
    const [isCompactMode, setIsCompactMode] = useState(false);

    const entryCardRef = useRef<HTMLDivElement>(null);
    const dailyCardRef = useRef<HTMLDivElement>(null);
    const overallCardRef = useRef<HTMLDivElement>(null);
    useGlow(entryCardRef);
    useGlow(dailyCardRef);
    useGlow(overallCardRef);
    
    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers), [workerGroups]);

    const activeWorkerGroups = useMemo(() => 
        workerGroups
            .filter(g => !g.isArchived)
            .map(g => ({
                ...g,
                workers: g.workers.filter(w => !w.isArchived)
            }))
            .filter(g => g.workers.length > 0), 
    [workerGroups]);

    const isDayFinalized = useMemo(() => finalizedDates.includes(entryDate), [finalizedDates, entryDate]);

    const handleAddEntry = (e: React.FormEvent) => {
        e.preventDefault();
        if (isDayFinalized) return;

        if (!entryDate || selectedWorkerIds.length === 0 || !selectedTaskId || !quantity) {
            alert("Veuillez remplir tous les champs obligatoires.");
            return;
        }

        const numWorkers = selectedWorkerIds.length;
        const quantityPerWorker = Number(quantity) / numWorkers;

        selectedWorkerIds.forEach(workerId => {
            addLog({
                date: entryDate,
                workerId,
                taskId: selectedTaskId,
                quantity: quantityPerWorker,
                observation,
            });
        });

        // Reset form
        setSelectedWorkerIds([]);
        setSelectedTaskId(null);
        setQuantity('');
        setObservation('');
    };
    
    const logsForSelectedDate = useMemo(() => {
        return logs.filter(log => log.date === entryDate);
    }, [logs, entryDate]);

    const handleDateNavigate = (offset: number) => {
        const currentDate = new Date(entryDate);
        currentDate.setUTCDate(currentDate.getUTCDate() + offset);
        setEntryDate(currentDate.toISOString().split('T')[0]);
    };

    const downloadCSV = (csvContent: string, fileName: string) => {
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for BOM to support UTF-8 in Excel
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Data processing for Daily Summary CSV
    const dailySummaryData = useMemo(() => {
        const uniqueTaskIdsInLogs = [...new Set(logsForSelectedDate.map(log => Number(log.taskId)))];
        const headerTaskIds = uniqueTaskIdsInLogs.sort((a, b) => Number(a) - Number(b));
        const dataMap = new Map<number, Map<number, number>>();
        for (const log of logsForSelectedDate) {
            const workerId = Number(log.workerId);
            const taskId = Number(log.taskId);
            if (!dataMap.has(workerId)) dataMap.set(workerId, new Map());
            const workerMap = dataMap.get(workerId)!;
            const currentQty = workerMap.get(taskId) || 0;
            workerMap.set(taskId, currentQty + log.quantity);
        }
        return { headerTaskIds, dataMap };
    }, [logsForSelectedDate]);

    const handleExportDailyCSV = () => {
        const { headerTaskIds, dataMap } = dailySummaryData;
        const headers = ['Ouvrier', ...headerTaskIds.map(id => `"${TASK_MAP.get(id)?.description.replace(/"/g, '""') || `Tâche ${id}`}"`)];
        const rows = allWorkers
            .filter(w => dataMap.has(w.id))
            .map(worker => {
                const rowData = [`"${worker.name}"`];
                headerTaskIds.forEach(taskId => {
                    const quantity = dataMap.get(worker.id)?.get(taskId) || 0;
                    rowData.push(quantity.toFixed(2));
                });
                return rowData;
            });

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        downloadCSV(csvContent, `resume_journalier_${entryDate}.csv`);
    };
    
    // Data processing for Overall Summary CSV
    const overallSummaryData = useMemo(() => {
        const uniqueTaskIds = [...new Set(logs.map(log => Number(log.taskId)))];
        const headerTaskIds = uniqueTaskIds.sort((a, b) => Number(a) - Number(b));
        const dataMap = new Map<number, Map<number, number>>();
        for (const log of logs) {
            const workerId = Number(log.workerId);
            const taskId = Number(log.taskId);
            if (!dataMap.has(workerId)) dataMap.set(workerId, new Map());
            const workerMap = dataMap.get(workerId)!;
            const currentQuantity = workerMap.get(taskId) || 0;
            workerMap.set(taskId, currentQuantity + Number(log.quantity));
        }
        return { headerTaskIds, dataMap };
    }, [logs]);

    const handleExportOverallCSV = () => {
        const { headerTaskIds, dataMap } = overallSummaryData;
        const headers = ['Ouvrier', ...headerTaskIds.map(id => `"${TASK_MAP.get(id)?.description.replace(/"/g, '""') || `Tâche ${id}`}"`)];
        const rows = allWorkers
            .filter(w => dataMap.has(w.id))
            .map(worker => {
                const rowData = [`"${worker.name}"`];
                headerTaskIds.forEach(taskId => {
                    const quantity = dataMap.get(worker.id)?.get(taskId) || 0;
                    rowData.push(quantity.toFixed(2));
                });
                return rowData;
            });
        
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        downloadCSV(csvContent, `resume_global.csv`);
    };
    
    return (
        <div className="space-y-8">
            <div ref={entryCardRef} className="bg-sonacos-lavender p-6 rounded-lg shadow-lg border border-purple-200 interactive-glow" onMouseEnter={playHoverSound}>
                <div className="flex justify-between items-start mb-6 border-b border-gray-200 pb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Saisie des Opérations</h2>
                        {isDayFinalized && <p className="text-sm font-semibold text-red-700 bg-red-100/60 px-3 py-1 rounded-full mt-2 inline-block">Cette journée est finalisée et en lecture seule.</p>}
                    </div>
                     {currentUser.role === 'superadmin' && (
                        <button 
                            onClick={(e) => { createRipple(e); onToggleFinalize(entryDate); }}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                isDayFinalized 
                                ? 'bg-sonacos-yellow text-gray-800 hover:bg-amber-400 focus:ring-sonacos-yellow' 
                                : 'bg-sonacos-green text-white hover:bg-green-800 focus:ring-sonacos-green'
                            }`}
                        >
                            {isDayFinalized ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" /></svg>
                                ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v1h1a1 1 0 011 1v3a1 1 0 01-1 1H5v1a5 5 0 0010 0v-1h-1a1 1 0 01-1-1V9a1 1 0 011-1h1V7a5 5 0 00-5-5z" /></svg>
                            )}
                            <span>{isDayFinalized ? 'Déverrouiller' : 'Finaliser la journée'}</span>
                        </button>
                    )}
                </div>
                <fieldset disabled={isDayFinalized}>
                    <form onSubmit={handleAddEntry} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                        <div className="lg:col-span-1">
                            <label htmlFor="entry-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                            <div className="flex items-center">
                                <button type="button" onClick={(e) => { createRipple(e); handleDateNavigate(-1); }} className="p-2.5 border border-slate-300 rounded-l-md bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sonacos-green">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                </button>
                                <input type="date" id="entry-date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required className="w-full p-2 border-t border-b border-slate-300 shadow-sm focus:ring-sonacos-green focus:border-sonacos-green disabled:bg-slate-100 text-center"/>
                                 <button type="button" onClick={(e) => { createRipple(e); handleDateNavigate(1); }} className="p-2.5 border border-slate-300 rounded-r-md bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sonacos-green">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-2 lg:col-span-1">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Ouvrier(s)</label>
                            <WorkerMultiSelect workerGroups={activeWorkerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds} disabled={isDayFinalized} />
                        </div>
                        <div className="md:col-span-1 lg:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Tâche</label>
                            <SearchableSelect options={taskOptions} value={selectedTaskId} onChange={setSelectedTaskId} placeholder="Sélectionner une tâche" disabled={isDayFinalized} />
                        </div>
                        <div className="lg:col-span-1">
                            <label htmlFor="quantity" className="block text-sm font-medium text-slate-700 mb-1.5">Quantité</label>
                            <input type="number" id="quantity" value={quantity} onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} min="0" step="any" placeholder="0" required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green disabled:bg-slate-100"/>
                        </div>
                        <div className="md:col-span-2 lg:col-span-2">
                            <label htmlFor="observation" className="block text-sm font-medium text-slate-700 mb-1.5">Observation</label>
                            <input type="text" id="observation" value={observation} onChange={e => setObservation(e.target.value)} placeholder="Optionnel" className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green disabled:bg-slate-100"/>
                        </div>
                        <div className="md:col-span-1 lg:col-span-1">
                            <button type="submit" onClick={createRipple} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-blue-grey text-white font-semibold rounded-lg hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                <span>Ajouter</span>
                            </button>
                        </div>
                    </form>
                </fieldset>
            </div>
            
            <div ref={dailyCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 className="text-xl font-bold text-slate-800">Résumé du {new Date(entryDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsCompactMode(prev => !prev)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-slate-100 text-slate-600 hover:bg-slate-200 focus:ring-slate-500"
                        >
                            {isCompactMode ? 
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5 8a1 1 0 100-2 1 1 0 000 2zM2 8a3 3 0 116 0 3 3 0 01-6 0zm14 0a1 1 0 100-2 1 1 0 000 2zm-3 0a3 3 0 116 0 3 3 0 01-6 0zM7 15a1 1 0 11-2 0 1 1 0 012 0zm-3 0a3 3 0 100-6 3 3 0 000 6zm14 0a1 1 0 11-2 0 1 1 0 012 0zm-3 0a3 3 0 100-6 3 3 0 000 6z" /></svg>
                            }
                            <span>{isCompactMode ? 'Vue Normale' : 'Vue Compacte'}</span>
                        </button>
                        {logsForSelectedDate.length > 0 && (
                            <ExportMenu
                                onPrint={() => printElement('daily-summary-table-container', `Résumé du ${entryDate}`)}
                                onExportCSV={handleExportDailyCSV}
                                onExportExcel={() => exportToExcel('daily-summary-table-container', `resume_journalier_${entryDate}`)}
                                onExportPDF={() => exportToPDF('daily-summary-table-container', `resume_journalier_${entryDate}`)}
                            />
                        )}
                    </div>
                </div>
                 <div id="daily-summary-table-container">
                    <DailySummaryTable 
                        logs={logsForSelectedDate} 
                        workers={allWorkers}
                        date={entryDate}
                        addLog={addLog}
                        deleteLog={deleteLog}
                        isDayFinalized={isDayFinalized}
                        isCompact={isCompactMode}
                    />
                 </div>
            </div>
            
            <div ref={overallCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h3 className="text-xl font-bold text-slate-800">Résumé Global de toutes les Saisies</h3>
                    <div className="flex items-center gap-2">
                        {logs.length > 0 && (
                             <ExportMenu
                                onPrint={() => printElement('overall-summary-table-container', 'Résumé Global')}
                                onExportCSV={handleExportOverallCSV}
                                onExportExcel={() => exportToExcel('overall-summary-table-container', 'resume_global')}
                                onExportPDF={() => exportToPDF('overall-summary-table-container', 'resume_global')}
                            />
                        )}
                    </div>
                </div>
                 <div id="overall-summary-table-container">
                    <OverallSummaryTable allLogs={logs} workers={allWorkers} isCompact={isCompactMode} />
                 </div>
            </div>
        </div>
    );
};

export default DailyEntryView;