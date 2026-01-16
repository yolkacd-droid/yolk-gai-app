
import React, { useState, useMemo, useEffect, FC, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import ReactDOM from 'react-dom/client';
import { Department, Employee, Task, Project } from './types';
import { getProjects, getDepartments, getEmployees, addProject, updateProject, deleteProject, addTask, updateTask, deleteTask, updateProjects, initSupabase, getSupabaseConfig, isSupabaseEnabled, subscribeToChanges, checkConnectionAndSeed, hasAdminPassword, verifyAdminPassword, setAdminPassword, isGlobalConfigured, isGlobalPassword, initSupabaseFromUrl, getShareableConfigLink, getRemoteSettings, saveRemoteSettings } from './services/apiService';
import { addDays, getDaysBetween, formatDate } from './utils/dateUtils';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, FilterIcon, PlusIcon, FolderIcon, ChevronDownIcon, XMarkIcon, PencilIcon, TrashIcon, GripVerticalIcon } from './components/icons';

// Settings Constants Keys
const SETTINGS_KEY = 'gantt-ui-settings-v2';
const GANTT_COLUMN_WIDTHS_KEY = 'ganttColumnWidths';
const NUMBER_OF_DAYS_IN_VIEW = 30;
const MIN_COLUMN_WIDTH = 50;

interface UISettings {
    dayWidth: number;
    rowHeight: number;
    projectBarHeight: number;
    taskBarHeight: number;
    fontSize: number;
    headerFontSize: number;
}

const DEFAULT_SETTINGS: UISettings = {
    dayWidth: 45,
    rowHeight: 54,
    projectBarHeight: 40,
    taskBarHeight: 32,
    fontSize: 13,
    headerFontSize: 10,
};

const DEFAULT_COLUMN_WIDTHS = {
    project: 220,
    department: 100,
    author: 100,
    progress: 100,
};

// --- Custom Icons ---
const CogIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.592c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

// --- Helper Components ---

const Resizer: FC<{ onMouseDown: (e: React.MouseEvent) => void }> = ({ onMouseDown }) => (
    <div onMouseDown={onMouseDown} onClick={e => e.stopPropagation()} className="absolute top-0 right-0 h-full w-2.5 cursor-col-resize group z-20 flex justify-center items-center">
        <div className="w-px h-2/3 bg-transparent group-hover:bg-gray-500 transition-colors duration-200"></div>
    </div>
);

const Tooltip: FC<{ content: React.ReactNode; children: React.ReactNode }> = ({ content, children }) => {
    const [visible, setVisible] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const handleMouseMove = (e: React.MouseEvent) => setPosition({ x: e.clientX, y: e.clientY });
    const handleMouseEnter = (e: React.MouseEvent) => { setPosition({ x: e.clientX, y: e.clientY }); setVisible(true); };
    const handleMouseLeave = () => setVisible(false);
    const handleTouchStart = (e: React.TouchEvent) => { const touch = e.touches[0]; setPosition({ x: touch.clientX, y: touch.clientY }); setVisible(!visible); };

    return (
        <div className="w-full h-full" onMouseEnter={handleMouseEnter} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onTouchStart={handleTouchStart}>
            {children}
            {visible && createPortal(
                <div className="fixed top-0 left-0 pointer-events-none z-[9999] bg-gray-900/95 backdrop-blur-md text-white text-xs rounded-md py-3 px-4 shadow-2xl border border-gray-700 transition-opacity duration-200"
                    style={{ transform: `translate(${Math.min(window.innerWidth - 280, position.x + 15)}px, ${Math.min(window.innerHeight - 150, position.y + 15)}px)`, width: 'max-content', maxWidth: '280px' }}>
                    {content}
                </div>, document.body
            )}
        </div>
    );
};

const ModalBase: FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode; title?: string }> = ({ isOpen, onClose, children, title }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[100] p-0 sm:p-4" onClick={onClose}>
            <div className="bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto border border-gray-700 custom-scrollbar" onClick={e => e.stopPropagation()}>
                {title && (
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-white">{title}</h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-700 transition-colors"><XMarkIcon className="h-6 w-6" /></button>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
};

// --- Settings Component ---
const SliderField: FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void; colorClass: string; unit?: string }> = ({ label, value, min, max, onChange, colorClass, unit = 'px' }) => {
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-sm">
                <label className="text-gray-300 font-medium">{label}</label>
                <span className={`${colorClass} font-mono font-black`}>{localValue}{unit}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                value={localValue} 
                onInput={(e) => setLocalValue(parseInt((e.target as HTMLInputElement).value))}
                onChange={(e) => onChange(parseInt((e.target as HTMLInputElement).value))} 
                className="w-full accent-indigo-500 bg-gray-700 h-1.5 rounded-lg appearance-none cursor-pointer" 
            />
        </div>
    );
};

const SettingsModal: FC<{ isOpen: boolean; onClose: () => void; settings: UISettings; setSettings: (s: UISettings) => void; onSaveSupabase: (url: string, key: string) => void }> = ({ isOpen, onClose, settings, setSettings, onSaveSupabase }) => {
    const update = useCallback((key: keyof UISettings, val: any) => setSettings({ ...settings, [key]: val }), [settings, setSettings]);
    const [sbUrl, setSbUrl] = useState('');
    const [sbKey, setSbKey] = useState('');
    const [adminPwd, setAdminPwd] = useState('');
    const [isProtected, setIsProtected] = useState(false);
    const [isGlobalConfig, setIsGlobalConfig] = useState(false);
    const [isGlobalPwd, setIsGlobalPwd] = useState(false);
    
    useEffect(() => {
        const config = getSupabaseConfig();
        if(config) {
            setSbUrl(config.url);
            setSbKey(config.key);
        }
        setIsProtected(hasAdminPassword());
        setIsGlobalConfig(isGlobalConfigured());
        setIsGlobalPwd(isGlobalPassword());
    }, [isOpen]);

    const handleSave = () => {
        if (!isGlobalConfig) {
            onSaveSupabase(sbUrl, sbKey);
        }
        if (adminPwd && !isGlobalPwd) setAdminPassword(adminPwd);
        onClose();
    };

    const copySql = () => {
        const sql = `create table projects (id text primary key, name text, created_at timestamptz default now());\ncreate table tasks (id text primary key, name text, start_date text, end_date text, color text, employee_id text, progress int, description text, project_id text references projects(id) on delete cascade);\ncreate table system_settings (key text primary key, value jsonb);`;
        navigator.clipboard.writeText(sql);
        alert('SQL 쿼리가 클립보드에 복사되었습니다. Supabase SQL 에디터에서 실행하세요.');
    };

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} title="표시 및 시스템 설정">
            <div className="space-y-8 pb-32">
                 <section className="space-y-5">
                    <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest border-b border-rose-400/20 pb-2">보안 설정</h4>
                    <div className="space-y-3">
                        <p className="text-xs text-rose-200 leading-relaxed">
                             설정 메뉴 접근 시 사용할 비밀번호를 설정하여 무단 변경을 방지하세요.
                        </p>
                         {isProtected && <div className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-bold flex items-center gap-2"><span>🔒</span>현재 비밀번호가 설정되어 있습니다.</div>}
                         {isGlobalPwd && <div className="px-3 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 text-xs font-bold flex items-center gap-2"><span>🛡️</span>소스 코드에 의해 비밀번호가 고정되었습니다.</div>}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">관리자 비밀번호 {isProtected ? '변경' : '설정'}</label>
                            <input 
                                type="password" 
                                value={adminPwd} 
                                onChange={e => setAdminPwd(e.target.value)} 
                                placeholder={isGlobalPwd ? "소스 코드에서 관리됨" : (isProtected ? "새 비밀번호 (비워두면 유지)" : "비밀번호 입력")} 
                                disabled={isGlobalPwd}
                                className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-3 text-white text-sm focus:ring-1 focus:ring-rose-500 outline-none transition-all placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed" 
                            />
                        </div>
                    </div>
                </section>

                 <section className="space-y-5">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-indigo-400/20 pb-2">실시간 데이터베이스 (Supabase)</h4>
                    <div className="space-y-3">
                        {isGlobalConfig ? (
                            <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-emerald-500/20 text-emerald-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-200">환경 변수로 연결됨</p>
                                        <p className="text-xs text-gray-500">시스템 환경 변수(.env) 설정을 사용 중입니다.</p>
                                    </div>
                                </div>
                                <button onClick={copySql} className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-indigo-400 hover:text-indigo-300 text-xs font-bold rounded-lg transition-all border border-gray-600">
                                    초기 설정용 SQL 스크립트 복사
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                                    <p className="text-xs text-indigo-200 leading-relaxed">
                                        <strong className="text-white">Supabase</strong>를 연결하면 여러 사용자가 실시간으로 같은 화면을 볼 수 있습니다. 설정 정보는 앱에 안전하게 저장됩니다.
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Project URL</label>
                                    <input 
                                        type="text" 
                                        value={sbUrl} 
                                        onChange={e => setSbUrl(e.target.value)} 
                                        placeholder="https://xyz.supabase.co" 
                                        className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-2 text-white text-xs focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Anon / Public Key</label>
                                    <input 
                                        type="password" 
                                        value={sbKey} 
                                        onChange={e => setSbKey(e.target.value)} 
                                        placeholder="eyJhbGciOiJIUzI1NiIsInR5..." 
                                        className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-2 text-white text-xs focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed" 
                                    />
                                </div>
                                <button onClick={copySql} className="text-xs text-indigo-400 hover:text-indigo-300 underline font-bold">SQL 설정 스크립트 복사</button>
                            </>
                        )}
                    </div>
                </section>

                <section className="space-y-5">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-400/20 pb-2">테이블 레이아웃</h4>
                    <SliderField label="날짜 칸 너비 (가로)" value={settings.dayWidth} min={30} max={120} onChange={(v) => update('dayWidth', v)} colorClass="text-emerald-300" />
                    <SliderField label="행 높이 (세로)" value={settings.rowHeight} min={35} max={120} onChange={(v) => update('rowHeight', v)} colorClass="text-emerald-300" />
                </section>

                <section className="space-y-5">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest border-b border-amber-400/20 pb-2">바 스타일 및 폰트</h4>
                    <SliderField label="프로젝트 바 높이" value={settings.projectBarHeight} min={10} max={60} onChange={(v) => update('projectBarHeight', v)} colorClass="text-amber-300" />
                    <SliderField label="태스크 바 높이" value={settings.taskBarHeight} min={10} max={60} onChange={(v) => update('taskBarHeight', v)} colorClass="text-amber-300" />
                    <SliderField label="내용 글자 크기" value={settings.fontSize} min={8} max={26} onChange={(v) => update('fontSize', v)} colorClass="text-amber-300" />
                    <SliderField label="제목줄 글자 크기" value={settings.headerFontSize} min={8} max={22} onChange={(v) => update('headerFontSize', v)} colorClass="text-amber-300" />
                </section>
                
                <button onClick={handleSave} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-indigo-500/20 active:scale-95">설정 저장 및 연결</button>
            </div>
        </ModalBase>
    );
};

const AuthModal: FC<{ isOpen: boolean; onClose: () => void; onSuccess: () => void }> = ({ isOpen, onClose, onSuccess }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setPassword('');
            setError(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (verifyAdminPassword(password)) {
            onSuccess();
            onClose();
        } else {
            setError(true);
            setPassword('');
        }
    };

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} title="관리자 인증">
            <form onSubmit={handleSubmit} className="space-y-6">
                 <div className="p-4 bg-gray-700/50 rounded-xl border border-gray-600">
                    <p className="text-sm text-gray-300 text-center">설정 메뉴에 접근하려면 비밀번호를 입력하세요.</p>
                </div>
                <div>
                    <input 
                        ref={inputRef}
                        type="password" 
                        value={password} 
                        onChange={e => { setPassword(e.target.value); setError(false); }} 
                        placeholder="비밀번호 입력" 
                        className={`w-full bg-gray-900/50 border ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-600 focus:ring-indigo-500'} rounded-xl p-4 text-white text-lg text-center tracking-widest focus:ring-2 outline-none transition-all`} 
                        autoFocus
                    />
                    {error && <p className="text-red-400 text-xs font-bold text-center mt-2 animate-pulse">비밀번호가 일치하지 않습니다.</p>}
                </div>
                <button type="submit" className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95">확인</button>
            </form>
        </ModalBase>
    );
};

// --- Task/Project Management Modals ---
// ... (All other components remain unchanged from previous state)

const TaskModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { name: string; employeeId: string; startDate: string; duration: number; description: string }) => Promise<void>;
    employees: Employee[];
    task?: Task;
    project: Project | null;
}> = ({ isOpen, onClose, onSubmit, employees, task, project }) => {
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [duration, setDuration] = useState(1);
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (task) {
                setName(task.name);
                setEmployeeId(task.employeeId);
                setStartDate(formatDate(new Date(task.startDate)));
                setDuration(getDaysBetween(new Date(task.startDate), new Date(task.endDate)));
                setDescription(task.description || '');
            } else {
                setName('');
                setEmployeeId(employees[0]?.id || '');
                setStartDate(formatDate(new Date()));
                setDuration(3);
                setDescription('');
            }
        }
    }, [isOpen, task, employees]);

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            await onSubmit({ name, employeeId, startDate, duration, description });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} title={task ? '태스크 수정' : '새 태스크 추가'}>
            <form onSubmit={handleFormSubmit} className="space-y-4">
                {project && <div className="text-[10px] text-indigo-400 font-black uppercase tracking-widest mb-1 px-1">PROJECT: {project.name}</div>}
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-bold ml-1">태스크 이름</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="작업 내용을 입력하세요" className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold ml-1">담당자</label>
                        <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none">
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs text-gray-500 font-bold ml-1">시작일</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required style={{ colorScheme: 'dark' }} />
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-bold ml-1">기간 (일)</label>
                    <input type="number" min="1" value={duration} onChange={e => setDuration(parseInt(e.target.value))} className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required />
                </div>
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-bold ml-1">상세 설명</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all" placeholder="구체적인 내용을 입력하세요" />
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 mt-4 active:scale-95">
                    {isSubmitting ? '저장 중...' : '저장 완료'}
                </button>
            </form>
        </ModalBase>
    );
};

const ProjectModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string) => Promise<void>;
    project: Project | null;
}> = ({ isOpen, onClose, onSubmit, project }) => {
    const [name, setName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    useEffect(() => { if (isOpen) setName(project?.name || ''); }, [isOpen, project]);
    
    const handleSubmit = async (e: React.FormEvent) => { 
        e.preventDefault(); 
        setIsSubmitting(true);
        try {
            await onSubmit(name);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    return (
        <ModalBase isOpen={isOpen} onClose={onClose} title={project ? '프로젝트 수정' : '새 프로젝트 추가'}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1">
                    <label className="text-xs text-gray-500 font-bold ml-1">프로젝트 명칭</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="프로젝트 이름을 입력하세요" className="w-full bg-gray-700/50 border border-gray-600 rounded-xl p-4 text-lg font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all" required autoFocus />
                </div>
                <button type="submit" disabled={isSubmitting} className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-black rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                    {isSubmitting ? '처리 중...' : '프로젝트 생성'}
                </button>
            </form>
        </ModalBase>
    );
};

const ConfirmationModal: FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    title: string;
    message: string;
}> = ({ isOpen, onClose, onConfirm, title, message }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalBase isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-8">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
                    <p className="text-gray-200 leading-relaxed text-sm text-center">{message}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={onClose} disabled={isSubmitting} className="py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50">취소</button>
                    <button onClick={handleConfirm} disabled={isSubmitting} className="py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all shadow-lg shadow-red-500/20 active:scale-95 disabled:opacity-50">
                        {isSubmitting ? '삭제 중...' : '삭제 확인'}
                    </button>
                </div>
            </div>
        </ModalBase>
    );
};

// --- Main Components ---
// ... (Header, TimelineHeader, TaskBar, ProjectBar, TimelineGridBackground, GanttView unchanged)

const Header: FC<{
    departments: Department[];
    filter: { departmentId: string; employeeId: string };
    setFilter: React.Dispatch<React.SetStateAction<{ departmentId: string; employeeId: string }>>;
    viewStartDate: Date;
    setViewStartDate: React.Dispatch<React.SetStateAction<Date>>;
    onOpenSettings: () => void;
    isOnline: boolean;
}> = ({ departments, filter, setFilter, viewStartDate, setViewStartDate, onOpenSettings, isOnline }) => {
    const employeesInSelectedDept = useMemo(() => {
        if (filter.departmentId === 'all' || !departments) return [];
        return departments.find(d => d.id === filter.departmentId)?.employees || [];
    }, [filter.departmentId, departments]);

    const handleDateShift = (days: number) => setViewStartDate(currentDate => addDays(currentDate, days));
    const goToToday = () => { const today = new Date(); today.setDate(today.getDate() - 2); today.setHours(0,0,0,0); setViewStartDate(today); }

    return (
        <header className="bg-gray-900/90 backdrop-blur-xl p-3 sm:p-5 border-b border-gray-800 sticky top-0 z-40">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl shadow-lg transition-colors ${isOnline ? 'bg-indigo-600 shadow-indigo-600/30' : 'bg-gray-700 shadow-gray-700/30'}`}>
                        <CalendarIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">다현산업 <span className="text-indigo-400">일정 플래너</span></h1>
                        <div className="flex items-center gap-2">
                             <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Team Productivity Suite</p>
                             {isOnline && <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Live Sync</span>}
                        </div>
                    </div>
                    <button onClick={onOpenSettings} className="p-2.5 ml-2 rounded-xl bg-gray-800 hover:bg-indigo-500/20 text-gray-400 hover:text-indigo-400 transition-all border border-gray-700 hover:border-indigo-500/50 shadow-inner group">
                        <CogIcon className="h-5 w-5 group-hover:rotate-90 transition-transform duration-700" />
                    </button>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full lg:w-auto">
                    <div className="flex gap-2 flex-grow sm:flex-grow-0 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                        <div className="flex items-center bg-gray-800/80 rounded-xl px-3 border border-gray-700 shrink-0">
                            <FilterIcon className="h-4 w-4 text-indigo-400 mr-3"/>
                            <select value={filter.departmentId} onChange={e => setFilter({ departmentId: e.target.value, employeeId: 'all' })} className="bg-transparent py-3 pl-1 pr-8 text-sm font-bold text-gray-200 rounded-xl focus:outline-none appearance-none cursor-pointer">
                                <option value="all">부서 전체</option>
                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center bg-gray-800/80 rounded-xl px-3 border border-gray-700 shrink-0">
                            <select value={filter.employeeId} onChange={e => setFilter(f => ({ ...f, employeeId: e.target.value }))} disabled={filter.departmentId === 'all'} className="bg-transparent py-3 pl-1 pr-8 text-sm font-bold text-gray-200 rounded-xl focus:outline-none disabled:opacity-30 appearance-none cursor-pointer">
                                <option value="all">직원 전체</option>
                                {employeesInSelectedDept.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-start gap-3 bg-gray-800/40 rounded-2xl p-1.5 border border-gray-700/50">
                        <button onClick={() => handleDateShift(-7)} className="p-2.5 rounded-xl hover:bg-gray-700 transition-all text-gray-400 hover:text-white active:scale-90"><ChevronLeftIcon className="h-5 w-5" /></button>
                        <button onClick={goToToday} className="flex items-center gap-2.5 px-5 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-gray-700/50 hover:bg-gray-700 transition-all text-gray-300 hover:text-white shadow-sm">오늘</button>
                        <button onClick={() => handleDateShift(7)} className="p-2.5 rounded-xl hover:bg-gray-700 transition-all text-gray-400 hover:text-white active:scale-90"><ChevronRightIcon className="h-5 w-5" /></button>
                    </div>
                </div>
            </div>
        </header>
    );
};

const TimelineHeader: FC<{ dates: Date[], todayString: string; dayWidth: number; fontSize: number }> = ({ dates, todayString, dayWidth, fontSize }) => {
    return (
        <div className="flex" style={{ height: '100%' }}>
            {dates.map((date, index) => {
                const day = date.getDay();
                const isWeekend = day === 0 || day === 6;
                const isToday = formatDate(date) === todayString;
                return (
                    <div key={index} className={`flex-shrink-0 flex flex-col items-center justify-center border-r border-gray-800 ${isWeekend ? 'bg-gray-800/40' : ''} ${isToday ? 'bg-yellow-400/10' : ''}`} style={{ width: dayWidth }}>
                        <div className={`leading-tight uppercase opacity-50 font-black mb-0.5`} style={{ fontSize: fontSize * 0.8 }}>{date.toLocaleString('ko-KR', { weekday: 'short' })}</div>
                        <div className={`font-black ${isToday ? 'text-yellow-400 animate-pulse' : 'text-gray-300'}`} style={{ fontSize: fontSize }}>{date.getDate()}</div>
                    </div>
                );
            })}
        </div>
    );
};

const TaskBar: FC<{
    task: Task;
    viewStartDate: Date;
    onProgressChange: (newProgress: number) => void;
    employeeMap: Map<string, Employee>;
    departmentMap: Map<string, Department>;
    dayWidth: number;
    barHeight: number;
    fontSize: number;
}> = ({ task, viewStartDate, onProgressChange, employeeMap, departmentMap, dayWidth, barHeight, fontSize }) => {
    const barRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const startDate = new Date(task.startDate);
    const endDate = new Date(task.endDate);
    const startOffsetDays = getDaysBetween(viewStartDate, startDate) - 1;
    const durationDays = getDaysBetween(startDate, endDate);
    const left = startOffsetDays * dayWidth;
    const width = durationDays * dayWidth - 4;
    if (left + width < 0 || left > NUMBER_OF_DAYS_IN_VIEW * dayWidth) return null;

    const employee = employeeMap.get(task.employeeId);
    const department = employee ? departmentMap.get(employee.departmentId) : undefined;

    const tooltipContent = (
        <div className="space-y-3 w-64 p-1">
            <p className="font-black text-lg text-indigo-300 tracking-tight leading-tight">{task.name}</p>
            <div className="text-[11px] text-gray-400 space-y-2 font-bold uppercase tracking-wider">
                <div className="flex items-center justify-between"><span className="opacity-50">담당</span> <span>{employee?.name} ({department?.name})</span></div>
                <div className="flex items-center justify-between"><span className="opacity-50">기간</span> <span>{formatDate(startDate)} ~ {formatDate(endDate)}</span></div>
                <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5"><span className="opacity-50">진행률</span> <span className="text-white">{task.progress}%</span></div>
                    <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className={`h-full ${task.color} opacity-80`} style={{ width: `${task.progress}%` }}></div>
                    </div>
                </div>
            </div>
            {task.description && (
                <div className="pt-3 border-t border-gray-700 mt-2">
                    <p className="text-xs text-gray-300 leading-relaxed font-medium">{task.description}</p>
                </div>
            )}
        </div>
    );

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (window.matchMedia("(pointer: coarse)").matches) return;
        e.preventDefault(); e.stopPropagation();
        isDraggingRef.current = true;
        const updateProgress = (clientX: number) => {
            if(!barRef.current) return;
            const rect = barRef.current.getBoundingClientRect();
            let newProgress = ((clientX - rect.left) / rect.width) * 100;
            newProgress = Math.max(0, Math.min(100, Math.round(newProgress)));
            onProgressChange(newProgress);
        };
        const handleMouseMove = (moveEvent: MouseEvent) => { if (isDraggingRef.current) updateProgress(moveEvent.clientX); };
        const handleMouseUp = () => { isDraggingRef.current = false; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
        document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
    };

    const textOffset = `max(0px, calc(var(--gantt-scroll-left, 0px) - ${left}px))`;
    const visibleBarWidth = `calc(${width}px - ${textOffset})`;

    return (
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left, height: barHeight }}>
            <div style={{ width: Math.max(0, width), height: '100%' }}>
                <Tooltip content={tooltipContent}>
                    <div ref={barRef} onMouseDown={handleMouseDown} className="w-full h-full rounded-xl bg-gray-800/90 shadow-2xl hover:ring-2 hover:ring-white/40 transition-all duration-300 cursor-pointer flex items-center overflow-hidden border border-white/5">
                        <div className={`h-full ${task.color} pointer-events-none transition-all duration-500 opacity-70`} style={{ width: `${task.progress}%` }}></div>
                    </div>
                </Tooltip>
            </div>
            <div className="absolute top-0 h-full flex items-center pointer-events-none" style={{ transform: `translateX(${textOffset})`}}>
                <span className="font-black text-white px-4 truncate drop-shadow-xl tracking-tight" style={{ maxWidth: visibleBarWidth, fontSize }}>
                    {task.name}
                </span>
            </div>
        </div>
    );
};

const ProjectBar: FC<{ project: Project; viewStartDate: Date; dayWidth: number; barHeight: number; fontSize: number }> = ({ project, viewStartDate, dayWidth, barHeight, fontSize }) => {
    if (project.tasks.length === 0) return null;
    const startDates = project.tasks.map(t => new Date(t.startDate));
    const endDates = project.tasks.map(t => new Date(t.endDate));
    const projectStartDate = new Date(Math.min(...startDates.map(d => d.getTime())));
    const projectEndDate = new Date(Math.max(...endDates.map(d => d.getTime())));
    const totalProgress = project.tasks.reduce((sum, task) => sum + (task.progress || 0), 0);
    const averageProgress = project.tasks.length > 0 ? Math.round(totalProgress / project.tasks.length) : 0;
    const startOffsetDays = getDaysBetween(viewStartDate, projectStartDate) - 1;
    const durationDays = getDaysBetween(projectStartDate, projectEndDate);
    const left = startOffsetDays * dayWidth;
    const width = durationDays * dayWidth - 4;
    if (left + width < 0 || left > NUMBER_OF_DAYS_IN_VIEW * dayWidth) return null;

    const textOffset = `max(0px, calc(var(--gantt-scroll-left, 0px) - ${left}px))`;
    const visibleBarWidth = `calc(${width}px - ${textOffset})`;

    return (
        <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{ left, height: barHeight, width: Math.max(0, width) }}>
            <Tooltip content={<div className="text-xs p-2 font-black uppercase tracking-wider text-indigo-200">{project.name} <br/><span className="text-white">{averageProgress}% COMPLETE</span></div>}>
                <div className="relative w-full h-full flex items-center group cursor-pointer">
                    {/* Glow & Track Background */}
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="relative w-full h-full flex items-center justify-center">
                        {/* Horizontal Body (The Track) - Thick body with border */}
                        <div className="absolute w-full h-8 bg-gray-900/90 border border-indigo-500/50 rounded-sm overflow-hidden shadow-lg backdrop-blur-sm z-10">
                            {/* Inner Progress Fill */}
                            <div className="h-full bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 transition-all duration-700 relative" style={{ width: `${averageProgress}%` }}>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
                            </div>
                        </div>

                        {/* Traditional Gantt Brackets (Summary Marks) */}
                        {/* Start (Left) Bracket */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-[6px] border-l-4 border-t-4 border-b-4 border-indigo-400 rounded-l-sm z-20"></div>
                        
                        {/* End (Right) Bracket */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 h-10 w-[6px] border-r-4 border-t-4 border-b-4 border-indigo-400 rounded-r-sm z-20"></div>
                    </div>

                    {/* Project Label Overlay */}
                    <div className="absolute top-0 h-full flex items-center pointer-events-none z-30" style={{ transform: `translateX(${textOffset})` }}>
                        <span className="font-bold text-white px-6 tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style={{ maxWidth: visibleBarWidth, fontSize: fontSize + 1 }}>
                            {project.name} <span className="ml-2 text-indigo-300">{averageProgress}%</span>
                        </span>
                    </div>
                </div>
            </Tooltip>
        </div>
    );
};

const TimelineGridBackground: FC<{ dates: Date[], todayString: string, sidebarWidth: number, dayWidth: number }> = ({ dates, todayString, sidebarWidth, dayWidth }) => (
    <div className="absolute top-0 left-0 h-full w-full flex pointer-events-none" style={{ zIndex: 0 }}>
        <div style={{ width: sidebarWidth, minWidth: sidebarWidth }}></div>
        <div className="flex-grow flex h-full">
            {dates.map((date, index) => {
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isToday = formatDate(date) === todayString;
                return (
                    <div key={index} className={`h-full border-r border-gray-800/40 ${isWeekend ? 'bg-gray-800/10' : ''} ${isToday ? 'bg-yellow-400/5' : ''}`} style={{ width: dayWidth, minWidth: dayWidth }} />
                );
            })}
        </div>
    </div>
);

const GanttView: FC<{
    projects: Project[];
    timelineDates: Date[];
    viewStartDate: Date;
    todayString: string;
    employeeMap: Map<string, Employee>;
    departmentMap: Map<string, Department>;
    expandedProjects: Record<string, boolean>;
    toggleProjectExpansion: (projectId: string) => void;
    onAddTaskClick: (projectId: string) => void;
    onAddProjectClick: () => void;
    onTaskProgressChange: (projectId: string, taskId: string, progress: number) => void;
    onEditProject: (project: Project) => void;
    onDeleteProject: (project: Project) => void;
    onEditTask: (task: Task, projectId: string) => void;
    onDeleteTask: (task: Task, projectId: string) => void;
    columnWidths: typeof DEFAULT_COLUMN_WIDTHS;
    setColumnWidths: React.Dispatch<React.SetStateAction<typeof DEFAULT_COLUMN_WIDTHS>>;
    onReorderProjects: (draggedId: string, targetId: string) => void;
    uiSettings: UISettings;
}> = ({ projects, timelineDates, viewStartDate, todayString, employeeMap, departmentMap, expandedProjects, toggleProjectExpansion, onAddTaskClick, onAddProjectClick, onTaskProgressChange, onEditProject, onDeleteProject, onEditTask, onDeleteTask, columnWidths, setColumnWidths, onReorderProjects, uiSettings }) => {
    
    const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => { const checkMobile = () => setIsMobile(window.innerWidth < 768); checkMobile(); window.addEventListener('resize', checkMobile); return () => window.removeEventListener('resize', checkMobile); }, []);
    const visibleColumnWidths = useMemo(() => isMobile ? { project: Math.max(140, columnWidths.project * 0.7), department: 0, author: 0, progress: 0 } : columnWidths, [isMobile, columnWidths]);
    const sidebarWidth = useMemo(() => (Object.values(visibleColumnWidths) as number[]).reduce((sum, width) => sum + width, 0), [visibleColumnWidths]);
    const timelineWidth = timelineDates.length * uiSettings.dayWidth;

    const handleResizeMouseDown = (e: React.MouseEvent, columnKey: keyof typeof columnWidths) => {
        if (isMobile) return; e.preventDefault(); e.stopPropagation();
        const startX = e.clientX; const startWidth = columnWidths[columnKey];
        const handleMouseMove = (mv: MouseEvent) => setColumnWidths(prev => ({ ...prev, [columnKey]: Math.max(MIN_COLUMN_WIDTH, startWidth + (mv.clientX - startX)) }));
        const handleMouseUp = () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
        document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { const sl = e.currentTarget.scrollLeft; e.currentTarget.style.setProperty('--gantt-scroll-left', `${sl}px`); setScrollLeft(sl); };

    if (projects.length === 0) return <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 gap-4"><FilterIcon className="h-12 w-12 opacity-20" /><p className="font-bold tracking-tight">일치하는 결과가 없습니다.</p></div>;

    return (
        <div onScroll={handleScroll} className="flex-grow overflow-auto border border-gray-800 rounded-3xl shadow-inner bg-gray-950/40 relative no-scrollbar">
            <div style={{ width: sidebarWidth + timelineWidth, position: 'relative' }}>
                <div className="flex flex-shrink-0 sticky top-0 z-20 bg-gray-900/95 backdrop-blur-xl" style={{ height: uiSettings.rowHeight }}>
                    <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex items-center text-[9px] uppercase font-black text-gray-500 border-r border-b border-gray-800 sticky left-0 z-30 bg-gray-900">
                        <div style={{ width: visibleColumnWidths.project }} className="px-5 flex items-center justify-between h-full relative">
                            <span>NAME / TASK</span>
                            <button onClick={onAddProjectClick} className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-400/20 active:scale-90 transition-all"><PlusIcon className="h-3.5 w-3.5" /></button>
                            {!isMobile && <Resizer onMouseDown={e => handleResizeMouseDown(e, 'project')} />}
                        </div>
                        {visibleColumnWidths.department > 0 && <div style={{ width: visibleColumnWidths.department }} className="px-5 border-l border-gray-800 h-full flex items-center relative truncate"><span>DEPT</span><Resizer onMouseDown={e => handleResizeMouseDown(e, 'department')} /></div>}
                        {visibleColumnWidths.author > 0 && <div style={{ width: visibleColumnWidths.author }} className="px-5 border-l border-gray-800 h-full flex items-center relative truncate"><span>OWNER</span><Resizer onMouseDown={e => handleResizeMouseDown(e, 'author')} /></div>}
                        {visibleColumnWidths.progress > 0 && <div style={{ width: visibleColumnWidths.progress }} className="px-5 border-l border-gray-800 h-full flex items-center relative truncate"><span>PROG</span><Resizer onMouseDown={e => handleResizeMouseDown(e, 'progress')} /></div>}
                    </div>
                    <div className="border-b border-gray-800 flex-grow"><TimelineHeader dates={timelineDates} todayString={todayString} dayWidth={uiSettings.dayWidth} fontSize={uiSettings.headerFontSize} /></div>
                </div>

                <div className="relative">
                     <TimelineGridBackground dates={timelineDates} todayString={todayString} sidebarWidth={sidebarWidth} dayWidth={uiSettings.dayWidth} />
                    {projects.map(project => {
                        const isExpanded = expandedProjects[project.id] ?? true;
                        const totalProgress = project.tasks.reduce((sum, task) => sum + (task.progress || 0), 0);
                        const averageProgress = project.tasks.length > 0 ? Math.round(totalProgress / project.tasks.length) : 0;
                        return (
                        <div key={project.id} className="relative">
                            <div className={`flex items-center hover:bg-indigo-500/[0.03] group transition-all duration-300 border-b border-gray-800/40`} style={{ height: uiSettings.rowHeight }}>
                                <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex border-r border-gray-800 sticky left-0 z-10 bg-gray-900/90 backdrop-blur-md h-full shadow-2xl">
                                    <div style={{ width: visibleColumnWidths.project }} className="flex items-center px-2 sm:px-5 text-sm font-black text-gray-100 truncate tracking-tight">
                                        {!isMobile && <div draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', project.id); setDraggedProjectId(project.id); }} onDragEnd={() => {setDraggedProjectId(null); setDropTargetId(null);}} className="cursor-move p-1.5 -ml-2 mr-2 text-gray-600 hover:text-white transition-colors"><GripVerticalIcon className="h-4 w-4" /></div>}
                                        <div className="flex-grow flex items-center cursor-pointer truncate" onClick={() => toggleProjectExpansion(project.id)}>
                                            <ChevronDownIcon className={`h-3.5 w-3.5 mr-2 sm:mr-3 transition-transform duration-500 ${isExpanded ? 'rotate-0' : '-rotate-90 text-indigo-400'}`} />
                                            <FolderIcon className="h-5 w-5 mr-2 sm:mr-3 text-indigo-500 shrink-0 opacity-80" />
                                            <span className="truncate">{project.name}</span>
                                        </div>
                                    </div>
                                    {visibleColumnWidths.department > 0 && <div style={{ width: visibleColumnWidths.department }} className="border-l border-gray-800/40" />}
                                    {visibleColumnWidths.author > 0 && <div style={{ width: visibleColumnWidths.author }} className="relative flex items-center justify-center border-l border-gray-800/40"><button onClick={(e) => { e.stopPropagation(); onAddTaskClick(project.id); }} className="p-2 rounded-xl text-gray-600 hover:bg-gray-800 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all active:scale-90"><PlusIcon className="h-5 w-5" /></button></div>}
                                    {visibleColumnWidths.progress > 0 && <div style={{ width: visibleColumnWidths.progress }} className="relative border-l border-gray-800/60 flex items-center justify-center gap-3"><span className="text-[11px] font-black text-indigo-400/70 group-hover:opacity-0 transition-opacity tracking-widest">{averageProgress}%</span><div className="absolute inset-0 flex items-center justify-center gap-2.5 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); onEditProject(project); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-white transition-all"><PencilIcon className="h-4 w-4" /></button><button onClick={(e) => { e.stopPropagation(); onDeleteProject(project); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-red-400 transition-all"><TrashIcon className="h-4 w-4" /></button></div></div>}
                                </div>
                                <div className="relative flex-grow h-full bg-indigo-500/[0.01]">
                                    <ProjectBar project={project} viewStartDate={viewStartDate} dayWidth={uiSettings.dayWidth} barHeight={uiSettings.projectBarHeight} fontSize={uiSettings.fontSize} />
                                </div>
                            </div>
                            {isExpanded && project.tasks.map(task => {
                                const employee = employeeMap.get(task.employeeId);
                                const department = employee ? departmentMap.get(employee.departmentId) : undefined;
                                const startDate = new Date(task.startDate); const endDate = new Date(task.endDate);
                                const startOffsetDays = getDaysBetween(viewStartDate, startDate) - 1;
                                const durationDays = getDaysBetween(startDate, endDate);
                                const left = startOffsetDays * uiSettings.dayWidth;
                                const width = durationDays * uiSettings.dayWidth - 4;
                                const rightEdgePosition = (left as number) + (width as number);
                                if (task.progress === 100 && rightEdgePosition < scrollLeft) return null;
                                return (
                                    <div className="flex group border-b border-gray-800/20 last:border-0 hover:bg-white/[0.02] transition-colors" style={{ height: uiSettings.rowHeight }} key={task.id}>
                                        <div style={{ width: sidebarWidth, minWidth: sidebarWidth }} className="flex border-r border-gray-800 sticky left-0 z-10 bg-gray-900/90 backdrop-blur-md shadow-lg">
                                            <div style={{ width: visibleColumnWidths.project }} className="flex items-center px-4 pl-10 sm:pl-12 truncate cursor-pointer" onClick={() => onEditTask(task, project.id)}><p className="text-gray-400 font-bold truncate tracking-tight transition-colors group-hover:text-white" style={{ fontSize: uiSettings.fontSize }}>{task.name}</p></div>
                                            {visibleColumnWidths.department > 0 && <div style={{ width: visibleColumnWidths.department }} className="flex items-center px-5 border-l border-gray-800/30 truncate"><p className="text-gray-600 text-[10px] font-black uppercase tracking-wider truncate">{department?.name}</p></div>}
                                            {visibleColumnWidths.author > 0 && <div style={{ width: visibleColumnWidths.author }} className="flex items-center px-5 border-l border-gray-800/30 truncate"><p className="text-gray-500 text-[11px] font-bold truncate">{employee?.name}</p></div>}
                                            {visibleColumnWidths.progress > 0 && <div style={{ width: visibleColumnWidths.progress }} className="flex items-center justify-center px-5 border-l border-gray-800/30"><div className="flex items-center group-hover:hidden"><span className="text-[10px] font-black text-gray-600 tracking-tighter">{task.progress}%</span></div><div className="hidden items-center gap-2 group-hover:flex"><button onClick={(e) => { e.stopPropagation(); onEditTask(task, project.id); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-white transition-all"><PencilIcon className="h-4 w-4" /></button><button onClick={(e) => { e.stopPropagation(); onDeleteTask(task, project.id); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-800 hover:text-red-400 transition-all"><TrashIcon className="h-4 w-4" /></button></div></div>}
                                        </div>
                                        <div className="relative flex-grow h-full">
                                            <TaskBar task={task} viewStartDate={viewStartDate} onProgressChange={(np) => onTaskProgressChange(project.id, task.id, np)} employeeMap={employeeMap} departmentMap={departmentMap} dayWidth={uiSettings.dayWidth} barHeight={uiSettings.taskBarHeight} fontSize={uiSettings.fontSize} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )})}
                </div>
            </div>
        </div>
    );
};

const App: FC = () => {
    // State
    const [projects, setProjects] = useState<Project[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [filter, setFilter] = useState({ departmentId: 'all', employeeId: 'all' });
    const [viewStartDate, setViewStartDate] = useState<Date>(new Date());
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
    const [isLoading, setIsLoading] = useState(true);

    // UI Settings
    const [uiSettings, setUiSettings] = useState<UISettings>(() => {
        const saved = localStorage.getItem(SETTINGS_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    });
    const [columnWidths, setColumnWidths] = useState(() => {
        const saved = localStorage.getItem(GANTT_COLUMN_WIDTHS_KEY);
        return saved ? JSON.parse(saved) : DEFAULT_COLUMN_WIDTHS;
    });

    // Modals
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [projectModal, setProjectModal] = useState<{ open: boolean; project: Project | null }>({ open: false, project: null });
    const [taskModal, setTaskModal] = useState<{ open: boolean; task: Task | null; projectId: string | null }>({ open: false, task: null, projectId: null });
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; type: 'project' | 'task'; id: string; subId?: string; title: string; message: string }>({ open: false, type: 'project', id: '', title: '', message: '' });
    
    const [isOnline, setIsOnline] = useState(isSupabaseEnabled());

    // Computed
    const todayString = formatDate(new Date());
    
    const timelineDates = useMemo(() => {
        const dates = [];
        for (let i = 0; i < NUMBER_OF_DAYS_IN_VIEW; i++) {
            dates.push(addDays(viewStartDate, i));
        }
        return dates;
    }, [viewStartDate]);

    // Initial Data Load
    const loadData = useCallback(async () => {
        try {
            const [loadedProjects, loadedDepartments, loadedEmployees] = await Promise.all([getProjects(), getDepartments(), getEmployees()]);
            setProjects(loadedProjects); setDepartments(loadedDepartments); setEmployees(loadedEmployees);
            setExpandedProjects(prev => {
                if (Object.keys(prev).length === 0) {
                    return Object.fromEntries(loadedProjects.map(p => [p.id, true]));
                }
                return prev;
            });
            // Load remote UI settings if connected
            const remoteSettings = await getRemoteSettings('ui_settings');
            if (remoteSettings) {
                setUiSettings(remoteSettings);
            }
        } finally { setIsLoading(false); }
    }, []);

    // Check for URL config on mount
    useEffect(() => {
        const hasUrlConfig = initSupabaseFromUrl();
        if (hasUrlConfig) {
            setIsOnline(true);
        }
        loadData();
    }, [loadData]);

    // Realtime Subscription
    useEffect(() => {
        if (isSupabaseEnabled()) {
            const unsubscribe = subscribeToChanges(() => {
                loadData();
            });
            return () => { unsubscribe(); };
        }
    }, [loadData]);

    const { employeeMap, departmentMap } = useMemo(() => {
        const eMap = new Map(employees.map(e => [e.id, e]));
        const dMap = new Map(departments.map(d => [d.id, d]));
        return { employeeMap: eMap, departmentMap: dMap };
    }, [employees, departments]);

    const filteredProjects = useMemo(() => {
        if (filter.departmentId === 'all' && filter.employeeId === 'all') return projects;
        return projects.map(p => {
             const filteredTasks = p.tasks.filter(t => {
                 const emp = employeeMap.get(t.employeeId);
                 if (!emp) return false;
                 if (filter.departmentId !== 'all' && emp.departmentId !== filter.departmentId) return false;
                 if (filter.employeeId !== 'all' && emp.id !== filter.employeeId) return false;
                 return true;
             });
             return { ...p, tasks: filteredTasks };
        }).filter(p => p.tasks.length > 0);
    }, [projects, filter, employeeMap]);

    // Effects for saving settings
    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(uiSettings));
    }, [uiSettings]);

    useEffect(() => {
        localStorage.setItem(GANTT_COLUMN_WIDTHS_KEY, JSON.stringify(columnWidths));
    }, [columnWidths]);

    const fetchData = async () => {
        try {
            const [p, d, e] = await Promise.all([getProjects(), getDepartments(), getEmployees()]);
            setProjects(p);
            setDepartments(d);
            setEmployees(e);
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        const start = new Date();
        start.setDate(start.getDate() - 2);
        start.setHours(0,0,0,0);
        setViewStartDate(start);
        fetchData();
        const unsubscribe = subscribeToChanges(() => fetchData());
        return () => { unsubscribe(); };
    }, []);

    // Handlers
    const handleSaveSupabase = async (url: string, key: string) => {
        setIsLoading(true);
        initSupabase(url, key);
        setIsOnline(isSupabaseEnabled());
        
        try {
            await checkConnectionAndSeed();
            // Connected successfully: Save current UI settings to DB as baseline if valid
            if (uiSettings) {
                await saveRemoteSettings('ui_settings', uiSettings);
            }
            await fetchData();
        } catch (e: any) {
            console.error(e);
            if (e.message === 'TABLES_MISSING') {
                alert('데이터베이스 테이블이 없습니다. 설정 메뉴의 "1. SQL 스크립트 복사"를 눌러 Supabase SQL Editor에서 실행해주세요.');
                setIsSettingsOpen(true);
            } else {
                alert('데이터베이스 연결 실패: ' + e.message);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    // Auto-save UI settings to DB if online
    const handleUiSettingsChange = (newSettings: UISettings) => {
        setUiSettings(newSettings);
        if (isOnline) {
            saveRemoteSettings('ui_settings', newSettings);
        }
    };

    const handleProjectSubmit = async (name: string) => {
        try {
            if (projectModal.project) {
                await updateProject(projectModal.project.id, name);
            } else {
                await addProject(name);
            }
            await fetchData();
            setProjectModal({ open: false, project: null });
        } catch (e) { console.error(e); alert('Error saving project'); }
    };

    const handleTaskSubmit = async (data: { name: string; employeeId: string; startDate: string; duration: number; description: string }) => {
        if (!taskModal.projectId) return;
        try {
            const start = new Date(data.startDate);
            const end = addDays(start, data.duration - 1); 
            
            if (taskModal.task) {
                await updateTask(taskModal.projectId, taskModal.task.id, {
                    name: data.name,
                    employeeId: data.employeeId,
                    startDate: start,
                    endDate: end,
                    description: data.description
                });
            } else {
                await addTask(taskModal.projectId, {
                    name: data.name,
                    employeeId: data.employeeId,
                    startDate: start,
                    endDate: end,
                    description: data.description
                });
            }
            await fetchData();
            setTaskModal({ open: false, task: null, projectId: null });
        } catch (e) { console.error(e); alert('Error saving task'); }
    };

    const handleDelete = async () => {
        try {
            if (confirmModal.type === 'project') {
                await deleteProject(confirmModal.id);
            } else if (confirmModal.type === 'task' && confirmModal.subId) {
                await deleteTask(confirmModal.id, confirmModal.subId);
            }
            await fetchData();
            setConfirmModal({ ...confirmModal, open: false });
        } catch(e) { console.error(e); alert('Error deleting'); }
    };

    const handleProgressChange = async (projectId: string, taskId: string, progress: number) => {
        setProjects(prev => prev.map(p => {
            if (p.id !== projectId) return p;
            return { ...p, tasks: p.tasks.map(t => t.id === taskId ? { ...t, progress } : t) };
        }));
        try {
            await updateTask(projectId, taskId, { progress });
        } catch (e) { console.error(e); fetchData(); }
    };

    const toggleProjectExpansion = (pid: string) => {
        setExpandedProjects(prev => {
            const current = prev[pid] ?? true;
            return { ...prev, [pid]: !current };
        });
    };

    const handleReorderProjects = async (draggedId: string, targetId: string) => {
        if (draggedId === targetId) return;
        const draggedIndex = projects.findIndex(p => p.id === draggedId);
        const targetIndex = projects.findIndex(p => p.id === targetId);
        if (draggedIndex === -1 || targetIndex === -1) return;
        const newProjects = [...projects];
        const [removed] = newProjects.splice(draggedIndex, 1);
        newProjects.splice(targetIndex, 0, removed);
        setProjects(newProjects);
        await updateProjects(newProjects);
    };

    const handleOpenSettings = () => {
        if (hasAdminPassword()) {
            setIsAuthModalOpen(true);
        } else {
            setIsSettingsOpen(true);
        }
    };

    if (isLoading) return <div className="bg-gray-950 text-white min-h-screen flex flex-col items-center justify-center font-sans tracking-tight"><div className="w-16 h-16 border-[6px] border-indigo-600 border-t-transparent rounded-full animate-spin mb-6 shadow-[0_0_40px_rgba(79,70,229,0.4)]" /><div className="text-2xl font-black animate-pulse text-indigo-300 tracking-tighter uppercase">DAHYUN GANTT IS LOADING...</div></div>;

    return (
        <div className="flex flex-col h-screen bg-gray-950 text-gray-200 overflow-hidden font-sans selection:bg-indigo-500/30">
            <Header 
                departments={departments}
                filter={filter}
                setFilter={setFilter}
                viewStartDate={viewStartDate}
                setViewStartDate={setViewStartDate}
                onOpenSettings={handleOpenSettings}
                isOnline={isOnline}
            />
            <main className="flex-grow p-2 sm:p-4 overflow-hidden flex flex-col">
                <GanttView
                    projects={filteredProjects}
                    timelineDates={timelineDates}
                    viewStartDate={viewStartDate}
                    todayString={todayString}
                    employeeMap={employeeMap}
                    departmentMap={departmentMap}
                    expandedProjects={expandedProjects}
                    toggleProjectExpansion={toggleProjectExpansion}
                    onAddTaskClick={(pid) => setTaskModal({ open: true, task: null, projectId: pid })}
                    onAddProjectClick={() => setProjectModal({ open: true, project: null })}
                    onTaskProgressChange={handleProgressChange}
                    onEditProject={(p) => setProjectModal({ open: true, project: p })}
                    onDeleteProject={(p) => setConfirmModal({ open: true, type: 'project', id: p.id, title: '프로젝트 삭제', message: `"${p.name}" 프로젝트와 포함된 모든 태스크를 삭제하시겠습니까?` })}
                    onEditTask={(t, pid) => setTaskModal({ open: true, task: t, projectId: pid })}
                    onDeleteTask={(t, pid) => setConfirmModal({ open: true, type: 'task', id: pid, subId: t.id, title: '태스크 삭제', message: `"${t.name}" 태스크를 삭제하시겠습니까?` })}
                    columnWidths={columnWidths}
                    setColumnWidths={setColumnWidths}
                    onReorderProjects={handleReorderProjects}
                    uiSettings={uiSettings}
                />
            </main>

            {/* Modals */}
            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={uiSettings} setSettings={handleUiSettingsChange} onSaveSupabase={handleSaveSupabase} />
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onSuccess={() => setIsSettingsOpen(true)} />
            <ProjectModal isOpen={projectModal.open} onClose={() => setProjectModal({ open: false, project: null })} onSubmit={handleProjectSubmit} project={projectModal.project} />
            <TaskModal isOpen={taskModal.open} onClose={() => setTaskModal({ open: false, task: null, projectId: null })} onSubmit={handleTaskSubmit} employees={employees} task={taskModal.task || undefined} project={projects.find(p => p.id === taskModal.projectId) || null} />
            <ConfirmationModal isOpen={confirmModal.open} onClose={() => setConfirmModal({ ...confirmModal, open: false })} onConfirm={handleDelete} title={confirmModal.title} message={confirmModal.message} />
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<React.StrictMode><App /></React.StrictMode>);
