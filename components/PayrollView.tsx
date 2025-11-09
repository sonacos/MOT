
import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task, PayrollData, SavedPayroll, User } from '../types';
import { getDynamicTaskByIdWithFallback } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface PayrollViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedPayroll[];
    onSave: (report: Partial<SavedPayroll>) => void;
    onDelete: (report: SavedPayroll) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const PayrollView: React.FC<PayrollViewProps> = ({ allLogs, workerGroups, workedDays, taskMap, isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    
    // Component State
    const [mode, setMode] = useState<'list' | 'form'>('list');
    const [editingReport, setEditingReport] = useState<SavedPayroll | null>(null);
    const [viewingReport, setViewingReport] = useState<SavedPayroll | null>(null);
    const [draftData, setDraftData] = useState<PayrollData[] | null>(null);

    // Form State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [anneeScolaire, setAnneeScolaire] = useState('2024/2025');
    const [anneeRegle, setAnneeRegle] = useState('2025/2026');
    const [centreRegional, setCentreRegional] = useState('TAZA');
    const [additionalInputs, setAdditionalInputs] = useState<Record<number, { avance: string }>>({});

    const workerOwnerMap = useMemo(() => {
        const map = new Map<number, string>();
        workerGroups.forEach(group => {
            if (group && group.owner && Array.isArray(group.workers)) {
                group.workers.forEach(worker => {
                    if (worker) map.set(worker.id, group.owner!);
                });
            }
        });
        return map;
    }, [workerGroups]);

    const allWorkers = useMemo(() => 
        workerGroups
            .filter(g => g && !g.isArchived && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w && !w.isArchived))
    , [workerGroups]);

    const resetForm = () => {
        setStartDate('');
        setEndDate('');
        setSelectedWorkerIds([]);
        setAnneeScolaire('2024/2025');
        setAnneeRegle('2025/2026');
        setCentreRegional('TAZA');
        setAdditionalInputs({});
        setDraftData(null);
        setEditingReport(null);
        setViewingReport(null);
    };

    const handleNewReport = () => {
        resetForm();
        setMode('form');
    };

    const handleEditReport = (report: SavedPayroll) => {
        setMode('form');
        setEditingReport(report);
        setViewingReport(null);
        setDraftData(null);
        setStartDate(report.params.startDate);
        setEndDate(report.params.endDate);
        setSelectedWorkerIds(report.params.workerIds);
        setAnneeScolaire(report.params.anneeScolaire);
        setAnneeRegle(report.params.anneeRegle);
        setCentreRegional(report.params.centreRegional);
        setAdditionalInputs(report.params.additionalInputs);
    };

    const handleDeleteReport = (report: SavedPayroll) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer ce décompte du ${new Date(report.createdAt).toLocaleString('fr-FR')}?`, () => {
            onDelete(report);
            setViewingReport(null);
        });
    };
    
    const handleAvanceChange = (workerId: number, value: string) => {
        setAdditionalInputs(prev => ({ ...prev, [workerId]: { ...(prev[workerId] || { avance: '0' }), avance: value } }));
    };

    const getDaysWorkedForPeriod = (workerId: number, start: string, end: string): number => {
        const startDateObj = new Date(start + 'T00:00:00Z');
        const endDateObj = new Date(end + 'T00:00:00Z');
        const workerOwnerId = workerOwnerMap.get(workerId);
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return 0;

        const uniquePeriods = new Set<string>();
        let currentDate = new Date(startDateObj);
        while (currentDate <= endDateObj) {
            const year = currentDate.getUTCFullYear();
            const month = currentDate.getUTCMonth() + 1;
            const day = currentDate.getUTCDate();
            uniquePeriods.add(`${year}-${month}-${day <= 15 ? 'first' : 'second'}`);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
        
        // FIX: Explicitly type `periodKey` as string to resolve TypeScript inference error.
        return Array.from(uniquePeriods).reduce((totalDays, periodKey: string) => {
            const [year, month, period] = periodKey.split('-');
            const entry = workedDays.find(wd => wd.workerId === workerId && wd.year === parseInt(year) && wd.month === parseInt(month) && wd.period === (period as 'first' | 'second') && wd.owner === workerOwnerId);
            return totalDays + (entry ? entry.days : 0);
        }, 0);
    };

    const handleGenerateDraft = () => {
        if (!startDate || !endDate || !anneeScolaire || !centreRegional) {
            alert("Veuillez remplir tous les champs obligatoires (Année, Centre, Date de début et de fin).");
            return;
        }
    
        const workerIdsToReport = selectedWorkerIds.length > 0 ? selectedWorkerIds : allWorkers.map(w => w.id);
        const logsInPeriod = allLogs.filter(log => log.date >= startDate && log.date <= endDate && workerIdsToReport.includes(log.workerId) && log.owner === workerOwnerMap.get(log.workerId));
        
        const allRelevantWorkerIds = new Set(logsInPeriod.map(l => l.workerId));
        workedDays.forEach(wd => {
            const d = new Date(wd.year, wd.month - 1, wd.period === 'first' ? 1 : 16);
            if (d >= new Date(startDate) && d <= new Date(endDate) && workerIdsToReport.includes(wd.workerId) && wd.owner === workerOwnerMap.get(wd.workerId)) {
                allRelevantWorkerIds.add(wd.workerId);
            }
        });

        const processedData: PayrollData[] = Array.from(allRelevantWorkerIds).map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;
            
            const workerLogs = logsInPeriod.filter(l => l.workerId === workerId);
            const joursTravailles = getDaysWorkedForPeriod(workerId, startDate, endDate);

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
        }).filter((item): item is PayrollData => item !== null);
        
        setDraftData(processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name)));
    };

    const handleSaveReport = () => {
        if (!draftData) return;
        const report: Partial<SavedPayroll> = {
            id: editingReport?.id,
            owner: editingReport?.owner,
            createdAt: editingReport?.createdAt,
            params: { startDate, endDate, anneeScolaire, anneeRegle, centreRegional, workerIds: selectedWorkerIds, additionalInputs },
            data: draftData,
        };
        onSave(report);
        resetForm();
        setMode('list');
    };

    const ReportContent: React.FC<{ data: PayrollData[], inputs: Record<number, { avance: string }>, id: string }> = ({ data, inputs, id }) => {
        const laitPricePerDay = taskMap.get(LAIT_TASK_ID)?.price || 0;
        const panierPricePerDay = taskMap.get(PANIER_TASK_ID)?.price || 0;
        const grandTotals = useMemo(() => data.reduce((totals, d) => {
            const avance = parseFloat(inputs[d.worker.id]?.avance || '0') || 0;
            const indemniteLait = d.joursTravailles * laitPricePerDay;
            const primePanier = d.joursTravailles * panierPricePerDay;
            const net = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;
            return {
                totalOperation: totals.totalOperation + d.totalOperation, anciennete: totals.anciennete + d.anciennete, totalBrut: totals.totalBrut + d.totalBrut,
                retenu: totals.retenu + d.retenu, lait: totals.lait + indemniteLait, panier: totals.panier + primePanier, avance: totals.avance + avance, net: totals.net + net,
            };
        }, { totalOperation: 0, anciennete: 0, totalBrut: 0, retenu: 0, lait: 0, panier: 0, avance: 0, net: 0 }), [data, inputs, laitPricePerDay, panierPricePerDay]);
        
        const formattedStartDate = new Date(startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedEndDate = new Date(endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        return (
            <div id={id} className="printable-report bg-white p-6 printable-a4">
                 <header className="text-[10px] leading-tight"><div className="text-center mb-4"><h2 className="font-bold underline text-sm">Etat n°09</h2><h2 className="font-bold underline text-sm">DEPENSES EN REGIE</h2><h2 className="font-bold underline text-sm">DEPENSES DE PERSONNEL A LA TACHE</h2></div><div className="flex justify-between items-start"><div><p>Année : {anneeScolaire}</p><p>Centre Régional : {centreRegional.toUpperCase()}</p><p>Règle de Dépenses de {centreRegional.toUpperCase()}</p><p>Règle de dépenses auprès du Centre Régional de {centreRegional.toUpperCase()} Année : {anneeRegle}</p></div></div><div className="mt-4"><p><span className="font-bold">Somme à payer :</span> {grandTotals.net.toFixed(2)} DH</p><p className="mt-2"><span className="font-bold">DATE : du {formattedStartDate} au {formattedEndDate}</span></p></div></header>
                <table className="w-full border-collapse border border-black text-[9px] mt-2">
                    <thead className="text-[8px] font-bold"><tr className="bg-slate-100"><th className="border border-black p-1 align-middle text-center">n°ordre</th><th className="border border-black p-1 align-middle text-center">Nom et<br/>prenom</th><th className="border border-black p-1 align-middle text-center">Emplois</th><th className="border border-black p-1 align-middle text-center">Nombre<br/>d'enfants</th><th className="border border-black p-1 w-2/5 align-middle text-center">NATURE DE TACHE</th><th className="border border-black p-1 align-middle text-center">nbr<br/>unite</th><th className="border border-black p-1 align-middle text-center">P.U</th><th className="border border-black p-1 align-middle text-center">Montant<br/>Op.</th><th className="border border-black p-1 align-middle text-center">TOTAL Op.</th><th className="border border-black p-1 align-middle text-center">Taux<br/>Anc.</th><th className="border border-black p-1 align-middle text-center">Montant<br/>Anc.</th><th className="border border-black p-1 align-middle text-center">TOTAL<br/>BRUT</th><th className="border border-black p-1 align-middle text-center">RETENU<br/>CNSS+AMO<br/>6.74%</th><th className="border border-black p-1 align-middle text-center">Jours<br/>Trav.</th><th className="border border-black p-1 align-middle text-center">INDEMNITE<br/>DE LAIT</th><th className="border border-black p-1 align-middle text-center">Prime de<br/>panier</th><th className="border border-black p-1 align-middle text-center">Avance<br/>s/d</th><th className="border border-black p-1 align-middle text-center">NET A<br/>PAYER</th></tr></thead>
                    <tbody>
                        {data.map((d, workerIndex) => {
                            const numTasks = d.tasks.length || 1;
                            const avance = parseFloat(inputs[d.worker.id]?.avance || '0') || 0;
                            const indemniteLait = d.joursTravailles * laitPricePerDay;
                            const primePanier = d.joursTravailles * panierPricePerDay;
                            const netAPayer = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;
                            
                            const renderRow = (task: any, taskIndex: number) => (
                                <tr key={task ? `${d.worker.id}-${task.taskId}` : `${d.worker.id}-empty`} className={workerIndex > 0 && taskIndex === 0 ? "border-t-2 border-black" : ""}>
                                    {taskIndex === 0 && (<><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{workerIndex + 1}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.name}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.departement}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.numberOfChildren}</td></>)}
                                    <td className="border border-black p-1 text-center align-middle">{task ? getDynamicTaskByIdWithFallback(task.taskId, taskMap).description : '-'}</td>
                                    <td className="border border-black p-1 text-center align-middle">{task ? task.quantity.toFixed(2) : '-'}</td><td className="border border-black p-1 text-center align-middle">{task ? task.price.toFixed(2) : '-'}</td><td className="border border-black p-1 text-center align-middle">{task ? task.amount.toFixed(2) : '-'}</td>
                                    {taskIndex === 0 && (<><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalOperation.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.seniorityPercentage}%</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.anciennete.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalBrut.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.retenu.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.joursTravailles}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{indemniteLait > 0 ? indemniteLait.toFixed(2) : '-'}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{primePanier > 0 ? primePanier.toFixed(2) : '-'}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{avance > 0 ? avance.toFixed(2) : '-'}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-bold">{netAPayer.toFixed(2)}</td></>)}
                                </tr>
                            );
                            return d.tasks.length > 0 ? d.tasks.map(renderRow) : renderRow(null, 0);
                        })}
                    </tbody>
                    <tfoot className="font-bold bg-slate-200">
                        <tr><td colSpan={8} className="border border-black p-1 text-center align-middle">SOUS TOTAL</td><td className="border border-black p-1 text-center align-middle">{grandTotals.totalOperation.toFixed(2)}</td><td className="border border-black p-1 align-middle"></td><td className="border border-black p-1 text-center align-middle">{grandTotals.anciennete.toFixed(2)}</td><td className="border border-black p-1 text-center align-middle">{grandTotals.totalBrut.toFixed(2)}</td><td className="border border-black p-1 text-center align-middle">{grandTotals.retenu.toFixed(2)}</td><td className="border border-black p-1 align-middle"></td><td className="border border-black p-1 text-center align-middle">{grandTotals.lait.toFixed(2)}</td><td className="border border-black p-1 text-center align-middle">{grandTotals.panier.toFixed(2)}</td><td className="border border-black p-1 text-center align-middle">{grandTotals.avance.toFixed(2)}</td><td className="border border-black p-1 text-center align-middle">{grandTotals.net.toFixed(2)}</td></tr>
                        <tr><td colSpan={17} className="border border-black p-1 text-center align-middle">TOTAL</td><td className="border border-black p-1 text-center align-middle">{grandTotals.net.toFixed(2)}</td></tr>
                    </tfoot>
                </table>
            </div>
        );
    }

    if (isPrinting && viewingReport) {
        return <ReportContent data={viewingReport.data} inputs={viewingReport.params.additionalInputs} id="payroll-content" />;
    }

    return (
        <div className="space-y-8">
            {mode === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-slate-800">Décomptes de Paie Sauvegardés</h2><button onClick={handleNewReport} className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg><span>Générer un nouveau décompte</span></button></div>
                    {savedReports.length > 0 ? (
                        <ul className="space-y-3">{savedReports.map(report => (<li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center"><div><button onClick={() => setViewingReport(report)} className="font-semibold text-sonacos-green hover:underline">Décompte du {report.params.startDate} au {report.params.endDate}</button><p className="text-sm text-slate-500">Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}{currentUser.role === 'superadmin' && ` par ${report.owner}`}</p></div><div className="flex items-center gap-2"><button onClick={() => handleEditReport(report)} className="p-2 text-slate-500 hover:text-blue-600 rounded-full hover:bg-blue-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button><button onClick={() => handleDeleteReport(report)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button></div></li>))}</ul>
                    ) : <p className="text-center py-8 text-slate-500">Aucun décompte sauvegardé.</p>}
                </div>
            )}

            {mode === 'form' && (
                <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">{editingReport ? 'Modifier le Décompte' : 'Nouveau Décompte'}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
                        {/* Form Inputs */}
                        <div className="md:col-span-1"><label htmlFor="annee-scolaire" className="block text-sm font-medium text-slate-700 mb-1.5">Année</label><input type="text" id="annee-scolaire" value={anneeScolaire} onChange={e => setAnneeScolaire(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1"><label htmlFor="annee-regle" className="block text-sm font-medium text-slate-700 mb-1.5">Année de Règle</label><input type="text" id="annee-regle" value={anneeRegle} onChange={e => setAnneeRegle(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-2 lg:col-span-2"><label htmlFor="centre-regional" className="block text-sm font-medium text-slate-700 mb-1.5">Centre Régional</label><input type="text" id="centre-regional" value={centreRegional} onChange={e => setCentreRegional(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1 lg:col-span-2"><label htmlFor="start-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Début</label><input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1 lg:col-span-2"><label htmlFor="end-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Fin</label><input type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="lg:col-span-4 md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier</label><WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds}/></div>
                        <div className="lg:col-span-4 md:col-span-2 space-y-2"><h3 className="text-sm font-medium text-slate-700">Avances</h3><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-48 overflow-y-auto pt-2">{allWorkers.filter(w => selectedWorkerIds.length === 0 || selectedWorkerIds.includes(w.id)).map(worker => (<div key={worker.id}><label htmlFor={`avance-${worker.id}`} className="block text-xs font-medium text-slate-600 truncate">{worker.name}</label><input type="number" id={`avance-${worker.id}`} value={additionalInputs[worker.id]?.avance || ''} onChange={e => handleAvanceChange(worker.id, e.target.value)} min="0" placeholder="0.00" className="mt-1 w-full p-1.5 border border-slate-300 rounded-md"/></div>))}</div></div>
                    </div>
                    <div className="flex justify-between mt-6">
                        <button onClick={() => { setMode('list'); resetForm(); }} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button onClick={(e) => { createRipple(e); handleGenerateDraft(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Générer le Brouillon</button>
                    </div>
                </div>
            )}
            
            {(viewingReport || draftData) && (
                <div className="bg-slate-200 p-8 rounded-lg">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{viewingReport ? 'Aperçu du Décompte Sauvegardé' : 'Brouillon du Décompte'}</h2>
                    <div>
                        {viewingReport && <ExportMenu onPrint={() => printElement('payroll-content', 'Décompte')} onExportPDF={() => exportToPDF('payroll-content', 'Decompte', 'portrait')} onExportExcel={() => exportToExcel('payroll-content', 'Decompte')} />}
                        {draftData && !viewingReport && <button onClick={handleSaveReport} className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Confirmer et Sauvegarder</button>}
                    </div></div>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      {viewingReport ? <ReportContent data={viewingReport.data} inputs={viewingReport.params.additionalInputs} id="payroll-content" /> : draftData ? <ReportContent data={draftData} inputs={additionalInputs} id="payroll-content" /> : null}
                    </div>
                    {viewingReport && <div className="flex justify-center mt-4 gap-4"><button onClick={() => setViewingReport(null)} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Fermer l'aperçu</button></div>}
                </div>
            )}
        </div>
    );
};

export default PayrollView;
