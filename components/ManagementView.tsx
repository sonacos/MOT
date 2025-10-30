import React, { useState, FormEvent } from 'react';
import { Worker, WorkerGroup } from '../types';
import Modal from './Modal';

interface ManagementViewProps {
    workerGroups: WorkerGroup[];
    onAddGroup: (groupName: string) => void;
    onEditGroup: (groupId: number, newGroupName: string) => void;
    onDeleteGroup: (groupId: number) => void;
    onAddWorker: (groupId: number, workerData: Omit<Worker, 'id'>) => void;
    onEditWorker: (workerId: number, updatedWorkerData: Omit<Worker, 'id'>) => void;
    onDeleteWorker: (workerId: number) => void;
}

const ManagementView: React.FC<ManagementViewProps> = ({ 
    workerGroups, 
    onAddGroup, 
    onEditGroup, 
    onDeleteGroup,
    onAddWorker,
    onEditWorker,
    onDeleteWorker
}) => {
    const [isGroupModalOpen, setGroupModalOpen] = useState(false);
    const [isWorkerModalOpen, setWorkerModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<WorkerGroup | null>(null);
    const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
    const [currentGroupId, setCurrentGroupId] = useState<number | null>(null);

    // Group Form State
    const [groupName, setGroupName] = useState('');
    
    // Worker Form State
    const [workerName, setWorkerName] = useState('');
    const [workerMatricule, setWorkerMatricule] = useState('');
    const [workerDepartement, setWorkerDepartement] = useState('');

    const openGroupModal = (group: WorkerGroup | null = null) => {
        setEditingGroup(group);
        setGroupName(group ? group.groupName : '');
        setGroupModalOpen(true);
    };

    const closeGroupModal = () => {
        setGroupModalOpen(false);
        setEditingGroup(null);
        setGroupName('');
    };

    const handleGroupSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!groupName.trim()) return;
        if (editingGroup) {
            onEditGroup(editingGroup.id, groupName.trim());
        } else {
            onAddGroup(groupName.trim());
        }
        closeGroupModal();
    };
    
    const openWorkerModal = (groupId: number, worker: Worker | null = null) => {
        setCurrentGroupId(groupId);
        setEditingWorker(worker);
        setWorkerName(worker ? worker.name : '');
        setWorkerMatricule(worker ? worker.matricule : '');
        setWorkerDepartement(worker ? worker.departement : '');
        setWorkerModalOpen(true);
    };
    
    const closeWorkerModal = () => {
        setWorkerModalOpen(false);
        setEditingWorker(null);
        setCurrentGroupId(null);
        setWorkerName('');
        setWorkerMatricule('');
        setWorkerDepartement('');
    };

    const handleWorkerSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!workerName.trim() || !workerMatricule.trim() || !workerDepartement.trim()) {
            alert("Veuillez remplir tous les champs de l'ouvrier.");
            return;
        }
        const workerData = {
            name: workerName.trim(),
            matricule: workerMatricule.trim(),
            departement: workerDepartement.trim()
        };
        if (editingWorker) {
            onEditWorker(editingWorker.id, workerData);
        } else if(currentGroupId) {
            onAddWorker(currentGroupId, workerData);
        }
        closeWorkerModal();
    };
    
    const ActionButton: React.FC<{onClick: () => void, title: string, children: React.ReactNode, className?: string}> = 
    ({onClick, title, children, className}) => (
        <button onClick={onClick} title={title} className={`p-1.5 rounded-full transition-colors duration-200 ${className}`}>
            {children}
        </button>
    );

    return (
        <div className="space-y-8">
            <div className="flex justify-end items-center">
                <button 
                    onClick={() => openGroupModal()} 
                    className="flex items-center gap-2 px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sonacos-green transition-all duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
                    <span>Ajouter un Groupe</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {workerGroups.map(group => (
                    <div key={group.id} className="bg-white rounded-lg shadow-lg border border-slate-100 flex flex-col">
                         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-green-50/50 rounded-t-lg">
                            <h3 className="text-xl font-bold text-sonacos-green">{group.groupName}</h3>
                            <div className="flex items-center gap-2">
                                <ActionButton onClick={() => openWorkerModal(group.id)} title="Ajouter un ouvrier" className="text-green-700 bg-green-100 hover:bg-green-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                </ActionButton>
                                <ActionButton onClick={() => openGroupModal(group)} title="Modifier le groupe" className="text-blue-600 bg-blue-100 hover:bg-blue-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                </ActionButton>
                                <ActionButton onClick={() => onDeleteGroup(group.id)} title="Supprimer le groupe" className="text-red-600 bg-red-100 hover:bg-red-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                </ActionButton>
                            </div>
                        </div>

                         <div className="overflow-x-auto">
                            {group.workers.length > 0 ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-stone-100 text-slate-600">
                                        <tr>
                                            <th className="text-left p-3 font-semibold">Nom</th>
                                            <th className="text-left p-3 font-semibold">Matricule</th>
                                            <th className="text-right p-3 font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.workers.map((worker, index) => (
                                            <tr key={worker.id} className="odd:bg-white even:bg-stone-50 hover:bg-green-50/50">
                                                <td className="p-3">
                                                    <p className="font-medium text-slate-800">{worker.name}</p>
                                                    <p className="text-xs text-slate-500">{worker.departement}</p>
                                                </td>
                                                <td className="p-3 text-slate-600 font-mono">{worker.matricule}</td>
                                                <td className="p-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <ActionButton onClick={() => openWorkerModal(group.id, worker)} title="Modifier l'ouvrier" className="text-slate-500 hover:bg-blue-100 hover:text-blue-600">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                                                        </ActionButton>
                                                        <ActionButton onClick={() => onDeleteWorker(worker.id)} title="Supprimer l'ouvrier" className="text-slate-500 hover:bg-red-100 hover:text-red-600">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                        </ActionButton>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-sm text-slate-400 text-center p-8">Aucun ouvrier dans ce groupe.</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <Modal isOpen={isGroupModalOpen} onClose={closeGroupModal} title={editingGroup ? "Modifier le Groupe" : "Nouveau Groupe"}>
                <form onSubmit={handleGroupSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="group-name" className="block text-sm font-medium text-slate-700">Nom du groupe</label>
                        <input 
                            type="text" 
                            id="group-name" 
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            required
                            className="mt-1 w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={closeGroupModal} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button type="submit" className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">{editingGroup ? 'Enregistrer' : 'Créer'}</button>
                    </div>
                </form>
            </Modal>
            
            <Modal isOpen={isWorkerModalOpen} onClose={closeWorkerModal} title={editingWorker ? "Modifier l'Ouvrier" : "Nouvel Ouvrier"}>
                <form onSubmit={handleWorkerSubmit} className="space-y-4">
                     <div>
                        <label htmlFor="worker-name" className="block text-sm font-medium text-slate-700">Nom complet</label>
                        <input type="text" id="worker-name" value={workerName} onChange={e => setWorkerName(e.target.value)} required className="mt-1 w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" />
                    </div>
                     <div>
                        <label htmlFor="worker-matricule" className="block text-sm font-medium text-slate-700">Matricule</label>
                        <input type="text" id="worker-matricule" value={workerMatricule} onChange={e => setWorkerMatricule(e.target.value)} required className="mt-1 w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" />
                    </div>
                     <div>
                        <label htmlFor="worker-departement" className="block text-sm font-medium text-slate-700">Département</label>
                        <input type="text" id="worker-departement" value={workerDepartement} onChange={e => setWorkerDepartement(e.target.value)} required className="mt-1 w-full p-2 border border-slate-300 rounded-md shadow-sm focus:ring-sonacos-green focus:border-sonacos-green" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={closeWorkerModal} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-lg hover:bg-slate-300">Annuler</button>
                        <button type="submit" className="px-4 py-2 bg-sonacos-green text-white font-semibold rounded-lg hover:bg-green-800">{editingWorker ? 'Enregistrer' : 'Créer'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default ManagementView;