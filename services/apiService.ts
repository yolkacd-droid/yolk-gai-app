import { Project, Task, Department, Employee } from '../types';
import { addDays } from '../utils/dateUtils';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DATA_KEY = 'gantt-app-data';
const SUPABASE_CONFIG_KEY = 'gantt-supabase-config';
const ADMIN_LOCK_KEY = 'gantt-admin-lock';

// Hardcoded fallbacks for when environment variable injection fails
const FALLBACK_URL = "https://jvvqausidqgjtjteemyg.supabase.co";
const FALLBACK_KEY = "sb_publishable_Xjitm41vvj5TDVK8m302mg_i8DZT9AM";
const FALLBACK_PWD = "kiss1052";

// --- GLOBAL CONFIGURATION ---
let VITE_ENV_URL = "";
let VITE_ENV_KEY = "";
let VITE_ENV_PASSWORD = "";

try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
        // @ts-ignore
        VITE_ENV_URL = import.meta.env.VITE_SUPABASE_URL;
        // @ts-ignore
        VITE_ENV_KEY = import.meta.env.VITE_SUPABASE_KEY;
        // @ts-ignore
        VITE_ENV_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;
    }
} catch (e) {
    console.debug("Vite environment variables not accessible or not replaced:", e);
}

const getProcessEnv = (key: string) => {
    try {
        if (typeof process !== 'undefined' && process.env) {
            return process.env[key] || process.env[`VITE_${key}`];
        }
    } catch (e) {}
    return undefined;
};

const cleanEnv = (val: any) => {
    if (!val) return "";
    return String(val).replace(/^"|"$/g, '').trim();
}

const GLOBAL_SUPABASE_URL = cleanEnv(VITE_ENV_URL || getProcessEnv("SUPABASE_URL") || FALLBACK_URL);
const GLOBAL_SUPABASE_KEY = cleanEnv(VITE_ENV_KEY || getProcessEnv("SUPABASE_KEY") || FALLBACK_KEY);
const GLOBAL_ADMIN_PASSWORD = cleanEnv(VITE_ENV_PASSWORD || getProcessEnv("ADMIN_PASSWORD") || FALLBACK_PWD);

// --- Supabase Client Management ---
let supabase: SupabaseClient | null = null;
let useSupabase = false;

export const initSupabase = (url: string, key: string) => {
    const targetUrl = url || GLOBAL_SUPABASE_URL;
    const targetKey = key || GLOBAL_SUPABASE_KEY;

    if (targetUrl && targetKey) {
        try {
            supabase = createClient(targetUrl, targetKey);
            useSupabase = true;
            if (!GLOBAL_SUPABASE_URL) {
                localStorage.setItem(SUPABASE_CONFIG_KEY, JSON.stringify({ url: targetUrl, key: targetKey }));
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

export const isGlobalConfigured = () => !!(GLOBAL_SUPABASE_URL && GLOBAL_SUPABASE_KEY);
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

export const setAdminPassword = (password: string) => {
    if (GLOBAL_ADMIN_PASSWORD) return;
    if (!password) localStorage.removeItem(ADMIN_LOCK_KEY);
    else localStorage.setItem(ADMIN_LOCK_KEY, password);
};

export const verifyAdminPassword = (input: string) => {
    if (GLOBAL_ADMIN_PASSWORD) return input === GLOBAL_ADMIN_PASSWORD;
    const stored = localStorage.getItem(ADMIN_LOCK_KEY);
    return stored === input;
};

export const hasAdminPassword = () => {
    if (GLOBAL_ADMIN_PASSWORD) return true;
    return !!localStorage.getItem(ADMIN_LOCK_KEY);
};

export const isGlobalPassword = () => !!GLOBAL_ADMIN_PASSWORD;

// --- Data Helpers ---

interface AppData {
    projects: Project[];
    departments: Department[];
    employees: Employee[];
}

function getInitialData(): AppData {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
        projects: [
            {
                id: 'p1',
                name: '샘플 프로젝트',
                tasks: [
                    { id: 't1', name: '예시 태스크', startDate: addDays(today, 1), endDate: addDays(today, 10), color: 'bg-blue-500', employeeId: '', progress: 0 },
                ],
            }
        ],
        departments: [],
        employees: [],
    };
}

function readLocalData(): AppData {
    try {
        const rawData = localStorage.getItem(DATA_KEY);
        if (!rawData) return getInitialData();
        const parsedData = JSON.parse(rawData);
        if (parsedData.projects) {
            parsedData.projects.forEach((p: Project) => {
                p.tasks?.forEach((t: Task) => {
                    t.startDate = new Date(t.startDate);
                    t.endDate = new Date(t.endDate);
                });
            });
        }
        return parsedData;
    } catch { return getInitialData(); }
}

function writeLocalData(data: AppData) {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

// Robust column error identification
const isMissingColumnError = (error: any, columnName: string) => {
    if (!error) return false;
    // Postgres error code for undefined_column is 42703
    if (error.code === '42703') return true;
    const msg = String(error.message || "").toLowerCase();
    const col = columnName.toLowerCase();
    return msg.includes('column') && msg.includes(col);
};

const stringifyError = (err: any) => {
    if (typeof err === 'string') return err;
    if (err && err.message) return err.message;
    try { return JSON.stringify(err); } catch { return String(err); }
};

// --- API Functions (Hybrid) ---

export const getProjects = async (): Promise<Project[]> => {
    if (useSupabase && supabase) {
        try {
            let projectsData: any[] = [];
            
            // Try sorting by position first
            const { data, error: pError } = await supabase
                .from('projects')
                .select('*')
                .order('position', { ascending: true })
                .order('created_at', { ascending: true });
            
            if (pError) {
                if (isMissingColumnError(pError, 'position')) {
                    console.warn("Table 'projects' missing 'position' column. Falling back to 'created_at'.");
                    const { data: fallbackData, error: fError } = await supabase
                        .from('projects')
                        .select('*')
                        .order('created_at', { ascending: true });
                    if (fError) throw fError;
                    projectsData = fallbackData || [];
                } else {
                    throw pError;
                }
            } else {
                projectsData = data || [];
            }

            return fetchTasksForProjects(projectsData);
        } catch (err: any) {
            console.error("Supabase fetch error (getProjects):", stringifyError(err));
            throw err;
        }
    } else {
        return readLocalData().projects;
    }
};

async function fetchTasksForProjects(projectsData: any[]): Promise<Project[]> {
    if (!supabase) return [];
    
    let tasksData: any[] = [];
    
    // Try sorting by position first
    const { data, error: tError } = await supabase
        .from('tasks')
        .select('*')
        .order('position', { ascending: true })
        .order('id', { ascending: true });
        
    if (tError) {
        if (isMissingColumnError(tError, 'position')) {
            console.warn("Table 'tasks' missing 'position' column. Falling back to 'id'.");
            const { data: fallbackData, error: fError } = await supabase
                .from('tasks')
                .select('*')
                .order('id', { ascending: true });
            if (fError) throw fError;
            tasksData = fallbackData || [];
        } else {
            throw tError;
        }
    } else {
        tasksData = data || [];
    }

    return (projectsData || []).map((p: any) => ({
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
}

export const getDepartments = async (): Promise<Department[]> => {
    if (useSupabase && supabase) {
        try {
            const { data: depts, error } = await supabase.from('departments').select('*').order('name');
            if (error) throw error;
            const { data: emps, error: eError } = await supabase.from('employees').select('*');
            if (eError) throw eError;
            return (depts || []).map((d: any) => ({
                id: d.id,
                name: d.name,
                employees: (emps || []).filter((e: any) => e.department_id === d.id).map((e: any) => ({
                    id: e.id,
                    name: e.name,
                    departmentId: e.department_id
                }))
            }));
        } catch (err: any) { 
            console.error("Supabase fetch error (getDepartments):", stringifyError(err));
            throw err; 
        }
    } else {
        return readLocalData().departments;
    }
};

export const getEmployees = async (): Promise<Employee[]> => {
    if (useSupabase && supabase) {
        try {
            const { data, error } = await supabase.from('employees').select('*').order('name');
            if (error) throw error;
            return (data || []).map((e: any) => ({ id: e.id, name: e.name, departmentId: e.department_id }));
        } catch (err: any) { 
            console.error("Supabase fetch error (getEmployees):", stringifyError(err));
            throw err; 
        }
    } else {
        return readLocalData().employees;
    }
};

export const addDepartment = async (name: string): Promise<Department> => {
    const id = `dept-${Date.now()}`;
    if (useSupabase && supabase) {
        const { error } = await supabase.from('departments').insert({ id, name });
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.departments.push({ id, name, employees: [] });
        writeLocalData(data);
    }
    return { id, name, employees: [] };
};

export const deleteDepartment = async (id: string): Promise<void> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('departments').delete().eq('id', id);
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.departments = data.departments.filter(d => d.id !== id);
        writeLocalData(data);
    }
};

export const addEmployee = async (name: string, departmentId: string): Promise<Employee> => {
    const id = `emp-${Date.now()}`;
    if (useSupabase && supabase) {
        const { error } = await supabase.from('employees').insert({ id, name, department_id: departmentId });
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.employees.push({ id, name, departmentId });
        writeLocalData(data);
    }
    return { id, name, departmentId };
};

export const deleteEmployee = async (id: string): Promise<void> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.employees = data.employees.filter(e => e.id !== id);
        writeLocalData(data);
    }
};

export const addProject = async (projectName: string): Promise<Project> => {
    const id = `project-${Date.now()}`;
    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').insert({ id, name: projectName, position: 999 });
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.projects.push({ id, name: projectName, tasks: [] });
        writeLocalData(data);
    }
    return { id, name: projectName, tasks: [] };
};

export const updateProject = async (projectId: string, projectName: string): Promise<Project> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').update({ name: projectName }).eq('id', projectId);
        if (error) throw error;
    } else {
        const data = readLocalData();
        const p = data.projects.find(x => x.id === projectId);
        if (p) p.name = projectName;
        writeLocalData(data);
    }
    return { id: projectId, name: projectName, tasks: [] };
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
    const id = `task-${Date.now()}`;
    const color = 'bg-blue-500';
    if (useSupabase && supabase) {
        const { error } = await supabase.from('tasks').insert({
            id,
            project_id: projectId,
            name: taskData.name,
            start_date: taskData.startDate.toISOString().split('T')[0],
            end_date: taskData.endDate.toISOString().split('T')[0],
            color,
            employee_id: taskData.employeeId,
            progress: 0,
            description: taskData.description,
            position: 999
        });
        if (error) throw error;
    } else {
        const data = readLocalData();
        const p = data.projects.find(x => x.id === projectId);
        if (p) p.tasks.push({ id, ...taskData, color, progress: 0 });
        writeLocalData(data);
    }
    return { id, ...taskData, color, progress: 0 };
};

export const updateTask = async (projectId: string, taskId: string, taskUpdate: Partial<Task>): Promise<Task> => {
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
    } else {
        const data = readLocalData();
        const p = data.projects.find(x => x.id === projectId);
        const t = p?.tasks.find(x => x.id === taskId);
        if (t) Object.assign(t, taskUpdate);
        writeLocalData(data);
    }
    return { id: taskId, ...taskUpdate } as Task;
};

export const deleteTask = async (projectId: string, taskId: string): Promise<{ id: string }> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) throw error;
    } else {
        const data = readLocalData();
        const p = data.projects.find(x => x.id === projectId);
        if (p) p.tasks = p.tasks.filter(t => t.id !== taskId);
        writeLocalData(data);
    }
    return { id: taskId };
};

export const updateProjects = async (projects: Project[]): Promise<Project[]> => {
    if (useSupabase && supabase) {
        const updates = projects.map((p, i) => ({ id: p.id, name: p.name, position: i }));
        const { error } = await supabase.from('projects').upsert(updates, { onConflict: 'id' });
        if (error && !isMissingColumnError(error, 'position')) console.error("Upsert error:", stringifyError(error));
    } else {
        const data = readLocalData();
        data.projects = projects;
        writeLocalData(data);
    }
    return projects;
};

export const updateTaskPositions = async (projectId: string, tasks: Task[]) => {
    if (useSupabase && supabase) {
        const updates = tasks.map((t, i) => ({ id: t.id, project_id: projectId, position: i }));
        const { error } = await supabase.from('tasks').upsert(updates, { onConflict: 'id' });
        if (error && !isMissingColumnError(error, 'position')) {
            console.error("Task Pos Upsert error:", stringifyError(error));
        }
    } else {
        const data = readLocalData();
        const p = data.projects.find(x => x.id === projectId);
        if (p) p.tasks = tasks;
        writeLocalData(data);
    }
};

export const getRemoteSettings = async (key: string): Promise<any> => {
    if (!useSupabase || !supabase) return null;
    try {
        const { data, error } = await supabase.from('system_settings').select('value').eq('key', key).single();
        if (error) return null;
        return data?.value;
    } catch { return null; }
};

export const saveRemoteSettings = async (key: string, value: any): Promise<void> => {
    if (!useSupabase || !supabase) return;
    try {
        await supabase.from('system_settings').upsert({ key, value });
    } catch {}
};

export const checkConnectionAndSeed = async () => {
    if (!useSupabase || !supabase) return;
    const { error } = await supabase.from('projects').select('id').limit(1);
    if (error && error.code === '42P01') throw new Error('TABLES_MISSING');
};

export const subscribeToChanges = (callback: () => void) => {
    if (!useSupabase || !supabase) return () => {};
    const channel = supabase.channel('schema-db-changes').on('postgres_changes', { event: '*', schema: 'public' }, callback).subscribe();
    return () => { supabase?.removeChannel(channel); };
};