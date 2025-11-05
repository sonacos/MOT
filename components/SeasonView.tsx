import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays } from '../types';
import { TASK_MAP } from '../constants';
import { useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

const getCurrentSeason = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    let startYear, endYear;
    if (currentMonth >= 4) { // May or later
        startYear = currentYear;
        endYear = currentYear + 1;
    } else { // Before May
        startYear = currentYear - 1;
        endYear = currentYear;
    }
    const startDate = `${startYear}-05-01`;
    const endDate = `${endYear}-04-30`;
    return { startDate, endDate, startYear, endYear };
};

interface SeasonViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    isPrinting?: boolean;
}

const SeasonView: React.FC<SeasonViewProps> = ({ allLogs, workerGroups, workedDays, isPrinting = false }) => {
    const reportCardRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showLeftShadow, setShowLeftShadow] = useState(false);
    const [showRightShadow, setShowRightShadow] = useState(false);
    useGlow(reportCardRef);
    
    const { startDate, endDate, startYear, endYear } = useMemo(() => getCurrentSeason(), []);

    const { summaryData, headerTaskIds, columnTotals } = useMemo(() => {
        const logsForSeason = allLogs.filter(log => log.date >= startDate && log.date <= endDate);

        const seasonStartUTC = new Date(Date.UTC(startYear, 4, 1)); // May 1st
        const seasonEndUTC = new Date(Date.UTC(endYear, 4, 1));     // May 1st of next year (exclusive)

        const workedDaysForSeason = workedDays.filter(wd => {
            const entryDateUTC = new Date(Date.UTC(wd.year, wd.month - 1, 1));
            return entryDateUTC >= seasonStartUTC && entryDateUTC < seasonEndUTC;
        });

        const activeWorkers = workerGroups
            .filter(g => !g.isArchived)
            .flatMap(g => g.workers.filter(w => !w.isArchived));

        const data = new Map<number, { worker: Worker; tasks: Map<number, number>; workedDays: number }>();
        
        activeWorkers.forEach(worker => {
            data.set(worker.id, {
                worker,
                tasks: new Map<number, number>(),
                workedDays: 0,
            });
        });

        logsForSeason.forEach(log => {
            if (data.has(log.workerId)) {
                const workerData = data.get(log.workerId)!;
                const currentQty = workerData.tasks.get(log.taskId) || 0;
                workerData.tasks.set(log.taskId, currentQty + log.quantity);
            }
        });

        workedDaysForSeason.forEach(wd => {
            if (data.has(wd.workerId)) {
                const workerData = data.get(wd.workerId)!;
                workerData.workedDays += wd.days;
            }
        });

        const finalData = Array.from(data.values()).filter(d => d.tasks.size > 0 || d.workedDays > 0);
        finalData.sort((a, b) => a.worker.name.localeCompare(b.worker.name));
        
        const taskIds = new Set<number>();
        finalData.forEach(d => {
            d.tasks.forEach((_, taskId) => taskIds.add(taskId));
        });
        const sortedTaskIds = Array.from(taskIds).sort((a, b) => a - b);
        
        const totals: { workedDays: number; tasks: Map<number, number> } = {
            workedDays: 0,
            tasks: new Map<number, number>(),
        };

        finalData.forEach(d => {
            totals.workedDays += d.workedDays;
            d.tasks.forEach((qty, taskId) => {
                const currentTotal = totals.tasks.get(taskId) || 0;
                totals.tasks.set(taskId, currentTotal + qty);
            });
        });

        return { summaryData: finalData, headerTaskIds: sortedTaskIds, columnTotals: totals };
    }, [allLogs, workerGroups, workedDays, startDate, endDate, startYear, endYear]);

    const checkShadows = useCallback(() => {
        const el = scrollContainerRef.current;
        if (el) {
            const isScrollable = el.scrollWidth > el.clientWidth;
            const scrollEndReached = Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 1;
            setShowLeftShadow(el.scrollLeft > 0);
            setShowRightShadow(isScrollable && !scrollEndReached);
        }
    }, []);

    useEffect(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        checkShadows();
        el.addEventListener('scroll', checkShadows, { passive: true });
        const resizeObserver = new ResizeObserver(checkShadows);
        resizeObserver.observe(el);
        window.addEventListener('resize', checkShadows);
        return () => {
            if (el) {
                el.removeEventListener('scroll', checkShadows);
            }
            resizeObserver.disconnect();
            window.removeEventListener('resize', checkShadows);
        };
    }, [checkShadows, headerTaskIds]);

    const formattedStartDate = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
    const formattedEndDate = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    const ReportContent = () => (
        <div id="season-summary-table-container" className="relative">
            {isPrinting && (
                <div className="text-center my-4">
                    <h1 className="text-2xl font-bold text-slate-800">Cumul de la Saison</h1>
                    <p className="text-lg text-slate-600">Saison du {formattedStartDate} au {formattedEndDate}</p>
                </div>
            )}
            {summaryData.length === 0 ? (
                <p className="text-center py-8 text-slate-500">Aucune donnée enregistrée pour la saison actuelle.</p>
            ) : (
                <>
                <div ref={scrollContainerRef} className="overflow-x-auto border border-slate-200 rounded-lg shadow-inner bg-slate-50/50">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-white uppercase bg-sonacos-slate-dark sticky top-0 z-10">
                            <tr>
                                <th scope="col" className="border-b-2 border-r border-slate-500 min-w-[160px] sticky left-0 bg-sonacos-slate-dark z-10 font-semibold px-4 py-3">Ouvrier</th>
                                <th scope="col" className="border-b-2 border-r border-slate-500 text-center font-semibold min-w-[120px] px-2 py-3">Total Jours Travaillés</th>
                                {headerTaskIds.map(taskId => {
                                    const task = TASK_MAP.get(taskId);
                                    if (!task) return null;
                                    return (
                                        <th key={task.id} scope="col" className="border-b-2 border-r border-slate-500 text-center font-semibold min-w-[120px] px-2 py-3">
                                            <div className="font-bold text-xs">{task.category}</div>
                                            <div className="font-normal text-slate-300 mt-0.5 text-[10px]">{task.description}</div>
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {summaryData.map(({ worker, tasks, workedDays }) => (
                                <tr key={worker.id} className="bg-white border-b border-slate-200">
                                    <td className="font-medium text-slate-900 whitespace-nowrap border-r border-slate-200 sticky left-0 bg-white px-4 py-2">{worker.name}</td>
                                    <td className="text-center font-semibold border-r border-slate-200 p-2">
                                        {workedDays > 0 ? workedDays : <span className="text-slate-400">-</span>}
                                    </td>
                                    {headerTaskIds.map(taskId => {
                                        const quantity = tasks.get(taskId) || 0;
                                        return (
                                            <td key={taskId} className="text-center font-medium border-r border-slate-200 p-2">
                                                {quantity > 0 ? quantity.toFixed(2) : <span className="text-slate-400">-</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-sonacos-slate-dark text-white font-bold">
                            <tr>
                                <td className="border-t-2 border-r border-slate-500 sticky left-0 bg-sonacos-slate-dark z-10 px-4 py-3">Total</td>
                                <td className="border-t-2 border-r border-slate-500 text-center px-2 py-3">
                                    {columnTotals.workedDays > 0 ? columnTotals.workedDays : '-'}
                                </td>
                                {headerTaskIds.map(taskId => {
                                    const total = columnTotals.tasks.get(taskId) || 0;
                                    return (
                                        <td key={`total-${taskId}`} className="border-t-2 border-r border-slate-500 text-center px-2 py-3">
                                            {total > 0 ? total.toFixed(2) : '-'}
                                        </td>
                                    );
                                })}
                            </tr>
                        </tfoot>
                    </table>
                </div>
                <div aria-hidden="true" className={`absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-slate-200 via-slate-200/70 to-transparent pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`}></div>
                <div aria-hidden="true" className={`absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-slate-200 via-slate-200/70 to-transparent pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`}></div>
                </>
            )}
        </div>
    );
    
    if (isPrinting) {
        return <ReportContent />;
    }

    return (
        <div className="space-y-8">
            <div ref={reportCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <div>
                         <h2 className="text-2xl font-bold text-slate-800">Cumul de la Saison</h2>
                         <p className="text-md text-slate-500 mt-1">
                            Période : <span className="font-semibold">{formattedStartDate}</span> au <span className="font-semibold">{formattedEndDate}</span>
                         </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {summaryData.length > 0 && (
                            <ExportMenu
                                onPrint={() => printElement('season-summary-table-container', `Cumul Saison ${startDate}_${endDate}`)}
                                onExportExcel={() => exportToExcel('season-summary-table-container', `cumul_saison_${startDate}_${endDate}`)}
                                onExportPDF={() => exportToPDF('season-summary-table-container', `cumul_saison_${startDate}_${endDate}`)}
                            />
                        )}
                    </div>
                </div>
                <ReportContent />
            </div>
        </div>
    );
};

export default SeasonView;