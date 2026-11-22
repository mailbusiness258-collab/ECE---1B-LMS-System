import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  OFFICIAL_COR_SCHEDULE,
  OFFICIAL_ECE1B_MASTERLIST,
} from './src/lib/ece1bCatalog.ts';

interface FirebaseClientConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId: string;
}

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig: FirebaseClientConfig = JSON.parse(
  fs.readFileSync(firebaseConfigPath, 'utf-8')
);

const BOOTSTRAPPED_ADMIN_EMAIL = 'mailbusiness258@gmail.com';
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ACCOUNTS_FILE = path.resolve(DATA_DIR, 'student-accounts.json');
const PORTAL_STORE_FILE = path.resolve(DATA_DIR, 'portal-store.json');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// --- Persistent JSON Stores (Student Accounts + Portal Mirror) ---
interface StudentAccountRecord {
  studentNumber: string;
  uid: string;
  salt: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredRosterMember {
  id: string;
  fullName: string;
  handle: string;
  studentId: string;
  roleLabel: 'Officer' | 'Student';
  officerTitle: string;
  enrollmentType: 'Regular' | 'Irregular';
  birthdayDisplay: string;
  avatarId: string;
  linkedUid: string;
}

interface StoredPortalData {
  chapters: Array<Record<string, unknown>>;
  materials: Array<Record<string, unknown>>;
  flashcardDecks: Array<Record<string, unknown>>;
  quizzes: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  announcements: Array<Record<string, unknown>>;
  scheduleSlots: Array<Record<string, unknown>>;
  roster: StoredRosterMember[];
  kioskLinks: Array<Record<string, unknown>>;
  taskProgressByUid: Record<string, string[]>;
  quizAttempts: Array<Record<string, unknown>>;
  updatedAt: string;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function buildStarterPortalData(): StoredPortalData {
  const now = Date.now();
  const isoHoursFromNow = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

  const roster: StoredRosterMember[] = OFFICIAL_ECE1B_MASTERLIST.map((stu) => {
    const handleBase =
      stu.fullName
        .split(',')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') || 'student';
    return {
      id: `stu_${stu.studentNumber}`,
      fullName: stu.fullName,
      handle: handleBase.slice(0, 30),
      studentId: stu.studentNumber,
      roleLabel: 'Student',
      officerTitle: '',
      enrollmentType: 'Regular',
      birthdayDisplay: '',
      avatarId: 'blank',
      linkedUid: '',
    };
  });

  return {
    chapters: [
      {
        id: 'chap_coe104_ch1',
        title: 'Chapter 1: Antiderivatives & Integration Techniques',
        subject: 'COE 104',
        order: 1,
        description:
          'Power rules, u-substitution, integration by parts (LIATE), and definite integral bounds.',
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
      {
        id: 'chap_ece103_ch1',
        title: 'Chapter 1: Electrostatics & Gauss Law',
        subject: 'ECE 103',
        order: 1,
        description: 'Electric charge, Coulomb law, electric field lines, and Gaussian surfaces.',
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
    ],
    materials: [
      {
        id: 'mat_coe104_calc2_rev',
        title: 'COE 104 Calculus 2: Integration Techniques Reviewer',
        subject: 'COE 104',
        chapterId: 'chap_coe104_ch1',
        category: 'Reviewer',
        description:
          'Core integration formulas, u-substitution, integration by parts, and trigonometric identities for Calculus 2.',
        contentBody:
          'Accumulation and antiderivative problems build directly on recognizing composite derivatives and choosing the right integration rule.\n\n1. U-Substitution: Look for an inner function g(x) whose derivative g\'(x) also appears inside the integrand. Set u = g(x) and du = g\'(x) dx.\n\n2. Integration by Parts: integral(u dv) = uv - integral(v du). Use the LIATE priority order (Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential) when choosing u.\n\n3. Definite Integrals: Either transform the lower and upper limits into u-values immediately, or substitute back to x before evaluating F(b) - F(a).',
        links: [
          {
            label: "Paul's Online Math Notes — Calculus II",
            url: 'https://tutorial.math.lamar.edu/Classes/CalcII/CalcII.aspx',
          },
        ],
        images: [],
        fileName: 'COE104_Calculus2_Integration_Reviewer.txt',
        fileUrl: '',
        mimeType: 'text/plain',
        extractedSummary:
          'Covers basic antiderivative power rules, u-substitution for composite functions, Integration by Parts (LIATE rule: Logarithmic, Inverse trig, Algebraic, Trigonometric, Exponential), and definite integral bounds substitution.',
        linkedQuizId: 'quiz_coe104_calc2',
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
    ],
    flashcardDecks: [
      {
        id: 'deck_coe104_ch1',
        title: 'Integration Rules & LIATE Flashcards',
        subject: 'COE 104',
        chapterId: 'chap_coe104_ch1',
        description: 'Quick-recall cards for basic antiderivatives and integration by parts.',
        cards: [
          {
            id: 'fc_calc_1',
            front: 'Integration by Parts Formula',
            back: 'integral(u dv) = uv - integral(v du)',
          },
          {
            id: 'fc_calc_2',
            front: 'LIATE Priority Order for choosing u',
            back: 'Logarithmic, Inverse trigonometric, Algebraic, Trigonometric, Exponential',
          },
          {
            id: 'fc_calc_3',
            front: 'integral(1 / x) dx',
            back: 'ln|x| + C',
          },
          {
            id: 'fc_calc_4',
            front: 'integral(sec^2(x)) dx',
            back: 'tan(x) + C',
          },
        ],
        cardCount: 4,
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
    ],
    quizzes: [
      {
        id: 'quiz_coe104_calc2',
        title: 'COE 104 Calculus 2 Practice Quiz',
        subject: 'COE 104',
        chapterId: 'chap_coe104_ch1',
        description:
          'Interactive practice covering integration techniques, identification, and step-by-step reasoning.',
        sourceMaterialId: 'mat_coe104_calc2_rev',
        published: true,
        timeLimitMinutes: 15,
        questionCount: 4,
        totalPoints: 10,
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
        questions: [
          {
            id: 'q_calc_1',
            type: 'multiple_choice',
            prompt: 'Which choice is the indefinite integral of 2x * cos(x^2) dx?',
            options: ['sin(x^2) + C', '-sin(x^2) + C', '2*sin(x^2) + C', 'cos(x^2) + C'],
            correctAnswer: 'sin(x^2) + C',
            acceptedAnswers: [],
            rubric: '',
            explanation:
              'Let u = x^2 so du = 2x dx. Integrating cos(u) du gives sin(u) + C = sin(x^2) + C.',
            points: 2,
          },
          {
            id: 'q_calc_2',
            type: 'identification',
            prompt:
              'What mnemonic acronym is commonly used to pick the "u" factor in Integration by Parts?',
            options: [],
            correctAnswer: 'LIATE',
            acceptedAnswers: ['ILATE'],
            rubric: '',
            explanation:
              'LIATE stands for Logarithmic, Inverse trigonometric, Algebraic, Trigonometric, Exponential.',
            points: 2,
          },
          {
            id: 'q_calc_3',
            type: 'true_false',
            prompt:
              'When evaluating a definite integral using u-substitution, you may either change the limits to u-values or substitute back to x before applying the original limits.',
            options: ['True', 'False'],
            correctAnswer: 'True',
            acceptedAnswers: [],
            rubric: '',
            explanation: 'Both approaches yield the exact same definite value if applied consistently.',
            points: 1,
          },
          {
            id: 'q_calc_4',
            type: 'essay',
            prompt:
              'Explain the Integration by Parts formula and demonstrate which part should be chosen as u when integrating x * e^x dx.',
            options: [],
            correctAnswer:
              'The formula is integral(u dv) = uv - integral(v du). Choose u = x (algebraic) and dv = e^x dx (exponential) because differentiating x simplifies it to 1, yielding x*e^x - e^x + C.',
            acceptedAnswers: [],
            rubric: 'States uv - integral(v du), selects u = x and dv = e^x dx, and gives final result.',
            explanation: 'Choosing u = x reduces the polynomial degree after one differentiation step.',
            points: 5,
          },
        ],
      },
    ],
    tasks: [
      {
        id: 'task_coe104_calc2_quiz',
        title: 'Quiz 1: Antiderivatives & Substitution',
        subject: 'COE 104',
        type: 'Quiz',
        description:
          'Calculus 2 diagnostic and integration by substitution quiz with Prof. Raevinor Gonzales at NH 406*.',
        dueAt: isoHoursFromNow(44),
        authorUid: 'system_seed',
      },
      {
        id: 'task_ece103l_lab_prelim',
        title: 'Lab Sheet 01: Electrostatics & Electric Field Mapping',
        subject: 'ECE 103L',
        type: 'Assignment',
        description:
          'Prepare pre-lab calculations and equipotential sketches for Engr./Prof. Rina Santiago (COE 2 203).',
        dueAt: isoHoursFromNow(26),
        authorUid: 'system_seed',
      },
      {
        id: 'task_ece101l_cad_plate',
        title: 'CAD Plate 01: Orthographic & Layer Setup',
        subject: 'ECE 101L',
        type: 'Assignment',
        description:
          'Submit DWG and PDF export for Computer-Aided Design under Prof. Nemuel Norman Giron (NH 401*).',
        dueAt: isoHoursFromNow(96),
        authorUid: 'system_seed',
      },
      {
        id: 'task_ece102_materials',
        title: 'Reading Check: Atomic Bonding & Crystal Structures',
        subject: 'ECE 102',
        type: 'Requirement',
        description:
          'Review Chapters 2-3 for Materials Science and Engineering with Engr. Amor Lacara (COE 2 - 405*).',
        dueAt: isoHoursFromNow(68),
        authorUid: 'system_seed',
      },
    ],
    announcements: [
      {
        id: 'ann_cor_2ndsem',
        title: 'BulSU ECE 1B — 2nd Semester AY 2026–2027 Portal Active',
        body: 'Official COR schedule (12 subjects, 29 total units) and the 55-student ECE 1B Masterlist are now synced. Check Subjects & Schedule for room assignments including COE 2 - 506*, NH 406*, NH 502*, NH 401*, and COE 2 203.',
        category: 'General',
        pinned: true,
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
      {
        id: 'ann_lab_safety',
        title: 'Physics 2 & Engineers Lab Guidelines (ECE 103L / COE 105L)',
        body: 'Bring closed shoes, scientific calculators, and lab notebooks for COE 2 203 and NH 502* laboratory sessions.',
        category: 'Urgent',
        pinned: false,
        authorUid: 'system_seed',
        authorName: 'ECE 1B Officer',
      },
    ],
    scheduleSlots: OFFICIAL_COR_SCHEDULE.map((s) => ({ ...s })),
    roster,
    kioskLinks: [
      {
        id: 'link_bulsu_portal',
        title: 'BulSU Student Portal',
        subtitle: 'Official Bulacan State University student grades and COR portal',
        url: 'https://bulsu.edu.ph',
        category: 'Portal',
      },
      {
        id: 'link_drive',
        title: 'ECE 1B Shared Drive',
        subtitle: 'Lecture slides, CAD plates, and lab manuals',
        url: 'https://drive.google.com',
        category: 'Drive',
      },
    ],
    taskProgressByUid: {},
    quizAttempts: [],
    updatedAt: new Date().toISOString(),
  };
}

function getStudentAccounts(): Record<string, StudentAccountRecord> {
  return readJsonFile<Record<string, StudentAccountRecord>>(ACCOUNTS_FILE, {});
}

function saveStudentAccounts(accounts: Record<string, StudentAccountRecord>): void {
  writeJsonFile(ACCOUNTS_FILE, accounts);
}

function getPortalStore(): StoredPortalData {
  const fallback = buildStarterPortalData();
  const existing = readJsonFile<StoredPortalData | null>(PORTAL_STORE_FILE, null);
  if (!existing || !Array.isArray(existing.roster) || existing.roster.length === 0) {
    writeJsonFile(PORTAL_STORE_FILE, fallback);
    return fallback;
  }

  // Auto-ensure all 55 official masterlist students exist in portalStore.roster
  let dirty = false;
  const existingIds = new Set(existing.roster.map((r) => r.studentId));
  for (const stu of OFFICIAL_ECE1B_MASTERLIST) {
    if (!existingIds.has(stu.studentNumber)) {
      const handleBase =
        stu.fullName
          .split(',')[0]
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') || 'student';
      existing.roster.push({
        id: `stu_${stu.studentNumber}`,
        fullName: stu.fullName,
        handle: handleBase.slice(0, 30),
        studentId: stu.studentNumber,
        roleLabel: 'Student',
        officerTitle: '',
        enrollmentType: 'Regular',
        birthdayDisplay: '',
        avatarId: 'blank',
        linkedUid: '',
      });
      dirty = true;
    }
  }
  if (!Array.isArray(existing.chapters)) {
    existing.chapters = fallback.chapters;
    dirty = true;
  }
  if (!Array.isArray(existing.flashcardDecks)) {
    existing.flashcardDecks = fallback.flashcardDecks;
    dirty = true;
  }
  if (!existing.taskProgressByUid) {
    existing.taskProgressByUid = {};
    dirty = true;
  }
  if (!Array.isArray(existing.quizAttempts)) {
    existing.quizAttempts = [];
    dirty = true;
  }
  if (dirty) {
    existing.updatedAt = new Date().toISOString();
    writeJsonFile(PORTAL_STORE_FILE, existing);
  }
  return existing;
}

function savePortalStore(data: StoredPortalData): void {
  data.updatedAt = new Date().toISOString();
  writeJsonFile(PORTAL_STORE_FILE, data);
}

// --- Password & Token Utilities ---
function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password: string, salt: string, storedHashHex: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64);
  const stored = Buffer.from(storedHashHex, 'hex');
  if (derived.length !== stored.length) return false;
  return crypto.timingSafeEqual(derived, stored);
}

interface StudentTokenPayload {
  typ: 'student';
  uid: string;
  studentNumber: string;
  exp: number;
}

function signStudentToken(uid: string, studentNumber: string): string {
  const payload: StudentTokenPayload = {
    typ: 'student',
    uid,
    studentNumber,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `st_${encoded}.${sig}`;
}

function verifyStudentToken(token: string): StudentTokenPayload | null {
  if (!token || !token.startsWith('st_') || token.length > 2048) return null;
  const raw = token.slice(3);
  const dotIdx = raw.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf-8');
  const expectedBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as StudentTokenPayload;
    if (
      parsed.typ !== 'student' ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.studentNumber !== 'string' ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeImageOrInternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 500) return false;
  if (/^\/api\/materials\/files\/[a-zA-Z0-9_\-]+\.(png|jpg|webp)$/.test(trimmed)) {
    return true;
  }
  return isSafeExternalUrl(trimmed);
}

function findRosterMemberByStudentNumber(
  store: StoredPortalData,
  studentNumber: string
): StoredRosterMember | undefined {
  const clean = studentNumber.trim();
  // Prefer linked profile entry if duplicated, otherwise stu_ entry
  const matches = store.roster.filter((m) => m.studentId.trim() === clean);
  if (matches.length === 0) return undefined;
  return matches.find((m) => Boolean(m.linkedUid)) || matches[0];
}

// --- Express Auth Types & Middleware ---
interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
  studentNumber?: string;
  authType: 'firebase' | 'student';
  idToken: string;
}

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

async function verifyFirebaseToken(idToken: string): Promise<AuthenticatedUser | null> {
  if (!idToken || idToken.length > 8192 || idToken.startsWith('st_')) return null;
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; displayName?: string }>;
  };
  const user = data.users?.[0];
  if (!user?.localId || !user?.email || !user.emailVerified) {
    return null;
  }
  return {
    uid: user.localId,
    email: user.email.toLowerCase(),
    emailVerified: Boolean(user.emailVerified),
    fullName: user.displayName,
    authType: 'firebase',
    idToken,
  };
}

async function checkIsAdmin(user: AuthenticatedUser): Promise<boolean> {
  if (user.authType === 'student') {
    const store = getPortalStore();
    const member = findRosterMemberByStudentNumber(store, user.studentNumber || '');
    return Boolean(member && member.roleLabel === 'Officer');
  }
  if (user.email === BOOTSTRAPPED_ADMIN_EMAIL && user.emailVerified) {
    return true;
  }
  const safeUid = user.uid.replace(/[^a-zA-Z0-9_\-]/g, '');
  if (!safeUid || safeUid !== user.uid) return false;
  const dbId = encodeURIComponent(firebaseConfig.firestoreDatabaseId || '(default)');
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${dbId}/documents/admins/${encodeURIComponent(safeUid)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${user.idToken}`,
    },
  });
  return res.ok;
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const token = match[1].trim();

    if (token.startsWith('st_')) {
      const payload = verifyStudentToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Session expired. Please sign in again with your student number.' });
        return;
      }
      const store = getPortalStore();
      const member = findRosterMemberByStudentNumber(store, payload.studentNumber);
      if (!member) {
        res.status(401).json({ error: 'Student number not found in class masterlist.' });
        return;
      }
      req.user = {
        uid: payload.uid,
        email: `${payload.studentNumber}@ece1b.bulsu.local`,
        emailVerified: true,
        fullName: member.fullName,
        studentNumber: payload.studentNumber,
        authType: 'student',
        idToken: token,
      };
      next();
      return;
    }

    const verified = await verifyFirebaseToken(token);
    if (!verified) {
      res.status(401).json({ error: 'Invalid or unverified session token.' });
      return;
    }
    req.user = verified;
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(401).json({ error: 'Unable to verify authentication.' });
  }
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
      }
      const isAdmin = await checkIsAdmin(req.user);
      if (!isAdmin) {
        res.status(403).json({ error: 'Officer or administrator permission required.' });
        return;
      }
      next();
    } catch (error) {
      console.error('Admin verification error:', error);
      res.status(403).json({ error: 'Unable to verify officer permission.' });
    }
  });
}

const MIME_EXT_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const EXT_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

function buildStudentSessionResponse(member: StoredRosterMember, studentNumber: string, token: string) {
  const isOfficer = member.roleLabel === 'Officer';
  return {
    token,
    isAdmin: isOfficer,
    officerTitle: isOfficer ? member.officerTitle || 'Class Officer' : '',
    profile: {
      uid: `stu_${studentNumber}`,
      email: `${studentNumber}@ece1b.bulsu.local`,
      fullName: member.fullName,
      handle: member.handle || 'student',
      studentId: studentNumber,
      birthday: member.birthdayDisplay || '',
      enrollmentType: member.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular',
      avatarId: member.avatarId || 'blank',
    },
  };
}

async function startServer() {
  // Ensure starter portal store is initialized on boot
  getPortalStore();

  const app = express();
  app.use(express.json({ limit: '20mb' }));

  // --- Student Number + Password Authentication ---
  app.post('/api/auth/lookup-student', (req: Request, res: Response) => {
    const raw = typeof req.body?.studentNumber === 'string' ? req.body.studentNumber : '';
    const studentNumber = raw.trim();
    if (!/^[a-zA-Z0-9\-]{4,25}$/.test(studentNumber)) {
      res.status(400).json({ error: 'Enter a valid BulSU student number (e.g. 2026001612).' });
      return;
    }

    const store = getPortalStore();
    const member = findRosterMemberByStudentNumber(store, studentNumber);
    if (!member) {
      res.json({ found: false });
      return;
    }

    const accounts = getStudentAccounts();
    const hasPassword = Boolean(accounts[studentNumber]);
    res.json({
      found: true,
      fullName: member.fullName,
      roleLabel: member.roleLabel,
      officerTitle: member.officerTitle,
      enrollmentType: member.enrollmentType,
      hasPassword,
    });
  });

  app.post('/api/auth/register-student', (req: Request, res: Response) => {
    const studentNumber =
      typeof req.body?.studentNumber === 'string' ? req.body.studentNumber.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!/^[a-zA-Z0-9\-]{4,25}$/.test(studentNumber)) {
      res.status(400).json({ error: 'Invalid student number format.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
      return;
    }

    const store = getPortalStore();
    const member = findRosterMemberByStudentNumber(store, studentNumber);
    if (!member) {
      res.status(404).json({
        error: 'Student number is not in the synced ECE 1B masterlist. Ask an officer to add you first.',
      });
      return;
    }

    const accounts = getStudentAccounts();
    if (accounts[studentNumber]) {
      res.status(409).json({
        error: 'This student number already has a password. Please sign in instead.',
      });
      return;
    }

    const { salt, hash } = hashPassword(password);
    const uid = `stu_${studentNumber}`;
    const nowIso = new Date().toISOString();
    accounts[studentNumber] = {
      studentNumber,
      uid,
      salt,
      hash,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    saveStudentAccounts(accounts);

    const token = signStudentToken(uid, studentNumber);
    res.json(buildStudentSessionResponse(member, studentNumber, token));
  });

  app.post('/api/auth/login-student', (req: Request, res: Response) => {
    const studentNumber =
      typeof req.body?.studentNumber === 'string' ? req.body.studentNumber.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!studentNumber || !password) {
      res.status(400).json({ error: 'Student number and password are required.' });
      return;
    }

    const store = getPortalStore();
    const member = findRosterMemberByStudentNumber(store, studentNumber);
    const accounts = getStudentAccounts();
    const account = accounts[studentNumber];

    if (!member || !account || !verifyPassword(password, account.salt, account.hash)) {
      res.status(401).json({ error: 'Incorrect student number or password.' });
      return;
    }

    const token = signStudentToken(account.uid, studentNumber);
    res.json(buildStudentSessionResponse(member, studentNumber, token));
  });

  app.get('/api/auth/session', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || req.user.authType !== 'student' || !req.user.studentNumber) {
      res.status(400).json({ error: 'Student session token required.' });
      return;
    }
    const store = getPortalStore();
    const member = findRosterMemberByStudentNumber(store, req.user.studentNumber);
    if (!member) {
      res.status(404).json({ error: 'Student not found in masterlist.' });
      return;
    }
    res.json(buildStudentSessionResponse(member, req.user.studentNumber, req.user.idToken));
  });

  app.post('/api/auth/update-profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user || req.user.authType !== 'student' || !req.user.studentNumber) {
      res.status(400).json({ error: 'Student session required.' });
      return;
    }
    const store = getPortalStore();
    const cleanNum = req.user.studentNumber;
    const idx = store.roster.findIndex((r) => r.studentId.trim() === cleanNum);
    if (idx === -1) {
      res.status(404).json({ error: 'Masterlist profile not found.' });
      return;
    }

    const fullName =
      typeof req.body?.fullName === 'string' && req.body.fullName.trim()
        ? req.body.fullName.trim().slice(0, 120)
        : store.roster[idx].fullName;
    const handle =
      typeof req.body?.handle === 'string' && req.body.handle.trim()
        ? req.body.handle.trim().slice(0, 40)
        : store.roster[idx].handle;
    const birthday =
      typeof req.body?.birthday === 'string'
        ? req.body.birthday.trim().slice(0, 40)
        : store.roster[idx].birthdayDisplay;
    const enrollmentType =
      req.body?.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular';

    store.roster[idx] = {
      ...store.roster[idx],
      fullName,
      handle,
      birthdayDisplay: birthday,
      enrollmentType,
    };
    savePortalStore(store);

    res.json(buildStudentSessionResponse(store.roster[idx], cleanNum, req.user.idToken));
  });

  // --- Portal Mirror & Student-Number Data Endpoints ---
  app.post('/api/portal/sync', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const store = getPortalStore();
      const body = req.body as Partial<StoredPortalData>;

      if (Array.isArray(body.chapters)) store.chapters = body.chapters;
      if (Array.isArray(body.materials)) store.materials = body.materials;
      if (Array.isArray(body.flashcardDecks)) store.flashcardDecks = body.flashcardDecks;
      if (Array.isArray(body.quizzes)) store.quizzes = body.quizzes;
      if (Array.isArray(body.tasks)) store.tasks = body.tasks;
      if (Array.isArray(body.announcements)) store.announcements = body.announcements;
      if (Array.isArray(body.scheduleSlots)) store.scheduleSlots = body.scheduleSlots;
      if (Array.isArray(body.roster)) {
        store.roster = body.roster as StoredRosterMember[];
      }
      if (Array.isArray(body.kioskLinks)) store.kioskLinks = body.kioskLinks;

      if (Array.isArray(body.quizAttempts)) {
        const mergedMap = new Map<string, Record<string, unknown>>();
        for (const existingAttempt of store.quizAttempts) {
          const id = String(existingAttempt.id || '');
          if (id) mergedMap.set(id, existingAttempt);
        }
        for (const incomingAttempt of body.quizAttempts) {
          const id = String(incomingAttempt.id || '');
          if (id) mergedMap.set(id, incomingAttempt);
        }
        store.quizAttempts = Array.from(mergedMap.values());
      }

      savePortalStore(store);
      const studentOnlyAttempts = store.quizAttempts.filter((a) =>
        String(a.studentUid || '').startsWith('stu_')
      );
      res.json({ ok: true, studentAttempts: studentOnlyAttempts });
    } catch (error) {
      console.error('Portal sync error:', error);
      res.status(500).json({ error: 'Failed to sync portal data.' });
    }
  });

  app.get('/api/portal/data', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    try {
      const store = getPortalStore();
      const isOfficer =
        req.user?.authType === 'student'
          ? Boolean(
              findRosterMemberByStudentNumber(store, req.user.studentNumber || '')?.roleLabel ===
                'Officer'
            )
          : false;

      const visibleQuizzes = isOfficer
        ? store.quizzes
        : store.quizzes.filter((q) => q.published === true);
      const visibleAttempts = isOfficer
        ? store.quizAttempts
        : store.quizAttempts.filter((a) => a.studentUid === req.user?.uid);

      res.json({
        chapters: store.chapters,
        materials: store.materials,
        flashcardDecks: store.flashcardDecks,
        quizzes: visibleQuizzes,
        tasks: store.tasks,
        announcements: store.announcements,
        scheduleSlots: store.scheduleSlots,
        roster: store.roster,
        kioskLinks: store.kioskLinks,
        completedTaskIds: store.taskProgressByUid[req.user?.uid || ''] || [],
        attempts: visibleAttempts,
      });
    } catch (error) {
      console.error('Portal read error:', error);
      res.status(500).json({ error: 'Failed to load portal data.' });
    }
  });

  app.post('/api/portal/student-task-progress', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    const taskId = typeof req.body?.taskId === 'string' ? req.body.taskId.trim() : '';
    const completed = Boolean(req.body?.completed);
    if (!taskId || !req.user) {
      res.status(400).json({ error: 'Task identifier is required.' });
      return;
    }
    const store = getPortalStore();
    const current = new Set(store.taskProgressByUid[req.user.uid] || []);
    if (completed) {
      current.add(taskId);
    } else {
      current.delete(taskId);
    }
    store.taskProgressByUid[req.user.uid] = Array.from(current);
    savePortalStore(store);
    res.json({ completedTaskIds: store.taskProgressByUid[req.user.uid] });
  });

  app.post('/api/portal/student-quiz-attempt', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    const store = getPortalStore();
    const quizId = typeof req.body?.quizId === 'string' ? req.body.quizId.trim() : '';
    const quiz = store.quizzes.find((q) => String(q.id) === quizId);
    if (!quiz) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    const attempt = {
      id: `att_${crypto.randomUUID().slice(0, 12)}`,
      quizId,
      quizTitle: String(quiz.title || ''),
      subject: String(quiz.subject || ''),
      studentUid: req.user.uid,
      studentName: req.user.fullName || 'ECE 1B Student',
      answers:
        req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {},
      autoScore: Math.max(0, Number(req.body?.autoScore) || 0),
      maxAutoScore: Math.max(0, Number(req.body?.maxAutoScore) || 0),
      totalPoints: Math.max(1, Number(quiz.totalPoints) || 1),
      essayPendingCount: Math.max(0, Math.round(Number(req.body?.essayPendingCount) || 0)),
      essayFeedback: {},
      status: Number(req.body?.essayPendingCount) === 0 ? 'graded' : 'submitted',
      submittedAt: new Date().toISOString(),
    };
    store.quizAttempts.unshift(attempt);
    savePortalStore(store);
    res.json(attempt);
  });

  // Officer server-side CRUD for Student-Number Officers
  app.post('/api/portal/mutate', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const store = getPortalStore();
      const action = typeof req.body?.action === 'string' ? req.body.action : '';
      const payload = (req.body?.payload || {}) as Record<string, unknown>;
      const existingId =
        typeof req.body?.existingId === 'string' ? req.body.existingId.trim() : '';
      const authorUid = req.user?.uid || 'officer';
      const authorName = req.user?.fullName || 'ECE 1B Officer';

      switch (action) {
        case 'saveChapter': {
          const id = existingId || `chap_${crypto.randomUUID().slice(0, 10)}`;
          const record = {
            id,
            title: String(payload.title || '').slice(0, 160),
            subject: String(payload.subject || '').slice(0, 40),
            order: Math.min(Math.max(Math.round(Number(payload.order) || 1), 0), 500),
            description: String(payload.description || '').slice(0, 1000),
            authorUid,
            authorName,
          };
          const idx = store.chapters.findIndex((c) => c.id === id);
          if (idx >= 0) store.chapters[idx] = { ...store.chapters[idx], ...record };
          else store.chapters.push(record);
          savePortalStore(store);
          res.json({ id, record });
          return;
        }
        case 'deleteChapter': {
          store.chapters = store.chapters.filter((c) => c.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'saveMaterial': {
          const id = existingId || `mat_${crypto.randomUUID().slice(0, 10)}`;
          const links = Array.isArray(payload.links)
            ? payload.links
                .filter(
                  (l): l is { label: string; url: string } =>
                    Boolean(l && typeof l === 'object' && isSafeExternalUrl((l as { url?: unknown }).url))
                )
                .slice(0, 15)
                .map((l) => ({
                  label: String(l.label || 'Resource Link').slice(0, 100),
                  url: String(l.url).trim().slice(0, 500),
                }))
            : [];
          const images = Array.isArray(payload.images)
            ? payload.images
                .filter(
                  (img): img is { caption: string; url: string } =>
                    Boolean(
                      img &&
                        typeof img === 'object' &&
                        isSafeImageOrInternalUrl((img as { url?: unknown }).url)
                    )
                )
                .slice(0, 15)
                .map((img) => ({
                  caption: String(img.caption || '').slice(0, 200),
                  url: String(img.url).trim().slice(0, 500),
                }))
            : [];

          const record = {
            id,
            title: String(payload.title || '').slice(0, 180),
            subject: String(payload.subject || '').slice(0, 40),
            chapterId: String(payload.chapterId || '').slice(0, 128),
            category: String(payload.category || 'Reviewer'),
            description: String(payload.description || '').slice(0, 2000),
            contentBody: String(payload.contentBody || '').slice(0, 20000),
            links,
            images,
            fileName: String(payload.fileName || '').slice(0, 200),
            fileUrl: String(payload.fileUrl || '').slice(0, 500),
            mimeType: String(payload.mimeType || '').slice(0, 100),
            extractedSummary: String(payload.extractedSummary || '').slice(0, 4000),
            linkedQuizId: String(payload.linkedQuizId || '').slice(0, 128),
            authorUid,
            authorName,
          };
          const idx = store.materials.findIndex((m) => m.id === id);
          if (idx >= 0) store.materials[idx] = { ...store.materials[idx], ...record };
          else store.materials.unshift(record);
          savePortalStore(store);
          res.json({ id, record });
          return;
        }
        case 'deleteMaterial': {
          store.materials = store.materials.filter((m) => m.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'saveFlashcardDeck': {
          const id = existingId || `deck_${crypto.randomUUID().slice(0, 10)}`;
          const rawCards = Array.isArray(payload.cards) ? payload.cards : [];
          const cards = rawCards
            .slice(0, 100)
            .map((c, idx) => {
              const card = (c || {}) as { id?: string; front?: string; back?: string };
              return {
                id: String(card.id || `fc_${idx + 1}`),
                front: String(card.front || '').slice(0, 1000),
                back: String(card.back || '').slice(0, 1000),
              };
            })
            .filter((c) => c.front.trim() && c.back.trim());

          const record = {
            id,
            title: String(payload.title || '').slice(0, 180),
            subject: String(payload.subject || '').slice(0, 40),
            chapterId: String(payload.chapterId || '').slice(0, 128),
            description: String(payload.description || '').slice(0, 1000),
            cards,
            cardCount: cards.length,
            authorUid,
            authorName,
          };
          const idx = store.flashcardDecks.findIndex((d) => d.id === id);
          if (idx >= 0) store.flashcardDecks[idx] = { ...store.flashcardDecks[idx], ...record };
          else store.flashcardDecks.unshift(record);
          savePortalStore(store);
          res.json({ id, record });
          return;
        }
        case 'deleteFlashcardDeck': {
          store.flashcardDecks = store.flashcardDecks.filter((d) => d.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'saveQuiz': {
          const id = existingId || `quiz_${crypto.randomUUID().slice(0, 10)}`;
          const record = {
            id,
            ...payload,
            authorUid,
            authorName,
          };
          const idx = store.quizzes.findIndex((q) => q.id === id);
          if (idx >= 0) store.quizzes[idx] = { ...store.quizzes[idx], ...record };
          else store.quizzes.unshift(record);
          savePortalStore(store);
          res.json({ id, record });
          return;
        }
        case 'deleteQuiz': {
          store.quizzes = store.quizzes.filter((q) => q.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'gradeAttempt': {
          const idx = store.quizAttempts.findIndex((a) => a.id === existingId);
          if (idx >= 0) {
            store.quizAttempts[idx] = { ...store.quizAttempts[idx], ...payload };
            savePortalStore(store);
          }
          res.json({ ok: true });
          return;
        }
        case 'createAnnouncement': {
          const id = `ann_${crypto.randomUUID().slice(0, 10)}`;
          store.announcements.unshift({
            id,
            title: String(payload.title || '').slice(0, 160),
            body: String(payload.body || '').slice(0, 4000),
            category: String(payload.category || 'General'),
            pinned: Boolean(payload.pinned),
            authorUid,
            authorName,
          });
          savePortalStore(store);
          res.json({ id });
          return;
        }
        case 'deleteAnnouncement': {
          store.announcements = store.announcements.filter((a) => a.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'createTask': {
          const id = `task_${crypto.randomUUID().slice(0, 10)}`;
          store.tasks.push({
            id,
            ...payload,
            authorUid,
          });
          savePortalStore(store);
          res.json({ id });
          return;
        }
        case 'updateTask': {
          const idx = store.tasks.findIndex((t) => t.id === existingId);
          if (idx >= 0) {
            store.tasks[idx] = { ...store.tasks[idx], ...payload };
            savePortalStore(store);
          }
          res.json({ ok: true });
          return;
        }
        case 'deleteTask': {
          store.tasks = store.tasks.filter((t) => t.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'createSlot': {
          const id = `slot_${crypto.randomUUID().slice(0, 10)}`;
          store.scheduleSlots.push({ id, ...payload });
          savePortalStore(store);
          res.json({ id });
          return;
        }
        case 'deleteSlot': {
          store.scheduleSlots = store.scheduleSlots.filter((s) => s.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'createLink': {
          if (!isSafeExternalUrl(payload.url)) {
            res.status(400).json({ error: 'Link URL must start with https:// or http://.' });
            return;
          }
          const id = `link_${crypto.randomUUID().slice(0, 10)}`;
          store.kioskLinks.push({ id, ...payload });
          savePortalStore(store);
          res.json({ id });
          return;
        }
        case 'deleteLink': {
          store.kioskLinks = store.kioskLinks.filter((l) => l.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'addRosterStudent': {
          const fullName = String(payload.fullName || '').trim().slice(0, 120);
          const studentId = String(payload.studentId || '').trim().slice(0, 40);
          const handle =
            fullName.split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';
          const id = studentId ? `stu_${studentId}` : `stu_${crypto.randomUUID().slice(0, 8)}`;
          store.roster.push({
            id,
            fullName,
            handle: handle.slice(0, 32),
            studentId,
            roleLabel: payload.roleLabel === 'Officer' ? 'Officer' : 'Student',
            officerTitle: String(payload.officerTitle || '').slice(0, 80),
            enrollmentType: payload.enrollmentType === 'Irregular' ? 'Irregular' : 'Regular',
            birthdayDisplay: String(payload.birthdayDisplay || '').slice(0, 40),
            avatarId: 'blank',
            linkedUid: '',
          });
          savePortalStore(store);
          res.json({ id });
          return;
        }
        case 'updateRosterRole': {
          const idx = store.roster.findIndex((r) => r.id === existingId);
          const nextPosition = String(payload.nextPosition || 'Student');
          if (idx >= 0) {
            store.roster[idx] = {
              ...store.roster[idx],
              roleLabel: nextPosition === 'Student' ? 'Student' : 'Officer',
              officerTitle: nextPosition === 'Student' ? '' : nextPosition,
            };
            savePortalStore(store);
          }
          res.json({ ok: true });
          return;
        }
        case 'deleteRosterStudent': {
          store.roster = store.roster.filter((r) => r.id !== existingId);
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        case 'syncOfficial': {
          const starter = buildStarterPortalData();
          const byId = new Map(store.roster.map((r) => [r.studentId, r]));
          for (const officialStu of starter.roster) {
            if (!byId.has(officialStu.studentId)) {
              store.roster.push(officialStu);
            }
          }
          const slotIds = new Set(store.scheduleSlots.map((s) => s.id));
          for (const slot of starter.scheduleSlots) {
            if (!slotIds.has(slot.id)) store.scheduleSlots.push(slot);
          }
          savePortalStore(store);
          res.json({ ok: true });
          return;
        }
        default:
          res.status(400).json({ error: 'Unknown portal mutation action.' });
      }
    } catch (error) {
      console.error('Portal mutate error:', error);
      res.status(500).json({ error: 'Failed to apply portal change.' });
    }
  });

  // Upload study material or image file (Admin / Co-Officer only)
  app.post('/api/materials/upload', requireAdmin, (req: AuthenticatedRequest, res: Response) => {
    try {
      const { fileName, mimeType, dataBase64 } = req.body as {
        fileName?: string;
        mimeType?: string;
        dataBase64?: string;
      };

      if (typeof mimeType !== 'string' || !MIME_EXT_MAP[mimeType]) {
        res.status(400).json({ error: 'Supported formats: PDF, TXT, Markdown, PNG, JPEG, or WEBP.' });
        return;
      }
      if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
        res.status(400).json({ error: 'File content is required.' });
        return;
      }

      const cleanedBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanedBase64, 'base64');
      if (buffer.byteLength === 0 || buffer.byteLength > 15 * 1024 * 1024) {
        res.status(400).json({ error: 'File must be between 1 byte and 15 MB.' });
        return;
      }

      const ext = MIME_EXT_MAP[mimeType];
      const storedName = `mat_${crypto.randomUUID().replace(/-/g, '')}${ext}`;
      const targetPath = path.resolve(UPLOADS_DIR, storedName);
      if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid target file path.' });
        return;
      }

      fs.writeFileSync(targetPath, buffer);
      const safeDisplayName =
        typeof fileName === 'string' && fileName.trim().length > 0
          ? fileName.trim().slice(0, 180)
          : `study_material${ext}`;

      res.json({
        fileUrl: `/api/materials/files/${storedName}`,
        fileName: safeDisplayName,
        mimeType,
        sizeBytes: buffer.byteLength,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to save uploaded study material.' });
    }
  });

  // Serve uploaded study material files safely (inline for embedded PDF/image viewing)
  app.get('/api/materials/files/:filename', (req: Request, res: Response) => {
    const filename = String(req.params.filename || '');
    if (!/^[a-zA-Z0-9_\-]+\.(pdf|txt|md|png|jpg|webp)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid file identifier.' });
      return;
    }
    const resolved = path.resolve(UPLOADS_DIR, filename);
    if (!resolved.startsWith(UPLOADS_DIR + path.sep) || !fs.existsSync(resolved)) {
      res.status(404).json({ error: 'Study material file not found.' });
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', EXT_MIME_MAP[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(resolved);
  });

  // Convert PDF or study notes into an interactive quiz via Gemini (Admin / Co-Officer only)
  app.post('/api/quiz/generate-from-material', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        title,
        subject,
        textContent,
        fileBase64,
        mimeType,
        questionTypes,
        questionCount,
      } = req.body as {
        title?: string;
        subject?: string;
        textContent?: string;
        fileBase64?: string;
        mimeType?: string;
        questionTypes?: string[];
        questionCount?: number;
      };

      const safeTitle = typeof title === 'string' ? title.trim().slice(0, 180) : 'Class Reviewer';
      const safeSubject = typeof subject === 'string' ? subject.trim().slice(0, 40) : 'ECE 1B';
      const allowedTypes = ['multiple_choice', 'identification', 'true_false', 'essay'];
      const requestedTypes = Array.isArray(questionTypes)
        ? questionTypes.filter((t) => allowedTypes.includes(t))
        : [];
      const finalTypes =
        requestedTypes.length > 0
          ? requestedTypes
          : ['multiple_choice', 'identification', 'essay'];
      const targetCount = Math.min(Math.max(Number(questionCount) || 10, 3), 35);

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      if (typeof fileBase64 === 'string' && fileBase64.length > 0 && typeof mimeType === 'string') {
        const supportedForModel = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain', 'text/markdown'];
        if (!supportedForModel.includes(mimeType)) {
          res.status(400).json({ error: 'Unsupported file type for quiz conversion.' });
          return;
        }
        const cleaned = fileBase64.replace(/^data:[^;]+;base64,/, '');
        if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
          const decodedText = Buffer.from(cleaned, 'base64').toString('utf-8').slice(0, 60000);
          parts.push({ text: `Study Material Text:\n${decodedText}` });
        } else {
          parts.push({
            inlineData: {
              mimeType,
              data: cleaned,
            },
          });
        }
      }

      if (typeof textContent === 'string' && textContent.trim().length > 0) {
        parts.push({ text: `Additional Study Notes / Exam Content:\n${textContent.trim().slice(0, 50000)}` });
      }

      if (parts.length === 0) {
        res.status(400).json({ error: 'Please attach a PDF/file or paste study material text.' });
        return;
      }

      const instructionPrompt = `You are an ECE (Electronics and Communications Engineering) academic exam parser and quiz designer for block ECE 1B.
Analyze the attached study material or exam PDF titled "${safeTitle}" for subject "${safeSubject}".
1. Write a concise, well-organized study summary (max 2500 characters) highlighting the key concepts, formulas, and topics covered.
2. Convert the content into an interactive quiz with approximately ${targetCount} high-quality questions.
   - If the uploaded document is already an exam/questionnaire, faithfully extract and convert its real questions into interactive items while preserving accuracy.
   - If it is lecture notes or a reviewer, craft clear, rigorous questions covering the core topics.
   - Use ONLY these requested question types: ${finalTypes.join(', ')}.
   - Rules per question type:
     * "multiple_choice": Provide exactly 4 clear options in "options", and set "correctAnswer" to the exact matching string from "options". Set "points" to 1 or 2.
     * "true_false": Set "options" to ["True", "False"], and set "correctAnswer" to either "True" or "False". Set "points" to 1.
     * "identification": Set "options" to [], set "correctAnswer" to the concise primary answer (e.g. a term, formula result, or law name), and include common valid variations in "acceptedAnswers". Set "points" to 2.
     * "essay": Set "options" to [], set "correctAnswer" to a concise model answer, and set "rubric" to clear grading criteria (e.g. key concepts expected). Set "points" to 5.
   - Include a brief "explanation" for every question so students learn when reviewing their answers.`;

      parts.push({ text: instructionPrompt });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction:
            'Extract or generate accurate interactive academic quizzes strictly matching the JSON schema. Never fabricate unreadable citations.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              extractedSummary: {
                type: Type.STRING,
                description: 'Concise study guide summary of the uploaded material.',
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description: 'One of multiple_choice, identification, true_false, essay',
                    },
                    prompt: {
                      type: Type.STRING,
                      description: 'The question text presented to the student.',
                    },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Answer choices for multiple_choice or true_false, empty otherwise.',
                    },
                    correctAnswer: {
                      type: Type.STRING,
                      description: 'Expected answer or model answer.',
                    },
                    acceptedAnswers: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Alternative valid answers for identification questions.',
                    },
                    rubric: {
                      type: Type.STRING,
                      description: 'Grading rubric for essay questions.',
                    },
                    explanation: {
                      type: Type.STRING,
                      description: 'Short explanation shown during answer review.',
                    },
                    points: {
                      type: Type.INTEGER,
                      description: 'Point value for the question (1 to 10).',
                    },
                  },
                  required: ['type', 'prompt', 'options', 'correctAnswer', 'explanation', 'points'],
                },
              },
            },
            required: ['extractedSummary', 'questions'],
          },
        },
      });

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        res.status(502).json({ error: 'Quiz generator returned an empty response.' });
        return;
      }

      const parsed = JSON.parse(rawText) as {
        extractedSummary?: string;
        questions?: Array<{
          type?: string;
          prompt?: string;
          options?: string[];
          correctAnswer?: string;
          acceptedAnswers?: string[];
          rubric?: string;
          explanation?: string;
          points?: number;
        }>;
      };

      const sanitizedQuestions = (parsed.questions || [])
        .slice(0, 60)
        .map((q, index) => {
          const qType = allowedTypes.includes(String(q.type))
            ? (q.type as 'multiple_choice' | 'identification' | 'true_false' | 'essay')
            : 'multiple_choice';
          const options =
            qType === 'true_false'
              ? ['True', 'False']
              : qType === 'multiple_choice'
                ? (Array.isArray(q.options) ? q.options.map((o) => String(o).slice(0, 300)).slice(0, 6) : [])
                : [];
          const points = Math.min(Math.max(Math.round(Number(q.points) || 1), 1), 20);
          return {
            id: `q_${index + 1}_${crypto.randomUUID().slice(0, 6)}`,
            type: qType,
            prompt: String(q.prompt || `Question ${index + 1}`).slice(0, 2000),
            options:
              qType === 'multiple_choice' && options.length < 2
                ? ['Option A', 'Option B', 'Option C', 'Option D']
                : options,
            correctAnswer: String(q.correctAnswer || (options[0] ?? '')).slice(0, 1500),
            acceptedAnswers: Array.isArray(q.acceptedAnswers)
              ? q.acceptedAnswers.map((a) => String(a).slice(0, 200)).slice(0, 10)
              : [],
            rubric: String(q.rubric || '').slice(0, 600),
            explanation: String(q.explanation || '').slice(0, 1000),
            points,
          };
        })
        .filter((q) => q.prompt.trim().length > 0);

      if (sanitizedQuestions.length === 0) {
        res.status(422).json({ error: 'Could not extract quiz questions from this material.' });
        return;
      }

      res.json({
        extractedSummary: String(parsed.extractedSummary || '').slice(0, 3800),
        questions: sanitizedQuestions,
      });
    } catch (error) {
      console.error('Gemini quiz generation error:', error);
      const message = error instanceof Error ? error.message : 'Quiz conversion failed.';
      res.status(500).json({ error: message });
    }
  });

  // AI-assisted essay grading suggestion for officers
  app.post('/api/quiz/grade-essay', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { questionPrompt, modelAnswer, rubric, studentAnswer, maxPoints } = req.body as {
        questionPrompt?: string;
        modelAnswer?: string;
        rubric?: string;
        studentAnswer?: string;
        maxPoints?: number;
      };

      const safeMax = Math.min(Math.max(Math.round(Number(maxPoints) || 5), 1), 50);
      if (!studentAnswer || !String(studentAnswer).trim()) {
        res.json({ suggestedScore: 0, feedback: 'No answer was submitted.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Grade this ECE student essay response fairly out of ${safeMax} points.
Question: ${String(questionPrompt || '').slice(0, 1500)}
Model Answer: ${String(modelAnswer || '').slice(0, 1500)}
Rubric: ${String(rubric || 'Accuracy, clarity, and completeness').slice(0, 800)}
Student Answer: ${String(studentAnswer || '').slice(0, 3000)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedScore: { type: Type.INTEGER },
              feedback: { type: Type.STRING },
            },
            required: ['suggestedScore', 'feedback'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        suggestedScore?: number;
        feedback?: string;
      };
      const score = Math.min(Math.max(Math.round(Number(parsed.suggestedScore) || 0), 0), safeMax);
      res.json({
        suggestedScore: score,
        feedback: String(parsed.feedback || '').slice(0, 800),
      });
    } catch (error) {
      console.error('Essay grading helper error:', error);
      res.status(500).json({ error: 'Unable to evaluate essay response right now.' });
    }
  });

  // Vite dev middleware or static production build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ECE 1B Portal server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
