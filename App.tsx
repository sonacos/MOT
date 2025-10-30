import React, { useState, useCallback, useEffect } from 'react';
import { DailyLog, WorkerGroup, Worker } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DailyEntryView from './components/DailyEntryView';
import ReportView from './components/ReportView';
import ManagementView from './components/ManagementView';

const APP_STORAGE_KEY_LOGS = 'sonacos_task_logs_v2';
const APP_STORAGE_KEY_FINALIZED = 'sonacos_finalized_dates_v2';
const APP_STORAGE_KEY_WORKER_GROUPS = 'sonacos_worker_groups_v2';

const getDefaultWorkerGroups = (): WorkerGroup[] => [
  {
    id: 1,
    groupName: 'Groupe A',
    workers: [
      { id: 1, name: 'Ahmed Al-Farsi', matricule: 'SON001', departement: 'Réception' },
      { id: 2, name: 'Fatima Zahra', matricule: 'SON002', departement: 'Conditionnement' },
    ],
  },
  {
    id: 2,
    groupName: 'Groupe B',
    workers: [
      { id: 3, name: 'Youssef El-Idrissi', matricule: 'SON003', departement: 'Logistique' },
      { id: 4, name: 'Khadija Bouzid', matricule: 'SON004', departement: 'Traitement' },
    ],
  },
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'entry' | 'report' | 'management'>('entry');
  
  const [logs, setLogs] = useState<DailyLog[]>(() => {
    try {
      const savedLogs = window.localStorage.getItem(APP_STORAGE_KEY_LOGS);
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (error) {
      console.error("Failed to load logs from localStorage", error);
      return [];
    }
  });

  const [finalizedDates, setFinalizedDates] = useState<string[]>(() => {
    try {
        const savedDates = window.localStorage.getItem(APP_STORAGE_KEY_FINALIZED);
        return savedDates ? JSON.parse(savedDates) : [];
    } catch (error) {
        console.error("Failed to load finalized dates from localStorage", error);
        return [];
    }
  });
  
  const [workerGroups, setWorkerGroups] = useState<WorkerGroup[]>(() => {
    try {
      const savedGroups = window.localStorage.getItem(APP_STORAGE_KEY_WORKER_GROUPS);
      return savedGroups ? JSON.parse(savedGroups) : getDefaultWorkerGroups();
    } catch (error) {
      console.error("Failed to load worker groups from localStorage", error);
      return getDefaultWorkerGroups();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(APP_STORAGE_KEY_LOGS, JSON.stringify(logs));
    } catch (error) {
      console.error("Failed to save logs to localStorage", error);
    }
  }, [logs]);

  useEffect(() => {
    try {
        window.localStorage.setItem(APP_STORAGE_KEY_FINALIZED, JSON.stringify(finalizedDates));
    } catch (error) {
        console.error("Failed to save finalized dates to localStorage", error);
    }
  }, [finalizedDates]);

  useEffect(() => {
    try {
      window.localStorage.setItem(APP_STORAGE_KEY_WORKER_GROUPS, JSON.stringify(workerGroups));
    } catch (error) {
      console.error("Failed to save worker groups to localStorage", error);
    }
  }, [workerGroups]);

  const addLog = useCallback((log: Omit<DailyLog, 'id'>) => {
    setLogs(prev => [...prev, { ...log, id: Date.now() + Math.random() }]);
  }, []);

  const deleteLog = useCallback((logId: number) => {
    setLogs(prev => prev.filter(log => log.id !== logId));
  }, []);

  const toggleFinalizeDate = useCallback((date: string) => {
    setFinalizedDates(prev => 
        prev.includes(date) 
            ? prev.filter(d => d !== date) 
            : [...prev, date]
    );
  }, []);

  // Worker and Group Management Functions
  const saveWorkerGroups = (newGroups: WorkerGroup[]) => {
    const sortedGroups = [...newGroups].sort((a, b) => a.groupName.localeCompare(b.groupName));
    setWorkerGroups(sortedGroups);
  };

  const addGroup = (groupName: string) => {
    const newGroup: WorkerGroup = { id: Date.now(), groupName, workers: [] };
    saveWorkerGroups([...workerGroups, newGroup]);
  };

  const editGroup = (groupId: number, newGroupName: string) => {
    const newGroups = workerGroups.map(g => g.id === groupId ? { ...g, groupName: newGroupName } : g);
    saveWorkerGroups(newGroups);
  };
  
  const deleteGroup = (groupId: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce groupe et tous ses ouvriers ?")) {
      const newGroups = workerGroups.filter(g => g.id !== groupId);
      saveWorkerGroups(newGroups);
    }
  };

  const addWorker = (groupId: number, workerData: Omit<Worker, 'id'>) => {
    const newWorker: Worker = { ...workerData, id: Date.now() };
    const newGroups = workerGroups.map(g => {
      if (g.id === groupId) {
        return { ...g, workers: [...g.workers, newWorker].sort((a,b) => a.name.localeCompare(b.name)) };
      }
      return g;
    });
    saveWorkerGroups(newGroups);
  };

  const editWorker = (workerId: number, updatedWorkerData: Omit<Worker, 'id'>) => {
     const newGroups = workerGroups.map(g => ({
       ...g,
       workers: g.workers.map(w => w.id === workerId ? { ...updatedWorkerData, id: workerId } : w).sort((a,b) => a.name.localeCompare(b.name))
     }));
     saveWorkerGroups(newGroups);
  };

  const deleteWorker = (workerId: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cet ouvrier ? Cette action supprimera également toutes les saisies associées à cet ouvrier.")) {
      // First, filter out the logs for the deleted worker
      setLogs(prevLogs => prevLogs.filter(log => log.workerId !== workerId));
      
      // Then, remove the worker from the groups
      const newGroups = workerGroups.map(g => ({
        ...g,
        workers: g.workers.filter(w => w.id !== workerId)
      }));
      saveWorkerGroups(newGroups);
    }
  };
  
  const viewTitles = {
    entry: 'Saisie Journalière des Opérations',
    report: 'Génération de Rapports',
    management: 'Gestion des Ouvriers & Groupes'
  };

  return (
    <div className="min-h-screen bg-sonacos-beige font-sans flex">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={viewTitles[currentView]} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            <div className="print:hidden">
              {currentView === 'entry' && <DailyEntryView logs={logs} addLog={addLog} deleteLog={deleteLog} finalizedDates={finalizedDates} onToggleFinalize={toggleFinalizeDate} workerGroups={workerGroups} />}
              {currentView === 'report' && <ReportView allLogs={logs} workerGroups={workerGroups} />}
              {currentView === 'management' && (
                <ManagementView 
                  workerGroups={workerGroups}
                  onAddGroup={addGroup}
                  onEditGroup={editGroup}
                  onDeleteGroup={deleteGroup}
                  onAddWorker={addWorker}
                  onEditWorker={editWorker}
                  onDeleteWorker={deleteWorker}
                />
              )}
            </div>
            <div className="hidden print:block">
                {currentView === 'report' && <ReportView allLogs={logs} workerGroups={workerGroups} isPrinting />}
            </div>
        </main>
      </div>
    </div>
  );
};

export default App;