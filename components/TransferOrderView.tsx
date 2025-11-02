import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays } from '../types';
import { TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface TransferOrderViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    isPrinting?: boolean;
}

interface TransferOrderData {
    worker: Worker;
    netPay: number;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const TransferOrderView: React.FC<TransferOrderViewProps> = ({ allLogs, workerGroups, workedDays, isPrinting = false }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    useGlow(reportCardRef);

    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers.filter(w => !w.isArchived)), [workerGroups]);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [centreRegional, setCentreRegional] = useState('TAZA');
    const [reportData, setReportData] = useState<TransferOrderData[] | null>(null);
    const [additionalInputs, setAdditionalInputs] = useState<Record<number, { avance: string }>>({});

    const handleAvanceChange = (workerId: number, value: string) => {
        setAdditionalInputs(prev => ({
            ...prev,
            [workerId]: {
                ...(prev[workerId] || { avance: '0' }),
                avance: value
            }
        }));
    };
    
    const getDaysWorkedForPeriod = (workerId: number, start: string, end: string): number => {
        const startDate = new Date(start + 'T00:00:00');
        const endDate = new Date(end + 'T00:00:00');
        let totalDays = 0;

        const relevantEntries = workedDays.filter(wd => {
            if (wd.workerId !== workerId) return false;
            const periodStartDay = wd.period === 'first' ? 1 : 16;
            const periodDate = new Date(wd.year, wd.month - 1, periodStartDay);
            return periodDate >= new Date(startDate.getFullYear(), startDate.getMonth(), 1) &&
                   periodDate <= new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
        });

        for (const entry of relevantEntries) {
             totalDays += entry.days;
        }

        return totalDays;
    };


    const handleGenerateReport = () => {
        if (!startDate || !endDate || !centreRegional) {
            alert("Veuillez remplir tous les champs obligatoires (Centre, Date de début et de fin).");
            return;
        }
    
        const workerIdsToReport = selectedWorkerIds.length > 0 ? selectedWorkerIds : allWorkers.map(w => w.id);
        
        const logsInPeriod = allLogs.filter(log => 
            log.date >= startDate && 
            log.date <= endDate && 
            workerIdsToReport.includes(log.workerId)
        );
        
        const allRelevantWorkerIds = new Set(logsInPeriod.map(l => l.workerId));
         workedDays.forEach(wd => {
            const d = new Date(wd.year, wd.month - 1, wd.period === 'first' ? 1 : 16);
            if (d >= new Date(startDate) && d <= new Date(endDate) && workerIdsToReport.includes(wd.workerId)) {
                allRelevantWorkerIds.add(wd.workerId);
            }
        });

        const initialInputs: Record<number, { avance: string }> = {};

        // FIX: Explicitly type the map callback parameter 'workerId' as a number to resolve TS error.
        const processedData: TransferOrderData[] = Array.from(allRelevantWorkerIds).map((workerId: number) => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;
            
            initialInputs[workerId] = { avance: '0' };
            
            const workerLogs = logsInPeriod.filter(l => l.workerId === workerId);
            const joursTravailles = getDaysWorkedForPeriod(workerId, startDate, endDate);
            
            const regularLogs = workerLogs.filter(log => log.taskId !== LAIT_TASK_ID && log.taskId !== PANIER_TASK_ID);

            const totalOperation = regularLogs.reduce((sum, log) => {
                const task = TASK_MAP.get(log.taskId);
                return sum + (Number(log.quantity) * (task?.price || 0));
            }, 0);

            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            
            const laitPricePerDay = TASK_MAP.get(LAIT_TASK_ID)?.price || 0;
            const panierPricePerDay = TASK_MAP.get(PANIER_TASK_ID)?.price || 0;
            const indemniteLait = joursTravailles * laitPricePerDay;
            const primePanier = joursTravailles * panierPricePerDay;
            
            const avance = parseFloat(additionalInputs[workerId]?.avance || '0') || 0;

            const netPay = totalBrut - retenu + indemniteLait + primePanier - avance;

            return { worker, netPay };
    
        }).filter((item): item is TransferOrderData => item !== null && item.netPay > 0);
        
        processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name));

        setAdditionalInputs(initialInputs);
        setReportData(processedData);
    };

    const ReportContent: React.FC<{ data: TransferOrderData[], id: string }> = ({ data, id }) => {
        const totalNet = data.reduce((sum, item) => sum + item.netPay, 0);

        return (
            <div id={id} className="printable-report bg-white p-8 printable-a4 min-h-[1000px] flex flex-col">
                 <header className="mb-10">
                    <div className="text-left mb-8">
                        <p className="font-bold text-lg text-slate-800">SONACOS</p>
                        <p className="text-md text-slate-600">Centre Régional: {centreRegional || 'N/A'}</p>
                    </div>
                    <div className="text-center my-10">
                        <h1 className="text-2xl font-bold text-sonacos-slate-dark tracking-wide uppercase underline">Ordre de Virement</h1>
                    </div>
                </header>

                <main className="flex-grow">
                    {data.length > 0 ? (
                        <table className="w-full border-collapse border border-black text-sm">
                            <thead className="bg-slate-100">
                                <tr>
                                    <th className="border border-black p-2 text-left font-bold">Nom et Prénom</th>
                                    <th className="border border-black p-2 text-left font-bold">N° de compte bancaire (RIB)</th>
                                    <th className="border border-black p-2 text-right font-bold">Montant Net à Payer (DH)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map(item => (
                                    <tr key={item.worker.id}>
                                        <td className="border border-black p-2">{item.worker.name}</td>
                                        <td className="border border-black p-2 font-mono">{item.worker.rib}</td>
                                        <td className="border border-black p-2 text-right font-mono">{item.netPay.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="font-bold bg-slate-100">
                                <tr>
                                    <td colSpan={2} className="border border-black p-2 text-right">Total Général</td>
                                    <td className="border border-black p-2 text-right font-mono">
                                        {totalNet.toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    ) : (
                        <p className="text-center text-slate-500 py-10">Aucune donnée à afficher pour la sélection actuelle.</p>
                    )}
                </main>

                <footer className="pt-24 mt-auto relative bottom-24">
                    <div className="flex justify-around">
                        <div className="flex flex-col items-center">
                            <p className="font-semibold text-slate-800 mb-2">Le Trésorier</p>
                        </div>
                        <div className="flex flex-col items-center">
                            <p className="font-semibold text-slate-800 mb-2">Le Chef de Centre</p>
                        </div>
                    </div>
                </footer>
            </div>
        );
    }


    if (isPrinting && reportData) {
        return <ReportContent data={reportData} id="transfer-order-content" />;
    }

    return (
        <div className="space-y-8">
            <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Options de Génération de l'Ordre de Virement</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-1 md:col-span-2">
                        <label htmlFor="centre-regional" className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label>
                        <input type="text" id="centre-regional" value={centreRegional} onChange={e => setCentreRegional(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" placeholder="Ex: TAZA"/>
                    </div>
                    <div className="md:col-span-1">
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Début</label>
                        <input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"/>
                    </div>
                     <div className="md:col-span-1">
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Fin</label>
                        <input type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"/>
                    </div>
                     <div className="lg:col-span-3 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier (Optionnel, tous par défaut)</label>
                         <WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds}/>
                    </div>
                     <div className="lg:col-span-3 md:col-span-2 space-y-2">
                        <h3 className="text-sm font-medium text-slate-700">Avances (Optionnel)</h3>
                        <p className="text-xs text-slate-500">
                           Saisissez ici les avances sur salaire pour la période sélectionnée. Celles-ci seront déduites du montant net à payer.
                           Cette information n'est pas sauvegardée et doit être saisie avant chaque génération.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-48 overflow-y-auto pt-2">
                           {allWorkers.filter(w => selectedWorkerIds.length === 0 || selectedWorkerIds.includes(w.id)).map(worker => (
                               <div key={worker.id}>
                                   <label htmlFor={`avance-${worker.id}`} className="block text-xs font-medium text-slate-600 truncate">{worker.name}</label>
                                   <input
                                       type="number"
                                       id={`avance-${worker.id}`}
                                       value={additionalInputs[worker.id]?.avance || ''}
                                       onChange={e => handleAvanceChange(worker.id, e.target.value)}
                                       min="0"
                                       placeholder="0.00"
                                       className="mt-1 w-full p-1.5 border border-slate-300 rounded-md shadow-sm text-sm focus:ring-sonacos-green focus:border-sonacos-green"
                                   />
                               </div>
                           ))}
                        </div>
                    </div>
                </div>
                 <div className="flex justify-end mt-6">
                    <div className="flex flex-col md:flex-row items-stretch gap-2">
                        <button onClick={(e) => { createRipple(e); handleGenerateReport(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">Générer l'Ordre</button>
                        {reportData && (
                           <ExportMenu 
                                onPrint={() => printElement('transfer-order-content', `Ordre de Virement - ${startDate} au ${endDate}`)}
                                onExportPDF={() => exportToPDF('transfer-order-content', `OrdreVirement_${startDate}_${endDate}`, 'portrait')}
                                onExportExcel={() => exportToExcel('transfer-order-content', `OrdreVirement_${startDate}_${endDate}`)}
                           />
                        )}
                    </div>
                </div>
            </div>
            
            {reportData && (
                <div ref={reportCardRef} className="bg-slate-200 p-8 rounded-lg" onMouseEnter={playHoverSound}>
                    <div className="bg-white shadow-2xl mx-auto max-w-4xl">
                      <ReportContent data={reportData} id="transfer-order-content" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransferOrderView;