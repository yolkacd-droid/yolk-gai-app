
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

console.log("Environment Config Load:", {
    URL_CONFIGURED: !!GLOBAL_SUPABASE_URL,
    KEY_CONFIGURED: !!GLOBAL_SUPABASE_KEY,
    PWD_CONFIGURED: !!GLOBAL_ADMIN_PASSWORD,
    USING_FALLBACK: !VITE_ENV_URL && !getProcessEnv("SUPABASE_URL")
});

// --- Initial Data Defaults (Used for seeding only) ---
const today = new Date();
today.setHours(0, 0, 0, 0);

const defaultEmployees: Employee[] = [
  { id: 'e1', name: '앨리스 존슨', departmentId: 'd1' },
  { id: 'e2', name: '밥 윌리엄스', departmentId: 'd1' },
  { id: 'e3', name: '찰리 브라운', departmentId: 'd2' },
  { id: 'e4', name: '다이아나 밀러', departmentId: 'd2' },
  { id: 'e5', name: '이든 데이비스', departmentId: 'd3' },
];

const defaultDepartments: Department[] = [
  { id: 'd1', name: '엔지니어링', employees: [] },
  { id: 'd2', name: '마케팅', employees: [] },
  { id: 'd3', name: '제품', employees: [] },
];

// --- Supabase Client Management ---
let supabase: SupabaseClient | null = null;
let useSupabase = false;

export const initSupabase = (url: string, key: string) => {
    const targetUrl = GLOBAL_SUPABASE_URL || url;
    const targetKey = GLOBAL_SUPABASE_KEY || key;

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
    // Merge default employees into default departments for local storage structure
    const hydratedDepts = defaultDepartments.map(d => ({
        ...d,
        employees: defaultEmployees.filter(e => e.departmentId === d.id)
    }));

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
        departments: hydratedDepts,
        employees: defaultEmployees,
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
        
        // Structure Check
        if (!parsedData || !Array.isArray(parsedData.projects)) {
             const initialData = getInitialData();
             writeLocalData(initialData);
             return initialData;
        }

        // Ensure date objects
        if (parsedData.projects) {
            parsedData.projects.forEach((p: Project) => {
                if(p.tasks) {
                    p.tasks.forEach((t: Task) => {
                        t.startDate = new Date(t.startDate);
                        t.endDate = new Date(t.endDate);
                    });
                } else {
                    p.tasks = [];
                }
            });
        }
        
        // Ensure employees/departments exist if migrating from old version
        if (!parsedData.departments) parsedData.departments = getInitialData().departments;
        if (!parsedData.employees) parsedData.employees = getInitialData().employees;

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
            const { data: projectsData, error: pError } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: true });
            if (pError) throw pError;

            const { data: tasksData, error: tError } = await supabase.from('tasks').select('*');
            if (tError) throw tError;

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
    if (useSupabase && supabase) {
        const { data: depts, error } = await supabase.from('departments').select('*').order('name');
        if (error) throw error;
        
        const { data: emps, error: eError } = await supabase.from('employees').select('*');
        if (eError) throw eError;

        // Map employees into departments
        return (depts || []).map((d: any) => ({
            id: d.id,
            name: d.name,
            employees: (emps || []).filter((e: any) => e.department_id === d.id).map((e: any) => ({
                id: e.id,
                name: e.name,
                departmentId: e.department_id
            }))
        }));
    } else {
        return readLocalData().departments;
    }
};

export const getEmployees = async (): Promise<Employee[]> => {
    if (useSupabase && supabase) {
        const { data, error } = await supabase.from('employees').select('*').order('name');
        if (error) throw error;
        return (data || []).map((e: any) => ({
            id: e.id,
            name: e.name,
            departmentId: e.department_id
        }));
    } else {
        return readLocalData().employees;
    }
};

// --- Organization Management (CRUD) ---

export const addDepartment = async (name: string): Promise<Department> => {
    const newId = `dept-${Date.now()}`;
    const newDept: Department = { id: newId, name, employees: [] };

    if (useSupabase && supabase) {
        const { error } = await supabase.from('departments').insert({ id: newId, name });
        if (error) throw error;
        return newDept;
    } else {
        const data = readLocalData();
        data.departments.push(newDept);
        writeLocalData(data);
        return newDept;
    }
};

export const deleteDepartment = async (id: string): Promise<void> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('departments').delete().eq('id', id);
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.departments = data.departments.filter(d => d.id !== id);
        // Also remove employees in this dept or move them? For now, we assume local implementation cascades or filters out
        data.employees = data.employees.filter(e => e.departmentId !== id);
        writeLocalData(data);
    }
};

export const addEmployee = async (name: string, departmentId: string): Promise<Employee> => {
    const newId = `emp-${Date.now()}`;
    const newEmp: Employee = { id: newId, name, departmentId };

    if (useSupabase && supabase) {
        const { error } = await supabase.from('employees').insert({ 
            id: newId, 
            name, 
            department_id: departmentId 
        });
        if (error) throw error;
        return newEmp;
    } else {
        const data = readLocalData();
        data.employees.push(newEmp);
        const dept = data.departments.find(d => d.id === departmentId);
        if (dept) dept.employees.push(newEmp);
        writeLocalData(data);
        return newEmp;
    }
};

export const deleteEmployee = async (id: string): Promise<void> => {
    if (useSupabase && supabase) {
        const { error } = await supabase.from('employees').delete().eq('id', id);
        if (error) throw error;
    } else {
        const data = readLocalData();
        data.employees = data.employees.filter(e => e.id !== id);
        data.departments.forEach(d => {
            d.employees = d.employees.filter(e => e.id !== id);
        });
        writeLocalData(data);
    }
};

// --- Project/Task CRUD ---

export const addProject = async (projectName: string): Promise<Project> => {
    const newId = `project-${Date.now()}`;
    const newProject: Project = { id: newId, name: projectName, tasks: [] };

    if (useSupabase && supabase) {
        const { error } = await supabase.from('projects').insert({ id: newId, name: projectName });
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
        return null;
    }
};

export const saveRemoteSettings = async (key: string, value: any): Promise<void> => {
    if (!useSupabase || !supabase) return;
    try {
        const { error } = await supabase.from('system_settings').upsert({ key, value });
        if (error && error.code === '42P01') return;
    } catch (e) {}
};

// --- Seed & Check Functions ---

const seedDatabase = async () => {
    if (!supabase) return;
    
    // 1. Seed Departments
    const { error: dError } = await supabase.from('departments').insert(defaultDepartments.map(d => ({ id: d.id, name: d.name })));
    if (dError) { 
        if(dError.code === '42P01') throw new Error('TABLES_MISSING'); 
        console.error('Dept Seed Error', dError);
    }

    // 2. Seed Employees
    const { error: eError } = await supabase.from('employees').insert(defaultEmployees.map(e => ({ id: e.id, name: e.name, department_id: e.departmentId })));
    if (eError) console.error('Emp Seed Error', eError);

    // 3. Seed Projects & Tasks
    const initialData = getInitialData();
    const p1 = initialData.projects[0];
    const { error: pError } = await supabase.from('projects').insert({ id: p1.id, name: p1.name });
    if (pError) console.error('Proj Seed Error', pError);

    // Map tasks to database format
    const dbTasks = p1.tasks.map(t => ({
        id: t.id,
        project_id: p1.id,
        name: t.name,
        start_date: t.startDate.toISOString().split('T')[0],
        end_date: t.endDate.toISOString().split('T')[0],
        color: t.color,
        employee_id: t.employeeId,
        progress: t.progress,
        description: t.description
    }));

    const { error: tError } = await supabase.from('tasks').insert(dbTasks);
    if (tError) console.error('Task Seed Error', tError);
};

export const checkConnectionAndSeed = async () => {
    if (!useSupabase || !supabase) return;

    try {
        // Check projects table existence
        const { data, error } = await supabase.from('projects').select('id').limit(1);
        
        if (error) {
            if (error.code === '42P01') {
                throw new Error('TABLES_MISSING');
            }
            throw error;
        }

        // Also check if departments exist (migrations)
        const { error: dCheckError } = await supabase.from('departments').select('id').limit(1);
        if (dCheckError && dCheckError.code === '42P01') {
             throw new Error('TABLES_MISSING'); // Departments table missing
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

    console.log("Initializing Realtime Subscription...");

    const channel = supabase.channel('db-changes')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public' },
            (payload) => {
                console.log('Realtime Change Detected:', payload.eventType, payload.table);
                callback();
            }
        )
        .subscribe((status) => {
            console.log("Realtime Connection Status:", status);
        });

    return () => {
        console.log("Cleaning up Realtime Subscription...");
        supabase?.removeChannel(channel);
    };
};
