export interface Task {
  id: number;
  description: string;
  unit: string;
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
}

export interface WorkerGroup {
  id: number;
  groupName: string;
  workers: Worker[];
}

export interface DailyLog {
    id: number;
    date: string; // YYYY-MM-DD
    workerId: number;
    taskId: number;
    quantity: number;
    observation: string;
}