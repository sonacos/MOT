import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task, FinalReportData, SavedFinalReport, User, SavedPayroll, PayrollData, SavedTransferOrder, TransferOrderData } from '../types';
import { getDynamicTaskByIdWithFallback } from '../constants';
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
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedFinalReport[];
    onSave: (report: Partial<SavedFinalReport>) => Promise<void>;
    onSavePayroll: (report: Partial<SavedPayroll>) => Promise<void>;
    onSaveTransferOrder: (report: Partial<SavedTransferOrder>) => Promise<void>;
    onDelete: (report: SavedFinalReport) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
    onDirectExport: (report: SavedFinalReport, format: 'print' | 'pdf' | 'excel') => void;
    viewingReport?: SavedFinalReport | null; // For direct export rendering
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

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
    taskMap: Map<number, Task & { category: string }>;
}> = ({ workers, logs, allWorkedDays, year, month, period, regionalCenter, startDate, endDate, taskMap }) => {
    
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

    const workersWithData = workers; // Use all selected workers passed in
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
                                        const task = getDynamicTaskByIdWithFallback(taskId, taskMap);
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

const FinalReportView: React.FC<FinalReportViewProps> = ({ allLogs, workerGroups, workedDays, onSaveWorkedDays, taskMap, isPrinting = false, savedReports, onSave, onSavePayroll, onSaveTransferOrder, onDelete, requestConfirmation, currentUser, onDirectExport, viewingReport: viewingReportForExport }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);

    const allWorkersIncludingDeparted = useMemo(() => 
        workerGroups
            .filter(g => g && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w))
    , [workerGroups]);

    const selectableWorkerGroups = useMemo(() => 
        workerGroups
            .filter(g => g && Array.isArray(g.workers))
            .map(g => ({
                ...g,
                workers: g.workers.filter(w => w) // Just check for existence
            }))
            .filter(g => g.workers.length > 0)
            .sort((a, b) => {
                if (a.isDepartedGroup) return 1;
                if (b.isDepartedGroup) return -1;
                return a.groupName.localeCompare(b.groupName);
            }), 
    [workerGroups]);


    // Component State
    const [mode, setMode] = useState<'list' | 'form'>('list');
    const [editingReport, setEditingReport] = useState<SavedFinalReport | null>(null);
    const [viewingReport, setViewingReport] = useState<SavedFinalReport | null>(null);
    const [draftData, setDraftData] = useState<FinalReportData | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedPeriod, setSelectedPeriod] = useState<'first' | 'second'>(new Date().getDate() <= 15 ? 'first' : 'second');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [regionalCenter, setRegionalCenter] = useState('');
    const [workersForDaysEntry, setWorkersForDaysEntry] = useState<Worker[] | null>(null);
    const [draftDays, setDraftDays] = useState<Record<number, string>>({});
    
    const handleDaysChange = (workerId: number, value: string) => {
        setDraftDays(prev => ({ ...prev, [workerId]: value }));
    };

    const resetForm = () => {
        setSelectedYear(new Date().getFullYear());
        setSelectedMonth(new Date().getMonth() + 1);
        setSelectedPeriod(new Date().getDate() <= 15 ? 'first' : 'second');
        setSelectedWorkerIds([]);
        setRegionalCenter('');
        setWorkersForDaysEntry(null);
        setDraftDays({});
        setDraftData(null);
        setEditingReport(null);
        setViewingReport(null);
    };

    const handleNewReport = () => {
        resetForm();
        setMode('form');
    };
    
    const handleEditReport = (report: SavedFinalReport) => {
        setMode('form');
        setEditingReport(report);
        setViewingReport(null);
        setDraftData(null);
        setSelectedYear(report.params.year);
        setSelectedMonth(report.params.month);
        setSelectedPeriod(report.params.period);
        setSelectedWorkerIds(report.params.workerIds);
        setRegionalCenter(report.params.regionalCenter);
    };

    const handleDeleteReport = (report: SavedFinalReport) => {
        requestConfirmation(
            "Confirmer la Suppression",
            `Êtes-vous sûr de vouloir supprimer ce rapport du ${new Date(report.createdAt).toLocaleString('fr-FR')}? La paie et l'ordre de virement associés ne seront PAS supprimés.`,
            () => {
                onDelete(report);
                setViewingReport(null);
            }
        );
    };

    const handlePrepareDaysEntry = () => {
        if (selectedWorkerIds.length === 0) {
            alert("Veuillez sélectionner au moins un ouvrier pour préparer le rapport.");
            return;
        }

        const allRelevantWorkerIds = new Set(selectedWorkerIds);
        
        const relevantWorkers = allWorkersIncludingDeparted
            .filter(w => allRelevantWorkerIds.has(w.id))
            .sort((a, b) => a.name.localeCompare(b.name));
        
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
        setDraftData(null);
    };

    const handleGenerateDraft = async () => {
        if (!workersForDaysEntry) return;

        setIsGenerating(true);

        const newWorkedDaysEntries = workersForDaysEntry.map(worker => {
            const days = parseInt(draftDays[worker.id] || '0', 10);
            return {
                workerId: worker.id,
                year: selectedYear,
                month: selectedMonth,
                period: selectedPeriod,
                days: isNaN(days) || days < 0 ? 0 : days,
            };
        });

        await Promise.all(newWorkedDaysEntries.map(entry => onSaveWorkedDays(entry)));
        
        const startDateNum = selectedPeriod === 'first' ? 1 : 16;
        const endDateNum = selectedPeriod === 'first' ? 15 : new Date(selectedYear, selectedMonth, 0).getDate();
        const startDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, startDateNum)).toISOString().split('T')[0];
        const endDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, endDateNum)).toISOString().split('T')[0];

        const workerIdsToReport = workersForDaysEntry.map(w => w.id);
        const logsForReport = allLogs.filter(log => log.date >= startDateStr && log.date <= endDateStr && workerIdsToReport.includes(log.workerId));
        
        setDraftData({
            workers: workersForDaysEntry,
            logs: logsForReport,
            allWorkedDays: workedDays, // Note: This might be slightly stale, but should be ok for display
            startDate: `${String(startDateNum).padStart(2, '0')}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`,
            endDate: `${endDateNum}/${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
        });

        setIsGenerating(false);
    };

    const handleSave = async (andContinue: boolean) => {
        if (!draftData) return;
        setIsSaving(true);
    
        // 1. Save FinalReport
        const finalReportToSave: Partial<SavedFinalReport> = {
            id: editingReport?.id,
            owner: editingReport?.owner,
            createdAt: editingReport?.createdAt,
            params: {
                year: selectedYear,
                month: selectedMonth,
                period: selectedPeriod,
                regionalCenter,
                workerIds: selectedWorkerIds
            },
            data: draftData,
        };
        await onSave(finalReportToSave);
    
        // Prepare data for chained reports
        const startDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, selectedPeriod === 'first' ? 1 : 16)).toISOString().split('T')[0];
        const endDate = new Date(Date.UTC(selectedYear, selectedMonth - 1, selectedPeriod === 'first' ? 15 : new Date(selectedYear, selectedMonth, 0).getDate())).toISOString().split('T')[0];
    
        const getDaysWorkedForWorker = (workerId: number) => {
            const entry = workedDays.find(d => d.workerId === workerId && d.year === selectedYear && d.month === selectedMonth && d.period === selectedPeriod);
            return entry?.days || 0;
        };

        // 2. Calculate and Save Payroll
        const payrollData: PayrollData[] = draftData.workers.map(worker => {
            const workerLogs = draftData.logs.filter(l => l.workerId === worker.id);
            const joursTravailles = getDaysWorkedForWorker(worker.id);
            const tasksSummary = new Map<number, { quantity: number; price: number }>();
            workerLogs.filter(log => log.taskId !== LAIT_TASK_ID && log.taskId !== PANIER_TASK_ID).forEach(log => {
                const task = taskMap.get(log.taskId);
                if (!task) return;
                const existing = tasksSummary.get(log.taskId) || { quantity: 0, price: task.price };
                existing.quantity += Number(log.quantity);
                tasksSummary.set(log.taskId, existing);
            });
            const workerTasks: PayrollData['tasks'] = Array.from(tasksSummary.entries()).map(([taskId, summary]) => ({ taskId, ...summary, amount: summary.quantity * summary.price }));
            const totalOperation = workerTasks.reduce((sum, task) => sum + task.amount, 0);
            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            return { worker, tasks: workerTasks.sort((a,b) => a.taskId - b.taskId), totalOperation, anciennete, totalBrut, retenu, joursTravailles };
        });
    
        const payrollReportToSave: Partial<SavedPayroll> = {
            params: {
                startDate, endDate, workerIds: selectedWorkerIds,
                anneeScolaire: `${selectedYear}/${selectedYear + 1}`,
                anneeRegle: `${selectedYear + 1}/${selectedYear + 2}`,
                // FIX: Use `regionalCenter` state variable for the `centreRegional` property.
                centreRegional: regionalCenter,
                additionalInputs: {},
            },
            data: payrollData,
        };
        await onSavePayroll(payrollReportToSave);
    
        // 3. Calculate and Save Transfer Order
        const transferOrderData: TransferOrderData[] = draftData.workers.map(worker => {
            const joursTravailles = getDaysWorkedForWorker(worker.id);
            const totalOperation = draftData.logs.filter(l => l.workerId === worker.id && l.taskId !== LAIT_TASK_ID && l.taskId !== PANIER_TASK_ID)
                .reduce((sum, log) => sum + (Number(log.quantity) * (taskMap.get(log.taskId)?.price || 0)), 0);
            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            const indemniteLait = joursTravailles * (taskMap.get(LAIT_TASK_ID)?.price || 0);
            const primePanier = joursTravailles * (taskMap.get(PANIER_TASK_ID)?.price || 0);
            const netPay = totalBrut - retenu + indemniteLait + primePanier;
            return { worker, netPay };
        }).filter(item => item.netPay > 0);
    
        const transferOrderReportToSave: Partial<SavedTransferOrder> = {
            params: {
                startDate, endDate, workerIds: selectedWorkerIds,
                city: regionalCenter || 'Taza',
                orderDate: new Date().toISOString().split('T')[0],
            },
            data: transferOrderData,
        };
        await onSaveTransferOrder(transferOrderReportToSave);
    
        setIsSaving(false);
    
        if (andContinue) {
            setEditingReport(null);
            setDraftData(null);
            setSelectedWorkerIds([]);
            setWorkersForDaysEntry(null);
            setDraftDays({});
            alert('Rapports sauvegardés avec succès. Vous pouvez maintenant sélectionner un autre groupe d\'ouvriers.');
        } else {
            resetForm();
            setMode('list');
        }
    };

    if (isPrinting) {
        const reportToPrint = viewingReport || viewingReportForExport;
        if (reportToPrint) {
             return <ReportContent {...reportToPrint.data} {...reportToPrint.params} taskMap={taskMap} allWorkedDays={workedDays} />;
        }
       return null;
    }

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
    const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('fr-FR', { month: 'long' }) }));

    return (
        <div className="space-y-8">
            {mode === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-slate-800">Rapports Bi-mensuels Sauvegardés</h2>
                        <button onClick={handleNewReport} className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                            <span>Générer un nouveau rapport</span>
                        </button>
                    </div>
                    {savedReports.length > 0 ? (
                        <ul className="space-y-3">
                            {savedReports
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map(report => (
                                <li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                                    <div>
                                        <button onClick={() => setViewingReport(report)} className="font-semibold text-sonacos-green hover:underline text-left">
                                            Rapport du {report.data.startDate} au {report.data.endDate}
                                        </button>
                                        <p className="text-sm text-slate-500">
                                            Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}
                                            {currentUser.role === 'superadmin' && ` par ${report.owner}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ExportMenu
                                            onPrint={() => onDirectExport(report, 'print')}
                                            onExportPDF={() => onDirectExport(report, 'pdf')}
                                            onExportExcel={() => onDirectExport(report, 'excel')}
                                        />
                                        <button onClick={() => handleEditReport(report)} className="p-2 text-slate-500 hover:text-blue-600 rounded-full hover:bg-blue-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button>
                                        <button onClick={() => handleDeleteReport(report)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-center py-8 text-slate-500">Aucun rapport sauvegardé.</p>}
                </div>
            )}

            {mode === 'form' && (
                <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">{editingReport ? 'Modifier le Rapport' : 'Générer un Nouveau Rapport'}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1.5">Année</label><select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md shadow-sm">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1.5">Mois</label><select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md shadow-sm">{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1.5">Période</label><select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value as 'first' | 'second')} className="w-full p-2 border border-slate-300 rounded-md shadow-sm"><option value="first">1 - 15</option><option value="second">16 - Fin du mois</option></select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label><input type="text" value={regionalCenter} onChange={e => setRegionalCenter(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md shadow-sm" placeholder="Ex: Taza"/></div>
                        <div className="md:col-span-4"><label className="block text-sm font-medium text-slate-700 mb-1.5">Ouvrier(s) à inclure</label><WorkerMultiSelect workerGroups={selectableWorkerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds} /></div>
                    </div>
                    <div className="flex justify-between items-center mt-6">
                        <button onClick={() => { setMode('list'); resetForm(); }} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button onClick={handlePrepareDaysEntry} className="px-4 py-2 bg-sonacos-blue-grey text-white font-semibold rounded-lg hover:bg-slate-600">Étape Suivante : Saisir les Jours</button>
                    </div>
                </div>
            )}
            
            {mode === 'form' && workersForDaysEntry && (
                 <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <h3 className="text-xl font-bold text-slate-800 mb-4">Saisie des Jours Travaillés</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-64 overflow-y-auto p-2 border rounded-md bg-slate-50">
                        {workersForDaysEntry.map(worker => (
                             <div key={worker.id}><label htmlFor={`wd-${worker.id}`} className="block text-sm font-medium text-slate-700 truncate mb-1">{worker.name}</label><input id={`wd-${worker.id}`} type="number" min="0" max="16" value={draftDays[worker.id] || '0'} onChange={e => handleDaysChange(worker.id, e.target.value)} className="w-full p-2 border border-slate-300 rounded-md"/></div>
                        ))}
                    </div>
                    <div className="flex justify-end mt-6">
                        <button onClick={handleGenerateDraft} disabled={isGenerating} className="px-4 py-2 bg-sonacos-teal-dark text-white font-semibold rounded-lg hover:bg-slate-800 disabled:bg-slate-400">
                            {isGenerating ? 'Génération...' : 'Générer le Brouillon du Rapport'}
                        </button>
                    </div>
                 </div>
            )}
            
            {(viewingReport || draftData) && (
                 <div className="bg-slate-200 p-8 rounded-lg">
                     <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold">{viewingReport ? 'Aperçu du Rapport Sauvegardé' : 'Brouillon du Rapport'}</h2>
                        <div className="flex items-center gap-3">
                            {viewingReport && <ExportMenu onPrint={() => printElement('final-report-content', 'Rapport')} onExportPDF={() => exportToPDF('final-report-content', 'Rapport')} onExportExcel={() => exportToExcel('final-report-content', 'Rapport')} />}
                            {draftData && !viewingReport && (
                                <div className="flex items-center gap-3">
                                    <button onClick={() => handleSave(false)} disabled={isSaving} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600 disabled:bg-slate-400">
                                        {isSaving ? 'Sauvegarde...' : 'Sauvegarder et Quitter'}
                                    </button>
                                    <button onClick={() => handleSave(true)} disabled={isSaving} className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 disabled:bg-slate-400">
                                        {isSaving ? 'Sauvegarde...' : 'Sauvegarder et Créer un autre'}
                                    </button>
                                </div>
                            )}
                        </div>
                     </div>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl" id="final-report-content">
                        {viewingReport ? <ReportContent {...viewingReport.data} {...viewingReport.params} taskMap={taskMap} allWorkedDays={workedDays}/> : draftData ? <ReportContent {...draftData} year={selectedYear} month={selectedMonth} period={selectedPeriod} regionalCenter={regionalCenter} taskMap={taskMap} allWorkedDays={workedDays}/> : null}
                    </div>
                     {viewingReport && (
                        <div className="flex justify-center mt-4 gap-4">
                             <button onClick={() => setViewingReport(null)} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Fermer l'aperçu</button>
                        </div>
                     )}
                </div>
            )}
        </div>
    );
};

export default FinalReportView;