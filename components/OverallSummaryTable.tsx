import React, { useMemo } from 'react';
import { DailyLog, Worker } from '../types';
import { TASK_MAP } from '../constants';

interface OverallSummaryTableProps {
    allLogs: DailyLog[];
    workers: Worker[];
}

const OverallSummaryTable: React.FC<OverallSummaryTableProps> = ({ allLogs, workers }) => {

    const { headerTaskIds, dataMap } = useMemo(() => {
        if (!allLogs || allLogs.length === 0) {
            return { headerTaskIds: [], dataMap: new Map() };
        }

        const uniqueTaskIds = [...new Set(allLogs.map(log => Number(log.taskId)))];
        
        // This will be Map<workerId, Map<taskId, totalQuantity>>
        const dataMap = new Map<number, Map<number, number>>();

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
        }
        
        return { 
            headerTaskIds: uniqueTaskIds.sort((a, b) => Number(a) - Number(b)), 
            dataMap 
        };
    }, [allLogs]);

    if (allLogs.length === 0) {
        return <p className="text-center py-8 text-slate-500">Aucune donnée à résumer.</p>;
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
                        const workerData = dataMap.get(worker.id);
                        const hasLogs = !!workerData;

                        return (
                             <tr key={worker.id} className={`odd:bg-white even:bg-stone-50 ${!hasLogs ? 'opacity-60' : ''} hover:bg-green-50/50`}>
                                <td className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap border-r border-slate-200 sticky left-0 odd:bg-white even:bg-stone-50 hover:bg-green-50/50">
                                    {worker.name}
                                </td>
                                {headerTaskIds.map(taskId => {
                                    const quantity = workerData?.get(taskId) || 0;
                                    return (
                                        <td key={taskId} className="p-2 text-center font-medium border-r border-slate-200">
                                            {quantity > 0 ? quantity.toFixed(2) : <span className="text-slate-400">-</span>}
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

export default OverallSummaryTable;