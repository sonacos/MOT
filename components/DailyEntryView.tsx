import React, { useState, useMemo } from 'react';
import { DailyLog, WorkerGroup } from '../types';
import { TASK_GROUPS, TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import SearchableSelect from './SearchableSelect';
import DailySummaryTable from './DailySummaryTable';
import OverallSummaryTable from './OverallSummaryTable';
import HistorySidebar from './HistorySidebar';

interface DailyEntryViewProps {
    logs: DailyLog[];
    addLog: (log: Omit<DailyLog, 'id'>) => void;
    deleteLog: (logId: number) => void;
    finalizedDates: string[];
    onToggleFinalize: (date: string) => void;
    workerGroups: WorkerGroup[];
}

const taskOptions = TASK_GROUPS.map(group => ({
    label: group.category,
    options: group.tasks.map(task => ({
        label: task.description,
        value: task.id,
        category: group.category
    }))
}));

const DailyEntryView: React.FC<DailyEntryViewProps> = ({ logs, addLog, deleteLog, finalizedDates, onToggleFinalize, workerGroups }) => {
    const today = new Date().toISOString().split('T')[0];
    const [entryDate, setEntryDate] = useState(today);
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState<number | ''>('');
    const [observation, setObservation] = useState('');
    
    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers), [workerGroups]);

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
    
    const printTable = (tableId: string, title: string) => {
        const printContents = document.getElementById(tableId)?.innerHTML;
        if (!printContents) return;

        const printWindow = window.open('', '', 'height=800,width=1200');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
                <head>
                    <title>${title}</title>
                    <script src="https://cdn.tailwindcss.com"></script>
                    <style>
                        @page { size: A4 landscape; margin: 0.75in; }
                        body { font-family: sans-serif; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
                        thead { background-color: #f1f5f9; }
                        tbody tr:nth-child(even) { background-color: #f8fafc; }
                        .text-center { text-align: center !important; }
                        .font-semibold { font-weight: 600; }
                        .text-slate-800 { color: #1e293b; }
                        .text-xs { font-size: 0.75rem; }
                        .text-slate-500 { color: #64748b; }
                        .font-normal { font-weight: 400; }
                        input { display: none; } /* Hide inputs for printing */
                    </style>
                </head>
                <body>
                    <h1 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem;">${title}</h1>
                    ${printContents}
                </body>
            </html>
        `);
        printWindow.document.close();

        setTimeout(() => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        }, 500);
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

    const ActionButton: React.FC<{onClick: () => void, children: React.ReactNode}> = ({ onClick, children }) => (
        <button
            onClick={onClick}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 bg-slate-600 text-white hover:bg-slate-700 focus:ring-slate-500"
        >
            {children}
        </button>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <div className="lg:col-span-1">
                <HistorySidebar 
                    logs={logs}
                    finalizedDates={finalizedDates}
                    currentDate={entryDate}
                    onDateSelect={setEntryDate}
                />
            </div>
            <div className="lg:col-span-3 space-y-8">
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-100">
                    <div className="flex justify-between items-start mb-6 border-b border-gray-200 pb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Saisie des Opérations</h2>
                            {isDayFinalized && <p className="text-sm font-semibold text-amber-800 bg-sonacos-yellow/50 px-3 py-1 rounded-full mt-2 inline-block">Cette journée est finalisée et en lecture seule.</p>}
                        </div>
                         <button 
                            onClick={() => onToggleFinalize(entryDate)}
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
                    </div>
                    <fieldset disabled={isDayFinalized}>
                        <form onSubmit={handleAddEntry} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                            <div className="lg:col-span-1">
                                <label htmlFor="entry-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date</label>
                                <div className="flex items-center">
                                    <button type="button" onClick={() => handleDateNavigate(-1)} className="p-2.5 border border-slate-300 rounded-l-md bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sonacos-green">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    </button>
                                    <input type="date" id="entry-date" value={entryDate} onChange={e => setEntryDate(e.target.value)} required className="w-full p-2 border-t border-b border-slate-300 shadow-sm focus:ring-sonacos-green focus:border-sonacos-green disabled:bg-slate-100 text-center"/>
                                     <button type="button" onClick={() => handleDateNavigate(1)} className="p-2.5 border border-slate-300 rounded-r-md bg-slate-50 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sonacos-green">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="md:col-span-2 lg:col-span-1">
                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Ouvrier(s)</label>
                                <WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds} disabled={isDayFinalized} />
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
                                <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    <span>Ajouter</span>
                                </button>
                            </div>
                        </form>
                    </fieldset>
                </div>
                
                 <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Résumé du {new Date(entryDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                     <div id="daily-summary-table-container">
                        <DailySummaryTable 
                            logs={logsForSelectedDate} 
                            workers={allWorkers}
                            date={entryDate}
                            addLog={addLog}
                            deleteLog={deleteLog}
                            isDayFinalized={isDayFinalized}
                        />
                     </div>
                     {logsForSelectedDate.length > 0 && (
                        <div className="mt-4 flex justify-end gap-3">
                            <ActionButton onClick={handleExportDailyCSV}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                <span>Exporter CSV</span>
                            </ActionButton>
                            <ActionButton onClick={() => printTable('daily-summary-table-container', `Résumé du ${entryDate}`)}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h6a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v3h6v-3z" clipRule="evenodd" /></svg>
                                <span>Imprimer</span>
                            </ActionButton>
                        </div>
                     )}
                </div>
                
                 <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Résumé Global de toutes les Saisies</h3>
                     <div id="overall-summary-table-container">
                        <OverallSummaryTable allLogs={logs} workers={allWorkers} />
                     </div>
                      {logs.length > 0 && (
                        <div className="mt-4 flex justify-end gap-3">
                           <ActionButton onClick={handleExportOverallCSV}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                <span>Exporter CSV</span>
                            </ActionButton>
                            <ActionButton onClick={() => printTable('overall-summary-table-container', 'Résumé Global')}>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v3a2 2 0 002 2h6a2 2 0 002-2v-3h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v3h6v-3z" clipRule="evenodd" /></svg>
                                <span>Imprimer</span>
                            </ActionButton>
                        </div>
                     )}
                </div>
            </div>
        </div>
    );
};

export default DailyEntryView;