import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays } from '../types';
import { TASK_MAP } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface PayrollViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    isPrinting?: boolean;
}

interface PayrollData {
    worker: Worker;
    tasks: {
        taskId: number;
        quantity: number;
        price: number;
        amount: number;
    }[];
    totalOperation: number;
    anciennete: number;
    totalBrut: number;
    retenu: number;
    joursTravailles: number;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const PayrollView: React.FC<PayrollViewProps> = ({ allLogs, workerGroups, workedDays, isPrinting = false }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    const reportCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    useGlow(reportCardRef);

    const allWorkers = useMemo(() => workerGroups.filter(g => !g.isArchived).flatMap(g => g.workers.filter(w => !w.isArchived)), [workerGroups]);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [anneeScolaire, setAnneeScolaire] = useState('2024/2025');
    const [anneeRegle, setAnneeRegle] = useState('2025/2026');
    const [centreRegional, setCentreRegional] = useState('TAZA');
    const [reportData, setReportData] = useState<PayrollData[] | null>(null);
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

    const formatTaskName = (taskId: number): React.ReactNode => {
        const task = TASK_MAP.get(taskId);
        if (!task) return 'Tâche inconnue';

        const { category, description } = task;

        if (category === 'Opérations Diverses') {
            return description;
        }

        return (
            <span>
                <strong>{category}:</strong> {description}
            </span>
        );
    };

    const getDaysWorkedForPeriod = (workerId: number, start: string, end: string): number => {
        const startDate = new Date(start + 'T00:00:00Z');
        const endDate = new Date(end + 'T00:00:00Z');

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;

        const uniquePeriods = new Set<string>();
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const year = currentDate.getUTCFullYear();
            const month = currentDate.getUTCMonth() + 1;
            const day = currentDate.getUTCDate();
            const period = day <= 15 ? 'first' : 'second';
            uniquePeriods.add(`${year}-${month}-${period}`);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
        
        let totalDays = 0;
        uniquePeriods.forEach(periodKey => {
            const [year, month, period] = periodKey.split('-');
            const entry = workedDays.find(wd => 
                wd.workerId === workerId &&
                wd.year === parseInt(year) &&
                wd.month === parseInt(month) &&
                wd.period === period
            );
            if (entry) {
                totalDays += entry.days;
            }
        });

        return totalDays;
    };

    const handleGenerateReport = () => {
        if (!startDate || !endDate || !anneeScolaire || !centreRegional) {
            alert("Veuillez remplir tous les champs obligatoires (Année, Centre, Date de début et de fin).");
            return;
        }
    
        const workerIdsToReport = selectedWorkerIds.length > 0 ? selectedWorkerIds : allWorkers.map(w => w.id);
        
        const logsInPeriodForSelectedWorkers = allLogs.filter(log => 
            log.date >= startDate && 
            log.date <= endDate && 
            workerIdsToReport.includes(log.workerId)
        );
        
        const initialInputs: Record<number, { avance: string }> = {};

        const allRelevantWorkerIds = new Set(workerIdsToReport);
        workedDays.forEach(wd => {
            const d = new Date(wd.year, wd.month - 1, wd.period === 'first' ? 1 : 16);
            if (d >= new Date(startDate) && d <= new Date(endDate) && workerIdsToReport.includes(wd.workerId)) {
                allRelevantWorkerIds.add(wd.workerId);
            }
        });

        // FIX: Explicitly type the map callback parameter 'workerId' as a number to resolve TS error.
        const processedData: PayrollData[] = Array.from(allRelevantWorkerIds).map((workerId: number) => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;
            
            initialInputs[workerId] = { avance: additionalInputs[workerId]?.avance || '0' };
            const workerLogs = logsInPeriodForSelectedWorkers.filter(l => l.workerId === workerId);
            const joursTravailles = getDaysWorkedForPeriod(workerId, startDate, endDate);

            const regularLogs = workerLogs.filter(log => log.taskId !== LAIT_TASK_ID && log.taskId !== PANIER_TASK_ID);
    
            const tasksSummary = new Map<number, { quantity: number; price: number }>();
            regularLogs.forEach(log => {
                const task = TASK_MAP.get(log.taskId);
                if (!task) return;
    
                const existing = tasksSummary.get(log.taskId) || { quantity: 0, price: task.price };
                existing.quantity += Number(log.quantity);
                tasksSummary.set(log.taskId, existing);
            });
            
            // FIX: Explicitly type the destructured map callback parameters to resolve TS error.
            const workerTasks: PayrollData['tasks'] = Array.from(tasksSummary.entries()).map(([taskId, summary]: [number, { quantity: number; price: number }]) => ({
                taskId,
                quantity: summary.quantity,
                price: summary.price,
                amount: summary.quantity * summary.price,
            }));
    
            const totalOperation = workerTasks.reduce((sum, task) => sum + task.amount, 0);
            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
    
            return {
                worker,
                tasks: workerTasks.sort((a,b) => a.taskId - b.taskId),
                totalOperation,
                anciennete,
                totalBrut,
                retenu,
                joursTravailles,
            };
    
        }).filter((item): item is PayrollData => item !== null);
        
        processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name));
    
        setReportData(processedData);
    };

    const ReportContent: React.FC<{ data: PayrollData[], id: string }> = ({ data, id }) => {
        const laitPricePerDay = TASK_MAP.get(LAIT_TASK_ID)?.price || 0;
        const panierPricePerDay = TASK_MAP.get(PANIER_TASK_ID)?.price || 0;
        
        const grandTotals = useMemo(() => {
            const totals = {
                totalOperation: 0,
                anciennete: 0,
                totalBrut: 0,
                retenu: 0,
                lait: 0,
                panier: 0,
                avance: 0,
                net: 0,
            };

            data.forEach(d => {
                const inputs = additionalInputs[d.worker.id] || { avance: '0' };
                const indemniteLait = d.joursTravailles * laitPricePerDay;
                const primePanier = d.joursTravailles * panierPricePerDay;
                const avance = parseFloat(inputs.avance) || 0;
                const net = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;

                totals.totalOperation += d.totalOperation;
                totals.anciennete += d.anciennete;
                totals.totalBrut += d.totalBrut;
                totals.retenu += d.retenu;
                totals.lait += indemniteLait;
                totals.panier += primePanier;
                totals.avance += avance;
                totals.net += net;
            });

            return totals;
        }, [data, additionalInputs, laitPricePerDay, panierPricePerDay]);
        
        const formattedStartDate = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedEndDate = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        return (
            <div id={id} className="printable-report bg-white p-6 printable-a4">
                 <header className="text-[10px] leading-tight">
                    <div className="text-center mb-4">
                        <h2 className="font-bold underline text-sm">Etat n°09</h2>
                        <h2 className="font-bold underline text-sm">DEPENSES EN REGIE</h2>
                        <h2 className="font-bold underline text-sm">DEPENSES DE PERSONNEL A LA TACHE</h2>
                    </div>
                    <div className="flex justify-between items-start">
                        <div>
                            <p>Année : {anneeScolaire}</p>
                            <p>Centre Régional : {centreRegional.toUpperCase()}</p>
                            <p>Règle de Dépenses de {centreRegional.toUpperCase()}</p>
                            <p>Règle de dépenses auprès du Centre Régional de {centreRegional.toUpperCase()} Année : {anneeRegle}</p>
                        </div>
                    </div>
                    <div className="mt-4">
                        <p><span className="font-bold">Somme à payer :</span> {grandTotals.net.toFixed(2)} DH</p>
                        <p className="mt-2"><span className="font-bold">DATE : du {formattedStartDate} au {formattedEndDate}</span></p>
                    </div>
                </header>
                
                <table className="w-full border-collapse border border-black text-[9px] mt-2">
                    <thead className="text-[8px] font-bold">
                        <tr className="bg-slate-100">
                            <th className="border border-black p-1 align-middle text-center">n°ordre</th>
                            <th className="border border-black p-1 align-middle text-center">Nom et<br/>prenom</th>
                            <th className="border border-black p-1 align-middle text-center">Emplois</th>
                            <th className="border border-black p-1 align-middle text-center">Nombre<br/>d'enfants</th>
                            <th className="border border-black p-1 w-2/5 align-middle text-center">NATURE DE TACHE</th>
                            <th className="border border-black p-1 align-middle text-center">nbr<br/>unite</th>
                            <th className="border border-black p-1 align-middle text-center">P.U</th>
                            <th className="border border-black p-1 align-middle text-center">Montant<br/>Op.</th>
                            <th className="border border-black p-1 align-middle text-center">TOTAL Op.</th>
                            <th className="border border-black p-1 align-middle text-center">Taux<br/>Anc.</th>
                            <th className="border border-black p-1 align-middle text-center">Montant<br/>Anc.</th>
                            <th className="border border-black p-1 align-middle text-center">TOTAL<br/>BRUT</th>
                            <th className="border border-black p-1 align-middle text-center">RETENU<br/>CNSS+AMO<br/>6.74%</th>
                            <th className="border border-black p-1 align-middle text-center">Jours<br/>Trav.</th>
                            <th className="border border-black p-1 align-middle text-center">INDEMNITE<br/>DE LAIT</th>
                            <th className="border border-black p-1 align-middle text-center">Prime de<br/>panier</th>
                            <th className="border border-black p-1 align-middle text-center">Avance<br/>s/d</th>
                            <th className="border border-black p-1 align-middle text-center">NET A<br/>PAYER</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((d, workerIndex) => {
                            const numTasks = d.tasks.length || 1;
                            const inputs = additionalInputs[d.worker.id] || { avance: '0' };
                            const indemniteLait = d.joursTravailles * laitPricePerDay;
                            const primePanier = d.joursTravailles * panierPricePerDay;
                            const avance = parseFloat(inputs.avance) || 0;
                            const netAPayer = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;
                            
                            const renderTasks = () => {
                                if (d.tasks.length === 0) {
                                    return (
                                        <tr key={`${d.worker.id}-no-task`} className={workerIndex > 0 ? "border-t-2 border-black" : ""}>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{workerIndex + 1}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.worker.name}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.worker.departement}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.worker.numberOfChildren}</td>
                                            <td className="border border-black p-1 text-center italic text-slate-500 align-middle">-</td>
                                            <td className="border border-black p-1 text-center align-middle">-</td>
                                            <td className="border border-black p-1 text-center align-middle">-</td>
                                            <td className="border border-black p-1 text-center align-middle">-</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle font-semibold">{d.totalOperation.toFixed(2)}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.worker.seniorityPercentage}%</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.anciennete.toFixed(2)}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle font-semibold">{d.totalBrut.toFixed(2)}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.retenu.toFixed(2)}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{d.joursTravailles}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{indemniteLait > 0 ? indemniteLait.toFixed(2) : '-'}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">{primePanier > 0 ? primePanier.toFixed(2) : '-'}</td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle">
                                                {avance > 0 ? avance.toFixed(2) : '-'}
                                            </td>
                                            <td rowSpan={1} className="border border-black p-1 text-center align-middle font-bold">{netAPayer.toFixed(2)}</td>
                                        </tr>
                                    );
                                }
                                return d.tasks.map((task, taskIndex) => (
                                    <tr key={`${d.worker.id}-${task.taskId}`} className={workerIndex > 0 && taskIndex === 0 ? "border-t-2 border-black" : ""}>
                                        {taskIndex === 0 && (
                                            <>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{workerIndex + 1}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.name}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.departement}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.numberOfChildren}</td>
                                            </>
                                        )}
                                        <td className="border border-black p-1 text-center align-middle">{formatTaskName(task.taskId)}</td>
                                        <td className="border border-black p-1 text-center align-middle">{task.quantity.toFixed(2)}</td>
                                        <td className="border border-black p-1 text-center align-middle">{task.price.toFixed(2)}</td>
                                        <td className="border border-black p-1 text-center align-middle">{task.amount.toFixed(2)}</td>
                                        {taskIndex === 0 && (
                                            <>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalOperation.toFixed(2)}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.seniorityPercentage}%</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.anciennete.toFixed(2)}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalBrut.toFixed(2)}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.retenu.toFixed(2)}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.joursTravailles}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{indemniteLait > 0 ? indemniteLait.toFixed(2) : '-'}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{primePanier > 0 ? primePanier.toFixed(2) : '-'}</td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">
                                                    {avance > 0 ? avance.toFixed(2) : '-'}
                                                </td>
                                                <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-bold">{netAPayer.toFixed(2)}</td>
                                            </>
                                        )}
                                    </tr>
                                ))
                            };

                            return renderTasks();
                        })}
                    </tbody>
                    <tfoot className="font-bold bg-slate-200">
                        <tr>
                            <td colSpan={8} className="border border-black p-1 text-center align-middle">SOUS TOTAL</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.totalOperation.toFixed(2)}</td>
                            <td className="border border-black p-1 align-middle"></td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.anciennete.toFixed(2)}</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.totalBrut.toFixed(2)}</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.retenu.toFixed(2)}</td>
                            <td className="border border-black p-1 align-middle"></td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.lait.toFixed(2)}</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.panier.toFixed(2)}</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.avance.toFixed(2)}</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.net.toFixed(2)}</td>
                        </tr>
                        <tr>
                            <td colSpan={17} className="border border-black p-1 text-center align-middle">TOTAL</td>
                            <td className="border border-black p-1 text-center align-middle">{grandTotals.net.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        );
    }


    if (isPrinting && reportData) {
        return <ReportContent data={reportData} id="payroll-content" />;
    }

    return (
        <div className="space-y-8">
            <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Options de Génération du Décompte</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
                     <div className="md:col-span-1">
                        <label htmlFor="annee-scolaire" className="block text-sm font-medium text-slate-700 mb-1.5">Année</label>
                        <input type="text" id="annee-scolaire" value={anneeScolaire} onChange={e => setAnneeScolaire(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" placeholder="Ex: 2024/2025"/>
                    </div>
                     <div className="md:col-span-1">
                        <label htmlFor="annee-regle" className="block text-sm font-medium text-slate-700 mb-1.5">Année de Règle</label>
                        <input type="text" id="annee-regle" value={anneeRegle} onChange={e => setAnneeRegle(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" placeholder="Ex: 2025/2026"/>
                    </div>
                    <div className="md:col-span-2 lg:col-span-2">
                        <label htmlFor="centre-regional" className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label>
                        <input type="text" id="centre-regional" value={centreRegional} onChange={e => setCentreRegional(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" placeholder="Ex: TAZA"/>
                    </div>
                    <div className="md:col-span-1 lg:col-span-2">
                        <label htmlFor="start-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Début</label>
                        <input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"/>
                    </div>
                     <div className="md:col-span-1 lg:col-span-2">
                        <label htmlFor="end-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Fin</label>
                        <input type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"/>
                    </div>
                     <div className="lg:col-span-4 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier (Optionnel, tous par défaut)</label>
                         <WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds}/>
                    </div>
                    <div className="lg:col-span-4 md:col-span-2 space-y-2">
                        <h3 className="text-sm font-medium text-slate-700">Avances (Optionnel)</h3>
                        <p className="text-xs text-slate-500">
                           Saisissez ici les avances sur salaire pour la période sélectionnée. Celles-ci seront déduites du montant net à payer.
                           Cette information n'est pas sauvegardée et doit être saisie avant chaque génération.
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-48 overflow-y-auto pt-2">
                           {allWorkers.filter(w => selectedWorkerIds.length === 0 || selectedWorkerIds.includes(w.id)).map(worker => (
                               <div key={worker.id}>
                                   <label htmlFor={`avance-payroll-${worker.id}`} className="block text-xs font-medium text-slate-600 truncate">{worker.name}</label>
                                   <input
                                       type="number"
                                       id={`avance-payroll-${worker.id}`}
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
                        <button onClick={(e) => { createRipple(e); handleGenerateReport(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green">Générer le Décompte</button>
                        {reportData && (
                           <ExportMenu 
                                onPrint={() => printElement('payroll-content', `Décompte de Rémunération - ${startDate} au ${endDate}`)}
                                onExportPDF={() => exportToPDF('payroll-content', `Decompte_${startDate}_${endDate}`, 'portrait')}
                                onExportExcel={() => exportToExcel('payroll-content', `Decompte_${startDate}_${endDate}`)}
                           />
                        )}
                    </div>
                </div>
            </div>
            
            {reportData && (
                <div ref={reportCardRef} className="bg-slate-200 p-8 rounded-lg" onMouseEnter={playHoverSound}>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      <ReportContent data={reportData} id="payroll-content" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default PayrollView;