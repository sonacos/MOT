import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays } from '../types';
import { getTaskByIdWithFallback } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToPDF, exportToExcel } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface FinalReportViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    onSaveWorkedDays: (data: Omit<WorkedDays, 'id' | 'owner'>) => void;
    isPrinting?: boolean;
}

const ReportContent: React.FC<{
    workers: Worker[];
    logs: DailyLog[];
    allWorkedDays: WorkedDays[];
    year: number;
    month: number;
    period: 'first' | 'second';
    regionalCenter: string;
    startDate: string;
    endDate: string;
}> = ({ workers, logs, allWorkedDays, year, month, period, regionalCenter, startDate, endDate }) => {
    
    const { headerTaskIds, dataMap, columnTotals } = useMemo(() => {
        if (!logs || logs.length === 0) {
            return { headerTaskIds: [], dataMap: new Map(), columnTotals: new Map() };
        }
        const uniqueTaskIds = [...new Set(logs.map(log => Number(log.taskId)))];
        const dataMap = new Map<number, Map<number, number>>();
        const totals = new Map<number, number>();
        for (const log of logs) {
            const workerId = Number(log.workerId);
            const taskId = Number(log.taskId);
            const quantity = Number(log.quantity);
            if (!dataMap.has(workerId)) dataMap.set(workerId, new Map());
            const workerMap = dataMap.get(workerId)!;
            workerMap.set(taskId, (workerMap.get(taskId) || 0) + quantity);
            totals.set(taskId, (totals.get(taskId) || 0) + quantity);
        }
        return { 
            headerTaskIds: uniqueTaskIds.sort((a, b) => Number(a) - Number(b)), 
            dataMap,
            columnTotals: totals
        };
    }, [logs]);

    const getDaysWorkedForWorker = (workerId: number) => {
        const entry = allWorkedDays.find(d =>
            d.workerId === workerId &&
            d.year === year &&
            d.month === month &&
            d.period === period
        );
        return entry?.days || 0;
    };

    const workersWithData = workers.filter(w => dataMap.has(w.id) || getDaysWorkedForWorker(w.id) > 0);
    const totalWorkedDays = workersWithData.reduce((sum, w) => sum + getDaysWorkedForWorker(w.id), 0);

    return (
        <div className="printable-report printable-a4 p-4">
            <div className="flex flex-col justify-between min-h-[700px]">
                <header>
                    <div className="text-left mb-8">
                        <p className="font-bold text-lg text-slate-800">SONACOS</p>
                        <p className="text-md text-slate-600">Centre Régional: {regionalCenter || 'N/A'}</p>
                    </div>
                    <div className="text-center my-10">
                        <h1 className="text-2xl font-bold text-sonacos-slate-dark tracking-wide uppercase">État Bi-mensuel de la Main d'Œuvre à la Tâche</h1>
                        <p className="text-lg text-slate-700 mt-2">Pour la période du {startDate} au {endDate}</p>
                    </div>
                </header>
                <main className="flex-grow">
                    {workersWithData.length > 0 ? (
                        <table className="w-full text-sm border-collapse">
                            <thead className="border-b-2 border-slate-400 bg-slate-100">
                                <tr>
                                    <th className="text-left py-2 px-4 border border-slate-300">Ouvrier</th>
                                    {headerTaskIds.map(taskId => {
                                        const task = getTaskByIdWithFallback(taskId);
                                        return (
                                            <th key={task.id} className="text-center py-2 px-1 border border-slate-300">
                                                {task.category === 'Opérations Diverses' || task.category === 'À METTRE À JOUR' ? (
                                                    <div className="font-bold text-xs">{task.description}</div>
                                                ) : (
                                                    <>
                                                        <div className="font-bold text-xs">{task.category}</div>
                                                        <div className="font-normal text-[10px]">{task.description}</div>
                                                    </>
                                                )}
                                            </th>
                                        );
                                    })}
                                    <th className="text-center py-2 px-1 border border-slate-300 font-bold text-xs">Jours Travaillés</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workersWithData.map(worker => {
                                    const workerData = dataMap.get(worker.id);
                                    const workedDays = getDaysWorkedForWorker(worker.id);
                                    return (
                                        <tr key={worker.id}>
                                            <td className="py-2 px-4 font-medium border border-slate-300">{worker.name}</td>
                                            {headerTaskIds.map(taskId => (
                                                <td key={taskId} className="text-center py-2 px-1 font-semibold border border-slate-300">
                                                    {(workerData?.get(taskId) || 0) > 0 ? (workerData?.get(taskId) || 0).toFixed(2) : <span className="text-slate-400">-</span>}
                                                </td>
                                            ))}
                                            <td className="text-center py-2 px-1 font-semibold border border-slate-300">
                                                {workedDays > 0 ? workedDays : <span className="text-slate-400">-</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-200 font-bold">
                                <tr>
                                    <td className="py-2 px-4 border border-slate-300">Total</td>
                                    {headerTaskIds.map(taskId => (
                                        <td key={`total-${taskId}`} className="text-center py-2 px-1 border border-slate-300">
                                            {(columnTotals.get(taskId) || 0) > 0 ? (columnTotals.get(taskId) || 0).toFixed(2) : '-'}
                                        </td>
                                    ))}
                                    <td className="text-center py-2 px-1 border border-slate-300">{totalWorkedDays}</td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <p className="text-center text-slate-500 py-10">Aucune donnée à afficher pour la sélection actuelle.</p>
                    )}
                </main>
                 <footer className="pt-10 mt-auto">
                    <div className="flex justify-between">
                        <div className="flex flex-col items-center"><p className="font-semibold text-slate-800 mb-2">Le Magasinier</p><div className="w-48 h-20"></div></div>
                        <div className="flex flex-col items-center"><p className="font-semibold text-slate-800 mb-2">Le Chef de Centre</p><div className="w-48 h-20"></div></div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

const FinalReportView: React.FC<FinalReportViewProps> = ({ allLogs, workerGroups, workedDays, onSaveWorkedDays, isPrinting = false }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    const daysEntryCardRef = useRef<HTMLDivElement>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    useGlow(daysEntryCardRef);
    useGlow(reportCardRef);

    const allActiveWorkers = useMemo(() => 
        workerGroups
            .filter(g => g && !g.isArchived && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w && !w.isArchived))
    , [workerGroups]);

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedPeriod, setSelectedPeriod] = useState<'first' | 'second'>(new Date().getDate() <= 15 ? 'first' : 'second');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [regionalCenter, setRegionalCenter] = useState('');
    
    const [workersForDaysEntry, setWorkersForDaysEntry] = useState<Worker[] | null>(null);
    const [draftDays, setDraftDays] = useState<Record<number, string>>({});
    const [reportData, setReportData] = useState<any | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handlePrepareDaysEntry = () => {
        const workerIdsToList = selectedWorkerIds.length > 0 ? selectedWorkerIds : allActiveWorkers.map(w => w.id);
        const relevantWorkers = allActiveWorkers.filter(w => workerIdsToList.includes(w.id));
        
        const initialDrafts: Record<number, string> = {};
        relevantWorkers.forEach(worker => {
            const entry = workedDays.find(d =>
                d.workerId === worker.id &&
                d.year === selectedYear &&
                d.month === selectedMonth &&
                d.period === selectedPeriod
            );
            initialDrafts[worker.id] = entry != null ? String(entry.days) : '0';
        });

        setDraftDays(initialDrafts);
        setWorkersForDaysEntry(relevantWorkers);
        setReportData(null); // Reset any existing report
    };

    const handleDaysChange = (workerId: number, value: string) => {
        setDraftDays(prev => ({ ...prev, [workerId]: value }));
    };

    const handleGenerateReport = async () => {
        if (!workersForDaysEntry) return;

        setIsGenerating(true);

        const newWorkedDaysEntries: Omit<WorkedDays, 'id' | 'owner'>[] = workersForDaysEntry.map(worker => {
            const days = parseInt(draftDays[worker.id] || '0', 10);
            return {
                workerId: worker.id,
                year: selectedYear,
                month: selectedMonth,
                period: selectedPeriod,
                days: isNaN(days) || days < 0 ? 0 : days,
            };
        });

        const savePromises = newWorkedDaysEntries.map(entry => onSaveWorkedDays(entry));
        await Promise.all(savePromises);

        // Create an updated version of the workedDays list for immediate use,
        // solving the stale state issue.
        const updatedWorkedDays = [...workedDays];
        newWorkedDaysEntries.forEach(newEntry => {
            const existingIndex = updatedWorkedDays.findIndex(d => 
                d.workerId === newEntry.workerId &&
                d.year === newEntry.year &&
                d.month === newEntry.month &&
                d.period === newEntry.period
            );
            
            if (existingIndex > -1) {
                updatedWorkedDays[existingIndex].days = newEntry.days;
            } else {
                updatedWorkedDays.push({ ...newEntry, id: `temp-${Math.random()}` });
            }
        });

        const startDateNum = selectedPeriod === 'first' ? 1 : 16;
        const endDateNum = selectedPeriod === 'first' ? 15 : new Date(selectedYear, selectedMonth, 0).getDate();
        const startDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, startDateNum)).toISOString().split('T')[0];
        const endDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, endDateNum)).toISOString().split('T')[0];

        const workerIdsToReport = workersForDaysEntry.map(w => w.id);
        const logsForReport = allLogs.filter(log => log.date >= startDateStr && log.date <= endDateStr && workerIdsToReport.includes(log.workerId));
        
        setReportData({
            workers: workersForDaysEntry,
            logs: logsForReport,
            allWorkedDays: updatedWorkedDays,
            startDate: `${String(startDateNum).padStart(2, '0')}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
            endDate: `${endDateNum}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
        });

        setWorkersForDaysEntry(null); // Hide the entry form
        setIsGenerating(false);
    };

    if (isPrinting && reportData) {
        return <ReportContent {...reportData} year={selectedYear} month={selectedMonth} period={selectedPeriod} regionalCenter={regionalCenter} />;
    }

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
    const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('fr-FR', { month: 'long' }) }));

    return (
        <div className="space-y-8">
            <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Générer l'État Bi-mensuel</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Année</label>
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green">
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Mois</label>
                        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green">
                            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                    </div>
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Période</label>
                         <select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value as 'first' | 'second')} className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green">
                            <option value="first">1 - 15</option>
                            <option value="second">16 - Fin du mois</option>
                        </select>
                    </div>
                     <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label>
                        <input type="text" value={regionalCenter} onChange={e => setRegionalCenter(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Ex: Taza"/>
                    </div>
                    <div className="md:col-span-4">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier (Optionnel)</label>
                        <WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds} />
                    </div>
                </div>
                <div className="flex justify-end items-center mt-6 gap-2">
                     <button onClick={(e) => { createRipple(e); handlePrepareDaysEntry(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-blue-grey text-white font-semibold rounded-lg hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500">
                        Afficher les ouvriers pour la saisie
                    </button>
                </div>
            </div>
            
            {workersForDaysEntry && (
                 <div ref={daysEntryCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Saisie des Jours Travaillés</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-64 overflow-y-auto p-2 border rounded-md bg-slate-50">
                        {workersForDaysEntry.map(worker => (
                             <div key={worker.id}>
                                <label htmlFor={`worked-days-${worker.id}`} className="block text-sm font-medium text-slate-700 truncate mb-1">{worker.name}</label>
                                <input
                                    id={`worked-days-${worker.id}`}
                                    type="number"
                                    min="0"
                                    max="16"
                                    value={draftDays[worker.id] || '0'}
                                    onChange={e => handleDaysChange(worker.id, e.target.value)}
                                    className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end mt-6">
                        <button onClick={(e) => { createRipple(e); handleGenerateReport(); }} disabled={isGenerating} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green disabled:bg-slate-400">
                            {isGenerating ? 'Génération...' : 'Enregistrer et Générer le Rapport'}
                        </button>
                    </div>
                 </div>
            )}
            
            {reportData && (
                 <div ref={reportCardRef} className="bg-slate-200 p-8 rounded-lg" onMouseEnter={playHoverSound}>
                     <div className="flex justify-end mb-4">
                        <ExportMenu
                            onPrint={() => printElement('final-report-content', `Etat_${selectedYear}-${selectedMonth}-${selectedPeriod}`)}
                            onExportPDF={() => exportToPDF('final-report-content', `Etat_${selectedYear}-${selectedMonth}-${selectedPeriod}`, 'landscape')}
                            onExportExcel={() => exportToExcel('final-report-content', `Etat_${selectedYear}-${selectedMonth}-${selectedPeriod}`)}
                        />
                    </div>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl" id="final-report-content">
                        <ReportContent {...reportData} year={selectedYear} month={selectedMonth} period={selectedPeriod} regionalCenter={regionalCenter} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default FinalReportView;