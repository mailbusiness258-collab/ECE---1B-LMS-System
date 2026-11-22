import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock,
  MapPin,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { ECE1B_SUBJECTS } from '../lib/ece1bCatalog';
import {
  Announcement,
  ClassTask,
  InteractiveQuiz,
  PORTAL_EMBLEM_SRC,
  ScheduleSlot,
  TabKey,
  UserProfile,
} from '../types';

interface HomeViewProps {
  profile: UserProfile;
  isAdmin: boolean;
  officerTitle?: string;
  tasks: ClassTask[];
  completedTaskIds: Set<string>;
  announcements: Announcement[];
  quizzes: InteractiveQuiz[];
  scheduleSlots: ScheduleSlot[];
  rosterCount: number;
  onOpenEditProfile: () => void;
  onToggleTask: (taskId: string, nextCompleted: boolean) => Promise<void>;
  onCreateAnnouncement: (payload: {
    title: string;
    body: string;
    category: 'General' | 'Exam' | 'Urgent' | 'Event';
    pinned: boolean;
  }) => Promise<void>;
  onDeleteAnnouncement: (id: string) => Promise<void>;
  onNavigate: (tab: TabKey) => void;
}

function formatCountdown(targetDate: Date, nowMs: number): string {
  const diffMs = Math.max(0, targetDate.getTime() - nowMs);
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDueDate(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const JS_DAY_TO_SCHEDULE: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | null> = [
  null, // Sun
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

export const HomeView: React.FC<HomeViewProps> = ({
  profile,
  isAdmin,
  officerTitle,
  tasks,
  completedTaskIds,
  announcements,
  quizzes,
  scheduleSlots,
  rosterCount,
  onOpenEditProfile,
  onToggleTask,
  onCreateAnnouncement,
  onDeleteAnnouncement,
  onNavigate,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annCategory, setAnnCategory] = useState<'General' | 'Exam' | 'Urgent' | 'Event'>('General');
  const [annPinned, setAnnPinned] = useState(false);
  const [postingAnn, setPostingAnn] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const today = new Date(nowMs);
  const formattedToday = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const upcomingTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.dueAt.getTime() >= nowMs - 3600 * 1000)
        .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    [tasks, nowMs]
  );

  const pendingTasksCount = tasks.filter((t) => !completedTaskIds.has(t.id)).length;
  const nextUpTask =
    upcomingTasks.find((t) => !completedTaskIds.has(t.id)) || upcomingTasks[0] || null;

  const threeDaysFromNow = nowMs + 3 * 24 * 3600 * 1000;
  const dueSoonTasks = upcomingTasks.filter((t) => t.dueAt.getTime() <= threeDaysFromNow);

  const activeDayKey = JS_DAY_TO_SCHEDULE[today.getDay()] || 'Mon';
  const isSundayPreview = JS_DAY_TO_SCHEDULE[today.getDay()] === null;

  const todaysClasses = useMemo(
    () =>
      scheduleSlots
        .filter((s) => s.day === activeDayKey)
        .sort((a, b) => a.sortMinutes - b.sortMinutes),
    [scheduleSlots, activeDayKey]
  );

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return 0;
      }),
    [announcements]
  );

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) return;
    setPostingAnn(true);
    try {
      await onCreateAnnouncement({
        title: annTitle.trim(),
        body: annBody.trim(),
        category: annCategory,
        pinned: annPinned,
      });
      setAnnTitle('');
      setAnnBody('');
      setAnnCategory('General');
      setAnnPinned(false);
      setShowAnnouncementModal(false);
    } finally {
      setPostingAnn(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Dark Chalkboard Command Hero with New ECE 1B Artwork */}
      <section className="bg-[#14131D] text-white rounded-2xl border border-[#2B283C] p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-7 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden border border-[#35314B] shrink-0 bg-[#1F1D2C]">
            <img
              src={PORTAL_EMBLEM_SRC}
              alt="ECE 1B Announcement Board Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="min-w-0 space-y-2">
            <div className="text-xs text-[#C4B5FD] font-medium">
              Bulacan State University · BS Electronics Engineering · 2nd Sem AY 2026–2027
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Welcome, {profile.fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#B6B2C8]">
              <span>{formattedToday}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-[#FBBF24]">
                {profile.studentId || 'Student No. not set'}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {isAdmin ? officerTitle || 'Class Officer' : `${profile.enrollmentType} Student`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => onNavigate('reviewer')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] transition-colors cursor-pointer"
              >
                Open Reviewer & Quizzes
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenEditProfile}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#222030] border border-[#38344E] text-xs font-semibold text-[#E5E1EE] hover:bg-[#2C293D] transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Profile
              </button>
            </div>
          </div>
        </div>

        {/* Right: Next Up Countdown Module */}
        <div className="lg:col-span-5 bg-[#1F1D2C] border border-[#35314B] rounded-xl p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono font-semibold text-[#FBBF24] uppercase tracking-wider">
              Next Deadline
            </span>
            {nextUpTask && (
              <span className="font-mono text-[#C4B5FD]">{nextUpTask.subject}</span>
            )}
          </div>

          {nextUpTask ? (
            <div className="mt-3">
              <div className="font-display text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                {formatCountdown(nextUpTask.dueAt, nowMs)}
              </div>
              <h2 className="text-sm font-semibold text-[#EAE7F5] mt-1.5 line-clamp-1">
                {nextUpTask.title}
              </h2>
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-[#322E47] text-xs text-[#B6B2C8]">
                <span className="tabular-nums">{formatDueDate(nextUpTask.dueAt)}</span>
                <button
                  type="button"
                  onClick={() => onNavigate('todo')}
                  className="font-semibold text-[#C4B5FD] hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  All tasks
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <div className="font-display text-xl font-bold text-white">All Caught Up</div>
              <p className="text-xs text-[#B6B2C8] mt-1">
                No upcoming tasks or expected quizzes on the calendar.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 4-Column Academic KPI Strip */}
      <section
        aria-label="Class summary metrics"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3.5"
      >
        <div className="bg-white border border-[#E5E1EE] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#615D75]">
            {isSundayPreview ? 'Monday Classes' : `${activeDayKey} Classes`}
          </div>
          <div className="font-display text-2xl font-bold text-[#14131D] mt-1 tabular-nums">
            {todaysClasses.length}
          </div>
          <div className="text-[11px] text-[#7A7690] mt-0.5">12 subjects · 29 units</div>
        </div>

        <div className="bg-white border border-[#E5E1EE] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#615D75]">Pending Tasks</div>
          <div className="font-display text-2xl font-bold text-[#5B21B6] mt-1 tabular-nums">
            {pendingTasksCount}
          </div>
          <div className="text-[11px] text-[#7A7690] mt-0.5 tabular-nums">
            {dueSoonTasks.length} due within 72h
          </div>
        </div>

        <div className="bg-white border border-[#E5E1EE] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#615D75]">Interactive Quizzes</div>
          <div className="font-display text-2xl font-bold text-[#14131D] mt-1 tabular-nums">
            {quizzes.length}
          </div>
          <div className="text-[11px] text-[#7A7690] mt-0.5">Ready for review</div>
        </div>

        <div className="bg-white border border-[#E5E1EE] rounded-2xl p-4">
          <div className="text-xs font-medium text-[#615D75]">ECE 1B Roster</div>
          <div className="font-display text-2xl font-bold text-[#14131D] mt-1 tabular-nums">
            {rosterCount}
          </div>
          <div className="text-[11px] text-[#7A7690] mt-0.5">Official block directory</div>
        </div>
      </section>

      {/* Main 2-Column Command Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Today's Schedule + 12 Enrolled COR Subjects */}
        <div className="lg:col-span-7 space-y-6">
          {/* Today's COR Schedule */}
          <section className="bg-white border border-[#E5E1EE] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#EFECE6]">
              <div>
                <h2 className="font-display text-base font-bold text-[#14131D]">
                  {isSundayPreview
                    ? 'Monday Schedule Preview'
                    : `Schedule for ${activeDayKey}`}
                </h2>
                <p className="text-xs text-[#615D75] mt-0.5">
                  From BulSU ECE 1B Certificate of Registration
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('kiosk')}
                className="text-xs font-semibold text-[#5B21B6] hover:underline cursor-pointer whitespace-nowrap"
              >
                Full week
              </button>
            </div>

            {todaysClasses.length === 0 ? (
              <p className="text-sm text-[#615D75] py-6 text-center">
                No classes scheduled for {activeDayKey}.
              </p>
            ) : (
              <ul className="divide-y divide-[#F1EEF7]">
                {todaysClasses.map((slot) => (
                  <li
                    key={slot.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-[#615D75]">
                        <span className="font-mono font-bold text-[#5B21B6]">
                          {slot.courseCode}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{slot.kind}</span>
                        {slot.instructor && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{slot.instructor}</span>
                          </>
                        )}
                      </div>
                      <div className="text-sm font-semibold text-[#14131D] mt-0.5">
                        {slot.courseTitle}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 text-xs shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono font-medium text-[#14131D] tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-[#7A7690]" />
                        {slot.startTime} – {slot.endTime}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[#615D75]">
                        <MapPin className="w-3 h-3 text-[#7A7690]" />
                        {slot.room || 'TBA'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 12 Official Subjects Directory */}
          <section className="bg-white border border-[#E5E1EE] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3.5 border-b border-[#EFECE6]">
              <div>
                <h2 className="font-display text-base font-bold text-[#14131D]">
                  Enrolled Subjects (12)
                </h2>
                <p className="text-xs text-[#615D75] mt-0.5">
                  2nd Semester AY 2026–2027 · 29 Total Units
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('kiosk')}
                className="text-xs font-semibold text-[#5B21B6] hover:underline cursor-pointer"
              >
                Course load
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4">
              {ECE1B_SUBJECTS.map((subj) => (
                <button
                  key={subj.code}
                  type="button"
                  onClick={() => onNavigate('reviewer')}
                  className="text-left p-3 rounded-xl border border-[#ECE8F4] hover:border-[#5B21B6]/50 hover:bg-[#FAF8FE] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-[#5B21B6]">{subj.code}</span>
                    <span className="text-[11px] text-[#7A7690] tabular-nums">
                      {subj.creditUnits}u
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[#14131D] truncate mt-0.5">
                    {subj.title}
                  </div>
                  <div className="text-[11px] text-[#615D75] truncate mt-0.5">
                    {subj.instructor}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Due Soon + Announcements */}
        <div className="lg:col-span-5 space-y-6">
          {/* Due in next 3 days */}
          <section className="bg-white border border-[#E5E1EE] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFECE6]">
              <h2 className="font-display text-base font-bold text-[#14131D]">
                Due in Next 72 Hours
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('todo')}
                className="text-xs font-semibold text-[#5B21B6] hover:underline cursor-pointer"
              >
                Open To-Do
              </button>
            </div>

            {dueSoonTasks.length === 0 ? (
              <p className="text-sm text-[#615D75] py-5">No deadlines within the next 3 days.</p>
            ) : (
              <ul className="divide-y divide-[#F1EEF7] mt-1">
                {dueSoonTasks.map((task) => {
                  const done = completedTaskIds.has(task.id);
                  return (
                    <li key={task.id} className="py-3 flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleTask(task.id, !done)}
                        className="flex items-start gap-3 text-left min-w-0 flex-1 cursor-pointer group"
                      >
                        <span
                          className={`mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            done
                              ? 'bg-[#5B21B6] border-[#5B21B6] text-white'
                              : 'border-[#C9C3D8] group-hover:border-[#5B21B6]'
                          }`}
                        >
                          {done && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <div className="font-mono text-[11px] font-semibold text-[#5B21B6]">
                            {task.subject} · {task.type}
                          </div>
                          <div
                            className={`text-sm font-medium mt-0.5 ${
                              done ? 'line-through text-[#8E8AA3]' : 'text-[#14131D]'
                            }`}
                          >
                            {task.title}
                          </div>
                        </div>
                      </button>
                      <span className="text-[11px] font-mono text-[#615D75] whitespace-nowrap shrink-0 tabular-nums pt-0.5">
                        {formatDueDate(task.dueAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Announcements */}
          <section className="bg-white border border-[#E5E1EE] rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#EFECE6] gap-3">
              <div className="flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-[#5B21B6]" />
                <h2 className="font-display text-base font-bold text-[#14131D]">
                  Announcements
                </h2>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#5B21B6] text-white text-xs font-semibold hover:bg-[#4C1D95] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Post Notice
                </button>
              )}
            </div>

            {sortedAnnouncements.length === 0 ? (
              <p className="text-sm text-[#615D75] py-5">No announcements posted yet.</p>
            ) : (
              <ul className="divide-y divide-[#F1EEF7] mt-1">
                {sortedAnnouncements.slice(0, 5).map((ann) => (
                  <li key={ann.id} className="py-3.5 last:pb-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-[#615D75]">
                          {ann.pinned && (
                            <span className="inline-flex items-center gap-1 font-semibold text-[#5B21B6]">
                              <Pin className="w-3 h-3" />
                              Pinned
                            </span>
                          )}
                          {ann.pinned && <span aria-hidden="true">·</span>}
                          <span className="font-semibold text-[#D97706]">{ann.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{ann.authorName}</span>
                        </div>
                        <h3 className="text-sm font-semibold text-[#14131D] mt-1">
                          {ann.title}
                        </h3>
                        <p className="text-xs text-[#615D75] mt-1 leading-relaxed whitespace-pre-line">
                          {ann.body}
                        </p>
                      </div>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDeleteAnnouncement(ann.id)}
                          aria-label={`Delete ${ann.title}`}
                          className="p-1.5 rounded-lg text-[#8E8AA3] hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Post Announcement Modal */}
      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E1EE] rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFECE6]">
              <h2 className="font-display text-lg font-bold text-[#14131D]">
                Post Class Announcement
              </h2>
              <button
                type="button"
                onClick={() => setShowAnnouncementModal(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615D75] hover:bg-[#F3F1F8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePostAnnouncement} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm focus:outline-none focus:border-[#5B21B6]"
                  placeholder="Room change or exam advisory"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                    Category
                  </label>
                  <select
                    value={annCategory}
                    onChange={(e) =>
                      setAnnCategory(e.target.value as 'General' | 'Exam' | 'Urgent' | 'Event')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm bg-white focus:outline-none focus:border-[#5B21B6]"
                  >
                    <option value="General">General</option>
                    <option value="Exam">Exam</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Event">Event</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2E2B3E] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={annPinned}
                      onChange={(e) => setAnnPinned(e.target.checked)}
                      className="rounded border-[#DCD7E8] accent-[#5B21B6]"
                    />
                    Pin announcement
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                  Message
                </label>
                <textarea
                  required
                  rows={4}
                  maxLength={4000}
                  value={annBody}
                  onChange={(e) => setAnnBody(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm focus:outline-none focus:border-[#5B21B6]"
                  placeholder="Write details for ECE 1B students..."
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAnnouncementModal(false)}
                  className="px-4 py-2 rounded-xl border border-[#DCD7E8] text-xs font-semibold text-[#2E2B3E] hover:bg-[#F7F6F9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={postingAnn}
                  className="px-5 py-2 rounded-xl bg-[#5B21B6] text-white text-xs font-semibold hover:bg-[#4C1D95] disabled:opacity-60 cursor-pointer"
                >
                  {postingAnn ? 'Posting...' : 'Publish Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
