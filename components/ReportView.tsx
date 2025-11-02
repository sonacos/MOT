import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup } from '../types';
import { TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface ReportViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    isPrinting?: boolean;
}

const ReportOverallSummary: React.FC<{ allLogs: DailyLog[]; workers: Worker[] }> = ({ allLogs, workers }) => {
    const { headerTaskIds, dataMap, columnTotals } = useMemo(() => {
        if (!allLogs || allLogs.length === 0) {
            return { headerTaskIds: [], dataMap: new Map(), columnTotals: new Map() };
        }

        const uniqueTaskIds = [...new Set(allLogs.map(log => Number(log.taskId)))];
        const dataMap = new Map<number, Map<number, number>>();
        const totals = new Map<number, number>();

        for (const log of allLogs) {
            const workerId = Number(log.workerId);
            const taskId = Number(log.taskId);
            const quantity = Number(log.quantity);

            if (!dataMap.has(workerId)) {
                dataMap.set(workerId, new Map());
            }
            const workerMap = dataMap.get(workerId)!;

            const currentQuantity = workerMap.get(taskId) || 0;
            workerMap.set(taskId, currentQuantity + quantity);
            
            totals.set(taskId, (totals.get(taskId) || 0) + quantity);
        }
        
        return { 
            headerTaskIds: uniqueTaskIds.sort((a, b) => Number(a) - Number(b)), 
            dataMap,
            columnTotals: totals
        };
    }, [allLogs]);

    if (allLogs.length === 0) {
        return null;
    }

    // Only show workers who have logs in the summary
    const workersWithLogs = workers.filter(w => dataMap.has(w.id));

    return (
        <table className="w-full text-sm border-collapse">
            <thead className="border-b-2 border-slate-400 bg-slate-100">
                <tr>
                    <th className="text-left py-2 px-4 border border-slate-300">Ouvrier</th>
                    {headerTaskIds.map(taskId => {
                        const task = TASK_MAP.get(taskId);
                        if (!task) return null;
                        return (
                            <th key={task.id} className="text-center py-2 px-1 border border-slate-300">
                                <div className="font-bold text-xs">{task.category}</div>
                                <div className="font-normal text-[10px]">{task.description}</div>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {workersWithLogs.map(worker => {
                    const workerData = dataMap.get(worker.id);
                    return (
                        <tr key={worker.id}>
                            <td className="py-2 px-4 font-medium border border-slate-300">{worker.name}</td>
                            {headerTaskIds.map(taskId => {
                                const quantity = workerData?.get(taskId) || 0;
                                return (
                                    <td key={taskId} className="text-center py-2 px-1 font-semibold border border-slate-300">
                                        {quantity > 0 ? quantity.toFixed(2) : <span className="text-slate-400">-</span>}
                                    </td>
                                );
                            })}
                        </tr>
                    );
                })}
            </tbody>
            <tfoot>
                <tr className="bg-slate-200 font-bold">
                    <td className="py-2 px-4 border border-slate-300">Total</td>
                    {headerTaskIds.map(taskId => {
                        const total = columnTotals.get(taskId) || 0;
                        return (
                            <td key={`total-${taskId}`} className="text-center py-2 px-1 border border-slate-300">
                                {total > 0 ? total.toFixed(2) : '-'}
                            </td>
                        );
                    })}
                </tr>
            </tfoot>
        </table>
    );
};


const ReportView: React.FC<ReportViewProps> = ({ allLogs, workerGroups, isPrinting = false }) => {
    
    const optionsCardRef = useRef<HTMLDivElement>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    useGlow(reportCardRef);

    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers), [workerGroups]);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [regionalCenter, setRegionalCenter] = useState('');
    const [reportData, setReportData] = useState<any>(null);

    const handleGenerateReport = () => {
        if (!startDate || !endDate) {
            alert("Veuillez sélectionner une période (date de début et de fin).");
            return;
        }

        const workerIdsToReport = selectedWorkerIds.length > 0 ? selectedWorkerIds : allWorkers.map(w => w.id);
        
        const workersForSummary = allWorkers.filter(w => workerIdsToReport.includes(w.id));

        const logsForSummary = allLogs.filter(log => 
            log.date >= startDate && log.date <= endDate && workerIdsToReport.includes(log.workerId)
        );
        
        setReportData({
            regionalCenter,
            startDate,
            endDate,
            allLogsForSummary: logsForSummary,
            allWorkersForSummary: workersForSummary,
        });
    };

    const ReportContent: React.FC<{data: any, id: string}> = ({data, id}) => {
        const formattedStartDate = new Date(data.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedEndDate = new Date(data.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
        <div id={id} className="printable-report printable-a4 p-4">
            <div className="flex flex-col justify-between min-h-[700px]">
                <header>
                    <div className="text-left mb-8">
                        <p className="font-bold text-lg text-slate-800">SONACOS</p>
                        <p className="text-md text-slate-600">Centre Régional: {data.regionalCenter || 'N/A'}</p>
                    </div>
                    <div className="text-center my-10">
                        <h1 className="text-2xl font-bold text-sonacos-slate-dark tracking-wide uppercase">État Bi-mensuel de la Main d'Œuvre à la Tâche</h1>
                        <p className="text-lg text-slate-700 mt-2">Pour la période du {formattedStartDate} au {formattedEndDate}</p>
                    </div>
                </header>

                <main className="flex-grow">
                    {(data.allLogsForSummary && data.allWorkersForSummary && data.allLogsForSummary.length > 0) ? (
                        <div>
                            <ReportOverallSummary 
                                allLogs={data.allLogsForSummary}
                                workers={data.allWorkersForSummary}
                            />
                        </div>
                    ) : (
                         <p className="text-center text-slate-500 py-10">Aucune donnée à afficher pour la sélection actuelle.</p>
                    )}
                </main>

                <footer className="pt-10 mt-auto">
                    <div className="flex justify-between">
                        <div className="flex flex-col items-center">
                            <p className="font-semibold text-slate-800 mb-2">Le Magasinier</p>
                            <div className="w-48 h-20"></div>
                        </div>
                        <div className="flex flex-col items-center">
                            <p className="font-semibold text-slate-800 mb-2">Le Chef de Centre</p>
                            <div className="w-48 h-20"></div>
                        </div>
                    </div>
                </footer>
            </div>
        </div>
        );
    };

    if (isPrinting && reportData) {
        return <ReportContent data={reportData} id="report-content" />;
    }

    return (
        <div className="space-y-8">
            <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Options de Génération</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div className="md:col-span-1">
                        <label htmlFor="regional-center" className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label>
                        <input
                            type="text"
                            id="regional-center"
                            value={regionalCenter}
                            onChange={e => setRegionalCenter(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                            placeholder="Ex: Centre de Meknès"
                        />
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Début</label>
                        <input
                            type="date"
                            id="start-date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            required
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                        />
                    </div>
                     <div className="md:col-span-1">
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Fin</label>
                        <input
                            type="date"
                            id="end-date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            required
                            className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                        />
                    </div>
                     <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier (Optionnel)</label>
                         <WorkerMultiSelect
                            workerGroups={workerGroups}
                            selectedWorkerIds={selectedWorkerIds}
                            onChange={setSelectedWorkerIds}
                         />
                    </div>
                </div>
                 <div className="flex justify-end mt-6">
                    <div className="flex flex-col md:flex-row items-stretch gap-2">
                        <button onClick={(e) => { createRipple(e); handleGenerateReport(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">Générer le Rapport</button>
                        {reportData && (
                           <ExportMenu 
                                onPrint={() => printElement('report-content', `Rapport - ${startDate} au ${endDate}`)}
                                onExportPDF={() => exportToPDF('report-content', `Rapport_${startDate}_${endDate}`, 'landscape')}
                           />
                        )}
                    </div>
                </div>
            </div>
            
            {reportData && (
                <div ref={reportCardRef} className="bg-slate-200 p-8 rounded-lg" onMouseEnter={playHoverSound}>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      <ReportContent data={reportData} id="report-content" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportView;