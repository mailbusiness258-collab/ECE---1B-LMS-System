import React, { useMemo, useState } from 'react';
import { CalendarClock, Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { ECE1B_SUBJECTS } from '../lib/ece1bCatalog';
import { ClassTask } from '../types';

interface TodoViewProps {
  tasks: ClassTask[];
  completedTaskIds: Set<string>;
  isAdmin: boolean;
  onToggleTask: (taskId: string, nextCompleted: boolean) => Promise<void>;
  onCreateTask: (payload: {
    title: string;
    subject: string;
    type: 'Quiz' | 'Assignment' | 'Exam' | 'Requirement';
    description: string;
    dueAt: Date;
  }) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    payload: {
      title: string;
      subject: string;
      type: 'Quiz' | 'Assignment' | 'Exam' | 'Requirement';
      description: string;
      dueAt: Date;
    }
  ) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
}

type FilterMode = 'upcoming' | 'due_soon' | 'completed' | 'all';

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export const TodoView: React.FC<TodoViewProps> = ({
  tasks,
  completedTaskIds,
  isAdmin,
  onToggleTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}) => {
  const [filter, setFilter] = useState<FilterMode>('upcoming');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(ECE1B_SUBJECTS[5].code); // COE 104 default
  const [type, setType] = useState<'Quiz' | 'Assignment' | 'Exam' | 'Requirement'>('Assignment');
  const [description, setDescription] = useState('');
  const [dueAtInput, setDueAtInput] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 48 * 3600 * 1000))
  );
  const [saving, setSaving] = useState(false);

  const subjects = useMemo(() => {
    const set = new Set<string>(ECE1B_SUBJECTS.map((s) => s.code));
    tasks.forEach((t) => set.add(t.subject));
    return ['ALL', ...Array.from(set)];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const threeDays = now + 3 * 24 * 3600 * 1000;
    const q = searchQuery.trim().toLowerCase();

    return [...tasks]
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .filter((task) => {
        const done = completedTaskIds.has(task.id);
        if (filter === 'upcoming' && done) return false;
        if (
          filter === 'due_soon' &&
          (done || task.dueAt.getTime() > threeDays || task.dueAt.getTime() < now - 3600 * 1000)
        ) {
          return false;
        }
        if (filter === 'completed' && !done) return false;
        if (subjectFilter !== 'ALL' && task.subject !== subjectFilter) return false;
        if (q) {
          const haystack = `${task.title} ${task.subject} ${task.description} ${task.type}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
  }, [tasks, completedTaskIds, filter, subjectFilter, searchQuery]);

  const openCreateModal = () => {
    setEditingTaskId(null);
    setTitle('');
    setSubject(ECE1B_SUBJECTS[5].code);
    setType('Assignment');
    setDescription('');
    setDueAtInput(toLocalInputValue(new Date(Date.now() + 48 * 3600 * 1000)));
    setModalOpen(true);
  };

  const openEditModal = (task: ClassTask) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setSubject(task.subject);
    setType(task.type);
    setDescription(task.description);
    setDueAtInput(toLocalInputValue(task.dueAt));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !subject.trim() || !dueAtInput) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim().slice(0, 180),
        subject: subject.trim().slice(0, 40),
        type,
        description: description.trim().slice(0, 2000),
        dueAt: new Date(dueAtInput),
      };
      if (editingTaskId) {
        await onUpdateTask(editingTaskId, payload);
      } else {
        await onCreateTask(payload);
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const completedCount = tasks.filter((t) => completedTaskIds.has(t.id)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B162B]">
            Assignments & Deadlines
          </h1>
          <p className="text-sm text-[#615A78] mt-1 tabular-nums">
            {completedCount} of {tasks.length} items marked done
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Assignment or Deadline
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-[#E4DEF2] rounded-2xl p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#F3EFFA] rounded-xl overflow-x-auto">
          {(
            [
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'due_soon', label: 'Next 72h' },
              { id: 'completed', label: 'Completed' },
              { id: 'all', label: 'All' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-white text-[#6D28D9] shadow-xs'
                  : 'text-[#615A78] hover:text-[#1B162B]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-[#8E86A8] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DDD5EC] text-xs focus:outline-none focus:border-[#6D28D9]"
            />
          </div>

          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs font-medium bg-white focus:outline-none focus:border-[#6D28D9]"
          >
            {subjects.map((sub) => (
              <option key={sub} value={sub}>
                {sub === 'ALL' ? 'All Subjects' : sub}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarClock className="w-8 h-8 text-[#8E86A8] mx-auto" />
            <h2 className="font-display text-base font-bold text-[#1B162B] mt-3">
              No tasks match this filter
            </h2>
            <p className="text-xs text-[#615A78] mt-1">
              Switch filters above or wait for class officers to post new deadlines.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#F3EFFA]">
            {filteredTasks.map((task) => {
              const done = completedTaskIds.has(task.id);
              const isOverdue = !done && task.dueAt.getTime() < Date.now();
              return (
                <li
                  key={task.id}
                  className="p-4 sm:px-6 sm:py-5 flex items-start justify-between gap-4 hover:bg-[#FAF8FE] transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id, !done)}
                      aria-label={done ? `Mark ${task.title} incomplete` : `Mark ${task.title} complete`}
                      className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                        done
                          ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
                          : 'border-[#CBC1DF] hover:border-[#6D28D9]'
                      }`}
                    >
                      {done && <Check className="w-4 h-4" />}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#615A78]">
                        <span className="font-mono font-bold text-[#6D28D9]">{task.subject}</span>
                        <span aria-hidden="true">·</span>
                        <span>{task.type}</span>
                        {isOverdue && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-red-700">Overdue</span>
                          </>
                        )}
                      </div>
                      <h3
                        className={`text-sm sm:text-base font-semibold mt-1 ${
                          done ? 'line-through text-[#9A93B2]' : 'text-[#1B162B]'
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.description && (
                        <p className="text-xs text-[#615A78] mt-1 leading-relaxed max-w-2xl">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs font-mono font-medium text-[#2E2744] tabular-nums whitespace-nowrap">
                      {task.dueAt.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </span>
                    {isAdmin && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          aria-label={`Edit ${task.title}`}
                          className="p-1.5 rounded-lg text-[#615A78] hover:text-[#6D28D9] hover:bg-[#F3EFFA] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={`Delete ${task.title}`}
                          className="p-1.5 rounded-lg text-[#615A78] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Create/Edit Task Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">
                {editingTaskId ? 'Edit Deadline' : 'Add Assignment or Deadline'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={180}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
                  placeholder="Lab Sheet 02: Vector Fields"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Subject Code
                  </label>
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono bg-white focus:outline-none focus:border-[#6D28D9]"
                  >
                    {ECE1B_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.title}
                      </option>
                    ))}
                    <option value="ECE 1B Admin">ECE 1B Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Type</label>
                  <select
                    value={type}
                    onChange={(e) =>
                      setType(e.target.value as 'Quiz' | 'Assignment' | 'Exam' | 'Requirement')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white focus:outline-none focus:border-[#6D28D9]"
                  >
                    <option value="Assignment">Assignment</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Exam">Exam</option>
                    <option value="Requirement">Requirement</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Due Date & Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={dueAtInput}
                  onChange={(e) => setDueAtInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Instructions / Notes
                </label>
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
                  placeholder="Submission details, room, or coverage..."
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] hover:bg-[#F5F1FC] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Create Deadline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
