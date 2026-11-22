import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { OFFICIAL_COR_SCHEDULE, OFFICIAL_ECE1B_MASTERLIST } from './ece1bCatalog';

let seedingInFlight = false;

export async function syncOfficialCorAndMasterlist(
  adminUid: string,
  adminName: string,
  forceFullReset = false
) {
  if (seedingInFlight) return;
  seedingInFlight = true;

  try {
    const existingSlotsSnap = await getDocs(collection(db, 'scheduleSlots'));
    const existingRosterSnap = await getDocs(collection(db, 'roster'));
    const existingTasksSnap = await getDocs(collection(db, 'tasks'));
    const existingChaptersSnap = await getDocs(collection(db, 'chapters'));
    const existingMaterialsSnap = await getDocs(collection(db, 'materials'));
    const existingDecksSnap = await getDocs(collection(db, 'flashcardDecks'));
    const existingQuizzesSnap = await getDocs(collection(db, 'quizzes'));
    const existingLinksSnap = await getDocs(collection(db, 'kioskLinks'));
    const existingAnnSnap = await getDocs(collection(db, 'announcements'));

    const hasOldLegacySeed =
      existingSlotsSnap.docs.some((d) => d.id.startsWith('slot_')) ||
      existingTasksSnap.docs.some((d) => d.id === 'task_circuits_lab1');

    const needsScheduleSync =
      forceFullReset ||
      hasOldLegacySeed ||
      !existingSlotsSnap.docs.some((d) => d.id === 'cor_mon_ae101');

    const needsRosterSync =
      forceFullReset ||
      !existingRosterSnap.docs.some((d) => d.id === 'stu_2026001612');

    const needsTasksSync =
      forceFullReset ||
      hasOldLegacySeed ||
      existingTasksSnap.empty;

    const existingMatCalc2 = existingMaterialsSnap.docs.find((d) => d.id === 'mat_coe104_calc2_rev');
    const matNeedsUpgrade = Boolean(
      existingMatCalc2 &&
        (typeof existingMatCalc2.data().chapterId !== 'string' ||
          typeof existingMatCalc2.data().contentBody !== 'string')
    );

    const existingQuizCalc2 = existingQuizzesSnap.docs.find((d) => d.id === 'quiz_coe104_calc2');
    const quizNeedsUpgrade = Boolean(
      existingQuizCalc2 && typeof existingQuizCalc2.data().chapterId !== 'string'
    );

    const needsChaptersSync =
      forceFullReset ||
      existingChaptersSnap.empty;

    const needsMaterialsSync =
      forceFullReset ||
      hasOldLegacySeed ||
      existingMaterialsSnap.empty ||
      matNeedsUpgrade ||
      quizNeedsUpgrade;

    const needsDecksSync =
      forceFullReset ||
      existingDecksSnap.empty;

    if (
      !needsScheduleSync &&
      !needsRosterSync &&
      !needsTasksSync &&
      !needsChaptersSync &&
      !needsMaterialsSync &&
      !needsDecksSync &&
      !existingAnnSnap.empty &&
      !existingLinksSnap.empty
    ) {
      return;
    }

    const batch = writeBatch(db);
    const now = Date.now();
    const hours = (h: number) => Timestamp.fromDate(new Date(now + h * 3600 * 1000));

    // Clean up legacy generic starter docs if present
    if (hasOldLegacySeed || forceFullReset) {
      for (const oldDoc of existingSlotsSnap.docs) {
        if (oldDoc.id.startsWith('slot_') || forceFullReset) {
          batch.delete(oldDoc.ref);
        }
      }
      for (const oldTask of existingTasksSnap.docs) {
        if (
          ['task_circuits_lab1', 'task_calc_probset', 'task_signed_cor', 'task_nstp_primer'].includes(
            oldTask.id
          )
        ) {
          batch.delete(oldTask.ref);
        }
      }
      for (const oldMat of existingMaterialsSnap.docs) {
        if (oldMat.id === 'mat_ece101_kvl_kcl') {
          batch.delete(oldMat.ref);
        }
      }
      for (const oldQuiz of existingQuizzesSnap.docs) {
        if (oldQuiz.id === 'quiz_ece101_starter') {
          batch.delete(oldQuiz.ref);
        }
      }
    }

    if (needsScheduleSync) {
      for (const slot of OFFICIAL_COR_SCHEDULE) {
        batch.set(doc(db, 'scheduleSlots', slot.id), {
          day: slot.day,
          courseCode: slot.courseCode,
          courseTitle: slot.courseTitle,
          startTime: slot.startTime,
          endTime: slot.endTime,
          sortMinutes: slot.sortMinutes,
          room: slot.room,
          instructor: slot.instructor,
          kind: slot.kind,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (needsRosterSync) {
      for (const stu of OFFICIAL_ECE1B_MASTERLIST) {
        const docId = `stu_${stu.studentNumber}`;
        const handleBase =
          stu.fullName
            .split(',')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '') || 'student';
        batch.set(doc(db, 'roster', docId), {
          fullName: stu.fullName,
          handle: handleBase.slice(0, 30),
          studentId: stu.studentNumber,
          roleLabel: 'Student',
          officerTitle: '',
          enrollmentType: 'Regular',
          birthdayDisplay: '',
          avatarId: 'blank',
          linkedUid: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (needsTasksSync) {
      const corTasks = [
        {
          id: 'task_coe104_calc2_quiz',
          title: 'Quiz 1: Antiderivatives & Substitution',
          subject: 'COE 104',
          type: 'Quiz',
          description: 'Calculus 2 diagnostic and integration by substitution quiz with Prof. Raevinor Gonzales at NH 406*.',
          dueAt: hours(44),
        },
        {
          id: 'task_ece103l_lab_prelim',
          title: 'Lab Sheet 01: Electrostatics & Electric Field Mapping',
          subject: 'ECE 103L',
          type: 'Assignment',
          description: 'Prepare pre-lab calculations and equipotential sketches for Engr./Prof. Rina Santiago (COE 2 203).',
          dueAt: hours(26),
        },
        {
          id: 'task_ece101l_cad_plate',
          title: 'CAD Plate 01: Orthographic & Layer Setup',
          subject: 'ECE 101L',
          type: 'Assignment',
          description: 'Submit DWG and PDF export for Computer-Aided Design under Prof. Nemuel Norman Giron (NH 401*).',
          dueAt: hours(96),
        },
        {
          id: 'task_ece102_materials',
          title: 'Reading Check: Atomic Bonding & Crystal Structures',
          subject: 'ECE 102',
          type: 'Requirement',
          description: 'Review Chapters 2-3 for Materials Science and Engineering with Engr. Amor Lacara (COE 2 - 405*).',
          dueAt: hours(68),
        },
      ];

      for (const t of corTasks) {
        batch.set(doc(db, 'tasks', t.id), {
          title: t.title,
          subject: t.subject,
          type: t.type,
          description: t.description,
          dueAt: t.dueAt,
          authorUid: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (existingAnnSnap.empty || hasOldLegacySeed) {
      batch.set(doc(db, 'announcements', 'ann_cor_2ndsem'), {
        title: 'BulSU ECE 1B — 2nd Semester AY 2026–2027 Portal Active',
        body: 'Official COR schedule (12 subjects, 29 total units) and the 55-student ECE 1B Masterlist are now synced. Check Subjects & Schedule for room assignments including COE 2 - 506*, NH 406*, NH 502*, NH 401*, and COE 2 203.',
        category: 'General',
        pinned: true,
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'announcements', 'ann_lab_safety'), {
        title: 'Physics 2 & Engineers Lab Guidelines (ECE 103L / COE 105L)',
        body: 'Bring closed shoes, scientific calculators, and lab notebooks for COE 2 203 and NH 502* laboratory sessions.',
        category: 'Urgent',
        pinned: false,
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (needsChaptersSync) {
      batch.set(doc(db, 'chapters', 'chap_coe104_ch1'), {
        title: 'Chapter 1: Antiderivatives & Integration Techniques',
        subject: 'COE 104',
        order: 1,
        description:
          'Power rules, u-substitution, integration by parts (LIATE), and definite integral bounds.',
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'chapters', 'chap_ece103_ch1'), {
        title: 'Chapter 1: Electrostatics & Gauss Law',
        subject: 'ECE 103',
        order: 1,
        description: 'Electric charge, Coulomb law, electric field lines, and Gaussian surfaces.',
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (needsMaterialsSync) {
      batch.set(doc(db, 'materials', 'mat_coe104_calc2_rev'), {
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
            label: 'Paul\'s Online Math Notes — Calculus II',
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
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'quizzes', 'quiz_coe104_calc2'), {
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
        authorUid: adminUid,
        authorName: adminName,
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (needsDecksSync) {
      batch.set(doc(db, 'flashcardDecks', 'deck_coe104_ch1'), {
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
        authorUid: adminUid,
        authorName: adminName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (existingLinksSnap.empty) {
      batch.set(doc(db, 'kioskLinks', 'link_bulsu_portal'), {
        title: 'BulSU Student Portal',
        subtitle: 'Official Bulacan State University student grades and COR portal',
        url: 'https://bulsu.edu.ph',
        category: 'Portal',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'kioskLinks', 'link_drive'), {
        title: 'ECE 1B Shared Drive',
        subtitle: 'Lecture slides, CAD plates, and lab manuals',
        url: 'https://drive.google.com',
        category: 'Drive',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'ece1b_sync');
  } finally {
    seedingInFlight = false;
  }
}

export const ensureStarterClassData = syncOfficialCorAndMasterlist;
