
import React, { useState, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { DailyLog, WorkerGroup, Worker, WorkedDays, User, UserRole, Task, TaskGroup, SavedFinalReport, SavedPayroll, SavedTransferOrder, SavedAnnualSummary, PayrollData, TransferOrderData } from './types';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import DailyEntryView from './components/DailyEntryView';
import ManagementView from './components/ManagementView';
import PayrollView from './components/PayrollView';
import TransferOrderView from './components/TransferOrderView';
import UserManagementView from './components/UserManagementView';
import SeasonView from './components/SeasonView';
import AnnualSummaryView from './components/AnnualSummaryView';
import LoginView from './components/LoginView';
import ConfirmationModal from './components/ConfirmationModal';
import TariffManagementView from './components/TariffManagementView';
import { unlockAudio } from './utils/audioUtils';
import { auth, db } from './firebaseConfig';
import { onAuthStateChanged, signOut } from "firebase/auth";
import FinalReportView from './components/FinalReportView';
import { printElement, exportToPDF, exportToExcel } from './utils/exportUtils';
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
    orderBy,
} from 'firebase/firestore';
import { INITIAL_TASK_GROUPS } from './constants';

const DEPARTED_GROUP_ID = 9999;
const reportCollections = ['finalReports', 'payrolls', 'transferOrders', 'annualSummaries'];
const LAIT_TASK_ID = 37;
const PANIER_TASK_ID = 47;


const createTaskMap = (taskGroups: TaskGroup[]): Map<number, Task & { category: string }> => {
    const taskMap = new Map<number, Task & { category: string }>();
    taskGroups.flatMap(group =>
        group.tasks.map(task => ({ ...task, category: group.category }))
    ).forEach(task => {
        taskMap.set(task.id, task);
    });
    return taskMap;
};

const App: React.FC = () => {
    type View = 'entry' | 'management' | 'payroll' | 'transferOrder' | 'userManagement' | 'season' | 'finalReport' | 'annualSummary' | 'tariffManagement';
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
    const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
    const [taskMap, setTaskMap] = useState<Map<number, Task & { category: string }>>(new Map());
    
    // Saved Reports States
    const [savedFinalReports, setSavedFinalReports] = useState<SavedFinalReport[]>([]);
    const [savedPayrolls, setSavedPayrolls] = useState<SavedPayroll[]>([]);
    const [savedTransferOrders, setSavedTransferOrders] = useState<SavedTransferOrder[]>([]);
    const [savedAnnualSummaries, setSavedAnnualSummaries] = useState<SavedAnnualSummary[]>([]);
    
    // Auth and loading states
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [authChecked, setAuthChecked] = useState(false);

    // Direct Export State
    const [exportRequest, setExportRequest] = useState<{report: any; type: string; format: 'print' | 'pdf' | 'excel'} | null>(null);

    
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
            // Fetch tariffs first as they are global and needed by other components
            const tariffsSnapshot = await getDocs(collection(db, 'tariffs'));
            if (tariffsSnapshot.empty) {
                console.log("Tariffs collection is empty. Populating from initial data...");
                const batch = writeBatch(db);
                INITIAL_TASK_GROUPS.forEach(group => {
                    const docId = group.category.replace(/[^a-zA-Z0-9]/g, '_');
                    const tariffRef = doc(db, 'tariffs', docId);
                    batch.set(tariffRef, group);
                });
                await batch.commit();
                setTaskGroups(INITIAL_TASK_GROUPS);
            } else {
                const fetchedTaskGroups = tariffsSnapshot.docs.map(doc => doc.data() as TaskGroup).sort((a,b) => INITIAL_TASK_GROUPS.findIndex(g => g.category === a.category) - INITIAL_TASK_GROUPS.findIndex(g => g.category === b.category));
                setTaskGroups(fetchedTaskGroups);
            }

            const reportSetters = {
                finalReports: (data: any) => setSavedFinalReports(data as SavedFinalReport[]),
                payrolls: (data: any) => setSavedPayrolls(data as SavedPayroll[]),
                transferOrders: (data: any) => setSavedTransferOrders(data as SavedTransferOrder[]),
                annualSummaries: (data: any) => setSavedAnnualSummaries(data as SavedAnnualSummary[]),
            };


            if (user.role === 'superadmin') {
                const [logsSnapshot, groupsSnapshot, finalizedSnapshot, workedDaysSnapshot, usersSnapshot, ...reportSnapshots] = await Promise.all([
                    getDocs(collectionGroup(db, 'dailyLogs')),
                    getDocs(collectionGroup(db, 'workerGroups')),
                    getDoc(doc(db, 'metadata', 'finalizedDates')),
                    getDocs(collectionGroup(db, 'workedDays')),
                    getDocs(collection(db, 'users')),
                    ...reportCollections.map(name => getDocs(collectionGroup(db, name)))
                ]);

                const usersData = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
                const userMap = new Map(usersData.map(u => [u.uid, u.email]));
                setUsers(usersData);

                setLogs(logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyLog)));
                
                const groups = groupsSnapshot.docs.map(doc => {
                    const groupData = doc.data();
                    const ownerId = doc.ref.parent.parent?.id;
                    const group = { 
                        id: Number(doc.id), 
                        ...groupData,
                        owner: groupData.owner || ownerId, // Fallback to ownerId from path
                    } as WorkerGroup; 
                    const ownerEmail = userMap.get(group.owner || '');
                    return { ...group, ownerEmail: ownerEmail || 'Inconnu' };
                });
                setWorkerGroups(groups);

                setWorkedDays(workedDaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkedDays)));
                
                if (finalizedSnapshot.exists()) setFinalizedDates(finalizedSnapshot.data().dates || []);
                
                reportSnapshots.forEach((snapshot, index) => {
                    const collectionName = reportCollections[index];
                    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    reportSetters[collectionName as keyof typeof reportSetters](data);
                });


            } else {
                const [logsSnapshot, groupsSnapshot, finalizedSnapshot, workedDaysSnapshot, ...reportSnapshots] = await Promise.all([
                    getDocs(collection(db, 'users', user.uid, 'dailyLogs')),
                    getDocs(collection(db, 'users', user.uid, 'workerGroups')),
                    getDoc(doc(db, 'metadata', 'finalizedDates')),
                    getDocs(collection(db, 'users', user.uid, 'workedDays')),
                    ...reportCollections.map(name => getDocs(query(collection(db, 'users', user.uid, name), orderBy('createdAt', 'desc'))))
                ]);
                
                setLogs(logsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyLog)));
                setWorkerGroups(groupsSnapshot.docs.map(doc => ({ id: Number(doc.id), ...doc.data() } as WorkerGroup)));
                setWorkedDays(workedDaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkedDays)));

                if (finalizedSnapshot.exists()) setFinalizedDates(finalizedSnapshot.data().dates || []);
                
                reportSnapshots.forEach((snapshot, index) => {
                    const collectionName = reportCollections[index];
                    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                    reportSetters[collectionName as keyof typeof reportSetters](data);
                });
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
                    userDoc = await getDoc(userDocRef);
                }

                if (userDoc.exists()) {
                    const userDbData = userDoc.data();
                    const userData = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email!,
                        role: userDbData.role as UserRole,
                    };

                    if (userData.email === 'tazzihamid@gmail.com' && userData.role !== 'superadmin') {
                        userData.role = 'superadmin';
                        await updateDoc(userDocRef, { role: 'superadmin' });
                    }

                    setCurrentUser(userData);
                    await fetchData(userData);
                } else {
                    signOut(auth);
                }
            } else {
                setCurrentUser(null);
            }
            setAuthChecked(true);
        });
        return () => unsubscribe();
    }, [fetchData]);

    useEffect(() => {
        if (taskGroups.length > 0) {
            setTaskMap(createTaskMap(taskGroups));
        }
    }, [taskGroups]);
    
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
            setDoc(groupDocRef)
              .then(() => {
                if(currentUser.role !== 'superadmin') {
                    setWorkerGroups(prev => [...prev, departedGroup]);
                }
              });
        }
    }, [isLoading, workerGroups, currentUser]);
    
    useEffect(() => {
        document.addEventListener('mousedown', unlockAudio, { once: true });
        return () => document.removeEventListener('mousedown', unlockAudio);
    }, []);

    // --- Generic Handlers for Saved Reports ---
    const createSaveHandler = <T extends { id?: string; owner?: string; createdAt?: string }>(collectionName: string) => async (reportToSave: T) => {
        if (!currentUser) return;
        const isNew = !reportToSave.id;
        const ownerId = isNew ? currentUser.uid : reportToSave.owner!;
        if (currentUser.role !== 'superadmin' && ownerId !== currentUser.uid) return;

        const now = new Date().toISOString();
        const data = {
            ...reportToSave,
            owner: ownerId,
            createdAt: isNew ? now : reportToSave.createdAt!,
            updatedAt: now,
        };

        if (isNew) {
            const { id, ...payload } = data;
            const docRef = await addDoc(collection(db, 'users', ownerId, collectionName), payload);
            if (currentUser.role !== 'superadmin') { // Refresh local state for current user
                 // FIX: Use `as unknown as <Type>` for type assertions to resolve conversion errors.
                 // The generic type T doesn't guarantee the presence of `params` and `data` properties,
                 // but the application logic ensures they exist on the `reportToSave` object.
                 if (collectionName === 'finalReports') setSavedFinalReports(prev => [...prev, { ...data, id: docRef.id } as unknown as SavedFinalReport]);
                 if (collectionName === 'payrolls') setSavedPayrolls(prev => [...prev, { ...data, id: docRef.id } as unknown as SavedPayroll]);
                 if (collectionName === 'transferOrders') setSavedTransferOrders(prev => [...prev, { ...data, id: docRef.id } as unknown as SavedTransferOrder]);
                 if (collectionName === 'annualSummaries') setSavedAnnualSummaries(prev => [...prev, { ...data, id: docRef.id } as unknown as SavedAnnualSummary]);
            }
        } else {
            const docRef = doc(db, 'users', ownerId, collectionName, reportToSave.id!);
            await setDoc(docRef, data);
             if (currentUser.role !== 'superadmin') { // Refresh local state for current user
                 // FIX: Use `as unknown as <Type>` for type assertions to resolve conversion errors.
                 // The generic type T doesn't guarantee the presence of `params` and `data` properties,
                 // but the application logic ensures they exist on the `reportToSave` object.
                 if (collectionName === 'finalReports') setSavedFinalReports(prev => prev.map(r => r.id === data.id ? data as unknown as SavedFinalReport : r));
                 if (collectionName === 'payrolls') setSavedPayrolls(prev => prev.map(r => r.id === data.id ? data as unknown as SavedPayroll : r));
                 if (collectionName === 'transferOrders') setSavedTransferOrders(prev => prev.map(r => r.id === data.id ? data as unknown as SavedTransferOrder : r));
                 if (collectionName === 'annualSummaries') setSavedAnnualSummaries(prev => prev.map(r => r.id === data.id ? data as unknown as SavedAnnualSummary : r));
            }
        }
        // Always do a full refresh for superadmin or if it's simpler
        if (currentUser.role === 'superadmin') {
            await fetchData(currentUser);
        }
    };

    const createDeleteHandler = <T extends { id: string; owner: string }>(collectionName: string) => async (reportToDelete: T) => {
        if (!currentUser) return;
        const { id, owner } = reportToDelete;
        if (currentUser.role !== 'superadmin' && owner !== currentUser.uid) return;
        await deleteDoc(doc(db, 'users', owner, collectionName, id));
        await fetchData(currentUser);
    };

    const handleSaveFinalReport = createSaveHandler<Partial<SavedFinalReport>>('finalReports');
    const handleDeleteFinalReport = createDeleteHandler<SavedFinalReport>('finalReports');
    const handleSavePayroll = createSaveHandler<Partial<SavedPayroll>>('payrolls');
    const handleDeletePayroll = createDeleteHandler<SavedPayroll>('payrolls');
    const handleSaveTransferOrder = createSaveHandler<Partial<SavedTransferOrder>>('transferOrders');
    const handleDeleteTransferOrder = createDeleteHandler<SavedTransferOrder>('transferOrders');
    const handleSaveAnnualSummary = createSaveHandler<Partial<SavedAnnualSummary>>('annualSummaries');
    const handleDeleteAnnualSummary = createDeleteHandler<SavedAnnualSummary>('annualSummaries');

    // --- Retroactive Generation ---
    const handleRetroactiveGeneration = async () => {
        if (!currentUser || taskMap.size === 0) return;

        requestConfirmation(
            "Génération Rétroactive",
            "Ceci va analyser tous les rapports bi-mensuels existants et créer les décomptes de paie et ordres de virement manquants. Voulez-vous continuer ?",
            async () => {
                const existingPayrollKeys = new Set(savedPayrolls.map(p => `${p.params.startDate}-${p.params.endDate}-${JSON.stringify(p.params.workerIds.sort())}-${p.owner}`));
                let generatedCount = 0;

                for (const finalReport of savedFinalReports) {
                    const key = `${finalReport.data.startDate.split('/').reverse().join('-')}-${finalReport.data.endDate.split('/').reverse().join('-')}-${JSON.stringify(finalReport.params.workerIds.sort())}-${finalReport.owner}`;

                    if (!existingPayrollKeys.has(key)) {
                        const { year, month, period, regionalCenter, workerIds } = finalReport.params;
                        const { workers: reportWorkers, logs: reportLogs } = finalReport.data;
                        const startDate = new Date(Date.UTC(year, month - 1, period === 'first' ? 1 : 16)).toISOString().split('T')[0];
                        const endDate = new Date(Date.UTC(year, month - 1, period === 'first' ? 15 : new Date(year, month, 0).getDate())).toISOString().split('T')[0];

                        const getDaysWorkedForWorker = (workerId: number) => {
                            const entry = workedDays.find(d => d.workerId === workerId && d.year === year && d.month === month && d.period === period);
                            return entry?.days || 0;
                        };

                        // Calculate Payroll
                        const payrollData: PayrollData[] = reportWorkers.map(worker => {
                            const workerLogs = reportLogs.filter(l => l.workerId === worker.id);
                            const joursTravailles = getDaysWorkedForWorker(worker.id);
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
                        });
                        const payrollToSave: Omit<SavedPayroll, 'id'> = {
                           owner: finalReport.owner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                           params: { startDate, endDate, workerIds, anneeScolaire: `${year}/${year + 1}`, anneeRegle: `${year + 1}/${year + 2}`, centreRegional: regionalCenter, additionalInputs: {} },
                           data: payrollData,
                        };
                        await handleSavePayroll(payrollToSave);

                        // Calculate Transfer Order
                        const transferOrderData: TransferOrderData[] = reportWorkers.map(worker => {
                            const joursTravailles = getDaysWorkedForWorker(worker.id);
                            const totalOperation = reportLogs.filter(l => l.workerId === worker.id && l.taskId !== LAIT_TASK_ID && l.taskId !== PANIER_TASK_ID)
                                .reduce((sum, log) => sum + (Number(log.quantity) * (taskMap.get(log.taskId)?.price || 0)), 0);
                            const anciennete = totalOperation * (worker.seniorityPercentage / 100);
                            const totalBrut = totalOperation + anciennete;
                            const retenu = totalBrut * 0.0674;
                            const indemniteLait = joursTravailles * (taskMap.get(LAIT_TASK_ID)?.price || 0);
                            const primePanier = joursTravailles * (taskMap.get(PANIER_TASK_ID)?.price || 0);
                            const netPay = totalBrut - retenu + indemniteLait + primePanier;
                            return { worker, netPay };
                        }).filter(item => item.netPay > 0);
                         const transferOrderToSave: Omit<SavedTransferOrder, 'id'> = {
                           owner: finalReport.owner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                           params: { startDate, endDate, workerIds, city: regionalCenter || 'Taza', orderDate: new Date().toISOString().split('T')[0] },
                           data: transferOrderData,
                        };
                        await handleSaveTransferOrder(transferOrderToSave);
                        generatedCount++;
                    }
                }
                alert(`${generatedCount} ensemble(s) de rapport(s) manquant(s) ont été générés avec succès.`);
                if (generatedCount > 0) {
                    await fetchData(currentUser);
                }
            }
        );
    };


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
        if (currentUser) await fetchData(currentUser);
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
            if (currentUser) await fetchData(currentUser);
        }
    };
    
    const deleteGroupPermanently = async (groupId: number, ownerId: string) => {
        if (!currentUser || currentUser.role !== 'superadmin') {
            alert("Action non autorisée.");
            return;
        }

        const groupToDelete = workerGroups.find(g => g.id === groupId && g.owner === ownerId);
        if (!groupToDelete) {
            console.error(`Group with ID ${groupId} for owner ${ownerId} not found.`);
            alert("Groupe non trouvé.");
            return;
        }

        const workersToMove = groupToDelete.workers || [];
        if (workersToMove.length === 0) {
            // If no workers, just delete the group
            try {
                await deleteDoc(doc(db, 'users', ownerId, 'workerGroups', String(groupId)));
                await fetchData(currentUser);
                return;
            } catch (error) {
                console.error("Error deleting empty group permanently:", error);
                alert("Une erreur est survenue lors de la suppression du groupe.");
                return;
            }
        }
        
        const departedGroup = workerGroups.find(g => g.id === DEPARTED_GROUP_ID && g.owner === ownerId);
        if (!departedGroup) {
            alert("Le groupe 'Personnel Parti' est introuvable pour cet utilisateur. Impossible de déplacer les ouvriers. Suppression annulée.");
            return;
        }

        try {
            const batch = writeBatch(db);
            const departedGroupRef = doc(db, 'users', ownerId, 'workerGroups', String(DEPARTED_GROUP_ID));
            const updatedWorkersForDepartedGroup = [
                ...departedGroup.workers, 
                ...workersToMove.map(w => ({ ...w, isArchived: true }))
            ].sort((a,b) => a.name.localeCompare(b.name));
            
            batch.update(departedGroupRef, { workers: updatedWorkersForDepartedGroup });

            const groupToDeleteRef = doc(db, 'users', ownerId, 'workerGroups', String(groupId));
            batch.delete(groupToDeleteRef);

            await batch.commit();
            await fetchData(currentUser);
        } catch (error) {
            console.error("Error deleting group permanently and moving workers:", error);
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

        if (currentUser.role !== 'superadmin' && (sourceGroup.owner !== currentUser.uid || targetGroup.owner !== currentUser.uid)) return;

        workerToMove = { ...workerToMove, isArchived: !!targetGroup.isDepartedGroup };
        const batch = writeBatch(db);

        const sourceGroupRef = doc(db, "users", sourceGroup.owner!, "workerGroups", String(sourceGroup.id));
        batch.update(sourceGroupRef, { workers: sourceGroup.workers.filter(w => w.id !== workerId) });

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

        const collectionsToDelete = ['dailyLogs', 'workerGroups', 'workedDays', ...reportCollections];
        for (const collectionName of collectionsToDelete) {
            const snapshot = await getDocs(collection(db, 'users', userId, collectionName));
            snapshot.forEach(doc => batch.delete(doc.ref));
        }
        
        const userDocRef = doc(db, 'users', userId);
        batch.delete(userDocRef);

        await batch.commit();

        if (currentUser) await fetchData(currentUser);
    };

    const handleUpdateTask = async (categoryName: string, taskId: number, newPrice: number) => {
        if (currentUser?.role !== 'superadmin') return;
        const docId = categoryName.replace(/[^a-zA-Z0-9]/g, '_');
        const groupDocRef = doc(db, 'tariffs', docId);
        
        const groupToUpdate = taskGroups.find(g => g.category === categoryName);
        if (!groupToUpdate) return;
    
        const updatedTasks = groupToUpdate.tasks.map(task => 
            task.id === taskId ? { ...task, price: newPrice } : task
        );
    
        await updateDoc(groupDocRef, { tasks: updatedTasks });
        if (currentUser) await fetchData(currentUser);
    };
    
    const handleAddTask = async (categoryName: string, taskData: Omit<Task, 'id'>) => {
        if (currentUser?.role !== 'superadmin') return;
        const docId = categoryName.replace(/[^a-zA-Z0-9]/g, '_');
        const groupDocRef = doc(db, 'tariffs', docId);
    
        const groupToUpdate = taskGroups.find(g => g.category === categoryName);
        if (!groupToUpdate) return;
        
        const newTask = { ...taskData, id: Date.now() };
    
        const updatedTasks = [...groupToUpdate.tasks, newTask];
    
        await updateDoc(groupDocRef, { tasks: updatedTasks });
        if (currentUser) await fetchData(currentUser);
    };

    // --- Direct Export Logic ---
    const handleDirectExport = (report: any, type: string, format: 'print' | 'pdf' | 'excel') => {
        setExportRequest({ report, type, format });
    };

    useEffect(() => {
        if (exportRequest) {
            setTimeout(() => {
                const { report, format, type } = exportRequest;
                const elementId = 'direct-export-content';
                const fileName = `${type}_${report.id}`;
                let orientation: 'portrait' | 'landscape' = 'landscape';
                if(type === 'transferOrder') orientation = 'portrait';
                
                switch (format) {
                    case 'print': printElement(elementId, type); break;
                    case 'pdf': exportToPDF(elementId, fileName, orientation); break;
                    case 'excel': exportToExcel(elementId, fileName); break;
                }
                setExportRequest(null);
            }, 100);
        }
    }, [exportRequest]);

    const renderExportComponent = () => {
        if (!exportRequest) return null;
        const { report, type } = exportRequest;
        
        switch (type) {
            case 'finalReport': return <FinalReportView isPrinting savedReports={[]} {...({} as any)} {...report.props} workerGroups={workerGroups} workedDays={workedDays} taskMap={taskMap} currentUser={currentUser} viewingReport={report} />;
            case 'payroll': return <PayrollView isPrinting savedReports={[]} {...({} as any)} {...report.props} workerGroups={workerGroups} taskMap={taskMap} currentUser={currentUser} viewingReport={report} onSave={handleSavePayroll} />;
            case 'transferOrder': return <TransferOrderView isPrinting savedReports={[]} {...({} as any)} {...report.props} workerGroups={workerGroups} taskMap={taskMap} currentUser={currentUser} viewingReport={report} onSave={handleSaveTransferOrder}/>;
            case 'annualSummary': return <AnnualSummaryView isPrinting savedReports={[]} {...({} as any)} {...report.props} savedFinalReports={savedFinalReports} workerGroups={workerGroups} workedDays={workedDays} taskMap={taskMap} currentUser={currentUser} viewingReport={report} />;
            default: return null;
        }
    };
    
    const viewTitles: Record<View, string> = {
        entry: 'Saisie Journalière des Opérations',
        finalReport: 'État Bi-mensuel Final',
        management: 'Gestion des Ouvriers & Groupes',
        payroll: 'Décompte des Rémunérations',
        transferOrder: 'Ordre de Virement Bancaire',
        userManagement: 'Gestion des Utilisateurs',
        season: 'Cumul de la Saison',
        annualSummary: 'Résumé Annuel des Rémunérations',
        tariffManagement: 'Gestion des Tarifs',
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

    const userLogs = currentUser.role === 'superadmin' ? logs : logs.filter(l => l.owner === currentUser.uid);
    const userWorkerGroups = currentUser.role === 'superadmin' ? workerGroups : workerGroups.filter(g => g.owner === currentUser.uid);
    const userWorkedDays = currentUser.role === 'superadmin' ? workedDays : workedDays.filter(wd => wd.owner === currentUser.uid);
    
    // Filter saved reports for current user if not superadmin
    const userSavedFinalReports = currentUser.role === 'superadmin' ? savedFinalReports : savedFinalReports.filter(r => r.owner === currentUser.uid);
    const userSavedPayrolls = currentUser.role === 'superadmin' ? savedPayrolls : savedPayrolls.filter(r => r.owner === currentUser.uid);
    const userSavedTransferOrders = currentUser.role === 'superadmin' ? savedTransferOrders : savedTransferOrders.filter(r => r.owner === currentUser.uid);
    const userSavedAnnualSummaries = currentUser.role === 'superadmin' ? savedAnnualSummaries : savedAnnualSummaries.filter(r => r.owner === currentUser.uid);

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
                            {currentView === 'entry' && <DailyEntryView logs={userLogs} addLog={addLog} deleteLog={deleteLog} finalizedDates={finalizedDates} onToggleFinalize={toggleFinalizeDate} workerGroups={userWorkerGroups} entryDate={entryDate} setEntryDate={setEntryDate} currentUser={currentUser} deleteLogsByDate={deleteLogsByDate} requestConfirmation={requestConfirmation} taskGroups={taskGroups} taskMap={taskMap} />}
                            {currentView === 'finalReport' && <FinalReportView 
                                allLogs={logs} 
                                workerGroups={workerGroups} 
                                workedDays={workedDays} 
                                onSaveWorkedDays={saveWorkedDays} 
                                taskMap={taskMap} 
                                savedReports={userSavedFinalReports} 
                                onSave={handleSaveFinalReport} 
                                onSavePayroll={handleSavePayroll}
                                onSaveTransferOrder={handleSaveTransferOrder}
                                onDelete={handleDeleteFinalReport} 
                                requestConfirmation={requestConfirmation} 
                                currentUser={currentUser} 
                                onDirectExport={(report, format) => handleDirectExport(report, 'finalReport', format)} 
                            />}
                            {currentView === 'payroll' && <PayrollView 
                                workerGroups={workerGroups} 
                                taskMap={taskMap} 
                                savedReports={userSavedPayrolls} 
                                onSave={handleSavePayroll}
                                onDelete={handleDeletePayroll} 
                                requestConfirmation={requestConfirmation} 
                                currentUser={currentUser} 
                                onDirectExport={(report, format) => handleDirectExport(report, 'payroll', format)}
                                viewingReport={exportRequest?.type === 'payroll' ? exportRequest.report : null}
                                onRetroactiveGenerate={handleRetroactiveGeneration}
                            />}
                            {currentView === 'transferOrder' && <TransferOrderView 
                                workerGroups={workerGroups} 
                                taskMap={taskMap} 
                                savedReports={userSavedTransferOrders} 
                                onSave={handleSaveTransferOrder}
                                onDelete={handleDeleteTransferOrder} 
                                requestConfirmation={requestConfirmation} 
                                currentUser={currentUser} 
                                onDirectExport={(report, format) => handleDirectExport(report, 'transferOrder', format)}
                                viewingReport={exportRequest?.type === 'transferOrder' ? exportRequest.report : null}
                            />}
                            {currentView === 'season' && <SeasonView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} taskMap={taskMap} />}
                            {currentView === 'annualSummary' && <AnnualSummaryView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} taskMap={taskMap} savedReports={userSavedAnnualSummaries} onSave={handleSaveAnnualSummary} onDelete={handleDeleteAnnualSummary} requestConfirmation={requestConfirmation} currentUser={currentUser} savedFinalReports={userSavedFinalReports} onDirectExport={(report, format) => handleDirectExport(report, 'annualSummary', format)} />}
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
                             {currentView === 'tariffManagement' && currentUser.role === 'superadmin' && (
                                <TariffManagementView
                                    taskGroups={taskGroups}
                                    onUpdateTask={handleUpdateTask}
                                    onAddTask={handleAddTask}
                                    requestConfirmation={requestConfirmation}
                                />
                            )}
                        </div>
                        <div className="hidden print:block">
                            {currentView === 'finalReport' && <FinalReportView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} onSaveWorkedDays={saveWorkedDays} isPrinting taskMap={taskMap} savedReports={userSavedFinalReports} onSave={handleSaveFinalReport} onDelete={handleDeleteFinalReport} requestConfirmation={requestConfirmation} currentUser={currentUser} onDirectExport={(report, format) => handleDirectExport(report, 'finalReport', format)} onSavePayroll={handleSavePayroll} onSaveTransferOrder={handleSaveTransferOrder} />}
                            {currentView === 'payroll' && <PayrollView workerGroups={workerGroups} isPrinting taskMap={taskMap} savedReports={userSavedPayrolls} onSave={handleSavePayroll} onDelete={handleDeletePayroll} requestConfirmation={requestConfirmation} currentUser={currentUser} onDirectExport={(report, format) => handleDirectExport(report, 'payroll', format)} onRetroactiveGenerate={handleRetroactiveGeneration} />}
                            {currentView === 'transferOrder' && <TransferOrderView workerGroups={workerGroups} isPrinting taskMap={taskMap} savedReports={userSavedTransferOrders} onSave={handleSaveTransferOrder} onDelete={handleDeleteTransferOrder} requestConfirmation={requestConfirmation} currentUser={currentUser} onDirectExport={(report, format) => handleDirectExport(report, 'transferOrder', format)} />}
                            {currentView === 'season' && <SeasonView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting taskMap={taskMap} />}
                            {currentView === 'annualSummary' && <AnnualSummaryView allLogs={logs} workerGroups={workerGroups} workedDays={workedDays} isPrinting taskMap={taskMap} savedReports={userSavedAnnualSummaries} onSave={handleSaveAnnualSummary} onDelete={handleDeleteAnnualSummary} requestConfirmation={requestConfirmation} currentUser={currentUser} savedFinalReports={userSavedFinalReports} onDirectExport={(report, format) => handleDirectExport(report, 'annualSummary', format)} />}
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
            {exportRequest && document.getElementById('direct-export-container') && ReactDOM.createPortal(
                <div id="direct-export-content" className="bg-white">
                    {renderExportComponent()}
                </div>,
                document.getElementById('direct-export-container')!
            )}
            <div id="direct-export-container" className="absolute -top-[9999px] -left-[9999px] print:hidden"></div>
        </div>
    );
};

export default App;
