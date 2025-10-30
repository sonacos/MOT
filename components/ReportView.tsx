import React, { useState, useMemo } from 'react';
import { DailyLog, WorkerGroup } from '../types';
import { TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';

interface ReportViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    isPrinting?: boolean;
}

const ReportView: React.FC<ReportViewProps> = ({ allLogs, workerGroups, isPrinting = false }) => {
    
    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers), [workerGroups]);

    const getSemiMonthlyPeriods = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const periods = [];

        // Current month
        periods.push({
            label: `1 - 15 ${now.toLocaleString('fr-FR', { month: 'long' })} ${year}`,
            startDate: new Date(year, month, 1).toISOString().split('T')[0],
            endDate: new Date(year, month, 15).toISOString().split('T')[0],
        });
        periods.push({
            label: `16 - fin ${now.toLocaleString('fr-FR', { month: 'long' })} ${year}`,
            startDate: new Date(year, month, 16).toISOString().split('T')[0],
            endDate: new Date(year, month + 1, 0).toISOString().split('T')[0],
        });
        
        // Previous month
        const prevMonthDate = new Date(year, month - 1, 1);
        const prevMonthYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth();
         periods.push({
            label: `1 - 15 ${prevMonthDate.toLocaleString('fr-FR', { month: 'long' })} ${prevMonthYear}`,
            startDate: new Date(prevMonthYear, prevMonth, 1).toISOString().split('T')[0],
            endDate: new Date(prevMonthYear, prevMonth, 15).toISOString().split('T')[0],
        });
        periods.push({
            label: `16 - fin ${prevMonthDate.toLocaleString('fr-FR', { month: 'long' })} ${prevMonthYear}`,
            startDate: new Date(prevMonthYear, prevMonth, 16).toISOString().split('T')[0],
            endDate: new Date(prevMonthYear, prevMonth + 1, 0).toISOString().split('T')[0],
        });

        return periods;
    };

    const periods = useMemo(getSemiMonthlyPeriods, []);
    const [selectedPeriod, setSelectedPeriod] = useState(periods[0]);
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [reportData, setReportData] = useState<any>(null);

    const handleGenerateReport = () => {
        const workerIdsToReport = selectedWorkerIds.length > 0 ? selectedWorkerIds : allWorkers.map(w => w.id);
        
        const filteredLogs = allLogs.filter(log => {
            const logDate = new Date(log.date);
            const startDate = new Date(selectedPeriod.startDate);
            const endDate = new Date(selectedPeriod.endDate);
            
            // Adjust for timezone differences by comparing dates only
            logDate.setHours(0,0,0,0);
            startDate.setHours(0,0,0,0);
            endDate.setHours(0,0,0,0);

            return logDate >= startDate && logDate <= endDate && workerIdsToReport.includes(log.workerId);
        });

        const dataByWorker = workerIdsToReport.map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId)!;
            const workerLogs = filteredLogs.filter(log => log.workerId === workerId);
            
            const tasksAggregated = workerLogs.reduce((acc, log) => {
                const task = TASK_MAP.get(log.taskId)!;
                if (!task) return acc;
                if (!acc[task.id]) {
                    acc[task.id] = { ...task, totalQuantity: 0, observations: new Set() };
                }
                acc[task.id].totalQuantity += log.quantity;
                if(log.observation) (acc[task.id].observations as Set<string>).add(log.observation);
                return acc;
            }, {} as any);
            
             const tasksArray = Object.values(tasksAggregated).map((task: any) => ({
                ...task,
                observations: Array.from(task.observations)
            }));

            return {
                ...worker,
                tasks: tasksArray,
            };
        }).filter(w => (w as any).tasks.length > 0);
        
        setReportData({
            periodLabel: selectedPeriod.label,
            workers: dataByWorker
        });
    };

    const ReportContent: React.FC<{data: any}> = ({data}) => (
        <div>
            <h1 className="text-3xl font-bold text-center mb-2 text-sonacos-green">État Semi-Mensuel des Tâches</h1>
            <p className="text-center text-lg text-slate-600 mb-6">Période du {data.periodLabel}</p>
            
            {data.workers.map((worker: any) => (
                <div key={worker.id} className="mb-10 break-before-page">
                    <div className="border-t-2 border-b-2 border-black py-4 px-2 my-4">
                        <p className="text-xl font-bold">{worker.name}</p>
                        <p className="text-sm text-slate-700">Matricule: {worker.matricule} | Département: {worker.departement}</p>
                    </div>

                    <table className="w-full text-sm">
                        <thead className="border-b-2 border-slate-400">
                             <tr>
                                <th className="text-left py-2 pr-4 w-3/5">Opération</th>
                                <th className="text-center py-2 px-4 w-1/5">Quantité</th>
                                <th className="text-left py-2 pl-4 w-1/5">Observations</th>
                            </tr>
                        </thead>
                        <tbody>
                            {worker.tasks.map((task: any) => (
                                <tr key={task.id} className="border-b border-slate-200">
                                    <td className="py-2 pr-4">
                                        <div className="font-medium text-slate-800">{task.category}</div>
                                        <div className="text-xs text-slate-600">{task.description}</div>
                                    </td>
                                    <td className="text-center py-2 px-4 font-semibold">{parseFloat(task.totalQuantity).toFixed(2)} <span className="text-xs text-slate-500">{task.unit}</span></td>
                                    <td className="py-2 pl-4 text-xs italic text-slate-600">{task.observations.join(', ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
             <div className="mt-16 pt-8">
                <div className="flex justify-between items-end">
                    <span className="text-sm text-slate-500">SONACOS</span>
                    <div className="text-center">
                        <div className="w-48 border-t border-slate-400 mb-2"></div>
                        <span className="text-sm text-slate-600">Signature</span>
                    </div>
                </div>
            </div>
        </div>
    );

    if (isPrinting && reportData) {
        return <ReportContent data={reportData} />;
    }

    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Options de Génération</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Période</label>
                        <select value={selectedPeriod.label} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedPeriod(periods.find(p => p.label === e.target.value)!)} className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green">
                            {periods.map(p => <option key={p.label}>{p.label}</option>)}
                        </select>
                    </div>
                     <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier (Optionnel)</label>
                         <WorkerMultiSelect
                            workerGroups={workerGroups}
                            selectedWorkerIds={selectedWorkerIds}
                            onChange={setSelectedWorkerIds}
                         />
                    </div>
                    <div className="md:col-span-1 flex flex-col items-stretch gap-2">
                        <button onClick={handleGenerateReport} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">Générer</button>
                        {reportData && (
                            <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 text-white font-semibold rounded-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500">Imprimer</button>
                        )}
                    </div>
                </div>
            </div>
            
            {reportData && (
                <div className="bg-white p-8 rounded-lg shadow-lg border border-slate-100">
                    <ReportContent data={reportData} />
                </div>
            )}
        </div>
    );
};

export default ReportView;