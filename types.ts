export interface Task {
  id: number;
  description: string;
  unit: string;
  price: number;
}

export interface TaskGroup {
  category: string;
  tasks: Task[];
}

export interface Worker {
  id: number;
  name: string;
  matricule: string;
  departement: string;
  rib: string;
  cnss: string;
  seniorityPercentage: number;
  numberOfChildren: number;
  isArchived?: boolean;
}

export interface WorkerGroup {
  id: number;
  groupName: string;
  workers: Worker[];
  isArchived?: boolean;
  isDepartedGroup?: boolean;
  owner?: string; // UID of the user who owns this group
  ownerEmail?: string; // Email of the user for display
}

export interface DailyLog {
    id: string; // Firestore ID
    date: string; // YYYY-MM-DD
    workerId: number;
    taskId: number;
    quantity: number;
    observation: string;
    owner?: string; // UID of the user who owns this log
}

export interface WorkedDays {
  id?: string; // Firestore ID
  workerId: number;
  year: number;
  month: number; // 1-12
  period: 'first' | 'second'; // 1-15 or 16-end
  days: number;
  owner?: string; // UID of the user who owns this entry
}

export type UserRole = 'superadmin' | 'user';

export interface User {
  uid: string; // Firebase Auth UID
  email: string;
  role: UserRole;
}
