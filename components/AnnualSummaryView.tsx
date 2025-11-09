import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task } from '../types';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface AnnualSummaryViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
}

interface AnnualSummaryData {
    worker: Worker;
    totalOperation: number;
    anciennete: number;
    totalBrut: number;
    retenu: number;
    joursTravailles: number;
    indemnites: number;
    netPay: number;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const AnnualSummaryView: React.FC<AnnualSummaryViewProps> = ({ allLogs, workerGroups, workedDays, taskMap, isPrinting = false }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    useGlow(reportCardRef);
    
    const workerOwnerMap = useMemo(() => {
        const map = new Map<number, string>();
        workerGroups.forEach(group => {
            if (group && group.owner && Array.isArray(group.workers)) {
                group.workers.forEach(worker => {
                    if (worker) {
                        map.set(worker.id, group.owner!);
                    }
                });
            }
        });
        return map;
    }, [workerGroups]);

    // Include all workers, even archived ones, to capture their full annual history
    const allWorkers = useMemo(() => 
        workerGroups
            .filter(g => g && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w))
    , [workerGroups]);

    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [reportData, setReportData] = useState<AnnualSummaryData[] | null>(null);

    const handleGenerateReport = () => {
        const yearStr = String(selectedYear);

        const logsForYear = allLogs.filter(log => log.date.startsWith(yearStr));
        const workedDaysForYear = workedDays.filter(wd => wd.year === selectedYear);

        const workerIdsWithActivity = new Set([
            ...logsForYear.map(l => l.workerId),
            ...workedDaysForYear.map(wd => wd.workerId)
        ]);

        const processedData: AnnualSummaryData[] = Array.from(workerIdsWithActivity).map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;

            const workerOwnerId = workerOwnerMap.get(workerId);

            const workerLogs = logsForYear.filter(l => l.workerId === workerId && l.owner === workerOwnerId);
            const workerWorkedDays = workedDaysForYear.filter(wd => wd.workerId === workerId && wd.owner === workerOwnerId);
            
            const joursTravailles = workerWorkedDays.reduce((sum, wd) => sum + wd.days, 0);

            const regularLogs = workerLogs.filter(log => log.taskId !== LAIT_TASK_ID && log.taskId !== PANIER_TASK_ID);

            const totalOperation = regularLogs.reduce((sum, log) => {
                const task = taskMap.get(log.taskId);
                return sum + (Number(log.quantity) * (task?.price || 0));
            }, 0);

            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            
            const laitPricePerDay = taskMap.get(LAIT_TASK_ID)?.price || 0;
            const panierPricePerDay = taskMap.get(PANIER_TASK_ID)?.price || 0;
            const indemnites = joursTravailles * (laitPricePerDay + panierPricePerDay);
            
            const netPay = totalBrut - retenu + indemnites;

            return { worker, totalOperation, anciennete, totalBrut, retenu, joursTravailles, indemnites, netPay };
    
        }).filter((item): item is AnnualSummaryData => item !== null && item.netPay > 0);
        
        processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name));

        setReportData(processedData);
    };

    const ReportContent: React.FC<{ data: AnnualSummaryData[], id: string }> = ({ data, id }) => {
        const grandTotal = data.reduce((sum, item) => sum + item.netPay, 0);

        return (
            <div id={id} className="printable-report bg-white p-6 printable-a4">
                 <header className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-sonacos-slate-dark">Résumé Annuel des Rémunérations</h1>
                    <p className="text-lg text-slate-700 mt-2">Pour l'année {selectedYear}</p>
                </header>
                
                <table className="w-full border-collapse border border-slate-300 text-sm">
                    <thead className="bg-slate-100 font-bold">
                        <tr>
                            <th className="border border-slate-300 p-2 text-left">Ouvrier</th>
                            <th className="border border-slate-300 p-2 text-right">Total Opérations (DH)</th>
                            <th className="border border-slate-300 p-2 text-right">Ancienneté (DH)</th>
                            <th className="border border-slate-300 p-2 text-right">Total Brut (DH)</th>
                            <th className="border border-slate-300 p-2 text-right">Retenue CNSS (DH)</th>
                            <th className="border border-slate-300 p-2 text-right">Jours Travaillés</th>
                            <th className="border border-slate-300 p-2 text-right">Indemnités (DH)</th>
                            <th className="border border-slate-300 p-2 text-right">Net à Payer (DH)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map(item => (
                            <tr key={item.worker.id} className="odd:bg-white even:bg-slate-50">
                                <td className="border border-slate-300 p-2 font-medium">{item.worker.name}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono">{item.totalOperation.toFixed(2)}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono">{item.anciennete.toFixed(2)}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono font-semibold">{item.totalBrut.toFixed(2)}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono text-red-600">({item.retenu.toFixed(2)})</td>
                                <td className="border border-slate-300 p-2 text-center font-mono">{item.joursTravailles}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono text-green-600">{item.indemnites.toFixed(2)}</td>
                                <td className="border border-slate-300 p-2 text-right font-mono font-bold text-lg">{item.netPay.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="font-bold bg-slate-200 text-lg">
                        <tr>
                            <td colSpan={7} className="border border-slate-300 p-3 text-right">Total Général</td>
                            <td className="border border-slate-300 p-3 text-right font-mono">
                                {grandTotal.toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    }

    if (isPrinting && reportData) {
        return <ReportContent data={reportData} id="annual-summary-content" />;
    }

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

    return (
        <div className="space-y-8">
            <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Options du Résumé Annuel</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div className="md:col-span-1">
                        <label htmlFor="select-year" className="block text-sm font-medium text-slate-700 mb-1.5">Année Civile</label>
                        <select 
                          id="select-year" 
                          value={selectedYear} 
                          onChange={e => setSelectedYear(Number(e.target.value))} 
                          className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                        >
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                </div>
                 <div className="flex justify-end mt-6">
                    <div className="flex flex-col md:flex-row items-stretch gap-2">
                        <button onClick={(e) => { createRipple(e); handleGenerateReport(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">Générer le Résumé</button>
                        {reportData && (
                           <ExportMenu 
                                onPrint={() => printElement('annual-summary-content', `Résumé Annuel - ${selectedYear}`)}
                                onExportPDF={() => exportToPDF('annual-summary-content', `ResumeAnnuel_${selectedYear}`, 'landscape')}
                                onExportExcel={() => exportToExcel('annual-summary-content', `ResumeAnnuel_${selectedYear}`)}
                           />
                        )}
                    </div>
                </div>
            </div>
            
            {reportData && (
                <div ref={reportCardRef} className="bg-slate-200 p-8 rounded-lg" onMouseEnter={playHoverSound}>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      <ReportContent data={reportData} id="annual-summary-content" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnnualSummaryView;
