import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task, SavedDetailedPayroll, User, DetailedPayrollData } from '../types';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToPDF, exportToExcel } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';
import { convertAmountToWords } from '../utils/numberToWords';

interface DetailedPayrollViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    onSaveWorkedDays: (data: Omit<WorkedDays, 'id' | 'owner'>) => void;
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedDetailedPayroll[];
    onSave: (report: Partial<SavedDetailedPayroll>) => void;
    onDelete: (report: SavedDetailedPayroll) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
    onDirectExport: (report: SavedDetailedPayroll, format: 'print' | 'pdf' | 'excel') => void;
    viewingReport?: SavedDetailedPayroll | null;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;
const RET_CNSS_RATE = 0.0448;
const RET_AMO_RATE = 0.0226;

const ReportContent: React.FC<{
    report: SavedDetailedPayroll;
    id: string;
    isEditing?: boolean;
    onInputChange?: (workerId: number, field: 'avanceAid' | 'ir', value: string) => void;
}> = ({ report, id, isEditing = false, onInputChange }) => {
    const { data, params } = report;
    const grandTotal = data.reduce((sum, item) => sum + item.netAPayer, 0);
    const totalInWords = convertAmountToWords(grandTotal);

    const formattedStartDate = new Date(Date.UTC(params.year, params.month - 1, params.period === 'first' ? 1 : 16)).toLocaleDateString('fr-FR');
    const formattedEndDate = new Date(Date.UTC(params.year, params.month - 1, params.period === 'first' ? 15 : new Date(params.year, params.month, 0).getDate())).toLocaleDateString('fr-FR');

    return (
        <div id={id} className="printable-report printable-a4 p-4 bg-white">
            <header className="flex justify-between items-start mb-4">
                <div className="flex flex-col items-center">
                   <img src="https://i.ibb.co/b3bLYz6/sonacos-logo.png" alt="SONACOS Logo" className="h-16" />
                   <p className="font-semibold text-sm">CR: {params.regionalCenter}</p>
                </div>
                <div className="text-center">
                    <h1 className="font-bold text-lg">MAIN D'ŒUVRE A LA TACHE N°010/25-26</h1>
                    <p className="font-semibold">DU: {formattedStartDate} AU {formattedEndDate}</p>
                </div>
                <div className="text-right text-sm">
                    <p>EXERCICE {params.year}/{params.year + 1}</p>
                </div>
            </header>

            <table className="w-full text-[8px] border-collapse border border-black">
                <thead className="font-bold bg-gray-100 text-center">
                    <tr>
                        <th className="border border-black p-1">N° LA CNSS</th>
                        <th className="border border-black p-1">N° CIN</th>
                        <th className="border border-black p-1">NOM ET PRENOM</th>
                        <th className="border border-black p-1">NBR DE JOURS</th>
                        <th className="border border-black p-1">MONTANT</th>
                        <th className="border border-black p-1">CONGE PAYE</th>
                        <th className="border border-black p-1">Jour Férié</th>
                        <th className="border border-black p-1">ANCIENNETE</th>
                        <th className="border border-black p-1">TOTAL</th>
                        <th className="border border-black p-1">INDEM. DE LAIT</th>
                        <th className="border border-black p-1">PRIME DE PANIER</th>
                        <th className="border border-black p-1">RET. CNSS I.P.E.</th>
                        <th className="border border-black p-1">RET. AMO</th>
                        <th className="border border-black p-1">AVANCE AID AL ADHA</th>
                        <th className="border border-black p-1">IR</th>
                        <th className="border border-black p-1">NET A PAYER</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(d => (
                        <tr key={d.worker.id}>
                            <td className="border border-black p-1">{d.worker.cnss}</td>
                            <td className="border border-black p-1">{d.worker.matricule}</td>
                            <td className="border border-black p-1">{d.worker.name}</td>
                            <td className="border border-black p-1 text-center">{d.joursTravailles}</td>
                            <td className="border border-black p-1 text-right">{d.montant.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.congePaye.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.jourFerier.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.anciennete.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right font-bold">{d.total.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.indemLait.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.primePanier.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.retCnss.toFixed(2)}</td>
                            <td className="border border-black p-1 text-right">{d.retAmo.toFixed(2)}</td>
                            <td className="border border-black p-0 text-right">
                                {isEditing ? <input type="number" value={params.additionalInputs[d.worker.id]?.avanceAid || ''} onChange={e => onInputChange?.(d.worker.id, 'avanceAid', e.target.value)} className="w-full h-full p-1 text-right bg-yellow-100 border-none"/> : (d.avanceAid > 0 ? d.avanceAid.toFixed(2) : '0.00')}
                            </td>
                            <td className="border border-black p-0 text-right">
                                {isEditing ? <input type="number" value={params.additionalInputs[d.worker.id]?.ir || ''} onChange={e => onInputChange?.(d.worker.id, 'ir', e.target.value)} className="w-full h-full p-1 text-right bg-yellow-100 border-none"/> : (d.ir > 0 ? d.ir.toFixed(2) : '0.00')}
                            </td>
                            <td className="border border-black p-1 text-right font-bold">{d.netAPayer.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="font-bold bg-gray-100">
                    <tr>
                        <td colSpan={3} className="border border-black p-1 text-center">TOTAL GENERAL</td>
                        <td className="border border-black p-1 text-center">{data.reduce((sum, d) => sum + d.joursTravailles, 0)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.montant, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.congePaye, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.jourFerier, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.anciennete, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.total, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.indemLait, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.primePanier, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.retCnss, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.retAmo, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.avanceAid, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{data.reduce((sum, d) => sum + d.ir, 0).toFixed(2)}</td>
                        <td className="border border-black p-1 text-right">{grandTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <footer className="mt-4">
                <p className="text-xs">LE PRESENT ETAT EST ARRETE A LA SOMME DE: <span className="font-bold">{totalInWords}</span></p>
                <div className="flex justify-between items-end mt-8 text-center text-xs">
                    <div><p>LE CHEF DE LA CELLULE FINANCES</p></div>
                    <div><p>LE REGISSEUR</p></div>
                    <div><p>LE CHEF DE CENTRE</p></div>
                </div>
            </footer>
        </div>
    );
}

const DetailedPayrollView: React.FC<DetailedPayrollViewProps> = ({ allLogs, workerGroups, workedDays, onSaveWorkedDays, taskMap, isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser, onDirectExport, viewingReport: viewingReportForExport }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);

    const allWorkers = useMemo(() => workerGroups.flatMap(g => g.workers), [workerGroups]);
    const selectableWorkerGroups = useMemo(() => workerGroups.filter(g => !g.isArchived && g.workers.some(w => !w.isArchived)), [workerGroups]);

    const [mode, setMode] = useState<'list' | 'form'>('list');
    const [editingReport, setEditingReport] = useState<SavedDetailedPayroll | null>(null);
    const [viewingReport, setViewingReport] = useState<SavedDetailedPayroll | null>(null);
    const [draftReport, setDraftReport] = useState<SavedDetailedPayroll | null>(null);
    
    // Form State
    const [step, setStep] = useState(1);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedPeriod, setSelectedPeriod] = useState<'first' | 'second'>(new Date().getDate() <= 15 ? 'first' : 'second');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [regionalCenter, setRegionalCenter] = useState('TAZA');
    const [additionalInputs, setAdditionalInputs] = useState<Record<number, { avanceAid: string; ir: string }>>({});

    const resetForm = () => {
        setStep(1);
        setSelectedYear(new Date().getFullYear());
        setSelectedMonth(new Date().getMonth() + 1);
        setSelectedPeriod(new Date().getDate() <= 15 ? 'first' : 'second');
        setSelectedWorkerIds([]);
        setRegionalCenter('TAZA');
        setAdditionalInputs({});
        setDraftReport(null);
        setEditingReport(null);
        setViewingReport(null);
    };

    const handleNewReport = () => {
        resetForm();
        setMode('form');
    };
    
    const handleEditReport = (report: SavedDetailedPayroll) => {
        setMode('form');
        setStep(2); // Start at step 2 for editing
        setEditingReport(report);
        setViewingReport(null);
        setDraftReport(report);
        setSelectedYear(report.params.year);
        setSelectedMonth(report.params.month);
        setSelectedPeriod(report.params.period);
        setSelectedWorkerIds(report.params.workerIds);
        setRegionalCenter(report.params.regionalCenter);
        setAdditionalInputs(report.params.additionalInputs);
    };

    const handleDeleteReport = (report: SavedDetailedPayroll) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer ce rapport de paie détaillée ?`, () => {
            onDelete(report);
            setViewingReport(null);
        });
    };
    
    const generateReportData = (): DetailedPayrollData[] => {
        const startDateNum = selectedPeriod === 'first' ? 1 : 16;
        const endDateNum = selectedPeriod === 'first' ? 15 : new Date(selectedYear, selectedMonth, 0).getDate();
        const startDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, startDateNum)).toISOString().split('T')[0];
        const endDateStr = new Date(Date.UTC(selectedYear, selectedMonth - 1, endDateNum)).toISOString().split('T')[0];

        const getDaysWorkedForWorker = (workerId: number) => workedDays.find(d => d.workerId === workerId && d.year === selectedYear && d.month === selectedMonth && d.period === selectedPeriod)?.days || 0;
        
        return selectedWorkerIds.map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;

            const joursTravailles = getDaysWorkedForWorker(workerId);
            const workerLogs = allLogs.filter(log => log.date >= startDateStr && log.date <= endDateStr && log.workerId === workerId);

            const montant = workerLogs.filter(l => l.taskId !== LAIT_TASK_ID && l.taskId !== PANIER_TASK_ID).reduce((sum, log) => sum + (log.quantity * (taskMap.get(log.taskId)?.price || 0)), 0);
            const anciennete = montant * (worker.seniorityPercentage / 100);
            const total = montant + anciennete;
            const indemLait = joursTravailles * (taskMap.get(LAIT_TASK_ID)?.price || 0);
            const primePanier = joursTravailles * (taskMap.get(PANIER_TASK_ID)?.price || 0);
            const retCnss = total * RET_CNSS_RATE;
            const retAmo = total * RET_AMO_RATE;
            const avanceAid = parseFloat(additionalInputs[workerId]?.avanceAid || '0') || 0;
            const ir = parseFloat(additionalInputs[workerId]?.ir || '0') || 0;
            const netAPayer = total + indemLait + primePanier - retCnss - retAmo - avanceAid - ir;

            return { worker, montant, anciennete, total, indemLait, primePanier, retCnss, retAmo, avanceAid, ir, netAPayer, joursTravailles, congePaye: 0, jourFerier: 0 };
        }).filter((item): item is DetailedPayrollData => item !== null);
    }
    
    const handleNextStep = () => {
        if (selectedWorkerIds.length === 0) {
            alert("Veuillez sélectionner au moins un ouvrier.");
            return;
        }
        
        // Initialize additional inputs for selected workers if not present
        const newInputs = { ...additionalInputs };
        selectedWorkerIds.forEach(id => {
            if (!newInputs[id]) {
                newInputs[id] = { avanceAid: '', ir: '' };
            }
        });
        setAdditionalInputs(newInputs);
        setStep(2);
    };

    const handleGenerateDraft = () => {
        const data = generateReportData();
        const report: SavedDetailedPayroll = {
            id: editingReport?.id || '',
            owner: editingReport?.owner || currentUser.uid,
            createdAt: editingReport?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            params: { year: selectedYear, month: selectedMonth, period: selectedPeriod, regionalCenter, workerIds: selectedWorkerIds, additionalInputs },
            data: data.sort((a,b) => a.worker.name.localeCompare(b.worker.name)),
        };
        setDraftReport(report);
    };
    
    const handleSaveReport = () => {
        if (!draftReport) return;
        onSave(draftReport);
        resetForm();
        setMode('list');
    };

    const handleInputChange = (workerId: number, field: 'avanceAid' | 'ir', value: string) => {
        const newDraft = JSON.parse(JSON.stringify(draftReport));
        newDraft.params.additionalInputs[workerId][field] = value;
        const newData = generateReportData();
        newDraft.data = newData.sort((a,b) => a.worker.name.localeCompare(b.worker.name));
        setDraftReport(newDraft);
    };

    if (isPrinting) {
        const reportToPrint = viewingReport || viewingReportForExport;
        if (reportToPrint) return <ReportContent report={reportToPrint} id="detailed-payroll-content" />;
        return null;
    }

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
    const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(0, i).toLocaleString('fr-FR', { month: 'long' }) }));
    const workersForInput = allWorkers.filter(w => selectedWorkerIds.includes(w.id)).sort((a, b) => a.name.localeCompare(b.name));
    
    return (
        <div className="space-y-8">
            {mode === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-slate-800">Rapports de Paie Détaillée</h2><button onClick={handleNewReport} className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800"><span>Générer un nouveau rapport</span></button></div>
                    {savedReports.length > 0 ? (
                        <ul className="space-y-3">{savedReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map(report => (
                            <li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                                <div><button onClick={() => setViewingReport(report)} className="font-semibold text-sonacos-green hover:underline text-left">Paie Détaillée - Période du {report.params.period === 'first' ? '01' : '16'}/{report.params.month}/{report.params.year}</button><p className="text-sm text-slate-500">Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}</p></div>
                                <div className="flex items-center gap-2"><ExportMenu onPrint={() => onDirectExport(report, 'print')} onExportPDF={() => onDirectExport(report, 'pdf')} onExportExcel={() => onDirectExport(report, 'excel')} /><button onClick={() => handleEditReport(report)} title="Modifier"><svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button><button onClick={() => handleDeleteReport(report)} title="Supprimer"><svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button></div>
                            </li>
                        ))}</ul>
                    ) : <p className="text-center py-8 text-slate-500">Aucun rapport sauvegardé.</p>}
                </div>
            )}

            {mode === 'form' && step === 1 && (
                <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Étape 1: Sélection Période & Ouvriers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                        <div className="md:col-span-1"><label className="block text-sm font-medium">Année</label><select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-2 border rounded-md">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium">Mois</label><select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full p-2 border rounded-md">{months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium">Période</label><select value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value as 'first' | 'second')} className="w-full p-2 border rounded-md"><option value="first">1 - 15</option><option value="second">16 - Fin</option></select></div>
                        <div className="md:col-span-1"><label className="block text-sm font-medium">Centre Régional</label><input type="text" value={regionalCenter} onChange={e => setRegionalCenter(e.target.value)} className="w-full p-2 border rounded-md"/></div>
                        <div className="md:col-span-4"><label className="block text-sm font-medium">Ouvrier(s)</label><WorkerMultiSelect workerGroups={selectableWorkerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds} /></div>
                    </div>
                    <div className="flex justify-between mt-6"><button onClick={() => setMode('list')} className="px-4 py-2 bg-slate-200 rounded-lg">Annuler</button><button onClick={handleNextStep} className="px-4 py-2 bg-sonacos-blue-grey text-white rounded-lg">Suivant</button></div>
                </div>
            )}
            
            {mode === 'form' && step === 2 && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">Étape 2: Avances & IR</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto p-2">
                        {workersForInput.map(worker => (
                            <div key={worker.id} className="p-3 border rounded-md bg-slate-50">
                                <p className="font-semibold">{worker.name}</p>
                                <div className="mt-2"><label className="text-xs">Avance Aïd al-Adha</label><input type="number" value={additionalInputs[worker.id]?.avanceAid || ''} onChange={e => setAdditionalInputs(prev => ({ ...prev, [worker.id]: { ...prev[worker.id], avanceAid: e.target.value } }))} className="w-full p-1 border rounded-md"/></div>
                                <div className="mt-2"><label className="text-xs">Impôt sur le Revenu (IR)</label><input type="number" value={additionalInputs[worker.id]?.ir || ''} onChange={e => setAdditionalInputs(prev => ({ ...prev, [worker.id]: { ...prev[worker.id], ir: e.target.value } }))} className="w-full p-1 border rounded-md"/></div>
                            </div>
                        ))}
                    </div>
                     <div className="flex justify-between mt-6"><button onClick={() => setStep(1)} className="px-4 py-2 bg-slate-200 rounded-lg">Précédent</button><button onClick={handleGenerateDraft} className="px-4 py-2 bg-sonacos-teal-dark text-white rounded-lg">Générer le Brouillon</button></div>
                </div>
            )}
            
            {(viewingReport || draftReport) && (
                <div className="bg-slate-200 p-8 rounded-lg">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{viewingReport ? 'Aperçu' : 'Brouillon'}</h2><div>
                        {viewingReport ? <ExportMenu onPrint={() => onDirectExport(viewingReport, 'print')} onExportPDF={() => onDirectExport(viewingReport, 'pdf')} onExportExcel={() => onDirectExport(viewingReport, 'excel')} /> : draftReport ? <button onClick={handleSaveReport} className="px-4 py-2 bg-sonacos-green text-white rounded-lg">Sauvegarder</button> : null}
                    </div></div>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      {(viewingReport || draftReport) && <ReportContent report={viewingReport || draftReport!} id="detailed-payroll-content" isEditing={!!draftReport && !viewingReport} onInputChange={handleInputChange}/>}
                    </div>
                    <div className="flex justify-center mt-4 gap-4">
                        {viewingReport ? <button onClick={() => setViewingReport(null)} className="px-4 py-2 bg-slate-500 rounded-lg">Fermer</button> : <button onClick={() => setDraftReport(null)} className="px-4 py-2 bg-slate-500 rounded-lg">Fermer</button>}
                        {viewingReport && <button onClick={() => handleEditReport(viewingReport)} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Modifier</button>}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DetailedPayrollView;
