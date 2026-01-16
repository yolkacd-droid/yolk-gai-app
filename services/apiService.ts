
import { Project, Task, Department, Employee } from '../types';
import { addDays } from '../utils/dateUtils';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DATA_KEY = 'gantt-app-data';
const SUPABASE_CONFIG_KEY = 'gantt-supabase-config';
const ADMIN_LOCK_KEY = 'gantt-admin-lock';

// --- GLOBAL CONFIGURATION HELPER ---
const getEnv = (key: string): string => {
    let val = "";
    
    // 1. Vite / Modern Browsers (import.meta.env)
    try {
        const metaEnv = (import.meta as any).env;
        if (metaEnv) {
            val = metaEnv[key] || metaEnv[`VITE_${key}`] || "";
        }
    } catch (e) {}

    // 2. Fallback to process.env (Node/Containers/Webpack shims)
    if (!val) {
        try {
            if (typeof process !== 'undefined' && process.env) {
                val = process.env[key] || process.env[`VITE_${key}`] || "";
            }
        } catch (e) {}
    }
    return val;
};

// --- GLOBAL CONFIGURATION ---
const GLOBAL_SUPABASE_URL = getEnv("SUPABASE_URL");
const GLOBAL_SUPABASE_KEY = getEnv("SUPABASE_KEY");
const GLOBAL_ADMIN_PASSWORD = getEnv("ADMIN_PASSWORD");

// Debugging Log (Console 확인용)
if (GLOBAL_SUPABASE_URL) {
    console.log("✅ Global Supabase Config Detected:", GLOBAL_SUPABASE_URL);
} else {
    console.log("⚠️ No Global Supabase Config Detected. Environment variables might be missing or server needs restart.");
}

// --- Initial Data ---
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
    // Prefer Global Config if available
    const targetUrl = GLOBAL_SUPABASE_URL || url;
    const targetKey = GLOBAL_SUPABASE_KEY || key;

    if (targetUrl && targetKey) {
        try {
            supabase = createClient(targetUrl, targetKey);
            useSupabase = true;
            // Only save to local storage if NOT using global config, to avoid confusion
            if (!GLOBAL_SUPABASE_URL) {
                localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url: targetUrl, key: targetKey }));
            } else {
                // If using global config, ensure local storage doesn't conflict, 
                // but we don't necessarily delete it to allow fallback if env var is removed later.
                console.log("Using Global Supabase Connection");
            }
        } catch (e) {
            console.error("Supabase init failed", e);
            useSupabase = false;
        }
    } else {
        supabase = null;
        useSupabase = false;
        if (!GLOBAL_SUPABASE_URL) {
            localStorage.removeItem(SUPABASE_CONFIG_KEY);
        }
    }
};

export const getSupabaseConfig = () => {
    if (GLOBAL_SUPABASE_URL && GLOBAL_SUPABASE_KEY) {
        return { url: GLOBAL_SUPABASE_URL, key: GLOBAL_SUPABASE_KEY };
    }
    try {
        const stored = localStorage.getItem(SUPABASE_CONFIG_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch { return null; }
};

// Check if configured globally (read-only in UI)
export const isGlobalConfigured = () => {
    return !!(GLOBAL_SUPABASE_URL && GLOBAL_SUPABASE_KEY);
};

// Auto-init if credentials exist
const storedConfig = getSupabaseConfig();
if (storedConfig) initSupabase(storedConfig.url, storedConfig.key);

export const isSupabaseEnabled = () => useSupabase;

export const initSupabaseFromUrl = (): boolean => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const sbUrl = params.get('sbUrl');
    const sbKey = params.get('sbKey');
    
    if (sbUrl && sbKey) {
        initSupabase(sbUrl, sbKey);
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
        window.history.replaceState({ path: newUrl }, '', newUrl);
        return true;
    }
    return false;
};

export const getShareableConfigLink = (): string | null => {
    const config = getSupabaseConfig();
    if (!config) return null;
    const url = new URL(window.location.href);
    url.searchParams.set('sbUrl', config.url);
    url.searchParams.set('sbKey', config.key);
    return url.toString();
};

// --- Security / Password Management ---
export const setAdminPassword = (password: string) => {
    if (GLOBAL_ADMIN_PASSWORD) {
        console.warn("Cannot change admin password when GLOBAL_ADMIN_PASSWORD is set in code.");
        return;
    }
    if (!password) {
        localStorage.removeItem(ADMIN_LOCK_KEY);
    } else {
        localStorage.setItem(ADMIN_LOCK_KEY, password);
    }
};

export const verifyAdminPassword = (input: string) => {
    if (GLOBAL_ADMIN_PASSWORD) {
        return input === GLOBAL_ADMIN_PASSWORD;
    }
    const stored = localStorage.getItem(ADMIN_LOCK_KEY);
    return stored === input;
};

export const hasAdminPassword = () => {
    if (GLOBAL_ADMIN_PASSWORD) return true;
    return !!localStorage.getItem(ADMIN_LOCK_KEY);
};

export const isGlobalPassword = () => {
    return !!GLOBAL_ADMIN_PASSWORD;
}


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
    return { id: projectId };
};

export const updateProjects = async (projects: Project[]): Promise<Project[]> => {
    if (!useSupabase) {
        const data = readLocalData();
        data.projects = projects;
        writeLocalData(data);
    }
    return projects;
};

// --- Remote Settings (System Settings) ---

export const getRemoteSettings = async (key: string): Promise<any> => {
    if (!useSupabase || !supabase) return null;
    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', key)
            .single();
        
        if (error) return null;
        return data?.value;
    } catch (e) {
        console.error("Error fetching remote settings", e);
        return null;
    }
};

export const saveRemoteSettings = async (key: string, value: any): Promise<void> => {
    if (!useSupabase || !supabase) return;
    try {
        const { error } = await supabase
            .from('system_settings')
            .upsert({ key, value });
        
        if (error) {
             // 42P01: undefined_table
            if (error.code === '42P01') return;
            console.error("Error saving remote settings", error);
        }
    } catch (e) {
        console.error("Error saving remote settings", e);
    }
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
