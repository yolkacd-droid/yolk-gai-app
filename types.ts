export interface Task {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  color: string;
  employeeId: string;
  progress: number;
  description?: string;
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export interface Employee {
  id: string;
  name: string;
  departmentId: string;
}

export interface Department {
  id: string;
  name: string;
  employees: Employee[];
}