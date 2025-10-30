import React, { useMemo, useState, useEffect } from 'react';
import { DailyLog, Worker } from '../types';
import { TASK_MAP } from '../constants';

interface DailySummaryTableProps {
    logs: DailyLog[];
    workers: Worker[];
    date: string;
    addLog: (log: Omit<DailyLog, 'id'>) => void;
    deleteLog: (logId: number) => void;
    isDayFinalized: boolean;
}

const DailySummaryTable: React.FC<DailySummaryTableProps> = ({ logs, workers, date, addLog, deleteLog, isDayFinalized }) => {
    
    const [draftQuantities, setDraftQuantities] = useState<Record<string, string>>({});

    const { headerTaskIds, dataMap } = useMemo(() => {
        const uniqueTaskIdsInLogs = [...new Set(logs.map(log => Number(log.taskId)))];
        
        const dataMap = new Map<number, Map<number, DailyLog[]>>();
        for (const log of logs) {
            const workerId = Number(log.workerId);
            const taskId = Number(log.taskId);
            if (!dataMap.has(workerId)) {
                dataMap.set(workerId, new Map());
            }
            const workerMap = dataMap.get(workerId)!;

            if(!workerMap.has(taskId)) {
                workerMap.set(taskId, []);
            }
            workerMap.get(taskId)!.push(log);
        }
        
        return { headerTaskIds: uniqueTaskIdsInLogs.sort((a, b) => Number(a) - Number(b)), dataMap };
    }, [logs]);

    useEffect(() => {
        const newDrafts: Record<string, string> = {};
        workers.forEach(worker => {
            headerTaskIds.forEach(taskId => {
                const key = `${worker.id}-${taskId}`;
                const logsForCell = dataMap.get(worker.id)?.get(taskId) || [];
                const quantity = logsForCell.reduce((sum, log) => sum + Number(log.quantity), 0);
                newDrafts[key] = quantity > 0 ? quantity.toFixed(2) : '';
            });
        });
        setDraftQuantities(newDrafts);
    }, [dataMap, workers, headerTaskIds]);


    const handleDraftChange = (workerId: number, taskId: number, value: string) => {
        const key = `${workerId}-${taskId}`;
        setDraftQuantities(prev => ({ ...prev, [key]: value }));
    };

    const handleUpdate = (workerId: number, taskId: number) => {
        if (isDayFinalized) return;
        
        const key = `${workerId}-${taskId}`;
        const newQuantityStr = draftQuantities[key];
        const newQuantity = newQuantityStr ? parseFloat(newQuantityStr) : 0;

        const existingLogs = dataMap.get(workerId)?.get(taskId) || [];
        const oldQuantity = existingLogs.reduce((sum, log) => sum + Number(log.quantity), 0);

        // Do nothing if value hasn't effectively changed
        if ( (isNaN(newQuantity) || newQuantity === 0) && oldQuantity === 0) return;
        if (newQuantity === oldQuantity) return;

        // Delete old logs for this cell
        existingLogs.forEach(log => deleteLog(log.id));

        // Add a new log if quantity is positive
        if (!isNaN(newQuantity) && newQuantity > 0) {
            const observation = existingLogs.length === 1 ? existingLogs[0].observation : '';
            addLog({
                date: date,
                workerId: workerId,
                taskId: taskId,
                quantity: newQuantity,
                observation: observation,
            });
        }
    };


    if (logs.length === 0) {
        return <p className="text-center py-8 text-slate-500">Aucune opération enregistrée pour cette date. Utilisez le formulaire ci-dessus pour commencer.</p>
    }

    return (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-stone-100 sticky top-0 z-10">
                    <tr>
                        <th scope="col" className="px-4 py-3 border-b border-r border-slate-200 min-w-[180px] sticky left-0 bg-stone-100 z-10 font-semibold">
                            Ouvrier
                        </th>
                        {headerTaskIds.map(taskId => {
                            const task = TASK_MAP.get(taskId);
                            if (!task) return null;
                            return (
                                <th key={task.id} scope="col" className="px-3 py-3 border-b border-r border-slate-200 min-w-[180px] text-center font-semibold">
                                    <div className="text-slate-800">{task.category}</div>
                                    <div className="font-normal text-xs text-slate-500 mt-1">{task.description}</div>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {workers.map(worker => {
                        const hasLogs = dataMap.has(worker.id);
                        return (
                             <tr key={worker.id} className={`odd:bg-white even:bg-stone-50 ${!hasLogs ? 'opacity-60' : ''} hover:bg-green-50/50`}>
                                <td className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap border-r border-slate-200 sticky left-0 odd:bg-white even:bg-stone-50 hover:bg-green-50/50">
                                    {worker.name}
                                </td>
                                {headerTaskIds.map(taskId => {
                                    const key = `${worker.id}-${taskId}`;
                                    return (
                                        <td key={taskId} className="p-0 text-center font-medium border-r border-slate-200">
                                            <input 
                                                type="number"
                                                value={draftQuantities[key] || ''}
                                                onChange={(e) => handleDraftChange(worker.id, taskId, e.target.value)}
                                                onBlur={() => handleUpdate(worker.id, taskId)}
                                                min="0"
                                                step="any"
                                                placeholder="-"
                                                disabled={isDayFinalized}
                                                className="w-full h-full text-center bg-transparent focus:bg-green-50 focus:outline-none focus:ring-1 focus:ring-sonacos-green rounded-sm p-2 disabled:cursor-not-allowed disabled:bg-slate-100/50"
                                            />
                                        </td>
                                    );
                                })}
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default DailySummaryTable;