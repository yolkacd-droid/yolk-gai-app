
import { Project, Task, Department, Employee } from '../types';
import { addDays } from '../utils/dateUtils';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DATA_KEY = 'gantt-app-data';
const SUPABASE_CONFIG_KEY = 'gantt-supabase-config';

// --- Initial Data (Static for now, synced projects/tasks later) ---
const today = new Date();
today.setHours(0, 0, 0, 0);

const initialEmployees: Employee[] = [
  { id: 'e1', name: '앨리스 존슨', departmentId: 'd1' },
  { id: 'e2', name: '밥 윌리엄스', departmentId: 'd1' },
  { id: 'e3', name: '찰리 브라운', departmentId: 'd2' },
  { id: 'e4', name: '다이아나 밀러', departmentId: 'd2' },
  { id: 'e5', name: '이든 데이비스', departmentId: 'd3' },
];

const initialDepartments: Department[] = [
  { id: 'd1', name: '엔지니어링', employees: initialEmployees.filter(e => e.departmentId === 'd1') },
  { id: 'd2', name: '마케팅', employees: initialEmployees.filter(e => e.departmentId === 'd2') },
  { id: 'd3', name: '제품', employees: initialEmployees.filter(e => e.departmentId === 'd3') },
];

// --- Supabase Client Management ---
let supabase: SupabaseClient | null = null;
let useSupabase = false;

export const initSupabase = (url: string, key: string) => {
    if (url && key) {
        try {
            supabase = createClient(url, key);
            useSupabase = true;
            localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url, key }));
        } catch (e) {
            console.error("Supabase init failed", e);
            useSupabase = false;
        }
    } else {
        supabase = null;
        useSupabase = false;
        localStorage.removeItem(SUPABASE_CONFIG_KEY);
    }
};

export const getSupabaseConfig = () => {
    try {
        const stored = localStorage.getItem(SUPABASE_CONFIG_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch { return null; }
};

// Auto-init if credentials exist
const storedConfig = getSupabaseConfig();
if (storedConfig) initSupabase(storedConfig.url, storedConfig.key);

export const isSupabaseEnabled = () => useSupabase;

// --- Data Helpers ---

// Local Storage Helper
interface AppData {
    projects: Project[];
    departments: Department[];
    employees: Employee[];
}

function getInitialData(): AppData {
    return {
        projects: [
            {
                id: 'p1',
                name: '쿼터별 웹사이트 리디자인',
                tasks: [
                    { id: 't1', name: 'API 설계 및 개발', startDate: addDays(today, 1), endDate: addDays(today, 10), color: 'bg-blue-500', employeeId: 'e1', progress: 80, description: '백엔드 API 엔드포인트.' },
                    { id: 't2', name: '프론트엔드 UI/UX 구현', startDate: addDays(today, 2), endDate: addDays(today, 12), color: 'bg-sky-500', employeeId: 'e2', progress: 50, description: 'React 컴포넌트 개발.' },
                    { id: 't3', name: '사용자 피드백 수집', startDate: addDays(today, 13), endDate: addDays(today, 20), color: 'bg-purple-500', employeeId: 'e5', progress: 25, description: '사용성 테스트 진행.' },
                ],
            }
        ],
        departments: initialDepartments,
        employees: initialEmployees,
    };
}

function readLocalData(): AppData {
    try {
        const rawData = localStorage.getItem(DATA_KEY);
        if (!rawData) {
            const initialData = getInitialData();
            writeLocalData(initialData);
            return initialData;
        }
        const parsedData = JSON.parse(rawData);
        
        // Ensure structure validity
        if (!parsedData || !Array.isArray(parsedData.projects)) {
             const initialData = getInitialData();
             writeLocalData(initialData); // Recover structure
             return initialData;
        }

        if (parsedData.projects) {
            parsedData.projects.forEach((p: Project) => {
                if(p.tasks) {
                    p.tasks.forEach((t: Task) => {
                        t.startDate = new Date(t.startDate);
                        t.endDate = new Date(t.endDate);
                    });
                } else {
                    p.tasks = []; // Ensure tasks array exists
                }
            });
        }
        return parsedData;
    } catch (error) {
        console.error("Failed to read local data", error);
        return getInitialData();
    }
}

function writeLocalData(data: AppData) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

// --- API Functions (Hybrid) ---

export const getProjects = async (): Promise<Project[]> => {
    if (useSupabase && supabase) {
        try {
            // Fetch Projects
            const { data: projectsData, error: pError } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: true });
            
            if (pError) throw pError;

            // Fetch Tasks
            const { data: tasksData, error: tError } = await supabase
                .from('tasks')
                .select('*');

            if (tError) throw tError;

            // Map Supabase flat data to nested structure
            const projects: Project[] = (projectsData || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                tasks: (tasksData || [])
                    .filter((t: any) => t.project_id === p.id)
                    .map((t: any) => ({
                        id: t.id,
                        name: t.name,
                        startDate: new Date(t.start_date),
                        endDate: new Date(t.end_date),
                        color: t.color,
                        employeeId: t.employee_id,
                        progress: t.progress,
                        description: t.description
                    }))
            }));
            return projects;
        } catch (err) {
            console.error("Supabase fetch error", err);
            throw err;
        }
    } else {
        return readLocalData().projects;
    }
};

export const getDepartments = async (): Promise<Department[]> => {
    return initialDepartments;
};

export const getEmployees = async (): Promise<Employee[]> => {
    return initialEmployees;
};

export const addProject = async (projectName: string): Promise<Project> => {
    const newId = `project-${Date.now()}`;
    const newProject: Project = { id: newId, name: projectName, tasks: [] };

    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').insert({
            id: newId,
            name: projectName
        });
        if (error) throw error;
        return newProject;
    } else {
        const data = readLocalData();
        data.projects.push(newProject);
        writeLocalData(data);
        return newProject;
    }
};

export const updateProject = async (projectId: string, projectName: string): Promise<Project> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').update({ name: projectName }).eq('id', projectId);
        if (error) throw error;
        return { id: projectId, name: projectName, tasks: [] };
    } else {
        const data = readLocalData();
        const project = data.projects.find(p => p.id === projectId);
        if (project) {
            project.name = projectName;
            writeLocalData(data);
            return project;
        }
        throw new Error("Project not found");
    }
};

export const deleteProject = async (projectId: string): Promise<{ id: string }> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').delete().eq('id', projectId);
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.projects = data.projects.filter(p => p.id !== projectId);
        writeLocalData(data);
    }
    return { id: projectId };
};

export const addTask = async (projectId: string, taskData: Omit<Task, 'id' | 'color' | 'progress'>): Promise<Task> => {
    const colors = ['bg-rose-500', 'bg-amber-500', 'bg-lime-500', 'bg-cyan-500', 'bg-fuchsia-500', 'bg-orange-500'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const newTask: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...taskData,
        color: randomColor,
        progress: 0,
    };

    if (useSupabase && supabase) {
        const { error } = await supabase.from('tasks').insert({
            id: newTask.id,
            name: newTask.name,
            start_date: newTask.startDate.toISOString().split('T')[0],
            end_date: newTask.endDate.toISOString().split('T')[0],
            color: newTask.color,
            employee_id: newTask.employeeId,
            progress: 0,
            description: newTask.description,
            project_id: projectId
        });
        if (error) throw error;
    } else {
        const data = readLocalData();
        const project = data.projects.find(p => p.id === projectId);
        if (project) {
            if (!project.tasks) project.tasks = [];
            project.tasks.push(newTask);
            writeLocalData(data);
        } else {
            throw new Error(`Project ${projectId} not found in local storage`);
        }
    }
    return newTask;
};

export const updateTask = async (projectId: string, taskId: string, taskUpdate: Partial<Omit<Task, 'id'>>): Promise<Task> => {
    if (useSupabase && supabase) {
        const updates: any = {};
        if (taskUpdate.name) updates.name = taskUpdate.name;
        if (taskUpdate.startDate) updates.start_date = taskUpdate.startDate.toISOString().split('T')[0];
        if (taskUpdate.endDate) updates.end_date = taskUpdate.endDate.toISOString().split('T')[0];
        if (taskUpdate.employeeId) updates.employee_id = taskUpdate.employeeId;
        if (taskUpdate.progress !== undefined) updates.progress = taskUpdate.progress;
        if (taskUpdate.description !== undefined) updates.description = taskUpdate.description;

        const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
        if (error) throw error;
        // NOTE: We return the update object mixed with ID. The caller MUST merge this with existing state.
        return { id: taskId, ...taskUpdate } as Task;
    } else {
        const data = readLocalData();
        const project = data.projects.find(p => p.id === projectId);
        const task = project?.tasks.find(t => t.id === taskId);
        if (task) {
            Object.assign(task, taskUpdate);
            writeLocalData(data);
            return task;
        }
        throw new Error("Task not found");
    }
};

export const deleteTask = async (projectId: string, taskId: string): Promise<{ id: string }> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) throw error;
    } else {
        const data = readLocalData();
        const project = data.projects.find(p => p.id === projectId);
        if (project) {
            project.tasks = project.tasks.filter(t => t.id !== taskId);
            writeLocalData(data);
        }
    }
    return { id: taskId };
};

export const updateProjects = async (projects: Project[]): Promise<Project[]> => {
    if (!useSupabase) {
        const data = readLocalData();
        data.projects = projects;
        writeLocalData(data);
    }
    return projects;
};

// --- Seed & Check Functions ---

const seedDatabase = async () => {
    if (!supabase) return;
    
    // Initial Data
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const p1 = { id: 'p1', name: '쿼터별 웹사이트 리디자인' };
    
    const tasks = [
        { 
            id: 't1', 
            project_id: 'p1', 
            name: 'API 설계 및 개발', 
            start_date: addDays(today, 1).toISOString().split('T')[0], 
            end_date: addDays(today, 10).toISOString().split('T')[0], 
            color: 'bg-blue-500', 
            employee_id: 'e1', 
            progress: 80, 
            description: '백엔드 API 엔드포인트.' 
        },
        { 
            id: 't2', 
            project_id: 'p1', 
            name: '프론트엔드 UI/UX 구현', 
            start_date: addDays(today, 2).toISOString().split('T')[0], 
            end_date: addDays(today, 12).toISOString().split('T')[0], 
            color: 'bg-sky-500', 
            employee_id: 'e2', 
            progress: 50, 
            description: 'React 컴포넌트 개발.' 
        },
        { 
            id: 't3', 
            project_id: 'p1', 
            name: '사용자 피드백 수집', 
            start_date: addDays(today, 13).toISOString().split('T')[0], 
            end_date: addDays(today, 20).toISOString().split('T')[0], 
            color: 'bg-purple-500', 
            employee_id: 'e5', 
            progress: 25, 
            description: '사용성 테스트 진행.' 
        }
    ];

    // Insert Project
    const { error: pError } = await supabase.from('projects').insert(p1);
    if (pError) throw pError;

    // Insert Tasks
    const { error: tError } = await supabase.from('tasks').insert(tasks);
    if (tError) throw tError;
};

export const checkConnectionAndSeed = async () => {
    if (!useSupabase || !supabase) return;

    try {
        // Check if table exists and has data
        const { data, error } = await supabase.from('projects').select('id').limit(1);
        
        if (error) {
            // 42P01 is PostgreSQL error for undefined table
            if (error.code === '42P01') {
                throw new Error('TABLES_MISSING');
            }
            throw error;
        }

        if (data.length === 0) {
            console.log("Database empty, seeding initial data...");
            await seedDatabase();
        }
    } catch (error) {
        throw error;
    }
};

// --- Realtime Subscription ---
export const subscribeToChanges = (callback: () => void) => {
    if (!useSupabase || !supabase) return () => {};

    const channel = supabase.channel('schema-db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'projects' },
            () => callback()
        )
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'tasks' },
            () => callback()
        )
        .subscribe();

    return () => {
        supabase?.removeChannel(channel);
    };
};
