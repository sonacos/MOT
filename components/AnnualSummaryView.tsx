import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task, AnnualSummaryData, SavedAnnualSummary, User } from '../types';
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
    savedReports: SavedAnnualSummary[];
    onSave: (report: Partial<SavedAnnualSummary>) => void;
    onDelete: (report: SavedAnnualSummary) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const AnnualSummaryView: React.FC<AnnualSummaryViewProps> = ({ allLogs, workerGroups, workedDays, taskMap, isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);
    
    // Component State
    const [mode, setMode] = useState<'list' | 'form'>('list');
    const [editingReport, setEditingReport] = useState<SavedAnnualSummary | null>(null);
    const [viewingReport, setViewingReport] = useState<SavedAnnualSummary | null>(null);
    const [draftData, setDraftData] = useState<AnnualSummaryData[] | null>(null);

    // Form State
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    
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
            .filter(g => g && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w))
    , [workerGroups]);

    const resetForm = () => {
        setSelectedYear(new Date().getFullYear());
        setDraftData(null);
        setEditingReport(null);
        setViewingReport(null);
    };

    const handleNewReport = () => {
        resetForm();
        setMode('form');
    };

    const handleEditReport = (report: SavedAnnualSummary) => {
        setMode('form');
        setEditingReport(report);
        setViewingReport(null);
        setDraftData(null);
        setSelectedYear(report.params.year);
    };

    const handleDeleteReport = (report: SavedAnnualSummary) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer ce résumé annuel pour ${report.params.year}?`, () => {
            onDelete(report);
            setViewingReport(null);
        });
    };

    const handleGenerateDraft = () => {
        const yearStr = String(selectedYear);
        const logsForYear = allLogs.filter(log => log.date.startsWith(yearStr));
        const workedDaysForYear = workedDays.filter(wd => wd.year === selectedYear);

        const workerIdsWithActivity = new Set([...logsForYear.map(l => l.workerId), ...workedDaysForYear.map(wd => wd.workerId)]);

        const processedData: AnnualSummaryData[] = Array.from(workerIdsWithActivity).map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;

            const workerOwnerId = workerOwnerMap.get(workerId);
            const workerLogs = logsForYear.filter(l => l.workerId === workerId && l.owner === workerOwnerId);
            const joursTravailles = workedDaysForYear.filter(wd => wd.workerId === workerId && wd.owner === workerOwnerId).reduce((sum, wd) => sum + wd.days, 0);

            const totalOperation = workerLogs.filter(log => log.taskId !== LAIT_TASK_ID && log.taskId !== PANIER_TASK_ID)
                .reduce((sum, log) => sum + (Number(log.quantity) * (taskMap.get(log.taskId)?.price || 0)), 0);

            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            const indemnites = joursTravailles * ((taskMap.get(LAIT_TASK_ID)?.price || 0) + (taskMap.get(PANIER_TASK_ID)?.price || 0));
            const netPay = totalBrut - retenu + indemnites;

            return { worker, totalOperation, anciennete, totalBrut, retenu, joursTravailles, indemnites, netPay };
        }).filter((item): item is AnnualSummaryData => item !== null && item.netPay > 0);
        
        setDraftData(processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name)));
    };

    const handleSaveReport = () => {
        if (!draftData) return;
        const report: Partial<SavedAnnualSummary> = {
            id: editingReport?.id, owner: editingReport?.owner, createdAt: editingReport?.createdAt,
            params: { year: selectedYear },
            data: draftData,
        };
        onSave(report);
        resetForm();
        setMode('list');
    };

    const ReportContent: React.FC<{ data: AnnualSummaryData[], params: SavedAnnualSummary['params'], id: string }> = ({ data, params, id }) => {
        const grandTotal = data.reduce((sum, item) => sum + item.netPay, 0);
        return (
            <div id={id} className="printable-report bg-white p-6 printable-a4">
                 <header className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-sonacos-slate-dark">Résumé Annuel des Rémunérations</h1>
                    <p className="text-lg text-slate-700 mt-2">Pour l'année {params.year}</p>
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
                        {data.map(item => (<tr key={item.worker.id} className="odd:bg-white even:bg-slate-50"><td className="border border-slate-300 p-2 font-medium">{item.worker.name}</td><td className="border border-slate-300 p-2 text-right font-mono">{item.totalOperation.toFixed(2)}</td><td className="border border-slate-300 p-2 text-right font-mono">{item.anciennete.toFixed(2)}</td><td className="border border-slate-300 p-2 text-right font-mono font-semibold">{item.totalBrut.toFixed(2)}</td><td className="border border-slate-300 p-2 text-right font-mono text-red-600">({item.retenu.toFixed(2)})</td><td className="border border-slate-300 p-2 text-center font-mono">{item.joursTravailles}</td><td className="border border-slate-300 p-2 text-right font-mono text-green-600">{item.indemnites.toFixed(2)}</td><td className="border border-slate-300 p-2 text-right font-mono font-bold text-lg">{item.netPay.toFixed(2)}</td></tr>))}
                    </tbody>
                    <tfoot className="font-bold bg-slate-200 text-lg">
                        <tr><td colSpan={7} className="border border-slate-300 p-3 text-right">Total Général</td><td className="border border-slate-300 p-3 text-right font-mono">{grandTotal.toFixed(2)}</td></tr>
                    </tfoot>
                </table>
            </div>
        );
    }

    if (isPrinting && viewingReport) {
        return <ReportContent data={viewingReport.data} params={viewingReport.params} id="annual-summary-content" />;
    }

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

    return (
        <div className="space-y-8">
            {mode === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                     <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-slate-800">Résumés Annuels Sauvegardés</h2><button onClick={handleNewReport} className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg><span>Générer un nouveau résumé</span></button></div>
                     {savedReports.length > 0 ? (
                        <ul className="space-y-3">{savedReports.map(report => (<li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center"><div><button onClick={() => setViewingReport(report)} className="font-semibold text-sonacos-green hover:underline">Résumé pour l'année {report.params.year}</button><p className="text-sm text-slate-500">Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}{currentUser.role === 'superadmin' && ` par ${report.owner}`}</p></div><div className="flex items-center gap-2"><button onClick={() => handleEditReport(report)} className="p-2 text-slate-500 hover:text-blue-600 rounded-full hover:bg-blue-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button><button onClick={() => handleDeleteReport(report)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button></div></li>))}</ul>
                    ) : <p className="text-center py-8 text-slate-500">Aucun résumé sauvegardé.</p>}
                </div>
            )}

            {mode === 'form' && (
                <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">{editingReport ? 'Modifier le' : 'Nouveau'} Résumé Annuel</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                        <div className="md:col-span-1"><label htmlFor="select-year" className="block text-sm font-medium text-slate-700 mb-1.5">Année Civile</label><select id="select-year" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-md shadow-sm">{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
                    </div>
                    <div className="flex justify-between mt-6">
                        <button onClick={() => { setMode('list'); resetForm(); }} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button onClick={(e) => { createRipple(e); handleGenerateDraft(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Générer le Brouillon</button>
                    </div>
                </div>
            )}
            
            {(viewingReport || draftData) && (
                <div className="bg-slate-200 p-8 rounded-lg">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{viewingReport ? 'Aperçu du Résumé Sauvegardé' : 'Brouillon du Résumé'}</h2>
                    <div>
                        {viewingReport && <ExportMenu onPrint={() => printElement('annual-summary-content', 'Résumé Annuel')} onExportPDF={() => exportToPDF('annual-summary-content', 'ResumeAnnuel', 'landscape')} onExportExcel={() => exportToExcel('annual-summary-content', 'ResumeAnnuel')} />}
                        {draftData && !viewingReport && <button onClick={handleSaveReport} className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Confirmer et Sauvegarder</button>}
                    </div></div>
                    <div className="bg-white shadow-2xl mx-auto max-w-6xl">
                      {viewingReport ? <ReportContent data={viewingReport.data} params={viewingReport.params} id="annual-summary-content" /> : draftData ? <ReportContent data={draftData} params={{year: selectedYear}} id="annual-summary-content" /> : null}
                    </div>
                    {viewingReport && <div className="flex justify-center mt-4 gap-4"><button onClick={() => setViewingReport(null)} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Fermer l'aperçu</button></div>}
                </div>
            )}
        </div>
    );
};

export default AnnualSummaryView;
