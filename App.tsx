import React, { useState, useCallback, useEffect } from 'react';
import { DailyLog, WorkerGroup, Worker, WorkedDays, User, UserRole } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DailyEntryView from './components/DailyEntryView';
import ReportView from './components/ReportView';
import ManagementView from './components/ManagementView';
import PayrollView from './components/PayrollView';
import WorkerDaysSection from './components/WorkerDaysSection';
import TransferOrderView from './components/TransferOrderView';
import UserManagementView from './components/UserManagementView';
import LoginView from './components/LoginView';
import { unlockAudio } from './utils/audioUtils';
import { auth, db } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth";
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
    type View = 'entry' | 'report' | 'management' | 'payroll' | 'workerDays' | 'transferOrder' | 'userManagement';
    const [currentView, setCurrentView] = useState<View>('entry');
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);

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
                    
                    await setDoc(userDocRef, newUserFirestoreData);
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

    // Ensure the departed group always exists for the current user
    useEffect(() => {
        if (!isLoading && currentUser && currentUser.role === 'user' && !workerGroups.some(g => g.id === DEPARTED_GROUP_ID)) {
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
              .then(() => setWorkerGroups(prev => [...prev, departedGroup]));
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
    
    const deleteGroup = async (groupId: number, ownerId: string) => {
        if (!currentUser) return;
        if (currentUser.role !== 'superadmin' && ownerId !== currentUser.uid) return;
         if (window.confirm("Êtes-vous sûr de vouloir archiver ce groupe ?")) {
            const groupRef = doc(db, 'users', ownerId, 'workerGroups', String(groupId));
            const group = workerGroups.find(g => g.id === groupId && g.owner === ownerId);
            if(group) {
                await updateDoc(groupRef, { isArchived: true, workers: group.workers.map(w => ({...w, isArchived: true})) });
                if (currentUser) await fetchData(currentUser);
            }
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

    const deleteWorker = async (workerId: number) => {
        if (!currentUser) return;
        const sourceGroup = workerGroups.find(g => g.workers.some(w => w.id === workerId));
        if (!sourceGroup) return;

        const departedGroupId = currentUser.role === 'superadmin' ? sourceGroup.owner! : currentUser.uid;
        const departedGroup = workerGroups.find(g => g.isDepartedGroup && g.owner === departedGroupId);

        if (window.confirm("Êtes-vous sûr de vouloir marquer cet ouvrier comme parti?")) {
            await moveWorker(workerId, departedGroup ? departedGroup.id : DEPARTED_GROUP_ID);
        }
    };
      
    const viewTitles: Record<View, string> = {
        entry: 'Saisie Journalière des Opérations',
        report: 'Génération de Rapports d\'Activité',
        management: 'Gestion des Ouvriers & Groupes',
        payroll: 'Décompte des Rémunérations',
        workerDays: 'Gestion des Jours de Travail',
        transferOrder: 'Ordre de Virement Bancaire',
        userManagement: 'Gestion des Utilisateurs',
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
            />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar title={viewTitles[currentView]} user={currentUser} onLogout={() => signOut(auth)} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
                    <div className={`transition-opacity duration-150 ${isAnimatingOut ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="print:hidden">
                            {currentView === 'entry' && <DailyEntryView logs={userLogs} addLog={addLog} deleteLog={deleteLog} finalizedDates={finalizedDates} onToggleFinalize={toggleFinalizeDate} workerGroups={userWorkerGroups} entryDate={entryDate} setEntryDate={setEntryDate} currentUser={currentUser}/>}
                            {currentView === 'report' && <ReportView allLogs={logs} workerGroups={workerGroups} />}
                            {currentView === 'payroll' && <PayrollView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} />}
                            {currentView === 'workerDays' && <WorkerDaysSection workerGroups={userWorkerGroups} workedDays={userWorkedDays} onSave={saveWorkedDays} />}
                            {currentView === 'transferOrder' && <TransferOrderView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} />}
                            {currentView === 'management' && (
                                <ManagementView 
                                    workerGroups={userWorkerGroups} onAddGroup={addGroup} onEditGroup={editGroup} onDeleteGroup={deleteGroup}
                                    onAddWorker={addWorker} onEditWorker={editWorker} onDeleteWorker={deleteWorker} onMoveWorker={moveWorker}
                                    currentUser={currentUser}
                                />
                            )}
                            {currentView === 'userManagement' && currentUser.role === 'superadmin' && (
                                <UserManagementView 
                                    users={users} onFetchUsers={() => fetchData(currentUser)} currentUser={currentUser}
                                />
                            )}
                        </div>
                        <div className="hidden print:block">
                            {currentView === 'report' && <ReportView allLogs={logs} workerGroups={workerGroups} isPrinting />}
                            {currentView === 'payroll' && <PayrollView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting />}
                            {currentView === 'transferOrder' && <TransferOrderView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting />}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;