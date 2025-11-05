import React, { useState, useCallback, useEffect } from 'react';
import { DailyLog, WorkerGroup, Worker, WorkedDays, User, UserRole } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DailyEntryView from './components/DailyEntryView';
import ManagementView from './components/ManagementView';
import PayrollView from './components/PayrollView';
import TransferOrderView from './components/TransferOrderView';
import UserManagementView from './components/UserManagementView';
import SeasonView from './components/SeasonView';
import LoginView from './components/LoginView';
import ConfirmationModal from './components/ConfirmationModal';
import { unlockAudio } from './utils/audioUtils';
import { auth, db } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth";
import FinalReportView from './components/FinalReportView';
import {
    collection,
    doc,
    getDocs,
    writeBatch,
    addDoc,
    deleteDoc,
    query,
    setDoc,
    updateDoc,
    getDoc,
    limit,
    collectionGroup,
    where,
} from 'firebase/firestore';

const DEPARTED_GROUP_ID = 9999;

const App: React.FC = () => {
    type View = 'entry' | 'management' | 'payroll' | 'transferOrder' | 'userManagement' | 'season' | 'finalReport';
    const [currentView, setCurrentView] = useState<View>('entry');
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);

    // Data states
    const [logs, setLogs] = useState<DailyLog[]>([]);
    const [workerGroups, setWorkerGroups] = useState<WorkerGroup[]>([]);
    const [finalizedDates, setFinalizedDates] = useState<string[]>([]);
    const [workedDays, setWorkedDays] = useState<WorkedDays[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    
    // Auth and loading states
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authChecked, setAuthChecked] = useState(false);
    
    // Confirmation Modal State
    const [confirmationState, setConfirmationState] = useState<{
        isOpen: boolean;
        title: string;
        message: string | React.ReactNode;
        onConfirm: (() => void) | null;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null,
    });

    const requestConfirmation = (title: string, message: string | React.ReactNode, onConfirm: () => void) => {
        setConfirmationState({ isOpen: true, title, message, onConfirm });
    };

    const handleConfirm = () => {
        if (confirmationState.onConfirm) {
            confirmationState.onConfirm();
        }
        handleCloseConfirmation();
    };

    const handleCloseConfirmation = () => {
        setConfirmationState({ isOpen: false, title: '', message: '', onConfirm: null });
    };

    // --- Firebase Data Fetching with Data Isolation ---
    const fetchData = useCallback(async (user: User) => {
        setIsLoading(true);
        try {
            if (user.role === 'superadmin') {
                // Superadmin fetches data from all users using collectionGroup
                const [logsSnapshot, groupsSnapshot, finalizedSnapshot, workedDaysSnapshot, usersSnapshot] = await Promise.all([
                    getDocs(collectionGroup(db, 'dailyLogs')),
                    getDocs(collectionGroup(db, 'workerGroups')),
                    getDoc(doc(db, 'metadata', 'finalizedDates')), // Finalized dates are global
                    getDocs(collectionGroup(db, 'workedDays')),
                    getDocs(collection(db, 'users'))
                ]);

                const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                const userMap = new Map(usersData.map(u => [u.uid, u.email]));
                setUsers(usersData);

                setLogs(logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyLog)));
                
                const groups = groupsSnapshot.docs.map(doc => {
                    const group = { id: Number(doc.id), ...doc.data() } as WorkerGroup;
                    const ownerEmail = userMap.get(group.owner || '');
                    return { ...group, ownerEmail: ownerEmail || 'Inconnu' };
                });
                setWorkerGroups(groups);

                setWorkedDays(workedDaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkedDays)));
                
                if (finalizedSnapshot.exists()) {
                    setFinalizedDates(finalizedSnapshot.data().dates || []);
                }

            } else {
                // Regular user fetches only their own data
                const [logsSnapshot, groupsSnapshot, finalizedSnapshot, workedDaysSnapshot] = await Promise.all([
                    getDocs(collection(db, 'users', user.uid, 'dailyLogs')),
                    getDocs(collection(db, 'users', user.uid, 'workerGroups')),
                    getDoc(doc(db, 'metadata', 'finalizedDates')),
                    getDocs(collection(db, 'users', user.uid, 'workedDays')),
                    getDocs(collection(db, 'users')).then(snapshot => setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User))))
                ]);
                
                setLogs(logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyLog)));
                setWorkerGroups(groupsSnapshot.docs.map(doc => ({ id: Number(doc.id), ...doc.data() } as WorkerGroup)));
                setWorkedDays(workedDaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkedDays)));

                if (finalizedSnapshot.exists()) {
                    setFinalizedDates(finalizedSnapshot.data().dates || []);
                }
            }
        } catch (error) {
            console.error("Error fetching data from Firestore:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // --- Auth Listener ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const userDocRef = doc(db, 'users', firebaseUser.uid);
                let userDoc = await getDoc(userDocRef);

                if (!userDoc.exists()) {
                    const usersCollectionRef = collection(db, 'users');
                    const firstUserQuery = query(usersCollectionRef, limit(1));
                    const existingUsersSnapshot = await getDocs(firstUserQuery);
                    const isFirstUser = existingUsersSnapshot.empty;
                    
                    let newUserRole: UserRole = 'user';
                    if (isFirstUser || firebaseUser.email === 'tazzihamid@gmail.com') {
                        newUserRole = 'superadmin';
                    }
                    
                    const newUserFirestoreData = {
                        email: firebaseUser.email!,
                        role: newUserRole,
                    };
                    
                    const batch = writeBatch(db);
                    batch.set(userDocRef, newUserFirestoreData);

                    // Also create the "Departed" group for the new user
                    const departedGroup: Omit<WorkerGroup, 'id'> = {
                        groupName: 'Personnel Parti',
                        workers: [],
                        isDepartedGroup: true,
                        isArchived: true,
                        owner: firebaseUser.uid,
                    };
                    const departedGroupRef = doc(db, 'users', firebaseUser.uid, 'workerGroups', String(DEPARTED_GROUP_ID));
                    batch.set(departedGroupRef, departedGroup);

                    await batch.commit();
                    userDoc = await getDoc(userDocRef); // Re-fetch the doc after creation
                }

                if (userDoc.exists()) {
                    const userDbData = userDoc.data();
                    const userData = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email!,
                        role: userDbData.role as UserRole,
                    };

                    // Ensure the target user always has superadmin rights, even if they existed before this code change.
                    if (userData.email === 'tazzihamid@gmail.com' && userData.role !== 'superadmin') {
                        userData.role = 'superadmin';
                        await updateDoc(userDocRef, { role: 'superadmin' });
                    }

                    setCurrentUser(userData);
                    await fetchData(userData);
                } else {
                    // This case should ideally not be reached after the creation block above, but it's good for safety.
                    signOut(auth);
                }
            } else {
                setCurrentUser(null);
            }
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [fetchData]);

    // Ensure the departed group always exists for the current user (self-healing for existing users)
    useEffect(() => {
        if (!isLoading && currentUser && !workerGroups.some(g => g.id === DEPARTED_GROUP_ID && g.owner === currentUser.uid)) {
             const departedGroup: WorkerGroup = {
                id: DEPARTED_GROUP_ID,
                groupName: 'Personnel Parti',
                workers: [],
                isDepartedGroup: true,
                isArchived: true,
                owner: currentUser.uid,
            };
            const groupDocRef = doc(db, 'users', currentUser.uid, 'workerGroups', String(DEPARTED_GROUP_ID));
            setDoc(groupDocRef, departedGroup)
              .then(() => {
                if(currentUser.role !== 'superadmin') { // Avoid state pollution for admin
                    setWorkerGroups(prev => [...prev, departedGroup]);
                }
              });
        }
    }, [isLoading, workerGroups, currentUser]);
    
    useEffect(() => {
        document.addEventListener('mousedown', unlockAudio, { once: true });
        return () => document.removeEventListener('mousedown', unlockAudio);
    }, []);

    // --- Data Writing Functions with Scoping ---
    const addLog = useCallback(async (logData: Omit<DailyLog, 'id' | 'owner'>) => {
        if (!currentUser) return;
        const logWithOwner = { ...logData, owner: currentUser.uid };
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'dailyLogs'), logWithOwner);
        setLogs(prev => [...prev, { ...logWithOwner, id: docRef.id }]);
    }, [currentUser]);

    const deleteLog = useCallback(async (logId: string, ownerId?: string) => {
        if (!currentUser) return;
        const effectiveOwnerId = ownerId || currentUser.uid;
        if (currentUser.role !== 'superadmin' && effectiveOwnerId !== currentUser.uid) return;
        
        await deleteDoc(doc(db, 'users', effectiveOwnerId, 'dailyLogs', logId));
        setLogs(prev => prev.filter(log => log.id !== logId));
    }, [currentUser]);
    
    const deleteLogsByDate = useCallback(async (date: string) => {
        if (!currentUser) return;

        const logsToDelete = currentUser.role === 'superadmin'
            ? logs.filter(l => l.date === date)
            : logs.filter(l => l.date === date && l.owner === currentUser.uid);

        if (logsToDelete.length === 0) return;

        const batch = writeBatch(db);
        logsToDelete.forEach(log => {
            if (log.owner) {
                const logRef = doc(db, 'users', log.owner, 'dailyLogs', log.id);
                batch.delete(logRef);
            }
        });

        await batch.commit();
        const idsToDelete = new Set(logsToDelete.map(l => l.id));
        setLogs(prev => prev.filter(l => !idsToDelete.has(l.id)));
    }, [currentUser, logs]);

    const deleteLogsByPeriod = useCallback(async (year: number, month: number, period: 'first' | 'second') => {
        if (!currentUser) return;

        const startDateNum = period === 'first' ? 1 : 16;
        const endDateNum = period === 'first' ? 15 : new Date(year, month, 0).getDate();
        
        const startDate = new Date(Date.UTC(year, month - 1, startDateNum));
        const endDate = new Date(Date.UTC(year, month - 1, endDateNum));
        
        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        const logsToDelete = currentUser.role === 'superadmin'
            ? logs.filter(l => l.date >= startDateStr && l.date <= endDateStr)
            : logs.filter(l => 
                l.owner === currentUser.uid &&
                l.date >= startDateStr &&
                l.date <= endDateStr
            );

        if (logsToDelete.length === 0) return;

        const batch = writeBatch(db);
        logsToDelete.forEach(log => {
            if (log.owner) {
                const logRef = doc(db, 'users', log.owner, 'dailyLogs', log.id);
                batch.delete(logRef);
            }
        });

        await batch.commit();
        const idsToDelete = new Set(logsToDelete.map(l => l.id));
        setLogs(prev => prev.filter(l => !idsToDelete.has(l.id)));
    }, [currentUser, logs]);


    const toggleFinalizeDate = useCallback(async (date: string) => {
        // Finalized dates are global, only superadmin can change
        if (currentUser?.role !== 'superadmin') {
            alert("Seul un administrateur peut finaliser ou déverrouiller une journée.");
            return;
        }
        const newFinalized = finalizedDates.includes(date)
            ? finalizedDates.filter(d => d !== date)
            : [...finalizedDates, date];
        await setDoc(doc(db, 'metadata', 'finalizedDates'), { dates: newFinalized });
        setFinalizedDates(newFinalized);
    }, [finalizedDates, currentUser]);

    const saveWorkedDays = useCallback(async (data: Omit<WorkedDays, 'id' | 'owner'>) => {
        if (!currentUser) return;
        const path = `users/${currentUser.uid}/workedDays`;

        const q = query(collection(db, path),
            where("workerId", "==", data.workerId),
            where("year", "==", data.year),
            where("month", "==", data.month),
            where("period", "==", data.period)
        );
        const querySnapshot = await getDocs(q);
        const existingDoc = querySnapshot.docs[0];

        const dataWithOwner = { ...data, owner: currentUser.uid };

        if (data.days > 0) {
            if (existingDoc) {
                await updateDoc(doc(db, path, existingDoc.id), { days: data.days });
                setWorkedDays(prev => prev.map(d => d.id === existingDoc.id ? { ...d, days: data.days } : d));
            } else {
                const docRef = await addDoc(collection(db, path), dataWithOwner);
                setWorkedDays(prev => [...prev, { ...dataWithOwner, id: docRef.id }]);
            }
        } else if (existingDoc) {
            await deleteDoc(doc(db, path, existingDoc.id));
            setWorkedDays(prev => prev.filter(d => d.id !== existingDoc.id));
        }
    }, [currentUser]);

    const addGroup = async (groupName: string) => {
        if (!currentUser) return;
        const newGroupId = Date.now();
        const newGroup: WorkerGroup = { id: newGroupId, groupName, workers: [], owner: currentUser.uid };
        await setDoc(doc(db, 'users', currentUser.uid, 'workerGroups', String(newGroupId)), newGroup);
        if (currentUser) await fetchData(currentUser); // Refresh all data
    };

    const editGroup = async (groupId: number, newGroupName: string, ownerId: string) => {
        if (!currentUser) return;
        if (currentUser.role !== 'superadmin' && ownerId !== currentUser.uid) return;
        await updateDoc(doc(db, 'users', ownerId, 'workerGroups', String(groupId)), { groupName: newGroupName });
        if (currentUser) await fetchData(currentUser);
    };
    
    const archiveGroup = async (groupId: number, ownerId: string) => {
        if (!currentUser) return;
        if (currentUser.role !== 'superadmin' && ownerId !== currentUser.uid) return;

        const groupRef = doc(db, 'users', ownerId, 'workerGroups', String(groupId));
        const group = workerGroups.find(g => g.id === groupId && g.owner === ownerId);
        if(group) {
            await updateDoc(groupRef, { isArchived: true, workers: group.workers.map(w => ({...w, isArchived: true})) });
            if (currentUser) await fetchData(currentUser); // Refresh data after archiving
        }
    };
    
    const deleteGroupPermanently = async (groupId: number, ownerId: string) => {
        if (!currentUser || currentUser.role !== 'superadmin') {
            alert("Action non autorisée.");
            return;
        }
        try {
            await deleteDoc(doc(db, 'users', ownerId, 'workerGroups', String(groupId)));
            await fetchData(currentUser);
        } catch (error) {
            console.error("Error deleting group permanently:", error);
            alert("Une erreur est survenue lors de la suppression du groupe.");
        }
    };


    const addWorker = async (groupId: number, workerData: Omit<Worker, 'id'>, ownerId: string) => {
        if (!currentUser) return;
        if (currentUser.role !== 'superadmin' && ownerId !== currentUser.uid) return;
        const newWorker: Worker = { ...workerData, id: Date.now(), isArchived: false };
        const groupRef = doc(db, 'users', ownerId, 'workerGroups', String(groupId));
        const group = workerGroups.find(g => g.id === groupId && g.owner === ownerId);
        if(group) {
            const updatedWorkers = [...group.workers, newWorker].sort((a,b) => a.name.localeCompare(b.name));
            await updateDoc(groupRef, { workers: updatedWorkers });
            if (currentUser) await fetchData(currentUser);
        }
    };

    const editWorker = async (workerId: number, updatedWorkerData: Omit<Worker, 'id'>) => {
        if (!currentUser) return;
        const batch = writeBatch(db);
        let ownerId: string | undefined;

        workerGroups.forEach(g => {
            const workerIndex = g.workers.findIndex(w => w.id === workerId);
            if (workerIndex > -1) {
                ownerId = g.owner;
                if (currentUser.role === 'superadmin' || g.owner === currentUser.uid) {
                    const updatedWorkers = [...g.workers];
                    updatedWorkers[workerIndex] = { ...updatedWorkerData, id: workerId, isArchived: updatedWorkers[workerIndex].isArchived };
                    updatedWorkers.sort((a, b) => a.name.localeCompare(b.name));
                    const groupRef = doc(db, 'users', g.owner!, 'workerGroups', String(g.id));
                    batch.update(groupRef, { workers: updatedWorkers });
                }
            }
        });
        if(ownerId) {
            await batch.commit();
            if (currentUser) await fetchData(currentUser);
        }
    };

    const moveWorker = async (workerId: number, targetGroupId: number) => {
        if (!currentUser) return;
        let workerToMove: Worker | null = null;
        let sourceGroup: WorkerGroup | null = null;

        for (const group of workerGroups) {
            const foundWorker = group.workers.find(w => w.id === workerId);
            if (foundWorker) { workerToMove = foundWorker; sourceGroup = group; break; }
        }

        if (!workerToMove || !sourceGroup || sourceGroup.id === targetGroupId) return;

        const targetGroup = workerGroups.find(g => g.id === targetGroupId);
        if (!targetGroup) return;

        // Security check
        if (currentUser.role !== 'superadmin' && (sourceGroup.owner !== currentUser.uid || targetGroup.owner !== currentUser.uid)) return;

        workerToMove = { ...workerToMove, isArchived: !!targetGroup.isDepartedGroup };
        const batch = writeBatch(db);

        // Remove from source
        const sourceGroupRef = doc(db, "users", sourceGroup.owner!, "workerGroups", String(sourceGroup.id));
        batch.update(sourceGroupRef, { workers: sourceGroup.workers.filter(w => w.id !== workerId) });

        // Add to target
        const targetGroupRef = doc(db, "users", targetGroup.owner!, "workerGroups", String(targetGroup.id));
        batch.update(targetGroupRef, { workers: [...targetGroup.workers, workerToMove!].sort((a,b) => a.name.localeCompare(b.name)) });
        
        await batch.commit();
        if (currentUser) await fetchData(currentUser);
    };

    const archiveWorker = async (workerId: number) => {
        if (!currentUser) return;
        const sourceGroup = workerGroups.find(g => g.workers.some(w => w.id === workerId));
        if (!sourceGroup || !sourceGroup.owner) return;

        const ownerId = sourceGroup.owner;
        const departedGroup = workerGroups.find(g => g.isDepartedGroup && g.owner === ownerId);
        
        if (departedGroup) {
            await moveWorker(workerId, departedGroup.id);
        } else {
            console.error(`Could not find a departed group for owner ${ownerId}.`);
            alert("Impossible de trouver le groupe du personnel parti pour cet utilisateur.");
        }
    };
    
    const deleteWorkerPermanently = async (workerId: number) => {
        if (!currentUser) return;

        let sourceGroup: WorkerGroup | null = null;
        for (const group of workerGroups) {
            if (group.workers.some(w => w.id === workerId)) {
                sourceGroup = group;
                break;
            }
        }

        if (!sourceGroup || !sourceGroup.owner) return;
        
        if (currentUser.role !== 'superadmin' && sourceGroup.owner !== currentUser.uid) {
            console.error("Permission denied to delete worker permanently.");
            return;
        }

        const ownerId = sourceGroup.owner;
        const batch = writeBatch(db);

        const updatedWorkers = sourceGroup.workers.filter(w => w.id !== workerId);
        const groupRef = doc(db, 'users', ownerId, 'workerGroups', String(sourceGroup.id));
        batch.update(groupRef, { workers: updatedWorkers });

        const logsQuery = query(collection(db, 'users', ownerId, 'dailyLogs'), where("workerId", "==", workerId));
        const logsSnapshot = await getDocs(logsQuery);
        logsSnapshot.forEach(doc => batch.delete(doc.ref));

        const workedDaysQuery = query(collection(db, 'users', ownerId, 'workedDays'), where("workerId", "==", workerId));
        const workedDaysSnapshot = await getDocs(workedDaysQuery);
        workedDaysSnapshot.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        if (currentUser) await fetchData(currentUser);
    };
      
    const deleteUserOnly = async (userId: string) => {
        if (currentUser?.role !== 'superadmin' || currentUser.uid === userId) {
            alert("Action non autorisée.");
            return;
        }
        await deleteDoc(doc(db, 'users', userId));
        if (currentUser) await fetchData(currentUser);
    };

    const deleteUserAndData = async (userId: string) => {
        if (currentUser?.role !== 'superadmin' || currentUser.uid === userId) {
            alert("Action non autorisée.");
            return;
        }
        
        const batch = writeBatch(db);

        const collectionsToDelete = ['dailyLogs', 'workerGroups', 'workedDays'];
        for (const collectionName of collectionsToDelete) {
            const snapshot = await getDocs(collection(db, 'users', userId, collectionName));
            snapshot.forEach(doc => batch.delete(doc.ref));
        }
        
        const userDocRef = doc(db, 'users', userId);
        batch.delete(userDocRef);

        await batch.commit();

        if (currentUser) await fetchData(currentUser);
    };

    const viewTitles: Record<View, string> = {
        entry: 'Saisie Journalière des Opérations',
        finalReport: 'État Bi-mensuel Final',
        management: 'Gestion des Ouvriers & Groupes',
        payroll: 'Décompte des Rémunérations',
        transferOrder: 'Ordre de Virement Bancaire',
        userManagement: 'Gestion des Utilisateurs',
        season: 'Cumul de la Saison',
    };

    const handleViewChange = useCallback((view: View) => {
        if (view === currentView) return;
        setIsAnimatingOut(true);
        setTimeout(() => { setCurrentView(view); setIsAnimatingOut(false); }, 150);
    }, [currentView]);

    const handleHistoryDateSelect = (date: string) => {
        setEntryDate(date);
        if (currentView !== 'entry') handleViewChange('entry');
    };

    const toggleSidebar = () => {
        setIsSidebarVisible(prev => !prev);
    };

    if (!authChecked) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Chargement...</div>;
    if (!currentUser) return <LoginView />;
    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-100">Chargement des données...</div>;

    // Filter data for current user if not superadmin
    const userLogs = currentUser.role === 'superadmin' ? logs : logs.filter(l => l.owner === currentUser.uid);
    const userWorkerGroups = currentUser.role === 'superadmin' ? workerGroups : workerGroups.filter(g => g.owner === currentUser.uid);
    const userWorkedDays = currentUser.role === 'superadmin' ? workedDays : workedDays.filter(wd => wd.owner === currentUser.uid);
    
    return (
        <div className="min-h-screen font-sans flex">
            <Sidebar 
                currentView={currentView} 
                onViewChange={handleViewChange} 
                logs={userLogs}
                finalizedDates={finalizedDates}
                entryDate={entryDate}
                onHistoryDateSelect={handleHistoryDateSelect}
                currentUser={currentUser}
                isVisible={isSidebarVisible}
                deleteLogsByPeriod={deleteLogsByPeriod}
                requestConfirmation={requestConfirmation}
            />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar title={viewTitles[currentView]} user={currentUser} onLogout={() => signOut(auth)} onToggleSidebar={toggleSidebar} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    <div className={`transition-opacity duration-150 ${isAnimatingOut ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="print:hidden">
                            {currentView === 'entry' && <DailyEntryView logs={userLogs} addLog={addLog} deleteLog={deleteLog} finalizedDates={finalizedDates} onToggleFinalize={toggleFinalizeDate} workerGroups={userWorkerGroups} entryDate={entryDate} setEntryDate={setEntryDate} currentUser={currentUser} deleteLogsByDate={deleteLogsByDate} requestConfirmation={requestConfirmation} />}
                            {currentView === 'finalReport' && <FinalReportView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} onSaveWorkedDays={saveWorkedDays} />}
                            {currentView === 'payroll' && <PayrollView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} />}
                            {currentView === 'transferOrder' && <TransferOrderView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} />}
                            {currentView === 'season' && <SeasonView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} />}
                            {currentView === 'management' && (
                                <ManagementView 
                                    workerGroups={userWorkerGroups} onAddGroup={addGroup} onEditGroup={editGroup} onArchiveGroup={archiveGroup}
                                    onAddWorker={addWorker} onEditWorker={editWorker} 
                                    onArchiveWorker={archiveWorker} onDeleteWorkerPermanently={deleteWorkerPermanently}
                                    onMoveWorker={moveWorker}
                                    onDeleteGroupPermanently={deleteGroupPermanently}
                                    currentUser={currentUser}
                                    requestConfirmation={requestConfirmation}
                                />
                            )}
                            {currentView === 'userManagement' && currentUser.role === 'superadmin' && (
                                <UserManagementView 
                                    users={users} 
                                    onFetchUsers={() => fetchData(currentUser)} 
                                    currentUser={currentUser}
                                    onDeleteUserOnly={deleteUserOnly}
                                    onDeleteUserAndData={deleteUserAndData}
                                />
                            )}
                        </div>
                        <div className="hidden print:block">
                            {currentView === 'finalReport' && <FinalReportView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} onSaveWorkedDays={saveWorkedDays} isPrinting />}
                            {currentView === 'payroll' && <PayrollView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting />}
                            {currentView === 'transferOrder' && <TransferOrderView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting />}
                            {currentView === 'season' && <SeasonView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting />}
                        </div>
                    </div>
                </main>
            </div>
             <ConfirmationModal
                isOpen={confirmationState.isOpen}
                onClose={handleCloseConfirmation}
                onConfirm={handleConfirm}
                title={confirmationState.title}
                message={confirmationState.message}
            />
        </div>
    );
};

export default App;