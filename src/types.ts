export type TabKey = 'home' | 'todo' | 'reviewer' | 'kiosk' | 'class';

export type EnrollmentType = 'Regular' | 'Irregular';
export type QuestionType = 'multiple_choice' | 'identification' | 'true_false' | 'essay';

export const ECE1B_OFFICER_POSITIONS = [
  'Mayor',
  'Vice-Mayor',
  'Secretary',
  'Treasurer',
  'Auditor',
  'P.I.O',
  'IECEP Coordinator',
  'Class Editor',
] as const;

export const PORTAL_EMBLEM_SRC = '/assets/aistudio/image_60bd6d8b.png';

export interface AvatarOption {
  id: string;
  label: string;
  src: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: 'blank',
    label: 'Blank',
    src: '',
  },
];

export function getAvatarSrc(_avatarId?: string): string {
  return '';
}

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  handle: string;
  studentId: string;
  birthday: string;
  enrollmentType: EnrollmentType;
  avatarId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface RosterMember {
  id: string;
  fullName: string;
  handle: string;
  studentId: string;
  roleLabel: 'Officer' | 'Student';
  officerTitle: string;
  enrollmentType: EnrollmentType;
  birthdayDisplay: string;
  avatarId: string;
  linkedUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminRecord {
  uid: string;
  email: string;
  fullName: string;
  title: string;
  inviteId?: string;
  addedBy: string;
  createdAt?: unknown;
}

export interface OfficerInvite {
  id: string;
  email: string;
  title: string;
  invitedBy: string;
  createdAt?: unknown;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: 'General' | 'Exam' | 'Urgent' | 'Event';
  pinned: boolean;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ClassTask {
  id: string;
  title: string;
  subject: string;
  type: 'Quiz' | 'Assignment' | 'Exam' | 'Requirement';
  description: string;
  dueAt: Date;
  authorUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleSlot {
  id: string;
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';
  courseCode: string;
  courseTitle: string;
  startTime: string;
  endTime: string;
  sortMinutes: number;
  room: string;
  instructor: string;
  kind: 'Lecture' | 'Lab';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyChapter {
  id: string;
  title: string;
  subject: string;
  order: number;
  description: string;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MaterialLink {
  label: string;
  url: string;
}

export interface MaterialImage {
  caption: string;
  url: string;
}

export interface StudyMaterial {
  id: string;
  title: string;
  subject: string;
  chapterId: string;
  category: 'Exam PDF' | 'Reviewer' | 'Lecture Slides' | 'Lab Manual' | 'Notes';
  description: string;
  contentBody: string;
  links: MaterialLink[];
  images: MaterialImage[];
  fileName: string;
  fileUrl: string;
  mimeType: string;
  extractedSummary: string;
  linkedQuizId: string;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
}

export interface FlashcardDeck {
  id: string;
  title: string;
  subject: string;
  chapterId: string;
  description: string;
  cards: FlashcardItem[];
  cardCount: number;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  rubric?: string;
  explanation: string;
  points: number;
}

export interface InteractiveQuiz {
  id: string;
  title: string;
  subject: string;
  chapterId: string;
  description: string;
  sourceMaterialId: string;
  published: boolean;
  timeLimitMinutes: number;
  questions: QuizQuestion[];
  questionCount: number;
  totalPoints: number;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EssayFeedbackEntry {
  score: number;
  comment: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  quizTitle: string;
  subject: string;
  studentUid: string;
  studentName: string;
  answers: Record<string, string>;
  autoScore: number;
  maxAutoScore: number;
  totalPoints: number;
  essayPendingCount: number;
  essayFeedback: Record<string, EssayFeedbackEntry>;
  status: 'submitted' | 'graded';
  submittedAt?: Date;
  updatedAt?: unknown;
}

export interface KioskLink {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  category: 'Portal' | 'Drive' | 'Reference' | 'Tools';
  createdAt?: unknown;
  updatedAt?: unknown;
}
