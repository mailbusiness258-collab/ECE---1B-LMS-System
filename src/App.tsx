import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  BookOpen,
  CalendarDays,
  CheckSquare,
  Home,
  KeyRound,
  LogOut,
  Pencil,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { syncOfficialCorAndMasterlist } from './lib/seedData';
import {
  AdminRecord,
  Announcement,
  AVATAR_OPTIONS,
  ClassTask,
  EnrollmentType,
  EssayFeedbackEntry,
  FlashcardDeck,
  InteractiveQuiz,
  KioskLink,
  MaterialImage,
  MaterialLink,
  OfficerInvite,
  PORTAL_EMBLEM_SRC,
  QuizAttempt,
  RosterMember,
  ScheduleSlot,
  StudyChapter,
  StudyMaterial,
  TabKey,
  UserProfile,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeView } from './components/HomeView';
import { TodoView } from './components/TodoView';
import { ReviewerView } from './components/ReviewerView';
import { KioskView } from './components/KioskView';
import { ClassView } from './components/ClassView';
import { EditProfileModal } from './components/StudentIdCard';

type AuthMode = 'none' | 'firebase' | 'student';

interface LookupResult {
  found: boolean;
  fullName?: string;
  roleLabel?: 'Officer' | 'Student';
  officerTitle?: string;
  enrollmentType?: EnrollmentType;
  hasPassword?: boolean;
}

function PortalShell() {
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('none');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [studentToken, setStudentToken] = useState<string | null>(null);

  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  // Student Number + Password login form state
  const [studentNumberInput, setStudentNumberInput] = useState('');
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [officerTitle, setOfficerTitle] = useState('');

  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);

  // Live collections
  const [tasks, setTasks] = useState<ClassTask[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [chapters, setChapters] = useState<StudyChapter[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [flashcardDecks, setFlashcardDecks] = useState<FlashcardDeck[]>([]);
  const [quizzes, setQuizzes] = useState<InteractiveQuiz[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [studentMirrorAttempts, setStudentMirrorAttempts] = useState<QuizAttempt[]>([]);
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [officerInvites, setOfficerInvites] = useState<OfficerInvite[]>([]);
  const [kioskLinks, setKioskLinks] = useState<KioskLink[]>([]);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setAuthMode((prev) => (prev === 'firebase' ? 'none' : prev));
        setProfile((prev) => (authMode === 'student' ? prev : null));
        setIsAdmin((prev) => (authMode === 'student' ? prev : false));
        setOfficerTitle((prev) => (authMode === 'student' ? prev : ''));
        setAuthReady(true);
        return;
      }

      setStudentToken(null);
      setAuthMode('firebase');
      try {
        const emailLower = (user.email || '').toLowerCase();
        const isBootAdmin = emailLower === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified;

        const adminDocSnap = await getDoc(doc(db, 'admins', user.uid));
        let userIsAdmin = isBootAdmin || adminDocSnap.exists();
        let resolvedTitle = adminDocSnap.exists()
          ? String(adminDocSnap.data().title || 'Mayor')
          : isBootAdmin
            ? 'Mayor'
            : '';

        if (isBootAdmin && !adminDocSnap.exists()) {
          await setDoc(doc(db, 'admins', user.uid), {
            uid: user.uid,
            email: emailLower,
            fullName: user.displayName || 'ECE 1B Officer',
            title: 'Mayor',
            addedBy: user.uid,
            createdAt: serverTimestamp(),
          });
          resolvedTitle = 'Mayor';
        }

        if (!userIsAdmin && user.emailVerified && emailLower) {
          const inviteSnap = await getDocs(
            query(collection(db, 'officerInvites'), where('email', '==', emailLower))
          );
          if (!inviteSnap.empty) {
            const firstInvite = inviteSnap.docs[0];
            const invData = firstInvite.data();
            resolvedTitle = String(invData.title || 'Co-Officer');
            await setDoc(doc(db, 'admins', user.uid), {
              uid: user.uid,
              email: emailLower,
              fullName: user.displayName || 'ECE 1B Officer',
              title: resolvedTitle,
              inviteId: firstInvite.id,
              addedBy: String(invData.invitedBy || user.uid),
              createdAt: serverTimestamp(),
            });
            userIsAdmin = true;
          }
        }

        setIsAdmin(userIsAdmin);
        setOfficerTitle(resolvedTitle);

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const defaultName = user.displayName || emailLower.split('@')[0] || 'ECE 1B Student';
        const defaultHandle =
          defaultName.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';

        if (!userSnap.exists()) {
          const initialProfile: UserProfile = {
            uid: user.uid,
            email: emailLower,
            fullName: defaultName.slice(0, 120),
            handle: defaultHandle.slice(0, 32),
            studentId: '',
            birthday: '',
            enrollmentType: 'Regular',
            avatarId: AVATAR_OPTIONS[0].id,
          };
          await setDoc(userRef, {
            ...initialProfile,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          setProfile(initialProfile);
        } else {
          const d = userSnap.data();
          setProfile({
            uid: user.uid,
            email: String(d.email || emailLower),
            fullName: String(d.fullName || defaultName),
            handle: String(d.handle || defaultHandle),
            studentId: String(d.studentId || ''),
            birthday: String(d.birthday || ''),
            enrollmentType: d.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular',
            avatarId: String(d.avatarId || AVATAR_OPTIONS[0].id),
          });
        }

        const rosterRef = doc(db, 'roster', user.uid);
        const rosterSnap = await getDoc(rosterRef);
        if (!rosterSnap.exists()) {
          await setDoc(rosterRef, {
            fullName: (userSnap.exists() ? userSnap.data().fullName : defaultName).slice(0, 120),
            handle: (userSnap.exists() ? userSnap.data().handle : defaultHandle).slice(0, 32),
            studentId: userSnap.exists() ? String(userSnap.data().studentId || '') : '',
            roleLabel: userIsAdmin ? 'Officer' : 'Student',
            officerTitle: userIsAdmin ? resolvedTitle || 'Class Officer' : '',
            enrollmentType:
              userSnap.exists() && userSnap.data().enrollmentType === 'Irregular'
                ? 'Irregular'
                : 'Regular',
            birthdayDisplay: userSnap.exists() ? String(userSnap.data().birthday || '') : '',
            avatarId: AVATAR_OPTIONS[0].id,
            linkedUid: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else if (userIsAdmin && rosterSnap.data().roleLabel !== 'Officer') {
          await updateDoc(rosterRef, {
            roleLabel: 'Officer',
            officerTitle: resolvedTitle || 'Class Officer',
            updatedAt: serverTimestamp(),
          });
        }

        if (userIsAdmin) {
          await syncOfficialCorAndMasterlist(user.uid, defaultName);
        }
      } catch (err) {
        console.error('Auth bootstrap error:', err);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach Firestore listeners when authenticated via Google Firebase
  useEffect(() => {
    if (!authReady || authMode !== 'firebase' || !currentUser) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        doc(db, 'users', currentUser.uid),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setProfile({
              uid: currentUser.uid,
              email: String(d.email || currentUser.email || ''),
              fullName: String(d.fullName || 'Student'),
              handle: String(d.handle || 'student'),
              studentId: String(d.studentId || ''),
              birthday: String(d.birthday || ''),
              enrollmentType: d.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular',
              avatarId: String(d.avatarId || AVATAR_OPTIONS[0].id),
            });
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'users', currentUser.uid, 'taskProgress'),
        (snap) => {
          const doneSet = new Set<string>();
          snap.forEach((docSnap) => {
            if (docSnap.data().completed === true) {
              doneSet.add(docSnap.id);
            }
          });
          setCompletedTaskIds(doneSet);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, `users/${currentUser.uid}/taskProgress`)
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'tasks'),
        (snap) => {
          const list: ClassTask[] = snap.docs.map((d) => {
            const data = d.data();
            const dueTs = data.dueAt as Timestamp | undefined;
            return {
              id: d.id,
              title: String(data.title || ''),
              subject: String(data.subject || ''),
              type: (data.type as ClassTask['type']) || 'Assignment',
              description: String(data.description || ''),
              dueAt: dueTs ? dueTs.toDate() : new Date(),
              authorUid: String(data.authorUid || ''),
            };
          });
          setTasks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'announcements'),
        (snap) => {
          const list: Announcement[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title || ''),
              body: String(data.body || ''),
              category: (data.category as Announcement['category']) || 'General',
              pinned: Boolean(data.pinned),
              authorUid: String(data.authorUid || ''),
              authorName: String(data.authorName || 'Officer'),
            };
          });
          setAnnouncements(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'announcements')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'scheduleSlots'),
        (snap) => {
          const list: ScheduleSlot[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              day: (data.day as ScheduleSlot['day']) || 'Mon',
              courseCode: String(data.courseCode || ''),
              courseTitle: String(data.courseTitle || ''),
              startTime: String(data.startTime || ''),
              endTime: String(data.endTime || ''),
              sortMinutes: Number(data.sortMinutes || 0),
              room: String(data.room || ''),
              instructor: String(data.instructor || ''),
              kind: data.kind === 'Lab' ? 'Lab' : 'Lecture',
            };
          });
          setScheduleSlots(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'scheduleSlots')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'chapters'),
        (snap) => {
          const list: StudyChapter[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title || ''),
              subject: String(data.subject || ''),
              order: Number(data.order || 0),
              description: String(data.description || ''),
              authorUid: String(data.authorUid || ''),
              authorName: String(data.authorName || 'Officer'),
            };
          });
          setChapters(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'chapters')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'materials'),
        (snap) => {
          const list: StudyMaterial[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title || ''),
              subject: String(data.subject || ''),
              chapterId: String(data.chapterId || ''),
              category: (data.category as StudyMaterial['category']) || 'Reviewer',
              description: String(data.description || ''),
              contentBody: String(data.contentBody || ''),
              links: Array.isArray(data.links) ? (data.links as MaterialLink[]) : [],
              images: Array.isArray(data.images) ? (data.images as MaterialImage[]) : [],
              fileName: String(data.fileName || ''),
              fileUrl: String(data.fileUrl || ''),
              mimeType: String(data.mimeType || ''),
              extractedSummary: String(data.extractedSummary || ''),
              linkedQuizId: String(data.linkedQuizId || ''),
              authorUid: String(data.authorUid || ''),
              authorName: String(data.authorName || 'Officer'),
            };
          });
          setMaterials(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'materials')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'flashcardDecks'),
        (snap) => {
          const list: FlashcardDeck[] = snap.docs.map((d) => {
            const data = d.data();
            const cards = Array.isArray(data.cards) ? data.cards : [];
            return {
              id: d.id,
              title: String(data.title || ''),
              subject: String(data.subject || ''),
              chapterId: String(data.chapterId || ''),
              description: String(data.description || ''),
              cards,
              cardCount: Number(data.cardCount || cards.length || 0),
              authorUid: String(data.authorUid || ''),
              authorName: String(data.authorName || 'Officer'),
            };
          });
          setFlashcardDecks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'flashcardDecks')
      )
    );

    const quizzesRef = isAdmin
      ? collection(db, 'quizzes')
      : query(collection(db, 'quizzes'), where('published', '==', true));
    unsubs.push(
      onSnapshot(
        quizzesRef,
        (snap) => {
          const list: InteractiveQuiz[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title || ''),
              subject: String(data.subject || ''),
              chapterId: String(data.chapterId || ''),
              description: String(data.description || ''),
              sourceMaterialId: String(data.sourceMaterialId || ''),
              published: Boolean(data.published),
              timeLimitMinutes: Number(data.timeLimitMinutes || 0),
              questions: Array.isArray(data.questions) ? data.questions : [],
              questionCount: Number(data.questionCount || 0),
              totalPoints: Number(data.totalPoints || 0),
              authorUid: String(data.authorUid || ''),
              authorName: String(data.authorName || 'Officer'),
            };
          });
          setQuizzes(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'quizzes')
      )
    );

    const attemptsRef = isAdmin
      ? collection(db, 'quizAttempts')
      : query(collection(db, 'quizAttempts'), where('studentUid', '==', currentUser.uid));
    unsubs.push(
      onSnapshot(
        attemptsRef,
        (snap) => {
          const list: QuizAttempt[] = snap.docs.map((d) => {
            const data = d.data();
            const subTs = data.submittedAt as Timestamp | undefined;
            return {
              id: d.id,
              quizId: String(data.quizId || ''),
              quizTitle: String(data.quizTitle || ''),
              subject: String(data.subject || ''),
              studentUid: String(data.studentUid || ''),
              studentName: String(data.studentName || ''),
              answers: (data.answers as Record<string, string>) || {},
              autoScore: Number(data.autoScore || 0),
              maxAutoScore: Number(data.maxAutoScore || 0),
              totalPoints: Number(data.totalPoints || 1),
              essayPendingCount: Number(data.essayPendingCount || 0),
              essayFeedback:
                (data.essayFeedback as Record<string, EssayFeedbackEntry>) || {},
              status: data.status === 'graded' ? 'graded' : 'submitted',
              submittedAt: subTs ? subTs.toDate() : undefined,
            };
          });
          setAttempts(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'quizAttempts')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'roster'),
        (snap) => {
          const list: RosterMember[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              fullName: String(data.fullName || ''),
              handle: String(data.handle || ''),
              studentId: String(data.studentId || ''),
              roleLabel: data.roleLabel === 'Officer' ? 'Officer' : 'Student',
              officerTitle: String(data.officerTitle || ''),
              enrollmentType: data.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular',
              birthdayDisplay: String(data.birthdayDisplay || ''),
              avatarId: String(data.avatarId || AVATAR_OPTIONS[0].id),
              linkedUid: String(data.linkedUid || ''),
            };
          });
          setRoster(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'roster')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'kioskLinks'),
        (snap) => {
          const list: KioskLink[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              title: String(data.title || ''),
              subtitle: String(data.subtitle || ''),
              url: String(data.url || ''),
              category: (data.category as KioskLink['category']) || 'Portal',
            };
          });
          setKioskLinks(list);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'kioskLinks')
      )
    );

    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'admins'),
          (snap) => {
            const list: AdminRecord[] = snap.docs.map((d) => {
              const data = d.data();
              return {
                uid: d.id,
                email: String(data.email || ''),
                fullName: String(data.fullName || ''),
                title: String(data.title || 'Officer'),
                addedBy: String(data.addedBy || ''),
              };
            });
            setAdmins(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'admins')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'officerInvites'),
          (snap) => {
            const list: OfficerInvite[] = snap.docs.map((d) => {
              const data = d.data();
              return {
                id: d.id,
                email: String(data.email || ''),
                title: String(data.title || 'Co-Officer'),
                invitedBy: String(data.invitedBy || ''),
              };
            });
            setOfficerInvites(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'officerInvites')
        )
      );
    }

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [authReady, authMode, currentUser, isAdmin]);

  // Sync Firebase Admin collections -> Express portal-store.json for Student-Number sessions
  useEffect(() => {
    if (authMode !== 'firebase' || !currentUser || !isAdmin) return;
    if (roster.length === 0 && scheduleSlots.length === 0) return;

    const timer = window.setTimeout(async () => {
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/portal/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            chapters,
            materials,
            flashcardDecks,
            quizzes,
            tasks: tasks.map((t) => ({ ...t, dueAt: t.dueAt.toISOString() })),
            announcements,
            scheduleSlots,
            roster,
            kioskLinks,
            quizAttempts: attempts.map((a) => ({
              ...a,
              submittedAt: a.submittedAt ? a.submittedAt.toISOString() : undefined,
            })),
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            studentAttempts?: Array<Record<string, unknown>>;
          };
          if (Array.isArray(data.studentAttempts)) {
            setStudentMirrorAttempts(
              data.studentAttempts.map((a) => ({
                id: String(a.id || ''),
                quizId: String(a.quizId || ''),
                quizTitle: String(a.quizTitle || ''),
                subject: String(a.subject || ''),
                studentUid: String(a.studentUid || ''),
                studentName: String(a.studentName || ''),
                answers: (a.answers as Record<string, string>) || {},
                autoScore: Number(a.autoScore || 0),
                maxAutoScore: Number(a.maxAutoScore || 0),
                totalPoints: Number(a.totalPoints || 1),
                essayPendingCount: Number(a.essayPendingCount || 0),
                essayFeedback:
                  (a.essayFeedback as Record<string, EssayFeedbackEntry>) || {},
                status: a.status === 'graded' ? 'graded' : 'submitted',
                submittedAt: a.submittedAt ? new Date(String(a.submittedAt)) : undefined,
              }))
            );
          }
        }
      } catch (err) {
        console.error('Portal mirror sync skipped:', err);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    authMode,
    currentUser,
    isAdmin,
    chapters,
    materials,
    flashcardDecks,
    quizzes,
    tasks,
    announcements,
    scheduleSlots,
    roster,
    kioskLinks,
    attempts,
  ]);

  // Fetch & poll portal data when authenticated via Student Number + Password
  const fetchStudentPortalData = useCallback(async (token: string) => {
    try {
      const res = await fetch('/api/portal/data', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        chapters?: StudyChapter[];
        materials?: StudyMaterial[];
        flashcardDecks?: FlashcardDeck[];
        quizzes?: InteractiveQuiz[];
        tasks?: Array<Record<string, unknown>>;
        announcements?: Announcement[];
        scheduleSlots?: ScheduleSlot[];
        roster?: RosterMember[];
        kioskLinks?: KioskLink[];
        completedTaskIds?: string[];
        attempts?: Array<Record<string, unknown>>;
      };

      if (Array.isArray(data.chapters)) setChapters(data.chapters);
      if (Array.isArray(data.materials)) {
        setMaterials(
          data.materials.map((m) => ({
            ...m,
            chapterId: String(m.chapterId || ''),
            contentBody: String(m.contentBody || ''),
            links: Array.isArray(m.links) ? m.links : [],
            images: Array.isArray(m.images) ? m.images : [],
          }))
        );
      }
      if (Array.isArray(data.flashcardDecks)) setFlashcardDecks(data.flashcardDecks);
      if (Array.isArray(data.quizzes)) {
        setQuizzes(
          data.quizzes.map((q) => ({
            ...q,
            chapterId: String(q.chapterId || ''),
          }))
        );
      }
      if (Array.isArray(data.tasks)) {
        setTasks(
          data.tasks.map((t) => ({
            id: String(t.id || ''),
            title: String(t.title || ''),
            subject: String(t.subject || ''),
            type: (t.type as ClassTask['type']) || 'Assignment',
            description: String(t.description || ''),
            dueAt: t.dueAt ? new Date(String(t.dueAt)) : new Date(),
            authorUid: String(t.authorUid || ''),
          }))
        );
      }
      if (Array.isArray(data.announcements)) setAnnouncements(data.announcements);
      if (Array.isArray(data.scheduleSlots)) setScheduleSlots(data.scheduleSlots);
      if (Array.isArray(data.roster)) setRoster(data.roster);
      if (Array.isArray(data.kioskLinks)) setKioskLinks(data.kioskLinks);
      if (Array.isArray(data.completedTaskIds)) {
        setCompletedTaskIds(new Set(data.completedTaskIds));
      }
      if (Array.isArray(data.attempts)) {
        setAttempts(
          data.attempts.map((a) => ({
            id: String(a.id || ''),
            quizId: String(a.quizId || ''),
            quizTitle: String(a.quizTitle || ''),
            subject: String(a.subject || ''),
            studentUid: String(a.studentUid || ''),
            studentName: String(a.studentName || ''),
            answers: (a.answers as Record<string, string>) || {},
            autoScore: Number(a.autoScore || 0),
            maxAutoScore: Number(a.maxAutoScore || 0),
            totalPoints: Number(a.totalPoints || 1),
            essayPendingCount: Number(a.essayPendingCount || 0),
            essayFeedback:
              (a.essayFeedback as Record<string, EssayFeedbackEntry>) || {},
            status: a.status === 'graded' ? 'graded' : 'submitted',
            submittedAt: a.submittedAt ? new Date(String(a.submittedAt)) : undefined,
          }))
        );
      }
    } catch (err) {
      console.error('Student portal fetch error:', err);
    }
  }, []);

  useEffect(() => {
    if (authMode !== 'student' || !studentToken) return;
    fetchStudentPortalData(studentToken);
    const interval = window.setInterval(() => {
      fetchStudentPortalData(studentToken);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [authMode, studentToken, fetchStudentPortalData]);

  const combinedAttempts = useMemo(() => {
    if (authMode !== 'firebase' || !isAdmin || studentMirrorAttempts.length === 0) {
      return attempts;
    }
    const map = new Map<string, QuizAttempt>();
    attempts.forEach((a) => map.set(a.id, a));
    studentMirrorAttempts.forEach((a) => {
      if (!map.has(a.id)) map.set(a.id, a);
    });
    return Array.from(map.values());
  }, [authMode, isAdmin, attempts, studentMirrorAttempts]);

  const deduplicatedRosterCount = useMemo(() => {
    const linkedStudentIds = new Set(
      roster.filter((m) => m.linkedUid && m.studentId).map((m) => m.studentId.trim())
    );
    return roster.filter(
      (m) => !(!m.linkedUid && m.studentId && linkedStudentIds.has(m.studentId.trim()))
    ).length;
  }, [roster]);

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (authMode === 'student' && studentToken) return studentToken;
    if (currentUser) return currentUser.getIdToken();
    return null;
  }, [authMode, studentToken, currentUser]);

  const studentMutate = async (
    action: string,
    payload: Record<string, unknown> = {},
    existingId = ''
  ): Promise<string> => {
    if (!studentToken) return '';
    const res = await fetch('/api/portal/mutate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ action, payload, existingId }),
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Operation failed.');
    }
    await fetchStudentPortalData(studentToken);
    return data.id || existingId;
  };

  // --- Sign-In Gate Handlers ---
  const handleLookupStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const clean = studentNumberInput.trim();
    if (!clean) return;
    setLookingUp(true);
    try {
      const res = await fetch('/api/auth/lookup-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentNumber: clean }),
      });
      const data = (await res.json()) as LookupResult & { error?: string };
      if (!res.ok) {
        setAuthError(data.error || 'Unable to verify student number.');
        setLookupResult(null);
        return;
      }
      if (!data.found) {
        setAuthError(
          'Student number not found in the ECE 1B masterlist. Ask a class officer to add you or sign in with Google.'
        );
        setLookupResult(null);
        return;
      }
      setLookupResult(data);
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch {
      setAuthError('Unable to reach class portal server.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleStudentAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupResult?.found) return;
    setAuthError('');

    if (!lookupResult.hasPassword && passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match.');
      return;
    }

    setSigningIn(true);
    try {
      const endpoint = lookupResult.hasPassword
        ? '/api/auth/login-student'
        : '/api/auth/register-student';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentNumber: studentNumberInput.trim(),
          password: passwordInput,
        }),
      });
      const data = (await res.json()) as {
        token?: string;
        profile?: UserProfile;
        isAdmin?: boolean;
        officerTitle?: string;
        error?: string;
      };
      if (!res.ok || !data.token || !data.profile) {
        setAuthError(data.error || 'Sign-in failed.');
        return;
      }
      setStudentToken(data.token);
      setProfile(data.profile);
      setIsAdmin(Boolean(data.isAdmin));
      setOfficerTitle(data.officerTitle || '');
      setAuthMode('student');
      setPasswordInput('');
      setConfirmPasswordInput('');
    } catch {
      setAuthError('Unable to complete sign-in right now.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Sign-in was cancelled or failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOutAll = async () => {
    setSettingsOpen(false);
    if (authMode === 'student') {
      setStudentToken(null);
      setAuthMode('none');
      setProfile(null);
      setIsAdmin(false);
      setOfficerTitle('');
      setLookupResult(null);
      setStudentNumberInput('');
      return;
    }
    await signOut(auth);
  };

  // --- Mutation Handlers ---
  const handleSaveProfile = async (updates: {
    fullName: string;
    handle: string;
    studentId: string;
    birthday: string;
    enrollmentType: EnrollmentType;
    avatarId: string;
  }) => {
    if (authMode === 'student' && studentToken) {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = (await res.json()) as { profile?: UserProfile };
        if (data.profile) setProfile(data.profile);
        await fetchStudentPortalData(studentToken);
      }
      return;
    }
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'roster', currentUser.uid), {
        fullName: updates.fullName,
        handle: updates.handle,
        studentId: updates.studentId,
        enrollmentType: updates.enrollmentType,
        birthdayDisplay: updates.birthday,
        avatarId: updates.avatarId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
    }
  };

  const handleToggleTask = async (taskId: string, nextCompleted: boolean) => {
    if (authMode === 'student' && studentToken) {
      const res = await fetch('/api/portal/student-task-progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({ taskId, completed: nextCompleted }),
      });
      if (res.ok) {
        const data = (await res.json()) as { completedTaskIds?: string[] };
        if (Array.isArray(data.completedTaskIds)) {
          setCompletedTaskIds(new Set(data.completedTaskIds));
        }
      }
      return;
    }
    if (!currentUser) return;
    const path = `users/${currentUser.uid}/taskProgress/${taskId}`;
    try {
      await setDoc(doc(db, 'users', currentUser.uid, 'taskProgress', taskId), {
        taskId,
        completed: nextCompleted,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  const handleCreateAnnouncement = async (payload: {
    title: string;
    body: string;
    category: 'General' | 'Exam' | 'Urgent' | 'Event';
    pinned: boolean;
  }) => {
    if (authMode === 'student') {
      await studentMutate('createAnnouncement', payload);
      return;
    }
    if (!currentUser || !profile) return;
    try {
      await addDoc(collection(db, 'announcements'), {
        ...payload,
        authorUid: currentUser.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'announcements');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteAnnouncement', {}, id);
      return;
    }
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  };

  const handleCreateTask = async (payload: {
    title: string;
    subject: string;
    type: 'Quiz' | 'Assignment' | 'Exam' | 'Requirement';
    description: string;
    dueAt: Date;
  }) => {
    if (authMode === 'student') {
      await studentMutate('createTask', {
        ...payload,
        dueAt: payload.dueAt.toISOString(),
      });
      return;
    }
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'tasks'), {
        title: payload.title,
        subject: payload.subject,
        type: payload.type,
        description: payload.description,
        dueAt: Timestamp.fromDate(payload.dueAt),
        authorUid: currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tasks');
    }
  };

  const handleUpdateTask = async (
    taskId: string,
    payload: {
      title: string;
      subject: string;
      type: 'Quiz' | 'Assignment' | 'Exam' | 'Requirement';
      description: string;
      dueAt: Date;
    }
  ) => {
    if (authMode === 'student') {
      await studentMutate(
        'updateTask',
        { ...payload, dueAt: payload.dueAt.toISOString() },
        taskId
      );
      return;
    }
    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        title: payload.title,
        subject: payload.subject,
        type: payload.type,
        description: payload.description,
        dueAt: Timestamp.fromDate(payload.dueAt),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteTask', {}, taskId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  const handleCreateSlot = async (
    slot: Omit<ScheduleSlot, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    if (authMode === 'student') {
      await studentMutate('createSlot', slot as unknown as Record<string, unknown>);
      return;
    }
    try {
      await addDoc(collection(db, 'scheduleSlots'), {
        ...slot,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'scheduleSlots');
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteSlot', {}, slotId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'scheduleSlots', slotId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `scheduleSlots/${slotId}`);
    }
  };

  const handleCreateLink = async (
    link: Omit<KioskLink, 'id' | 'createdAt' | 'updatedAt'>
  ) => {
    if (authMode === 'student') {
      await studentMutate('createLink', link as unknown as Record<string, unknown>);
      return;
    }
    try {
      await addDoc(collection(db, 'kioskLinks'), {
        ...link,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'kioskLinks');
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteLink', {}, linkId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'kioskLinks', linkId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `kioskLinks/${linkId}`);
    }
  };

  const handleSaveChapter = async (
    payload: Omit<StudyChapter, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ): Promise<string> => {
    if (authMode === 'student') {
      return studentMutate('saveChapter', payload as unknown as Record<string, unknown>, existingId || '');
    }
    if (!currentUser || !profile) return '';
    try {
      if (existingId) {
        await updateDoc(doc(db, 'chapters', existingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        return existingId;
      }
      const ref = await addDoc(collection(db, 'chapters'), {
        ...payload,
        authorUid: currentUser.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'chapters');
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteChapter', {}, chapterId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'chapters', chapterId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `chapters/${chapterId}`);
    }
  };

  const handleSaveMaterial = async (
    payload: Omit<StudyMaterial, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ): Promise<string> => {
    if (authMode === 'student') {
      return studentMutate(
        'saveMaterial',
        payload as unknown as Record<string, unknown>,
        existingId || ''
      );
    }
    if (!currentUser || !profile) return '';
    try {
      if (existingId) {
        await updateDoc(doc(db, 'materials', existingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        return existingId;
      }
      const ref = await addDoc(collection(db, 'materials'), {
        ...payload,
        authorUid: currentUser.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'materials');
    }
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteMaterial', {}, materialId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'materials', materialId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `materials/${materialId}`);
    }
  };

  const handleSaveFlashcardDeck = async (
    payload: Omit<FlashcardDeck, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ): Promise<string> => {
    if (authMode === 'student') {
      return studentMutate(
        'saveFlashcardDeck',
        payload as unknown as Record<string, unknown>,
        existingId || ''
      );
    }
    if (!currentUser || !profile) return '';
    try {
      if (existingId) {
        await updateDoc(doc(db, 'flashcardDecks', existingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        return existingId;
      }
      const ref = await addDoc(collection(db, 'flashcardDecks'), {
        ...payload,
        authorUid: currentUser.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'flashcardDecks');
    }
  };

  const handleDeleteFlashcardDeck = async (deckId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteFlashcardDeck', {}, deckId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'flashcardDecks', deckId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `flashcardDecks/${deckId}`);
    }
  };

  const handleSaveQuiz = async (
    payload: Omit<InteractiveQuiz, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ): Promise<string> => {
    if (authMode === 'student') {
      return studentMutate(
        'saveQuiz',
        payload as unknown as Record<string, unknown>,
        existingId || ''
      );
    }
    if (!currentUser || !profile) return '';
    try {
      if (existingId) {
        await updateDoc(doc(db, 'quizzes', existingId), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        return existingId;
      }
      const ref = await addDoc(collection(db, 'quizzes'), {
        ...payload,
        authorUid: currentUser.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'quizzes');
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteQuiz', {}, quizId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'quizzes', quizId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `quizzes/${quizId}`);
    }
  };

  const handleSubmitQuizAttempt = async (payload: {
    quiz: InteractiveQuiz;
    answers: Record<string, string>;
    autoScore: number;
    maxAutoScore: number;
    essayPendingCount: number;
  }): Promise<QuizAttempt> => {
    if (authMode === 'student' && studentToken) {
      const res = await fetch('/api/portal/student-quiz-attempt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          quizId: payload.quiz.id,
          answers: payload.answers,
          autoScore: payload.autoScore,
          maxAutoScore: payload.maxAutoScore,
          essayPendingCount: payload.essayPendingCount,
        }),
      });
      const created = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(created.error || 'Failed to submit quiz.');
      await fetchStudentPortalData(studentToken);
      return {
        id: String(created.id || ''),
        quizId: String(created.quizId || ''),
        quizTitle: String(created.quizTitle || ''),
        subject: String(created.subject || ''),
        studentUid: String(created.studentUid || ''),
        studentName: String(created.studentName || ''),
        answers: (created.answers as Record<string, string>) || {},
        autoScore: Number(created.autoScore || 0),
        maxAutoScore: Number(created.maxAutoScore || 0),
        totalPoints: Number(created.totalPoints || 1),
        essayPendingCount: Number(created.essayPendingCount || 0),
        essayFeedback: {},
        status: created.status === 'graded' ? 'graded' : 'submitted',
        submittedAt: created.submittedAt ? new Date(String(created.submittedAt)) : new Date(),
      };
    }

    if (!currentUser || !profile) {
      throw new Error('Must be signed in to submit quiz.');
    }
    const status = payload.essayPendingCount === 0 ? 'graded' : 'submitted';
    try {
      const ref = await addDoc(collection(db, 'quizAttempts'), {
        quizId: payload.quiz.id,
        quizTitle: payload.quiz.title,
        subject: payload.quiz.subject,
        studentUid: currentUser.uid,
        studentName: profile.fullName,
        answers: payload.answers,
        autoScore: payload.autoScore,
        maxAutoScore: payload.maxAutoScore,
        totalPoints: payload.quiz.totalPoints,
        essayPendingCount: payload.essayPendingCount,
        essayFeedback: {},
        status,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return {
        id: ref.id,
        quizId: payload.quiz.id,
        quizTitle: payload.quiz.title,
        subject: payload.quiz.subject,
        studentUid: currentUser.uid,
        studentName: profile.fullName,
        answers: payload.answers,
        autoScore: payload.autoScore,
        maxAutoScore: payload.maxAutoScore,
        totalPoints: payload.quiz.totalPoints,
        essayPendingCount: payload.essayPendingCount,
        essayFeedback: {},
        status,
        submittedAt: new Date(),
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'quizAttempts');
    }
  };

  const handleGradeAttempt = async (
    attemptId: string,
    payload: {
      autoScore: number;
      essayPendingCount: number;
      essayFeedback: Record<string, EssayFeedbackEntry>;
      status: 'submitted' | 'graded';
    }
  ) => {
    if (authMode === 'student') {
      await studentMutate('gradeAttempt', payload, attemptId);
      return;
    }
    const targetAttempt = combinedAttempts.find((a) => a.id === attemptId);
    if (targetAttempt && targetAttempt.studentUid.startsWith('stu_') && currentUser) {
      const token = await currentUser.getIdToken();
      await fetch('/api/portal/mutate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'gradeAttempt',
          payload,
          existingId: attemptId,
        }),
      });
      setStudentMirrorAttempts((prev) =>
        prev.map((a) => (a.id === attemptId ? { ...a, ...payload } : a))
      );
      return;
    }
    try {
      await updateDoc(doc(db, 'quizAttempts', attemptId), {
        ...payload,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `quizAttempts/${attemptId}`);
    }
  };

  const handleAddRosterStudent = async (payload: {
    fullName: string;
    studentId: string;
    enrollmentType: EnrollmentType;
    birthdayDisplay: string;
    roleLabel: 'Officer' | 'Student';
    officerTitle: string;
  }) => {
    if (authMode === 'student') {
      await studentMutate('addRosterStudent', payload as unknown as Record<string, unknown>);
      return;
    }
    try {
      const handle =
        payload.fullName.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';
      await addDoc(collection(db, 'roster'), {
        fullName: payload.fullName,
        handle: handle.slice(0, 32),
        studentId: payload.studentId,
        roleLabel: payload.roleLabel,
        officerTitle: payload.officerTitle,
        enrollmentType: payload.enrollmentType,
        birthdayDisplay: payload.birthdayDisplay,
        avatarId: AVATAR_OPTIONS[0].id,
        linkedUid: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'roster');
    }
  };

  const handleDeleteRosterStudent = async (id: string) => {
    if (authMode === 'student') {
      await studentMutate('deleteRosterStudent', {}, id);
      return;
    }
    try {
      await deleteDoc(doc(db, 'roster', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `roster/${id}`);
    }
  };

  const handlePromoteStudentToOfficer = async (member: RosterMember, title: string) => {
    if (authMode === 'student') {
      await studentMutate('updateRosterRole', { nextPosition: title }, member.id);
      return;
    }
    if (!currentUser || !member.linkedUid) return;
    try {
      const userSnap = await getDoc(doc(db, 'users', member.linkedUid));
      const email = userSnap.exists()
        ? String(userSnap.data().email || 'officer@ece1b.local')
        : 'officer@ece1b.local';
      await setDoc(doc(db, 'admins', member.linkedUid), {
        uid: member.linkedUid,
        email,
        fullName: member.fullName,
        title,
        addedBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'roster', member.id), {
        roleLabel: 'Officer',
        officerTitle: title,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `admins/${member.linkedUid}`);
    }
  };

  const handleDemoteOfficer = async (uid: string, rosterId: string) => {
    if (authMode === 'student') {
      await studentMutate('updateRosterRole', { nextPosition: 'Student' }, rosterId);
      return;
    }
    try {
      await deleteDoc(doc(db, 'admins', uid));
      await updateDoc(doc(db, 'roster', rosterId), {
        roleLabel: 'Student',
        officerTitle: '',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `admins/${uid}`);
    }
  };

  const handleUpdateRosterRole = async (member: RosterMember, nextPosition: string) => {
    if (authMode === 'student') {
      await studentMutate('updateRosterRole', { nextPosition }, member.id);
      return;
    }
    if (!currentUser) return;
    try {
      if (nextPosition === 'Student') {
        await updateDoc(doc(db, 'roster', member.id), {
          roleLabel: 'Student',
          officerTitle: '',
          updatedAt: serverTimestamp(),
        });
        if (member.linkedUid && member.linkedUid !== currentUser.uid) {
          const existingAdmin = admins.some((a) => a.uid === member.linkedUid);
          if (existingAdmin) {
            await deleteDoc(doc(db, 'admins', member.linkedUid));
          }
        }
        return;
      }

      await updateDoc(doc(db, 'roster', member.id), {
        roleLabel: 'Officer',
        officerTitle: nextPosition,
        updatedAt: serverTimestamp(),
      });

      if (member.linkedUid) {
        const existingAdmin = admins.some((a) => a.uid === member.linkedUid);
        if (existingAdmin) {
          await updateDoc(doc(db, 'admins', member.linkedUid), {
            title: nextPosition,
          });
        } else {
          const userSnap = await getDoc(doc(db, 'users', member.linkedUid));
          const email = userSnap.exists()
            ? String(userSnap.data().email || 'officer@ece1b.local')
            : 'officer@ece1b.local';
          await setDoc(doc(db, 'admins', member.linkedUid), {
            uid: member.linkedUid,
            email,
            fullName: member.fullName,
            title: nextPosition,
            addedBy: currentUser.uid,
            createdAt: serverTimestamp(),
          });
        }

        if (member.linkedUid === currentUser.uid) {
          setOfficerTitle(nextPosition);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `roster/${member.id}`);
    }
  };

  const handleCreateOfficerInvite = async (email: string, title: string) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'officerInvites'), {
        email: email.trim().toLowerCase(),
        title,
        invitedBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'officerInvites');
    }
  };

  const handleDeleteOfficerInvite = async (inviteId: string) => {
    try {
      await deleteDoc(doc(db, 'officerInvites', inviteId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `officerInvites/${inviteId}`);
    }
  };

  // --- Loading Screen ---
  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F7F6F9] flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#E4DEF2] mx-auto bg-[#14131D]">
            <img
              src={PORTAL_EMBLEM_SRC}
              alt="ECE 1B Portal Emblem"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="font-display text-sm font-bold text-[#1B162B]">
            Loading ECE 1B Class Portal...
          </p>
        </div>
      </div>
    );
  }

  const isAuthenticated =
    (authMode === 'firebase' && Boolean(currentUser) && Boolean(profile)) ||
    (authMode === 'student' && Boolean(studentToken) && Boolean(profile));

  // --- Sign-In Gate ---
  if (!isAuthenticated || !profile) {
    return (
      <div className="min-h-screen bg-[#F7F6F9] flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-3xl w-full bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 shadow-sm">
          <div className="md:col-span-5 bg-[#14131D] text-white p-6 sm:p-8 flex flex-col justify-between items-center text-center border-b md:border-b-0 md:border-r border-[#2B283C]">
            <div className="w-44 h-44 sm:w-48 sm:h-48 rounded-2xl overflow-hidden border border-[#35314B] bg-[#1F1D2C]">
              <img
                src={PORTAL_EMBLEM_SRC}
                alt="ECE 1B Announcement Board Emblem"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-5 space-y-1">
              <div className="font-mono text-[11px] font-semibold text-[#C4B5FD] uppercase tracking-wider">
                Bulacan State University
              </div>
              <div className="font-display text-xl font-extrabold text-white">ECE 1B</div>
              <p className="text-xs text-[#B6B2C8]">
                BS Electronics Engineering · 2nd Sem AY 2026–2027
              </p>
            </div>
          </div>

          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
            <h1 className="font-display text-2xl font-extrabold text-[#1B162B] tracking-tight">
              ECE 1B Class Portal
            </h1>
            <p className="text-xs sm:text-sm text-[#615A78] mt-1.5 leading-relaxed">
              Sign in with your BulSU student number (verified against the 55-student masterlist) or use Google for officer access.
            </p>

            {authError && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-3.5 py-2.5 text-xs">
                {authError}
              </div>
            )}

            {/* Student Number + Password Flow */}
            {!lookupResult?.found ? (
              <form onSubmit={handleLookupStudent} className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Student Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={studentNumberInput}
                      onChange={(e) => setStudentNumberInput(e.target.value)}
                      placeholder="e.g. 2026001612"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono focus:outline-none focus:border-[#6D28D9]"
                    />
                    <button
                      type="submit"
                      disabled={lookingUp}
                      className="px-4 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer whitespace-nowrap"
                    >
                      {lookingUp ? 'Checking...' : 'Continue'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleStudentAuthSubmit} className="mt-5 space-y-3">
                <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-xl p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono text-[#6D28D9]">
                      {studentNumberInput.trim()} ·{' '}
                      {lookupResult.roleLabel === 'Officer'
                        ? lookupResult.officerTitle || 'Officer'
                        : lookupResult.enrollmentType || 'Regular'}
                    </div>
                    <div className="text-sm font-bold text-[#1B162B] truncate">
                      {lookupResult.fullName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setLookupResult(null);
                      setAuthError('');
                      setPasswordInput('');
                      setConfirmPasswordInput('');
                    }}
                    className="text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer shrink-0"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    {lookupResult.hasPassword
                      ? 'Enter Password'
                      : 'Create a Password (first-time setup, min 8 characters)'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                {!lookupResult.hasPassword && (
                  <div>
                    <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      maxLength={128}
                      value={confirmPasswordInput}
                      onChange={(e) => setConfirmPasswordInput(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={signingIn}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#6D28D9] text-white text-sm font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  <KeyRound className="w-4 h-4" />
                  {signingIn
                    ? 'Signing in...'
                    : lookupResult.hasPassword
                      ? 'Sign In'
                      : 'Create Password & Enter Portal'}
                </button>
              </form>
            )}

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-[#E4DEF2]" />
              <span className="text-[11px] font-medium text-[#8E86A8] uppercase">or</span>
              <div className="h-px flex-1 bg-[#E4DEF2]" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full py-2.5 px-5 rounded-xl border border-[#DDD5EC] bg-white text-[#1B162B] text-xs font-semibold hover:bg-[#F5F1FC] transition-colors disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? 'Connecting to Google...' : 'Sign in with Google (Officers & Linked Accounts)'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const effectiveUid = profile.uid;

  const navItems: Array<{
    id: TabKey;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'home', label: 'Overview', mobileLabel: 'Overview', icon: Home },
    { id: 'kiosk', label: 'Subjects & Schedule', mobileLabel: 'Schedule', icon: CalendarDays },
    { id: 'todo', label: 'To-Do & Deadlines', mobileLabel: 'To-Do', icon: CheckSquare },
    { id: 'reviewer', label: 'Reviewer & Quizzes', mobileLabel: 'Reviewer', icon: BookOpen },
    { id: 'class', label: 'Class Masterlist', mobileLabel: 'Masterlist', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#F7F6F9] text-[#1B162B] pb-20 lg:pb-10">
      {/* Desktop Persistent Left Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white border-r border-[#E4DEF2] z-30">
        {/* Brand Header */}
        <div className="px-5 py-5 border-b border-[#EFEBF7] flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 text-left cursor-pointer min-w-0"
          >
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-[#E4DEF2] bg-[#14131D] shrink-0">
              <img
                src={PORTAL_EMBLEM_SRC}
                alt="ECE 1B Emblem"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="font-display text-base font-extrabold text-[#1B162B] leading-tight">
                ECE 1B
              </div>
              <div className="text-[11px] text-[#615A78] truncate">
                BulSU · BS ECE 2nd Sem
              </div>
            </div>
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'bg-[#F3EFFA] text-[#5B21B6] font-semibold'
                    : 'text-[#615A78] hover:bg-[#FAF8FE] hover:text-[#1B162B]'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#6D28D9]' : 'text-[#8E86A8]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom Profile & Settings */}
        <div className="p-4 border-t border-[#EFEBF7] bg-[#FAF8FE] space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-bold text-[#1B162B] truncate">{profile.fullName}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[#615A78] mt-0.5">
              <span className="font-mono text-[#6D28D9]">
                {profile.studentId || 'No Student No.'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">
                {isAdmin ? officerTitle || 'Officer' : profile.enrollmentType}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDD5EC] bg-white text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5 text-[#6D28D9]" />
              Profile
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="inline-flex items-center justify-center px-3 py-2 rounded-xl border border-[#DDD5EC] bg-white text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] transition-colors cursor-pointer"
              aria-label="Account and portal settings"
            >
              <Settings className="w-3.5 h-3.5 text-[#615A78]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile / Tablet Top Header */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E4DEF2]">
        <div className="px-4 h-14 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-[#E4DEF2] bg-[#14131D] shrink-0">
              <img
                src={PORTAL_EMBLEM_SRC}
                alt="ECE 1B Emblem"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-left">
              <div className="font-display text-sm font-extrabold text-[#1B162B] leading-none">
                ECE 1B
              </div>
              <div className="text-[10px] text-[#615A78] mt-0.5">BulSU BS ECE</div>
            </div>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditProfileOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
            >
              <Pencil className="w-3 h-3 text-[#6D28D9]" />
              Profile
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-2 rounded-lg border border-[#DDD5EC] text-[#615A78] hover:bg-[#F3EFFA] cursor-pointer"
              aria-label="Account settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <div className="lg:pl-64">
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8">
          {activeTab === 'home' && (
            <HomeView
              profile={profile}
              isAdmin={isAdmin}
              officerTitle={officerTitle}
              tasks={tasks}
              completedTaskIds={completedTaskIds}
              announcements={announcements}
              quizzes={quizzes}
              scheduleSlots={scheduleSlots}
              rosterCount={deduplicatedRosterCount}
              onOpenEditProfile={() => setEditProfileOpen(true)}
              onToggleTask={handleToggleTask}
              onCreateAnnouncement={handleCreateAnnouncement}
              onDeleteAnnouncement={handleDeleteAnnouncement}
              onNavigate={setActiveTab}
            />
          )}

          {activeTab === 'todo' && (
            <TodoView
              tasks={tasks}
              completedTaskIds={completedTaskIds}
              isAdmin={isAdmin}
              onToggleTask={handleToggleTask}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
            />
          )}

          {activeTab === 'reviewer' && (
            <ReviewerView
              isAdmin={isAdmin}
              currentUid={effectiveUid}
              getAuthToken={getAuthToken}
              chapters={chapters}
              materials={materials}
              flashcardDecks={flashcardDecks}
              quizzes={quizzes}
              attempts={combinedAttempts}
              onSaveChapter={handleSaveChapter}
              onDeleteChapter={handleDeleteChapter}
              onSaveMaterial={handleSaveMaterial}
              onDeleteMaterial={handleDeleteMaterial}
              onSaveFlashcardDeck={handleSaveFlashcardDeck}
              onDeleteFlashcardDeck={handleDeleteFlashcardDeck}
              onSaveQuiz={handleSaveQuiz}
              onDeleteQuiz={handleDeleteQuiz}
              onSubmitQuizAttempt={handleSubmitQuizAttempt}
              onGradeAttempt={handleGradeAttempt}
            />
          )}

          {activeTab === 'kiosk' && (
            <KioskView
              scheduleSlots={scheduleSlots}
              kioskLinks={kioskLinks}
              isAdmin={isAdmin}
              onCreateSlot={handleCreateSlot}
              onDeleteSlot={handleDeleteSlot}
              onCreateLink={handleCreateLink}
              onDeleteLink={handleDeleteLink}
            />
          )}

          {activeTab === 'class' && (
            <ClassView
              currentUid={effectiveUid}
              isAdmin={isAdmin}
              roster={roster}
              admins={admins}
              officerInvites={officerInvites}
              onSyncOfficialData={async () => {
                if (authMode === 'student') {
                  await studentMutate('syncOfficial', {});
                  return;
                }
                if (currentUser) {
                  await syncOfficialCorAndMasterlist(currentUser.uid, profile.fullName, true);
                }
              }}
              onAddRosterStudent={handleAddRosterStudent}
              onUpdateRosterRole={handleUpdateRosterRole}
              onDeleteRosterStudent={handleDeleteRosterStudent}
              onPromoteStudentToOfficer={handlePromoteStudentToOfficer}
              onDemoteOfficer={handleDemoteOfficer}
              onCreateOfficerInvite={handleCreateOfficerInvite}
              onDeleteOfficerInvite={handleDeleteOfficerInvite}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E4DEF2] px-2 py-1.5"
      >
        <div className="grid grid-cols-5 gap-1 items-center max-w-lg mx-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[44px] px-1.5 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#F3EFFA] text-[#5B21B6]'
                    : 'text-[#615A78] hover:text-[#1B162B]'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#6D28D9]' : ''}`} />
                <span className="truncate">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Edit Profile Modal */}
      <EditProfileModal
        profile={profile}
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        onSaveProfile={handleSaveProfile}
      />

      {/* Account & Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-md w-full p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">Account & Portal</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F3EFFA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-1.5">
                <div className="text-[#615A78]">Signed in as</div>
                <div className="text-sm font-bold text-[#1B162B]">{profile.fullName}</div>
                <div className="text-[#615A78]">
                  {authMode === 'student' ? 'Student Number Session' : profile.email}
                </div>
                {profile.studentId && (
                  <div className="font-mono text-[#6D28D9] pt-0.5">
                    Student No. {profile.studentId}
                  </div>
                )}
              </div>

              <div className="bg-[#F3EFFA] border border-[#DFD4F6] rounded-2xl p-4 flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-[#6D28D9] shrink-0" />
                <div>
                  <div className="font-semibold text-[#5B21B6]">
                    {isAdmin
                      ? `Administrator · ${officerTitle || 'Class Officer'}`
                      : 'ECE 1B Student'}
                  </div>
                  <div className="text-[#41287A] mt-0.5">
                    {isAdmin
                      ? 'You can organize chapters, edit materials/PDFs, create flashcards & quizzes, post announcements, and edit schedules.'
                      : 'You can browse subject chapters, view PDFs, study flashcards, track deadlines, and take interactive quizzes.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleSignOutAll}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    setEditProfileOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-[#1B162B] text-xs font-semibold hover:bg-[#F3EFFA] cursor-pointer"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PortalShell />
    </ErrorBoundary>
  );
}
