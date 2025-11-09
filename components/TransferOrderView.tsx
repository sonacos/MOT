import React, { useState, useMemo, useEffect } from 'react';
import { WorkerGroup, Task, TransferOrderData, SavedTransferOrder, User } from '../types';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface TransferOrderViewProps {
    workerGroups: WorkerGroup[];
    taskMap: Map<number, Task & { category: string }>;
    isPrinting?: boolean;
    savedReports: SavedTransferOrder[];
    onSave: (report: SavedTransferOrder) => void;
    onDelete: (report: SavedTransferOrder) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
    currentUser: User;
    onDirectExport: (report: SavedTransferOrder, format: 'print' | 'pdf' | 'excel') => void;
    viewingReport?: SavedTransferOrder | null;
}

const TransferOrderView: React.FC<TransferOrderViewProps> = ({ isPrinting = false, savedReports, onSave, onDelete, requestConfirmation, currentUser, onDirectExport, viewingReport: viewingReportForExport }) => {

    const [activeReport, setActiveReport] = useState<{ report: SavedTransferOrder; mode: 'view' | 'edit' } | null>(null);
    const [draftParams, setDraftParams] = useState<SavedTransferOrder['params'] | null>(null);

    useEffect(() => {
        if (activeReport?.mode === 'edit') {
            setDraftParams(JSON.parse(JSON.stringify(activeReport.report.params)));
        } else {
            setDraftParams(null);
        }
    }, [activeReport]);

    const handleEditReport = (report: SavedTransferOrder) => {
        setActiveReport({ report, mode: 'edit' });
    };

    const handleDeleteReport = (report: SavedTransferOrder) => {
        requestConfirmation("Confirmer la Suppression", `Êtes-vous sûr de vouloir supprimer cet ordre de virement du ${new Date(report.createdAt).toLocaleString('fr-FR')}?`, () => {
            onDelete(report);
            setActiveReport(null);
        });
    };
    
    const handleSaveModifications = () => {
        if (!activeReport || !draftParams) return;
        const updatedReport: SavedTransferOrder = {
            ...activeReport.report,
            params: draftParams,
            updatedAt: new Date().toISOString(),
        };
        onSave(updatedReport);
        setActiveReport({ report: updatedReport, mode: 'view' });
    };

    const sortedSavedReports = useMemo(() => 
        [...savedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    , [savedReports]);

    const ReportContent: React.FC<{ report: SavedTransferOrder, id: string, isEditing?: boolean }> = ({ report, id, isEditing = false }) => {
        const paramsToUse = isEditing && draftParams ? draftParams : report.params;
        const { data } = report;
        const totalNet = data.reduce((sum, item) => sum + item.netPay, 0);
        const formattedOrderDate = new Date(paramsToUse.orderDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return (
            <div id={id} className="printable-report bg-white p-8 printable-a4 min-h-[1000px] flex flex-col">
                 <header className="mb-10">
                    <div className="flex justify-between items-start">
                        <div className="flex flex-col items-center">
                            <img src="https://upload.wikimedia.org/wikipedia/ar/0/02/Logo-credit-agricol-maroc.jpg" alt="Logo" className="h-20 mb-2"/>
                            <div className="border-2 border-black py-2 px-4">
                                <h1 className="text-xl font-bold tracking-wide uppercase">Ordre de Virement</h1>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-md text-slate-600 mb-6">
                                {isEditing ? <input type="text" value={paramsToUse.city} onChange={e => setDraftParams(p => p ? {...p, city: e.target.value} : null)} className="bg-yellow-100 border-b border-dashed w-24 text-right"/> : paramsToUse.city}
                                {' le '}
                                {isEditing ? <input type="date" value={paramsToUse.orderDate} onChange={e => setDraftParams(p => p ? {...p, orderDate: e.target.value} : null)} className="bg-yellow-100 border-b border-dashed"/> : formattedOrderDate}
                            </p>
                            <div className="text-sm font-semibold text-left" style={{ lineHeight: '1.7' }}>
                                <p>CAISSE RÉGIONALE DE CRÉDIT AGRICOLE TAZA</p><p>AGENCE : SONACOS TAZA</p><p>ADRESS : </p><p>COMPTE N° : 2005547 Z 651</p>
                            </div>
                        </div>
                    </div>
                 </header>
                <main>{data.length > 0 ? (<table className="w-full border-collapse border border-black text-sm"><thead className="bg-slate-100"><tr><th className="border border-black p-2 text-left font-bold">Nom et Prénom</th><th className="border border-black p-2 text-left font-bold">N° de compte (RIB)</th><th className="border border-black p-2 text-left font-bold">CHEZ</th><th className="border border-black p-2 text-right font-bold">Montant Net (DH)</th></tr></thead><tbody>{data.map(item => (<tr key={item.worker.id}><td className="border border-black p-2">{item.worker.name}</td><td className="border border-black p-2 font-mono">{item.worker.rib}</td><td className="border border-black p-2 font-mono">{item.worker.bankCode || ''}</td><td className="border border-black p-2 text-right font-mono">{item.netPay.toFixed(2)}</td></tr>))}</tbody><tfoot className="font-bold bg-slate-100"><tr><td colSpan={3} className="border border-black p-2 text-right">Total Général</td><td className="border border-black p-2 text-right font-mono">{totalNet.toFixed(2)}</td></tr></tfoot></table>) : (<p className="text-center text-slate-500 py-10">Aucune donnée.</p>)}</main>
                <footer style={{ marginTop: '2cm' }}><div className="flex justify-around"><div className="flex flex-col items-center"><p className="font-semibold mb-2">Le Régisseur</p></div><div className="flex flex-col items-center"><p className="font-semibold mb-2">Le Chef de Centre</p></div></div></footer>
            </div>
        );
    }
    
    const reportToPrint = activeReport?.report || viewingReportForExport;
    if (isPrinting && reportToPrint) {
        return <ReportContent report={reportToPrint} id="transfer-order-content" />;
    }

    if (activeReport) {
        const isEditing = activeReport.mode === 'edit';
        return (
            <div className="bg-slate-200 p-8 rounded-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">{isEditing ? "Modifier l'Ordre" : "Aperçu de l'Ordre"}</h2>
                    <div className="flex items-center gap-3">
                        {!isEditing && <ExportMenu 
                            onPrint={() => printElement('transfer-order-content', 'Ordre de Virement')} 
                            onExportPDF={() => exportToPDF('transfer-order-content', 'OrdreVirement', 'portrait')} 
                            onExportExcel={() => exportToExcel('transfer-order-content', 'OrdreVirement')} 
                        />}
                    </div>
                </div>
                <div className="bg-white shadow-2xl mx-auto max-w-4xl">
                    <ReportContent report={activeReport.report} id="transfer-order-content" isEditing={isEditing} />
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
        );
    }

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-800">Ordres de Virement Sauvegardés</h2>
                <p className="text-sm text-slate-500">Générés automatiquement depuis les États Bi-mensuels.</p>
            </div>
            {sortedSavedReports.length > 0 ? (
                <ul className="space-y-3">
                    {sortedSavedReports.map(report => (
                        <li key={report.id} className="p-4 border rounded-lg hover:bg-slate-50 flex justify-between items-center flex-wrap gap-2">
                            <div>
                                <button onClick={() => setActiveReport({ report, mode: 'view' })} className="font-semibold text-sonacos-green hover:underline text-left">
                                    Ordre du {new Date(report.params.orderDate + 'T00:00:00').toLocaleDateString('fr-FR')} (Période: {report.params.startDate} - {report.params.endDate})
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
            ) : <p className="text-center py-8 text-slate-500">Aucun ordre de virement sauvegardé.</p>}
        </div>
    );
};

export default TransferOrderView;