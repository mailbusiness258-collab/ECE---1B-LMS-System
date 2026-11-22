import React, { useMemo, useState } from 'react';
import {
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldMinus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AdminRecord,
  ECE1B_OFFICER_POSITIONS,
  EnrollmentType,
  OfficerInvite,
  RosterMember,
} from '../types';

interface ClassViewProps {
  currentUid: string;
  isAdmin: boolean;
  roster: RosterMember[];
  admins: AdminRecord[];
  officerInvites: OfficerInvite[];
  onSyncOfficialData: () => Promise<void>;
  onAddRosterStudent: (payload: {
    fullName: string;
    studentId: string;
    enrollmentType: EnrollmentType;
    birthdayDisplay: string;
    roleLabel: 'Officer' | 'Student';
    officerTitle: string;
  }) => Promise<void>;
  onUpdateRosterRole: (member: RosterMember, nextPosition: string) => Promise<void>;
  onDeleteRosterStudent: (id: string) => Promise<void>;
  onPromoteStudentToOfficer: (member: RosterMember, title: string) => Promise<void>;
  onDemoteOfficer: (uid: string, rosterId: string) => Promise<void>;
  onCreateOfficerInvite: (email: string, title: string) => Promise<void>;
  onDeleteOfficerInvite: (inviteId: string) => Promise<void>;
}

export const ClassView: React.FC<ClassViewProps> = ({
  currentUid,
  isAdmin,
  roster,
  admins,
  officerInvites,
  onSyncOfficialData,
  onAddRosterStudent,
  onUpdateRosterRole,
  onDeleteRosterStudent,
  onPromoteStudentToOfficer,
  onDemoteOfficer,
  onCreateOfficerInvite,
  onDeleteOfficerInvite,
}) => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'Officer' | 'Student'>('ALL');
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [savingRoleId, setSavingRoleId] = useState<string | null>(null);

  // Add classmate form
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>('Regular');
  const [birthdayDisplay, setBirthdayDisplay] = useState('');
  const [roleLabel, setRoleLabel] = useState<'Officer' | 'Student'>('Student');
  const [officerTitle, setOfficerTitle] = useState<string>(ECE1B_OFFICER_POSITIONS[0]);
  const [savingStudent, setSavingStudent] = useState(false);

  // Invite co-officer form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteTitle, setInviteTitle] = useState<string>(ECE1B_OFFICER_POSITIONS[1]);
  const [savingInvite, setSavingInvite] = useState(false);

  const adminUidSet = useMemo(() => new Set(admins.map((a) => a.uid)), [admins]);

  // Deduplicate if a signed-in user matches a masterlist studentId
  const deduplicatedRoster = useMemo(() => {
    const linkedStudentIds = new Set(
      roster.filter((m) => m.linkedUid && m.studentId).map((m) => m.studentId.trim())
    );
    return roster.filter((m) => {
      if (!m.linkedUid && m.studentId && linkedStudentIds.has(m.studentId.trim())) {
        return false;
      }
      return true;
    });
  }, [roster]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...deduplicatedRoster]
      .sort((a, b) => {
        if (a.roleLabel !== b.roleLabel) return a.roleLabel === 'Officer' ? -1 : 1;
        if (a.roleLabel === 'Officer' && b.roleLabel === 'Officer') {
          const rankA = ECE1B_OFFICER_POSITIONS.indexOf(
            a.officerTitle as (typeof ECE1B_OFFICER_POSITIONS)[number]
          );
          const rankB = ECE1B_OFFICER_POSITIONS.indexOf(
            b.officerTitle as (typeof ECE1B_OFFICER_POSITIONS)[number]
          );
          const normA = rankA === -1 ? 99 : rankA;
          const normB = rankB === -1 ? 99 : rankB;
          if (normA !== normB) return normA - normB;
        }
        return a.fullName.localeCompare(b.fullName);
      })
      .filter((m) => {
        if (roleFilter !== 'ALL' && m.roleLabel !== roleFilter) return false;
        if (q) {
          const hay = `${m.fullName} ${m.studentId} ${m.officerTitle} ${m.handle}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [deduplicatedRoster, search, roleFilter]);

  const officerCount = deduplicatedRoster.filter((m) => m.roleLabel === 'Officer').length;

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSyncOfficialData();
    } finally {
      setSyncing(false);
    }
  };

  const handleRoleChange = async (member: RosterMember, nextPosition: string) => {
    setSavingRoleId(member.id);
    try {
      await onUpdateRosterRole(member, nextPosition);
    } finally {
      setSavingRoleId(null);
      setEditingRoleId(null);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingStudent(true);
    try {
      await onAddRosterStudent({
        fullName: fullName.trim().slice(0, 120),
        studentId: studentId.trim().slice(0, 40),
        enrollmentType,
        birthdayDisplay: birthdayDisplay.trim().slice(0, 40),
        roleLabel,
        officerTitle: roleLabel === 'Officer' ? officerTitle || ECE1B_OFFICER_POSITIONS[0] : '',
      });
      setFullName('');
      setStudentId('');
      setBirthdayDisplay('');
      setOfficerTitle(ECE1B_OFFICER_POSITIONS[0]);
      setRoleLabel('Student');
      setAddStudentOpen(false);
    } finally {
      setSavingStudent(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setSavingInvite(true);
    try {
      await onCreateOfficerInvite(
        inviteEmail.trim().toLowerCase(),
        inviteTitle || ECE1B_OFFICER_POSITIONS[1]
      );
      setInviteEmail('');
      setInviteTitle(ECE1B_OFFICER_POSITIONS[1]);
      setInviteOpen(false);
    } finally {
      setSavingInvite(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B162B]">
            ECE 1B Class Masterlist
          </h1>
          <p className="text-sm text-[#615A78] mt-1 tabular-nums">
            {deduplicatedRoster.length} students · {officerCount} class officers
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={syncing}
              onClick={handleSync}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] bg-white text-[#1B162B] text-xs font-semibold hover:bg-[#F5F1FC] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing COR...' : 'Sync COR & Masterlist'}
            </button>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#EFE9FB] text-[#5B21B6] text-xs font-semibold hover:bg-[#E4DAF9] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Authorize Co-Officer
            </button>
            <button
              type="button"
              onClick={() => setAddStudentOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add Student
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter */}
      <div className="bg-white border border-[#E4DEF2] rounded-2xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#F3EFFA] rounded-xl">
          {(['ALL', 'Officer', 'Student'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleFilter(r)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                roleFilter === r
                  ? 'bg-white text-[#6D28D9] shadow-xs'
                  : 'text-[#615A78] hover:text-[#1B162B]'
              }`}
            >
              {r === 'ALL' ? 'Everyone' : r === 'Officer' ? 'Officers' : 'Students'}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-[#8E86A8] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search surname, name, or 2026..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#DDD5EC] text-xs focus:outline-none focus:border-[#6D28D9]"
          />
        </div>
      </div>

      {/* Masterlist Directory Table */}
      {filteredRoster.length === 0 ? (
        <div className="bg-white border border-[#E4DEF2] rounded-2xl p-10 text-center">
          <Users className="w-8 h-8 text-[#8E86A8] mx-auto" />
          <h2 className="font-display text-base font-bold text-[#1B162B] mt-3">
            No students match your search
          </h2>
          <p className="text-xs text-[#615A78] mt-1">
            Try clearing the search box or switching the role filter.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E4DEF2] bg-[#FAF8FE] text-[11px] font-semibold text-[#615A78] uppercase tracking-wider">
                  <th className="py-3 px-4 w-12">No.</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Student Number</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Standing</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3EFFA] text-xs">
                {filteredRoster.map((member, index) => {
                  const isLinkedAdmin = Boolean(member.linkedUid && adminUidSet.has(member.linkedUid));
                  const isSelf = member.linkedUid === currentUid;
                  return (
                    <tr key={member.id} className="hover:bg-[#FAF8FE] transition-colors">
                      <td className="py-3 px-4 font-mono text-[#8E86A8] tabular-nums">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1B162B]">
                        {member.fullName}
                        {member.birthdayDisplay && (
                          <span className="ml-2 text-[11px] font-normal text-[#8E86A8]">
                            · {member.birthdayDisplay}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-[#6D28D9] tabular-nums whitespace-nowrap">
                        {member.studentId || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isAdmin && editingRoleId === member.id ? (
                          <select
                            autoFocus
                            disabled={savingRoleId === member.id}
                            value={
                              member.roleLabel === 'Officer'
                                ? member.officerTitle || 'Mayor'
                                : 'Student'
                            }
                            onChange={(e) => handleRoleChange(member, e.target.value)}
                            onBlur={() => setEditingRoleId(null)}
                            aria-label={`Select position for ${member.fullName}`}
                            className="px-2.5 py-1 rounded-lg border border-[#6D28D9] bg-white text-xs font-semibold text-[#1B162B] focus:outline-none"
                          >
                            <option value="Student">Student</option>
                            {ECE1B_OFFICER_POSITIONS.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => {
                              if (isAdmin) setEditingRoleId(member.id);
                            }}
                            title={isAdmin ? 'Click to assign ECE 1B position' : undefined}
                            className={`inline-flex items-center gap-1.5 ${
                              member.roleLabel === 'Officer'
                                ? 'font-semibold text-[#6D28D9]'
                                : 'text-[#615A78]'
                            } ${isAdmin ? 'cursor-pointer hover:text-[#5B21B6]' : ''}`}
                          >
                            {member.roleLabel === 'Officer'
                              ? member.officerTitle || 'Officer'
                              : 'Student'}
                            {isAdmin && (
                              <Pencil className="w-3 h-3 opacity-50" aria-hidden="true" />
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-[#615A78] whitespace-nowrap">
                        {member.enrollmentType}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-3">
                            {member.linkedUid && !isLinkedAdmin && (
                              <button
                                type="button"
                                onClick={() => setEditingRoleId(member.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Assign Position
                              </button>
                            )}
                            {member.linkedUid && isLinkedAdmin && !isSelf && (
                              <button
                                type="button"
                                onClick={() => onDemoteOfficer(member.linkedUid, member.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                              >
                                <ShieldMinus className="w-3.5 h-3.5" />
                                Remove Officer
                              </button>
                            )}
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => onDeleteRosterStudent(member.id)}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pre-authorized Co-Officer Invites (Admin Only) */}
      {isAdmin && (
        <section className="bg-white border border-[#E4DEF2] rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#1B162B]">
                Co-Officer Access List
              </h2>
              <p className="text-xs text-[#615A78] mt-0.5">
                Co-officers listed here automatically receive officer controls when they sign in with Google.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F3EFFA] text-[#5B21B6] text-xs font-semibold hover:bg-[#E7DDF8] cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Email
            </button>
          </div>

          {officerInvites.length === 0 ? (
            <p className="text-xs text-[#8E86A8] py-2">
              No pending co-officer email authorizations yet.
            </p>
          ) : (
            <ul className="divide-y divide-[#F3EFFA]">
              {officerInvites.map((inv) => (
                <li key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1B162B] truncate">{inv.email}</div>
                    <div className="text-[11px] text-[#615A78]">{inv.title}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteOfficerInvite(inv.id)}
                    className="p-1.5 rounded-lg text-[#8E86A8] hover:text-red-600 hover:bg-red-50 cursor-pointer"
                    aria-label={`Revoke ${inv.email}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Add Classmate Modal */}
      {addStudentOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">Add ECE 1B Student</h2>
              <button
                type="button"
                onClick={() => setAddStudentOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Full Name (Surname, First Name M.I.)
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  placeholder="DELA CRUZ, Juan A."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Student Number
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono"
                    placeholder="2026001612"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Birthday
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={birthdayDisplay}
                    onChange={(e) => setBirthdayDisplay(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                    placeholder="May 14"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Standing
                  </label>
                  <select
                    value={enrollmentType}
                    onChange={(e) => setEnrollmentType(e.target.value as EnrollmentType)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="Regular">Regular</option>
                    <option value="Irregular">Irregular</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Role</label>
                  <select
                    value={roleLabel}
                    onChange={(e) => setRoleLabel(e.target.value as 'Officer' | 'Student')}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="Student">Student</option>
                    <option value="Officer">Officer</option>
                  </select>
                </div>
              </div>

              {roleLabel === 'Officer' && (
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Officer Position
                  </label>
                  <select
                    value={officerTitle}
                    onChange={(e) => setOfficerTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    {ECE1B_OFFICER_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAddStudentOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStudent}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingStudent ? 'Adding...' : 'Add to Masterlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Authorize Co-Officer Email Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">
                Authorize Co-Officer
              </h2>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Co-Officer Google Email
                </label>
                <input
                  type="email"
                  required
                  maxLength={200}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                  placeholder="coofficer@gmail.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Officer Position
                </label>
                <select
                  required
                  value={inviteTitle}
                  onChange={(e) => setInviteTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                >
                  {ECE1B_OFFICER_POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInvite}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingInvite ? 'Saving...' : 'Authorize Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
