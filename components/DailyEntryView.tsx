import React, { useState, useMemo, useRef } from 'react';
import { DailyLog, WorkerGroup, User } from '../types';
import { TASK_GROUPS, getTaskByIdWithFallback } from '../constants';
import WorkerMultiSelect from './WorkerMultiSelect';
import SearchableSelect from './SearchableSelect';
import DailySummaryTable from './DailySummaryTable';
import OverallSummaryTable from './OverallSummaryTable';
import { playHoverSound, playClickSound } from '../utils/audioUtils';
import { createRipple, useGlow } from '../utils/effects';
import { printElement, exportToExcel, exportToPDF } from '../utils/exportUtils';
import ExportMenu from './ExportMenu';

interface DailyEntryViewProps {
    logs: DailyLog[];
    addLog: (log: Omit<DailyLog, 'id'>) => void;
    deleteLog: (logId: string, ownerId?: string) => void;
    finalizedDates: string[];
    onToggleFinalize: (date: string) => void;
    workerGroups: WorkerGroup[];
    entryDate: string;
    setEntryDate: (date: string) => void;
    currentUser: User;
    deleteLogsByDate: (date: string) => void;
    requestConfirmation: (title: string, message: string | React.ReactNode, onConfirm: () => void) => void;
}

const taskOptions = TASK_GROUPS.map(group => ({
    label: group.category,
    options: group.tasks.map(task => ({
        label: task.description,
        value: task.id,
        category: group.category
    }))
}));

const DailyEntryView: React.FC<DailyEntryViewProps> = ({ logs, addLog, deleteLog, finalizedDates, onToggleFinalize, workerGroups, entryDate, setEntryDate, currentUser, deleteLogsByDate, requestConfirmation }) => {
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
    const [quantity, setQuantity] = useState<number | ''>('');
    const [observation, setObservation] = useState('');
    const [isCompactMode, setIsCompactMode] = useState(false);

    const entryCardRef = useRef<HTMLDivElement>(null);
    const dailyCardRef = useRef<HTMLDivElement>(null);
    const overallCardRef = useRef<HTMLDivElement>(null);
    useGlow(entryCardRef);
    useGlow(dailyCardRef);
    useGlow(overallCardRef);
    
    const allWorkers = useMemo(() => 
        workerGroups.filter(g => g && Array.isArray(g.workers)).flatMap(g => g.workers)
    , [workerGroups]);

    const allActiveWorkers = useMemo(() => 
        workerGroups
            .filter(g => g && !g.isArchived && Array.isArray(g.workers))
            .flatMap(g => g.workers.filter(w => w && !w.isArchived))
    , [workerGroups]);


    const activeWorkerGroups = useMemo(() => 
        workerGroups
            .filter(g => g && !g.isArchived && Array.isArray(g.workers))
            .map(g => ({
                ...g,
                workers: g.workers.filter(w => w && !w.isArchived)
            }))
            .filter(g => g.workers.length > 0), 
    [workerGroups]);

    const isDayFinalized = useMemo(() => finalizedDates.includes(entryDate), [finalizedDates, entryDate]);
    
    const handleAddEntry = (e: React.FormEvent) => {
        e.preventDefault();
        if (isDayFinalized) return;

        if (!entryDate || selectedWorkerIds.length === 0 || !selectedTaskId || !quantity) {
            alert("Veuillez remplir tous les champs obligatoires.");
            return;
        }

        const numWorkers = selectedWorkerIds.length;
        const quantityPerWorker = Number(quantity) / numWorkers;

        selectedWorkerIds.forEach(workerId => {
            addLog({
                date: entryDate,
                workerId,
                taskId: selectedTaskId,
                quantity: quantityPerWorker,
                observation,
            });
        });

        // Reset form
        setSelectedWorkerIds([]);
        setSelectedTaskId(null);
        setQuantity('');
        setObservation('');
    };
    
    const logsForSelectedDate = useMemo(() => {
        return logs.filter(log => log.date === entryDate);
    }, [logs, entryDate]);

    const handleDateNavigate = (offset: number) => {
        const currentDate = new Date(entryDate);
        currentDate.setUTCDate(currentDate.getUTCDate() + offset);
        setEntryDate(currentDate.toISOString().split('T')[0]);
    };
    
    const handleDeleteDay = () => {
        if (isDayFinalized) return;
        const dateStr = new Date(entryDate + 'T00:00:00').toLocaleDateString('fr-FR');
        requestConfirmation(
            'Confirmer la Suppression',
            