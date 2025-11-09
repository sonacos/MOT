import React, { useState, useMemo, useEffect } from 'react';
import { Worker, PayrollData, SavedPayroll, User, Task } from '../types';
import { getDynamicTaskByIdWithFallback } from '../constants';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';
import { createRipple } from '../utils/effects';

interface PayrollViewProps {
    workerGroups: any; // Keep any for simplicity if worker structure is complex/not needed
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedPayroll[];
    onSave: (report: SavedPayroll) => void;
    onDelete: (report: SavedPayroll) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
    onDirectExport: (report: SavedPayroll, format: 'print' | 'pdf' | 'excel') => void;
    viewingReport?: SavedPayroll | null;
    onRetroactiveGenerate: () => void;
}

const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;

const PayrollView: React.FC<PayrollViewProps> = ({ taskMap, isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser, onDirectExport, viewingReport: viewingReportForExport, onRetroactiveGenerate }) => {
    
    const [activeReport, setActiveReport] = useState<{ report: SavedPayroll; mode: 'view' | 'edit' } | null>(null);
    const [draftParams, setDraftParams] = useState<SavedPayroll['params'] | null>(null);

    useEffect(() => {
        if (activeReport?.mode === 'edit') {
            setDraftParams(JSON.parse(JSON.stringify(activeReport.report.params)));
        } else {
            setDraftParams(null);
        }
    }, [activeReport]);

    const handleEditReport = (report: SavedPayroll) => {
        setActiveReport({ report, mode: 'edit' });
    };

    const handleDeleteReport = (report: SavedPayroll) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer ce décompte du ${new Date(report.createdAt).toLocaleString('fr-FR')}?`, () => {
            onDelete(report);
            setActiveReport(null);
        });
    };

    const handleSaveModifications = () => {
        if (!activeReport || !draftParams) return;
        const updatedReport: SavedPayroll = {
            ...activeReport.report,
            params: draftParams,
            updatedAt: new Date().toISOString(),
        };
        onSave(updatedReport);
        setActiveReport({ report: updatedReport, mode: 'view' });
    };

    const handleAvanceChange = (workerId: number, value: string) => {
        if (!draftParams) return;
        setDraftParams(prevParams => {
            const newParams = { ...prevParams! };
            if (!newParams.additionalInputs) {
                newParams.additionalInputs = {};
            }
            if (!newParams.additionalInputs[workerId]) {
                 newParams.additionalInputs[workerId] = { avance: '' };
            }
            newParams.additionalInputs[workerId].avance = value;
            return newParams;
        });
    };

    const sortedSavedReports = useMemo(() => 
        [...savedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    , [savedReports]);

    const ReportContent: React.FC<{ report: SavedPayroll, id: string, isEditing?: boolean }> = ({ report, id, isEditing = false }) => {
        const paramsToUse = isEditing && draftParams ? draftParams : report.params;
        const { data } = report;
        const laitPricePerDay = taskMap.get(LAIT_TASK_ID)?.price || 0;
        const panierPricePerDay = taskMap.get(PANIER_TASK_ID)?.price || 0;

        const grandTotals = useMemo(() => data.reduce((totals, d) => {
            const avance = parseFloat(paramsToUse.additionalInputs[d.worker.id]?.avance || '0') || 0;
            const indemniteLait = d.joursTravailles * laitPricePerDay;
            const primePanier = d.joursTravailles * panierPricePerDay;
            const net = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;
            return {
                totalOperation: totals.totalOperation + d.totalOperation, anciennete: totals.anciennete + d.anciennete, totalBrut: totals.totalBrut + d.totalBrut,
                retenu: totals.retenu + d.retenu, lait: totals.lait + indemniteLait, panier: totals.panier + primePanier, avance: totals.avance + avance, net: totals.net + net,
            };
        }, { totalOperation: 0, anciennete: 0, totalBrut: 0, retenu: 0, lait: 0, panier: 0, avance: 0, net: 0 }), [data, paramsToUse.additionalInputs, laitPricePerDay, panierPricePerDay]);
        
        const formattedStartDate = new Date(paramsToUse.startDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const formattedEndDate = new Date(paramsToUse.endDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        
        return (
            <div id={id} className="printable-report bg-white p-6 printable-a4">
                 <header className="text-[10px] leading-tight"><div className="text-center mb-4"><h2 className="font-bold underline text-sm">Etat n°09</h2><h2 className="font-bold underline text-sm">DEPENSES EN REGIE</h2><h2 className="font-bold underline text-sm">DEPENSES DE PERSONNEL A LA TACHE</h2></div><div className="flex justify-between items-start"><div><p>Année : <input type="text" value={paramsToUse.anneeScolaire} onChange={e => setDraftParams(p => p ? {...p, anneeScolaire: e.target.value} : null)} disabled={!isEditing} className="bg-transparent disabled:border-none border-b border-dashed w-24"/></p><p>Centre Régional : <input type="text" value={paramsToUse.centreRegional.toUpperCase()} onChange={e => setDraftParams(p => p ? {...p, centreRegional: e.target.value} : null)} disabled={!isEditing} className="bg-transparent disabled:border-none border-b border-dashed"/></p><p>Règle de Dépenses de {paramsToUse.centreRegional.toUpperCase()}</p><p>Règle de dépenses auprès du Centre Régional de {paramsToUse.centreRegional.toUpperCase()} Année : <input type="text" value={paramsToUse.anneeRegle} onChange={e => setDraftParams(p => p ? {...p, anneeRegle: e.target.value} : null)} disabled={!isEditing} className="bg-transparent disabled:border-none border-b border-dashed w-24"/></p></div></div><div className="mt-4"><p><span className="font-bold">Somme à payer :</span> {grandTotals.net.toFixed(2)} DH</p><p className="mt-2"><span className="font-bold">DATE : du {formattedStartDate} au {formattedEndDate}</span></p></div></header>
                <table className="w-full border-collapse border border-black text-[9px] mt-2">
                    <thead className="text-[8px] font-bold"><tr className="bg-slate-100"><th className="border border-black p-1 align-middle text-center">n°ordre</th><th className="border border-black p-1 align-middle text-center">Nom et<br/>prenom</th><th className="border border-black p-1 align-middle text-center">Emplois</th><th className="border border-black p-1 align-middle text-center">Nombre<br/>d'enfants</th><th className="border border-black p-1 w-2/5 align-middle text-center">NATURE DE TACHE</th><th className="border border-black p-1 align-middle text-center">nbr<br/>unite</th><th className="border border-black p-1 align-middle text-center">P.U</th><th className="border border-black p-1 align-middle text-center">Montant<br/>Op.</th><th className="border border-black p-1 align-middle text-center">TOTAL Op.</th><th className="border border-black p-1 align-middle text-center">Taux<br/>Anc.</th><th className="border border-black p-1 align-middle text-center">Montant<br/>Anc.</th><th className="border border-black p-1 align-middle text-center">TOTAL<br/>BRUT</th><th className="border border-black p-1 align-middle text-center">RETENU<br/>CNSS+AMO<br/>6.74%</th><th className="border border-black p-1 align-middle text-center">Jours<br/>Trav.</th><th className="border border-black p-1 align-middle text-center">INDEMNITE<br/>DE LAIT</th><th className="border border-black p-1 align-middle text-center">Prime de<br/>panier</th><th className="border border-black p-1 align-middle text-center">Avance<br/>s/d</th><th className="border border-black p-1 align-middle text-center">NET A<br/>PAYER</th></tr></thead>
                    <tbody>
                        {data.map((d, workerIndex) => {
                            const numTasks = d.tasks.length || 1;
                            const avance = parseFloat(paramsToUse.additionalInputs[d.worker.id]?.avance || '0') || 0;
                            const indemniteLait = d.joursTravailles * laitPricePerDay;
                            const primePanier = d.joursTravailles * panierPricePerDay;
                            const netAPayer = d.totalBrut - d.retenu + indemniteLait + primePanier - avance;
                            
                            const renderRow = (task: any, taskIndex: number) => (
                                <tr key={task ? `${d.worker.id}-${task.taskId}` : `${d.worker.id}-empty`} className={workerIndex > 0 && taskIndex === 0 ? "border-t-2 border-black" : ""}>
                                    {taskIndex === 0 && (<><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{workerIndex + 1}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.name}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.departement}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.numberOfChildren}</td></>)}
                                    <td className="border border-black p-1 text-center align-middle">{task ? getDynamicTaskByIdWithFallback(task.taskId, taskMap).description : '-'}</td>
                                    <td className="border border-black p-1 text-center align-middle">{task ? task.quantity.toFixed(2) : '-'}</td><td className="border border-black p-1 text-center align-middle">{task ? task.price.toFixed(2) : '-'}</td><td className="border border-black p-1 text-center align-middle">{task ? task.amount.toFixed(2) : '-'}</td>
                                    {taskIndex === 0 && (<><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalOperation.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.worker.seniorityPercentage}%</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.anciennete.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-semibold">{d.totalBrut.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.retenu.toFixed(2)}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{d.joursTravailles}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{indemniteLait > 0 ? indemniteLait.toFixed(2) : '-'}</td><td rowSpan={numTasks} className="border border-black p-1 text-center align-middle">{primePanier > 0 ? primePanier.toFixed(2) : '-'}</td>
                                    <td rowSpan={numTasks} className="border border-black p-0 text-center align-middle">
                                        {isEditing ? <input type="number" value={paramsToUse.additionalInputs[d.worker.id]?.avance || ''} onChange={e => handleAvanceChange(d.worker.id, e.target.value)} className="w-full h-full p-1 text-center bg-yellow-100 border-none"/> : (avance > 0 ? avance.toFixed(2) : '-')}
                                    </td>
                                    <td rowSpan={numTasks} className="border border-black p-1 text-center align-middle font-bold">{netAPayer.toFixed(2)}</td></>)}
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
    
    const reportToPrint = activeReport?.report || viewingReportForExport;
    if (isPrinting && reportToPrint) {
        return <ReportContent report={reportToPrint} id="payroll-content" />;
    }
    
    if (activeReport) {
        const isEditing = activeReport.mode === 'edit';
        return (
             <div className="bg-slate-200 p-8 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">{isEditing ? "Modifier le Décompte" : "Aperçu du Décompte"}</h2>
                    <div className="flex items-center gap-3">
                         {!isEditing && <ExportMenu 
                            onPrint={() => printElement('payroll-content', 'Décompte de Paie')} 
                            onExportPDF={() => exportToPDF('payroll-content', 'DecomptePaie', 'landscape')} 
                            onExportExcel={() => exportToExcel('payroll-content', 'DecomptePaie')} 
                         />}
                    </div>
                </div>
                <div className="bg-white shadow-2xl mx-auto" id="payroll-content-wrapper">
                     <ReportContent report={activeReport.report} id="payroll-content" isEditing={isEditing} />
                </div>
                <div className="flex justify-center mt-4 gap-4">
                    <button onClick={() => setActiveReport(null)} className="px-4 py-2 bg-slate-500 text-white font-semibold rounded-lg hover:bg-slate-600">Fermer</button>
                    {isEditing ? (
                        <button onClick={handleSaveModifications} className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">Sauvegarder les modifications</button>
                    ) : (
                         <button onClick={() => handleEditReport(activeReport.report)} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">Modifier</button>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Décomptes de Paie Sauvegardés</h2>
                    <p className="text-sm text-slate-500">Générés automatiquement depuis les États Bi-mensuels.</p>
                </div>
                <button onClick={(e) => { createRipple(e); onRetroactiveGenerate(); }} className="px-4 py-2 bg-sonacos-teal-dark text-white font-semibold rounded-lg hover:bg-slate-700">
                    Générer les décomptes manquants pour les anciennes périodes
                </button>
            </div>
            {sortedSavedReports.length > 0 ? (
                <ul className="space-y-3">
                    {sortedSavedReports.map(report => (
                        <li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                            <div>
                                <button onClick={() => setActiveReport({ report, mode: 'view'})} className="font-semibold text-sonacos-green hover:underline text-left">
                                    Décompte du {report.params.startDate} au {report.params.endDate}
                                </button>
                                <p className="text-sm text-slate-500">
                                    Créé le: {new Date(report.createdAt).toLocaleString('fr-FR')}
                                    {currentUser.role === 'superadmin' && ` par ${report.owner}`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <ExportMenu 
                                    onPrint={() => onDirectExport(report, 'print')}
                                    onExportPDF={() => onDirectExport(report, 'pdf')}
                                    onExportExcel={() => onDirectExport(report, 'excel')}
                                />
                                 <button onClick={() => handleEditReport(report)} title="Aperçu / Modifier" className="p-2 text-slate-500 hover:text-blue-600 rounded-full hover:bg-blue-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                </button>
                                <button onClick={() => handleDeleteReport(report)} className="p-2 text-slate-500 hover:text-red-600 rounded-full hover:bg-red-100">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : <p className="text-center py-8 text-slate-500">Aucun décompte de paie sauvegardé.</p>}
        </div>
    );
};

export default PayrollView;