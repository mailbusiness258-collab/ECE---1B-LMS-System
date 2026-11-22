import React, { useMemo, useState } from 'react';
import { Clock, ExternalLink, MapPin, Plus, Trash2, UserCheck, X } from 'lucide-react';
import { ECE1B_SUBJECTS } from '../lib/ece1bCatalog';
import { KioskLink, ScheduleSlot } from '../types';

interface KioskViewProps {
  scheduleSlots: ScheduleSlot[];
  kioskLinks: KioskLink[];
  isAdmin: boolean;
  onCreateSlot: (slot: Omit<ScheduleSlot, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteSlot: (slotId: string) => Promise<void>;
  onCreateLink: (link: Omit<KioskLink, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onDeleteLink: (linkId: string) => Promise<void>;
}

const DAYS: Array<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'> = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return 540;
  let hours = Number(match[1]);
  const mins = Number(match[2]);
  const ampm = (match[3] || '').toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return Math.min(Math.max(hours * 60 + mins, 0), 1440);
}

export const KioskView: React.FC<KioskViewProps> = ({
  scheduleSlots,
  kioskLinks,
  isAdmin,
  onCreateSlot,
  onDeleteSlot,
  onCreateLink,
  onDeleteLink,
}) => {
  const [viewMode, setViewMode] = useState<'schedule' | 'subjects'>('schedule');
  const [selectedDay, setSelectedDay] = useState<'ALL' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>('ALL');
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // Schedule form
  const [day, setDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'>('Mon');
  const [courseCode, setCourseCode] = useState(ECE1B_SUBJECTS[0].code);
  const [courseTitle, setCourseTitle] = useState(ECE1B_SUBJECTS[0].title);
  const [startTime, setStartTime] = useState('08:30 AM');
  const [endTime, setEndTime] = useState('10:00 AM');
  const [room, setRoom] = useState('COE 2 - 506*');
  const [instructor, setInstructor] = useState(ECE1B_SUBJECTS[0].instructor);
  const [kind, setKind] = useState<'Lecture' | 'Lab'>('Lecture');
  const [savingSlot, setSavingSlot] = useState(false);

  // Link form
  const [linkTitle, setLinkTitle] = useState('');
  const [linkSubtitle, setLinkSubtitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('https://');
  const [linkCategory, setLinkCategory] = useState<'Portal' | 'Drive' | 'Reference' | 'Tools'>('Portal');
  const [savingLink, setSavingLink] = useState(false);

  const groupedByDay = useMemo(() => {
    const activeDays = selectedDay === 'ALL' ? DAYS : [selectedDay];
    return activeDays.map((d) => ({
      day: d,
      slots: scheduleSlots
        .filter((s) => s.day === d)
        .sort((a, b) => a.sortMinutes - b.sortMinutes),
    }));
  }, [scheduleSlots, selectedDay]);

  const handleSubjectPick = (code: string) => {
    setCourseCode(code);
    const match = ECE1B_SUBJECTS.find((s) => s.code === code);
    if (match) {
      setCourseTitle(match.title);
      setInstructor(match.instructor);
      setRoom(match.rooms);
      setKind(match.labUnits > 0 ? 'Lab' : 'Lecture');
    }
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseTitle.trim()) return;
    setSavingSlot(true);
    try {
      await onCreateSlot({
        day,
        courseCode: courseCode.trim().slice(0, 30),
        courseTitle: courseTitle.trim().slice(0, 120),
        startTime: startTime.trim().slice(0, 20),
        endTime: endTime.trim().slice(0, 20),
        sortMinutes: parseTimeToMinutes(startTime),
        room: room.trim().slice(0, 60),
        instructor: instructor.trim().slice(0, 100),
        kind,
      });
      setSlotModalOpen(false);
    } finally {
      setSavingSlot(false);
    }
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkTitle.trim() || !/^https?:\/\/.+/.test(linkUrl.trim())) return;
    setSavingLink(true);
    try {
      await onCreateLink({
        title: linkTitle.trim().slice(0, 120),
        subtitle: linkSubtitle.trim().slice(0, 200),
        url: linkUrl.trim().slice(0, 500),
        category: linkCategory,
      });
      setLinkTitle('');
      setLinkSubtitle('');
      setLinkUrl('https://');
      setLinkModalOpen(false);
    } finally {
      setSavingLink(false);
    }
  };

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B162B]">
            Subjects, Schedule & Links
          </h1>
          <p className="text-sm text-[#615A78] mt-1">
            BulSU ECE 1B · 2nd Semester AY 2026–2027 · 12 Enrolled Subjects (29 Units)
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSlotModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Class Slot
            </button>
            <button
              type="button"
              onClick={() => setLinkModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#DDD5EC] bg-white text-[#1B162B] text-xs font-semibold hover:bg-[#F5F1FC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Link
            </button>
          </div>
        )}
      </div>

      {/* View Mode & Day Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#EDE8F7] rounded-xl w-fit">
          <button
            type="button"
            onClick={() => setViewMode('schedule')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              viewMode === 'schedule'
                ? 'bg-white text-[#6D28D9] shadow-xs'
                : 'text-[#615A78] hover:text-[#1B162B]'
            }`}
          >
            Weekly Timetable
          </button>
          <button
            type="button"
            onClick={() => setViewMode('subjects')}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              viewMode === 'subjects'
                ? 'bg-white text-[#6D28D9] shadow-xs'
                : 'text-[#615A78] hover:text-[#1B162B]'
            }`}
          >
            COR Subject Load (12)
          </button>
        </div>

        {viewMode === 'schedule' && (
          <div className="flex items-center gap-1 p-1 bg-[#EDE8F7] rounded-xl overflow-x-auto">
            {(['ALL', ...DAYS] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedDay === d
                    ? 'bg-white text-[#6D28D9] shadow-xs'
                    : 'text-[#615A78] hover:text-[#1B162B]'
                }`}
              >
                {d === 'ALL' ? 'Full Week' : d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weekly Schedule Grid */}
      {viewMode === 'schedule' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupedByDay.map((group) => (
            <section
              key={group.day}
              className="bg-white border border-[#E4DEF2] rounded-2xl p-5 flex flex-col"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#EFEBF7]">
                <h2 className="font-display text-base font-bold text-[#1B162B]">{group.day}</h2>
                <span className="text-xs text-[#615A78] tabular-nums">
                  {group.slots.length} {group.slots.length === 1 ? 'class' : 'classes'}
                </span>
              </div>

              {group.slots.length === 0 ? (
                <p className="text-xs text-[#8E86A8] py-6 text-center">No scheduled classes</p>
              ) : (
                <ul className="divide-y divide-[#F3EFFA] mt-1">
                  {group.slots.map((slot) => (
                    <li key={slot.id} className="py-3.5 first:pt-2.5 last:pb-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-xs text-[#615A78]">
                            <span className="font-mono font-bold text-[#6D28D9]">
                              {slot.courseCode}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{slot.kind}</span>
                          </div>
                          <h3 className="text-sm font-semibold text-[#1B162B] mt-0.5">
                            {slot.courseTitle}
                          </h3>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => onDeleteSlot(slot.id)}
                            aria-label={`Delete ${slot.courseCode}`}
                            className="p-1.5 rounded-lg text-[#8E86A8] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="mt-2 space-y-1 text-xs text-[#615A78]">
                        <div className="flex items-center gap-1.5 tabular-nums font-mono text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-[#8E86A8] shrink-0" />
                          <span>
                            {slot.startTime} – {slot.endTime}
                          </span>
                        </div>
                        {slot.room && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#8E86A8] shrink-0" />
                            <span>{slot.room}</span>
                          </div>
                        )}
                        {slot.instructor && (
                          <div className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-[#8E86A8] shrink-0" />
                            <span>{slot.instructor}</span>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Official COR Subject Load Table */}
      {viewMode === 'subjects' && (
        <section className="bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4DEF2] bg-[#FAF8FE] text-[11px] font-semibold text-[#615A78] uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Subject Title</th>
                  <th className="py-3 px-4 text-right">Units (Lec/Lab/Cr)</th>
                  <th className="py-3 px-4">Schedule</th>
                  <th className="py-3 px-4">Room</th>
                  <th className="py-3 px-4">Faculty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EFFA] text-xs">
                {ECE1B_SUBJECTS.map((subj) => (
                  <tr key={subj.code} className="hover:bg-[#FAF8FE]">
                    <td className="py-3.5 px-4 font-mono font-bold text-[#6D28D9] whitespace-nowrap">
                      {subj.code}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[#1B162B]">{subj.title}</td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-[#615A78] whitespace-nowrap">
                      {subj.lecUnits} / {subj.labUnits} / {subj.creditUnits}
                    </td>
                    <td className="py-3.5 px-4 text-[#1B162B] whitespace-nowrap">
                      {subj.scheduleSummary}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#615A78] whitespace-nowrap">
                      {subj.rooms}
                    </td>
                    <td className="py-3.5 px-4 text-[#615A78] whitespace-nowrap">
                      {subj.instructor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Kiosk Links */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-[#1B162B]">
          Class Portals & Quick Resources
        </h2>
        {kioskLinks.length === 0 ? (
          <div className="bg-white border border-[#E4DEF2] rounded-2xl p-8 text-center text-sm text-[#615A78]">
            No quick links posted yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kioskLinks.map((link) => (
              <div
                key={link.id}
                className="bg-white border border-[#E4DEF2] rounded-2xl p-4 flex items-start justify-between gap-3 hover:border-[#C5B5E8] transition-colors"
              >
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 group"
                >
                  <div className="text-[11px] font-semibold text-[#6D28D9]">{link.category}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <h3 className="text-sm font-bold text-[#1B162B] group-hover:text-[#6D28D9] truncate">
                      {link.title}
                    </h3>
                    <ExternalLink className="w-3.5 h-3.5 text-[#8E86A8] shrink-0" />
                  </div>
                  {link.subtitle && (
                    <p className="text-xs text-[#615A78] mt-1 line-clamp-2">{link.subtitle}</p>
                  )}
                </a>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => onDeleteLink(link.id)}
                    aria-label={`Delete ${link.title}`}
                    className="p-1.5 rounded-lg text-[#8E86A8] hover:text-red-600 hover:bg-red-50 shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Schedule Slot Modal */}
      {slotModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">Add Schedule Slot</h2>
              <button
                type="button"
                onClick={() => setSlotModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSlot} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Day</label>
                  <select
                    value={day}
                    onChange={(e) =>
                      setDay(e.target.value as 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    {DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Type</label>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as 'Lecture' | 'Lab')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="Lecture">Lecture</option>
                    <option value="Lab">Lab</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Subject
                  </label>
                  <select
                    value={courseCode}
                    onChange={(e) => handleSubjectPick(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono bg-white"
                  >
                    {ECE1B_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Course Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={courseTitle}
                    onChange={(e) => setCourseTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Start Time
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono"
                    placeholder="08:30 AM"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    End Time
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono"
                    placeholder="10:00 AM"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Room</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Instructor
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSlotModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSlot}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingSlot ? 'Adding...' : 'Add Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Kiosk Link Modal */}
      {linkModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">Add Kiosk Resource</h2>
              <button
                type="button"
                onClick={() => setLinkModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddLink} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  placeholder="ECE 1B Shared Drive"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">Category</label>
                <select
                  value={linkCategory}
                  onChange={(e) =>
                    setLinkCategory(e.target.value as 'Portal' | 'Drive' | 'Reference' | 'Tools')
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                >
                  <option value="Portal">Portal</option>
                  <option value="Drive">Drive</option>
                  <option value="Reference">Reference</option>
                  <option value="Tools">Tools</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">URL</label>
                <input
                  type="url"
                  required
                  maxLength={500}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Description
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={linkSubtitle}
                  onChange={(e) => setLinkSubtitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  placeholder="Lab templates and lecture PDFs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setLinkModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingLink}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingLink ? 'Saving...' : 'Save Resource'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
