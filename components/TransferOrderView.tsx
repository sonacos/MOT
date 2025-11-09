
import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, Worker, WorkerGroup, WorkedDays, Task, TransferOrderData, SavedTransferOrder, User } from '../types';
import WorkerMultiSelect from './WorkerMultiSelect';
import { playHoverSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface TransferOrderViewProps {
    allLogs: DailyLog[];
    workerGroups: WorkerGroup[];
    workedDays: WorkedDays[];
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedTransferOrder[];
    onSave: (report: Partial<SavedTransferOrder>) => void;
    onDelete: (report: SavedTransferOrder) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const TransferOrderView: React.FC<TransferOrderViewProps> = ({ allLogs, workerGroups, workedDays, taskMap, isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser }) => {
    const optionsCardRef = useRef<HTMLDivElement>(null);
    useGlow(optionsCardRef);

    // Component State
    const [mode, setMode] = useState<'list' | 'form'>('list');
    const [editingReport, setEditingReport] = useState<SavedTransferOrder | null>(null);
    const [viewingReport, setViewingReport] = useState<SavedTransferOrder | null>(null);
    const [draftData, setDraftData] = useState<TransferOrderData[] | null>(null);

    // Form State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [city, setCity] = useState('Taza');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);

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
        setCity('Taza');
        setOrderDate(new Date().toISOString().split('T')[0]);
        setDraftData(null);
        setEditingReport(null);
        setViewingReport(null);
    };

    const handleNewReport = () => {
        resetForm();
        setMode('form');
    };

    const handleEditReport = (report: SavedTransferOrder) => {
        setMode('form');
        setEditingReport(report);
        setViewingReport(null);
        setDraftData(null);
        setStartDate(report.params.startDate);
        setEndDate(report.params.endDate);
        setSelectedWorkerIds(report.params.workerIds);
        setCity(report.params.city);
        setOrderDate(report.params.orderDate);
    };

    const handleDeleteReport = (report: SavedTransferOrder) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer cet ordre de virement du ${new Date(report.createdAt).toLocaleString('fr-FR')}?`, () => {
            onDelete(report);
            setViewingReport(null);
        });
    };
    
    const getDaysWorkedForPeriod = (workerId: number, start: string, end: string): number => {
        const startDateObj = new Date(start + 'T00:00:00Z');
        const endDateObj = new Date(end + 'T00:00:00Z');
        const workerOwnerId = workerOwnerMap.get(workerId);
        if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return 0;
        const uniquePeriods = new Set<string>();
        let currentDate = new Date(startDateObj);
        while (currentDate <= endDateObj) {
            const year = currentDate.getUTCFullYear(), month = currentDate.getUTCMonth() + 1, day = currentDate.getUTCDate();
            uniquePeriods.add(`${year}-${month}-${day <= 15 ? 'first' : 'second'}`);
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        }
        // FIX: Explicitly type `periodKey` as string to resolve TypeScript inference error.
        return Array.from(uniquePeriods).reduce((total, periodKey: string) => {
            const [year, month, period] = periodKey.split('-');
            const entry = workedDays.find(wd => wd.workerId === workerId && wd.year === parseInt(year) && wd.month === parseInt(month) && wd.period === (period as 'first' | 'second') && wd.owner === workerOwnerId);
            return total + (entry ? entry.days : 0);
        }, 0);
    };

    const handleGenerateDraft = () => {
        if (!startDate || !endDate || !city || !orderDate) {
            alert("Veuillez remplir tous les champs obligatoires.");
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

        const processedData: TransferOrderData[] = Array.from(allRelevantWorkerIds).map(workerId => {
            const worker = allWorkers.find(w => w.id === workerId);
            if (!worker) return null;
            
            const joursTravailles = getDaysWorkedForPeriod(workerId, startDate, endDate);
            const totalOperation = allLogs.filter(l => l.workerId === workerId && l.date >= startDate && l.date <= endDate && l.taskId !== LAIT_TASK_ID && l.taskId !== PANIER_TASK_ID)
                .reduce((sum, log) => sum + (Number(log.quantity) * (taskMap.get(log.taskId)?.price || 0)), 0);

            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
            const totalBrut = totalOperation + anciennete;
            const retenu = totalBrut * 0.0674;
            const indemniteLait = joursTravailles * (taskMap.get(LAIT_TASK_ID)?.price || 0);
            const primePanier = joursTravailles * (taskMap.get(PANIER_TASK_ID)?.price || 0);
            const netPay = totalBrut - retenu + indemniteLait + primePanier;

            return { worker, netPay };
        }).filter((item): item is TransferOrderData => item !== null && item.netPay > 0);
        
        setDraftData(processedData.sort((a, b) => a.worker.name.localeCompare(b.worker.name)));
    };

    const handleSaveReport = () => {
        if (!draftData) return;
        const report: Partial<SavedTransferOrder> = {
            id: editingReport?.id, owner: editingReport?.owner, createdAt: editingReport?.createdAt,
            params: { city, orderDate, startDate, endDate, workerIds: selectedWorkerIds },
            data: draftData,
        };
        onSave(report);
        resetForm();
        setMode('list');
    };

    const ReportContent: React.FC<{ data: TransferOrderData[], params: SavedTransferOrder['params'], id: string }> = ({ data, params, id }) => {
        const totalNet = data.reduce((sum, item) => sum + item.netPay, 0);
        const formattedOrderDate = new Date(params.orderDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <div id={id} className="printable-report bg-white p-8 printable-a4 min-h-[1000px] flex flex-col">
                 <header className="mb-10"><div className="flex justify-between items-start"><div className="flex flex-col items-center"><img src="https://upload.wikimedia.org/wikipedia/ar/0/02/Logo-credit-agricol-maroc.jpg" alt="Logo" className="h-20 mb-2"/><div className="border-2 border-black py-2 px-4"><h1 className="text-xl font-bold tracking-wide uppercase">Ordre de Virement</h1></div></div><div className="text-right"><p className="text-md text-slate-600 mb-6">{params.city} le {formattedOrderDate}</p><div className="text-sm font-semibold text-left" style={{ lineHeight: '1.7' }}><p>CAISSE RÉGIONALE DE CRÉDIT AGRICOLE TAZA</p><p>AGENCE : SONACOS TAZA</p><p>ADRESS : </p><p>COMPTE N° : 2005547 Z 651</p></div></div></div></header>
                <main>{data.length > 0 ? (<table className="w-full border-collapse border border-black text-sm"><thead className="bg-slate-100"><tr><th className="border border-black p-2 text-left font-bold">Nom et Prénom</th><th className="border border-black p-2 text-left font-bold">N° de compte (RIB)</th><th className="border border-black p-2 text-left font-bold">CHEZ</th><th className="border border-black p-2 text-right font-bold">Montant Net (DH)</th></tr></thead><tbody>{data.map(item => (<tr key={item.worker.id}><td className="border border-black p-2">{item.worker.name}</td><td className="border border-black p-2 font-mono">{item.worker.rib}</td><td className="border border-black p-2 font-mono">{item.worker.bankCode || ''}</td><td className="border border-black p-2 text-right font-mono">{item.netPay.toFixed(2)}</td></tr>))}</tbody><tfoot className="font-bold bg-slate-100"><tr><td colSpan={3} className="border border-black p-2 text-right">Total Général</td><td className="border border-black p-2 text-right font-mono">{totalNet.toFixed(2)}</td></tr></tfoot></table>) : (<p className="text-center text-slate-500 py-10">Aucune donnée.</p>)}</main>
                <footer style={{ marginTop: '2cm' }}><div className="flex justify-around"><div className="flex flex-col items-center"><p className="font-semibold mb-2">Le Régisseur</p></div><div className="flex flex-col items-center"><p className="font-semibold mb-2">Le Chef de Centre</p></div></div></footer>
            </div>
        );
    }

    if (isPrinting && viewingReport) {
        return <ReportContent data={viewingReport.data} params={viewingReport.params} id="transfer-order-content" />;
    }

    return (
        <div className="space-y-8">
             {mode === 'list' && (
                <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-slate-800">Ordres de Virement Sauvegardés</h2><button onClick={handleNewReport} className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg><span>Générer un nouvel ordre</span></button></div>
                    {savedReports.length > 0 ? (
                        <ul className="space-y-3">{savedReports.map(report => (<li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center"><div><button onClick={() => setViewingReport(report)} className="font-semibold text-sonacos-green hover:underline">Ordre du {new Date(report.params.orderDate + 'T00:00:00').toLocaleDateString('fr-FR')} (Période: {report.params.startDate} - {report.params.endDate})</button><p className="text-sm text-slate-500">Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}{currentUser.role === 'superadmin' && ` par ${report.owner}`}</p></div><div className="flex items-center gap-2"><button onClick={() => handleEditReport(report)} className="p-2 text-slate-500 hover:text-blue-600 rounded-full hover:bg-blue-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button><button onClick={() => handleDeleteReport(report)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg></button></div></li>))}</ul>
                    ) : <p className="text-center py-8 text-slate-500">Aucun ordre de virement sauvegardé.</p>}
                </div>
            )}
            
            {mode === 'form' && (
                <div ref={optionsCardRef} className="bg-white p-6 rounded-lg shadow-lg border border-slate-200 interactive-glow" onMouseEnter={playHoverSound}>
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-4">{editingReport ? 'Modifier' : 'Générer'} un Ordre de Virement</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                        <div className="md:col-span-1"><label htmlFor="order-city" className="block text-sm font-medium text-slate-700 mb-1.5">Ville</label><input type="text" id="order-city" value={city} onChange={e => setCity(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1"><label htmlFor="order-date" className="block text-sm font-medium text-slate-700 mb-1.5">Fait le</label><input type="date" id="order-date" value={orderDate} onChange={e => setOrderDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1"><label htmlFor="start-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Début</label><input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="md:col-span-1"><label htmlFor="end-date" className="block text-sm font-medium text-slate-700 mb-1.5">Date de Fin</label><input type="date" id="end-date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-md shadow-sm"/></div>
                        <div className="lg:col-span-4 md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1.5">Filtrer par Ouvrier</label><WorkerMultiSelect workerGroups={workerGroups} selectedWorkerIds={selectedWorkerIds} onChange={setSelectedWorkerIds}/></div>
                    </div>
                    <div className="flex justify-between mt-6">
                        <button onClick={() => { setMode('list'); resetForm(); }} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button onClick={(e) => { createRipple(e); handleGenerateDraft(); }} className="flex items-center justify-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Générer le Brouillon</button>
                    </div>
                </div>
            )}
            
            {(viewingReport || draftData) && (
                <div className="bg-slate-200 p-8 rounded-lg">
                    <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{viewingReport ? 'Aperçu de l\'Ordre Sauvegardé' : 'Brouillon de l\'Ordre'}</h2>
                    <div>
                        {viewingReport && <ExportMenu onPrint={() => printElement('transfer-order-content', 'Ordre de Virement')} onExportPDF={() => exportToPDF('transfer-order-content', 'OrdreVirement', 'portrait')} onExportExcel={() => exportToExcel('transfer-order-content', 'OrdreVirement')} />}
                        {draftData && !viewingReport && <button onClick={handleSaveReport} className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Confirmer et Sauvegarder</button>}
                    </div></div>
                    <div className="bg-white shadow-2xl mx-auto max-w-4xl">
                      {viewingReport ? <ReportContent data={viewingReport.data} params={viewingReport.params} id="transfer-order-content" /> : draftData ? <ReportContent data={draftData} params={{ city, orderDate, startDate, endDate, workerIds: selectedWorkerIds }} id="transfer-order-content" /> : null}
                    </div>
                    {viewingReport && <div className="flex justify-center mt-4 gap-4"><button onClick={() => setViewingReport(null)} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Fermer l'aperçu</button></div>}
                </div>
            )}
        </div>
    );
};

export default TransferOrderView;
