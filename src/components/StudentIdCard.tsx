import React, { useState } from 'react';
import { X } from 'lucide-react';
import { EnrollmentType, UserProfile } from '../types';

interface EditProfileModalProps {
  profile: UserProfile;
  open: boolean;
  onClose: () => void;
  onSaveProfile: (updates: {
    fullName: string;
    handle: string;
    studentId: string;
    birthday: string;
    enrollmentType: EnrollmentType;
    avatarId: string;
  }) => Promise<void>;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  profile,
  open,
  onClose,
  onSaveProfile,
}) => {
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState(profile.fullName);
  const [handle, setHandle] = useState(profile.handle);
  const [studentId, setStudentId] = useState(profile.studentId);
  const [birthday, setBirthday] = useState(profile.birthday);
  const [enrollmentType, setEnrollmentType] = useState<EnrollmentType>(profile.enrollmentType);

  React.useEffect(() => {
    if (open) {
      setFullName(profile.fullName);
      setHandle(profile.handle);
      setStudentId(profile.studentId);
      setBirthday(profile.birthday);
      setEnrollmentType(profile.enrollmentType);
    }
  }, [open, profile]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await onSaveProfile({
        fullName: fullName.trim().slice(0, 120),
        handle: (handle.trim() || 'student').replace(/\s+/g, '').toLowerCase().slice(0, 32),
        studentId: studentId.trim().slice(0, 40),
        birthday: birthday.trim().slice(0, 40),
        enrollmentType,
        avatarId: 'blank',
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E1EE] rounded-2xl max-w-lg w-full p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-[#EFECE6]">
          <div>
            <h2 className="font-display text-lg font-bold text-[#14131D]">
              Update Student Profile
            </h2>
            <p className="text-xs text-[#615D75] mt-0.5">
              Syncs with your BulSU ECE 1B directory entry
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615D75] hover:bg-[#F3F1F8] cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm focus:outline-none focus:border-[#5B21B6]"
                placeholder="Rivera, Kurt Krian DL."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                Nickname / Handle
              </label>
              <input
                type="text"
                required
                maxLength={32}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm font-mono focus:outline-none focus:border-[#5B21B6]"
                placeholder="kurt"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                Student Number (COR)
              </label>
              <input
                type="text"
                maxLength={40}
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm font-mono focus:outline-none focus:border-[#5B21B6]"
                placeholder="2026001612"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2E2B3E] mb-1">
                Birthday
              </label>
              <input
                type="text"
                maxLength={40}
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DCD7E8] text-sm focus:outline-none focus:border-[#5B21B6]"
                placeholder="Nov 22"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#2E2B3E] mb-1.5">
              Enrollment Standing
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#F3F1F8] rounded-xl">
              {(['Regular', 'Irregular'] as EnrollmentType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEnrollmentType(type)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    enrollmentType === type
                      ? 'bg-white text-[#5B21B6] shadow-xs'
                      : 'text-[#615D75] hover:text-[#14131D]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[#DCD7E8] text-xs font-semibold text-[#2E2B3E] hover:bg-[#F7F6F9] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-[#5B21B6] text-white text-xs font-semibold hover:bg-[#4C1D95] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
