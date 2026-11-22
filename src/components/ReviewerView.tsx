import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  FileText,
  FileUp,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Link2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RotateCw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ECE1B_SUBJECTS } from '../lib/ece1bCatalog';
import {
  EssayFeedbackEntry,
  FlashcardDeck,
  FlashcardItem,
  InteractiveQuiz,
  MaterialImage,
  MaterialLink,
  QuestionType,
  QuizAttempt,
  QuizQuestion,
  StudyChapter,
  StudyMaterial,
} from '../types';
import { QuizRunnerModal } from './QuizRunnerModal';

interface ReviewerViewProps {
  isAdmin: boolean;
  currentUid: string;
  getAuthToken: () => Promise<string | null>;
  chapters: StudyChapter[];
  materials: StudyMaterial[];
  flashcardDecks: FlashcardDeck[];
  quizzes: InteractiveQuiz[];
  attempts: QuizAttempt[];
  onSaveChapter: (
    payload: Omit<StudyChapter, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  onDeleteChapter: (chapterId: string) => Promise<void>;
  onSaveMaterial: (
    payload: Omit<StudyMaterial, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  onDeleteMaterial: (materialId: string) => Promise<void>;
  onSaveFlashcardDeck: (
    payload: Omit<FlashcardDeck, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  onDeleteFlashcardDeck: (deckId: string) => Promise<void>;
  onSaveQuiz: (
    payload: Omit<InteractiveQuiz, 'id' | 'authorUid' | 'authorName' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<string>;
  onDeleteQuiz: (quizId: string) => Promise<void>;
  onSubmitQuizAttempt: (payload: {
    quiz: InteractiveQuiz;
    answers: Record<string, string>;
    autoScore: number;
    maxAutoScore: number;
    essayPendingCount: number;
  }) => Promise<QuizAttempt>;
  onGradeAttempt: (
    attemptId: string,
    payload: {
      autoScore: number;
      essayPendingCount: number;
      essayFeedback: Record<string, EssayFeedbackEntry>;
      status: 'submitted' | 'graded';
    }
  ) => Promise<void>;
}

type TopViewMode = 'workspace' | 'attempts' | 'grading' | 'quiz_builder';
type SelectedItemRef =
  | { kind: 'material'; id: string }
  | { kind: 'flashcards'; id: string }
  | { kind: 'quiz'; id: string };

const DEFAULT_SUBJECT_CODE = ECE1B_SUBJECTS[5]?.code || 'COE 104'; // COE 104 Calculus 2 has starter data

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function isSafeExternalLink(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeImageSrc(url: string): boolean {
  const trimmed = url.trim();
  if (/^\/api\/materials\/files\/[a-zA-Z0-9_\-]+\.(png|jpg|webp)$/.test(trimmed)) {
    return true;
  }
  return isSafeExternalLink(trimmed);
}

function createEmptyQuestion(type: QuestionType = 'multiple_choice'): QuizQuestion {
  return {
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    prompt: '',
    options:
      type === 'multiple_choice'
        ? ['Option A', 'Option B', 'Option C', 'Option D']
        : type === 'true_false'
          ? ['True', 'False']
          : [],
    correctAnswer: type === 'true_false' ? 'True' : '',
    acceptedAnswers: [],
    rubric: '',
    explanation: '',
    points: type === 'essay' ? 5 : type === 'identification' ? 2 : 1,
  };
}

function createEmptyCard(): FlashcardItem {
  return {
    id: `fc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    front: '',
    back: '',
  };
}

export const ReviewerView: React.FC<ReviewerViewProps> = ({
  isAdmin,
  currentUid,
  getAuthToken,
  chapters,
  materials,
  flashcardDecks,
  quizzes,
  attempts,
  onSaveChapter,
  onDeleteChapter,
  onSaveMaterial,
  onDeleteMaterial,
  onSaveFlashcardDeck,
  onDeleteFlashcardDeck,
  onSaveQuiz,
  onDeleteQuiz,
  onSubmitQuizAttempt,
  onGradeAttempt,
}) => {
  const [viewMode, setViewMode] = useState<TopViewMode>('workspace');
  const [selectedSubject, setSelectedSubject] = useState<string>(DEFAULT_SUBJECT_CODE);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [outlineSearch, setOutlineSearch] = useState('');
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<SelectedItemRef | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<InteractiveQuiz | null>(null);

  // Flashcard study player state
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [swapStudySides, setSwapStudySides] = useState(false);
  const [shuffledOrder, setShuffledOrder] = useState<number[] | null>(null);

  // Chapter modal state
  const [chapterModalOpen, setChapterModalOpen] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [chapTitle, setChapTitle] = useState('');
  const [chapOrder, setChapOrder] = useState(1);
  const [chapDesc, setChapDesc] = useState('');
  const [savingChapter, setSavingChapter] = useState(false);

  // Material / PDF Add & Edit Modal state
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [editingMatId, setEditingMatId] = useState<string | null>(null);
  const [matTitle, setMatTitle] = useState('');
  const [matSubject, setMatSubject] = useState(DEFAULT_SUBJECT_CODE);
  const [matChapterId, setMatChapterId] = useState('');
  const [matCategory, setMatCategory] = useState<StudyMaterial['category']>('Reviewer');
  const [matDescription, setMatDescription] = useState('');
  const [matContentBody, setMatContentBody] = useState('');
  const [matLinks, setMatLinks] = useState<MaterialLink[]>([]);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [matImages, setMatImages] = useState<MaterialImage[]>([]);
  const [newImgCaption, setNewImgCaption] = useState('');
  const [newImgUrl, setNewImgUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [existingFileUrl, setExistingFileUrl] = useState('');
  const [existingFileName, setExistingFileName] = useState('');
  const [existingMimeType, setExistingMimeType] = useState('');
  const [existingSummary, setExistingSummary] = useState('');
  const [existingLinkedQuizId, setExistingLinkedQuizId] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [autoConvertQuiz, setAutoConvertQuiz] = useState(false);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<QuestionType[]>([
    'multiple_choice',
    'identification',
    'essay',
  ]);
  const [targetQuestionCount, setTargetQuestionCount] = useState(10);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [materialStatus, setMaterialStatus] = useState('');
  const [materialError, setMaterialError] = useState('');

  // Flashcard Deck Modal state
  const [deckModalOpen, setDeckModalOpen] = useState(false);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [deckTitle, setDeckTitle] = useState('');
  const [deckSubject, setDeckSubject] = useState(DEFAULT_SUBJECT_CODE);
  const [deckChapterId, setDeckChapterId] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [deckCards, setDeckCards] = useState<FlashcardItem[]>([createEmptyCard()]);
  const [savingDeck, setSavingDeck] = useState(false);
  const [deckError, setDeckError] = useState('');

  // Manual Quiz Builder / Editor State
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState<string>('');
  const [quizTitle, setQuizTitle] = useState('');
  const [quizSubject, setQuizSubject] = useState(DEFAULT_SUBJECT_CODE);
  const [quizChapterId, setQuizChapterId] = useState('');
  const [quizDescription, setQuizDescription] = useState('');
  const [quizPublished, setQuizPublished] = useState(true);
  const [quizTimeLimit, setQuizTimeLimit] = useState(15);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([
    createEmptyQuestion('multiple_choice'),
  ]);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [quizError, setQuizError] = useState('');
  const [quizStatus, setQuizStatus] = useState('');

  // Grading State
  const [gradingAttempt, setGradingAttempt] = useState<QuizAttempt | null>(null);
  const [essayScores, setEssayScores] = useState<Record<string, EssayFeedbackEntry>>({});
  const [aiGradingQId, setAiGradingQId] = useState<string | null>(null);
  const [savingGrade, setSavingGrade] = useState(false);

  const currentSubjectMeta = useMemo(
    () =>
      ECE1B_SUBJECTS.find((s) => s.code === selectedSubject) || {
        code: selectedSubject,
        title: selectedSubject,
        instructor: '',
        rooms: '',
      },
    [selectedSubject]
  );

  // Content counts per subject tab
  const subjectCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of ECE1B_SUBJECTS) map[s.code] = 0;
    materials.forEach((m) => {
      map[m.subject] = (map[m.subject] || 0) + 1;
    });
    flashcardDecks.forEach((d) => {
      map[d.subject] = (map[d.subject] || 0) + 1;
    });
    quizzes.forEach((q) => {
      if (isAdmin || q.published) {
        map[q.subject] = (map[q.subject] || 0) + 1;
      }
    });
    return map;
  }, [materials, flashcardDecks, quizzes, isAdmin]);

  // Items for currently active subject tab
  const subjectChapters = useMemo(
    () =>
      chapters
        .filter((c) => c.subject === selectedSubject)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    [chapters, selectedSubject]
  );

  const subjectMaterials = useMemo(() => {
    const q = outlineSearch.trim().toLowerCase();
    return materials.filter(
      (m) =>
        m.subject === selectedSubject &&
        (!q || `${m.title} ${m.description} ${m.category}`.toLowerCase().includes(q))
    );
  }, [materials, selectedSubject, outlineSearch]);

  const subjectDecks = useMemo(() => {
    const q = outlineSearch.trim().toLowerCase();
    return flashcardDecks.filter(
      (d) =>
        d.subject === selectedSubject &&
        (!q || `${d.title} ${d.description}`.toLowerCase().includes(q))
    );
  }, [flashcardDecks, selectedSubject, outlineSearch]);

  const subjectQuizzes = useMemo(() => {
    const q = outlineSearch.trim().toLowerCase();
    return quizzes.filter(
      (quiz) =>
        quiz.subject === selectedSubject &&
        (isAdmin || quiz.published) &&
        (!q || `${quiz.title} ${quiz.description}`.toLowerCase().includes(q))
    );
  }, [quizzes, selectedSubject, isAdmin, outlineSearch]);

  const chapterIdSet = useMemo(
    () => new Set(subjectChapters.map((c) => c.id)),
    [subjectChapters]
  );

  const unassignedMaterials = useMemo(
    () => subjectMaterials.filter((m) => !m.chapterId || !chapterIdSet.has(m.chapterId)),
    [subjectMaterials, chapterIdSet]
  );
  const unassignedDecks = useMemo(
    () => subjectDecks.filter((d) => !d.chapterId || !chapterIdSet.has(d.chapterId)),
    [subjectDecks, chapterIdSet]
  );
  const unassignedQuizzes = useMemo(
    () => subjectQuizzes.filter((q) => !q.chapterId || !chapterIdSet.has(q.chapterId)),
    [subjectQuizzes, chapterIdSet]
  );

  // Auto-select first available item when switching subject tabs
  useEffect(() => {
    const validCurrent =
      selectedItem &&
      ((selectedItem.kind === 'material' &&
        subjectMaterials.some((m) => m.id === selectedItem.id)) ||
        (selectedItem.kind === 'flashcards' &&
          subjectDecks.some((d) => d.id === selectedItem.id)) ||
        (selectedItem.kind === 'quiz' &&
          subjectQuizzes.some((q) => q.id === selectedItem.id)));

    if (validCurrent) return;

    // Pick first item from ordered chapters, then unassigned
    for (const ch of subjectChapters) {
      const chMat = subjectMaterials.find((m) => m.chapterId === ch.id);
      if (chMat) {
        setSelectedItem({ kind: 'material', id: chMat.id });
        return;
      }
      const chDeck = subjectDecks.find((d) => d.chapterId === ch.id);
      if (chDeck) {
        setSelectedItem({ kind: 'flashcards', id: chDeck.id });
        return;
      }
      const chQuiz = subjectQuizzes.find((q) => q.chapterId === ch.id);
      if (chQuiz) {
        setSelectedItem({ kind: 'quiz', id: chQuiz.id });
        return;
      }
    }

    if (subjectMaterials[0]) {
      setSelectedItem({ kind: 'material', id: subjectMaterials[0].id });
    } else if (subjectDecks[0]) {
      setSelectedItem({ kind: 'flashcards', id: subjectDecks[0].id });
    } else if (subjectQuizzes[0]) {
      setSelectedItem({ kind: 'quiz', id: subjectQuizzes[0].id });
    } else {
      setSelectedItem(null);
    }
  }, [selectedSubject, subjectChapters, subjectMaterials, subjectDecks, subjectQuizzes, selectedItem]);

  // Reset flashcard player whenever switching decks
  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
    setShuffledOrder(null);
  }, [selectedItem?.id, selectedItem?.kind]);

  const activeMaterial = useMemo(
    () =>
      selectedItem?.kind === 'material'
        ? materials.find((m) => m.id === selectedItem.id) || null
        : null,
    [selectedItem, materials]
  );

  const activeDeck = useMemo(
    () =>
      selectedItem?.kind === 'flashcards'
        ? flashcardDecks.find((d) => d.id === selectedItem.id) || null
        : null,
    [selectedItem, flashcardDecks]
  );

  const activeQuizDetail = useMemo(
    () =>
      selectedItem?.kind === 'quiz'
        ? quizzes.find((q) => q.id === selectedItem.id) || null
        : null,
    [selectedItem, quizzes]
  );

  const myAttempts = useMemo(
    () => attempts.filter((a) => a.studentUid === currentUid),
    [attempts, currentUid]
  );

  const isChapterExpanded = (id: string) => expandedChapters[id] !== false;

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [id]: !(prev[id] !== false),
    }));
  };

  // --- Chapter Handlers ---
  const openCreateChapterModal = () => {
    setEditingChapterId(null);
    setChapTitle(`Chapter ${subjectChapters.length + 1}: `);
    setChapOrder(subjectChapters.length + 1);
    setChapDesc('');
    setChapterModalOpen(true);
  };

  const openEditChapterModal = (ch: StudyChapter) => {
    setEditingChapterId(ch.id);
    setChapTitle(ch.title);
    setChapOrder(ch.order);
    setChapDesc(ch.description);
    setChapterModalOpen(true);
  };

  const handleSaveChapterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chapTitle.trim()) return;
    setSavingChapter(true);
    try {
      await onSaveChapter(
        {
          title: chapTitle.trim().slice(0, 160),
          subject: selectedSubject,
          order: Math.min(Math.max(Number(chapOrder) || 1, 0), 500),
          description: chapDesc.trim().slice(0, 1000),
        },
        editingChapterId || undefined
      );
      setChapterModalOpen(false);
    } finally {
      setSavingChapter(false);
    }
  };

  // --- Material / PDF Modal Handlers ---
  const openNewMaterialModal = (presetChapterId = '', defaultAutoQuiz = false) => {
    setEditingMatId(null);
    setMatTitle('');
    setMatSubject(selectedSubject);
    setMatChapterId(presetChapterId || subjectChapters[0]?.id || '');
    setMatCategory(defaultAutoQuiz ? 'Exam PDF' : 'Reviewer');
    setMatDescription('');
    setMatContentBody('');
    setMatLinks([]);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setMatImages([]);
    setNewImgCaption('');
    setNewImgUrl('');
    setExistingFileUrl('');
    setExistingFileName('');
    setExistingMimeType('');
    setExistingSummary('');
    setExistingLinkedQuizId('');
    setSelectedFile(null);
    setAutoConvertQuiz(defaultAutoQuiz);
    setMaterialError('');
    setMaterialStatus('');
    setMaterialModalOpen(true);
  };

  const openEditMaterialModal = (mat: StudyMaterial) => {
    setEditingMatId(mat.id);
    setMatTitle(mat.title);
    setMatSubject(mat.subject);
    setMatChapterId(mat.chapterId || '');
    setMatCategory(mat.category);
    setMatDescription(mat.description);
    setMatContentBody(mat.contentBody || '');
    setMatLinks(Array.isArray(mat.links) ? mat.links : []);
    setNewLinkLabel('');
    setNewLinkUrl('');
    setMatImages(Array.isArray(mat.images) ? mat.images : []);
    setNewImgCaption('');
    setNewImgUrl('');
    setExistingFileUrl(mat.fileUrl || '');
    setExistingFileName(mat.fileName || '');
    setExistingMimeType(mat.mimeType || '');
    setExistingSummary(mat.extractedSummary || '');
    setExistingLinkedQuizId(mat.linkedQuizId || '');
    setSelectedFile(null);
    setAutoConvertQuiz(false);
    setMaterialError('');
    setMaterialStatus('');
    setMaterialModalOpen(true);
  };

  const handleAddExternalLink = () => {
    if (!newLinkLabel.trim() || !newLinkUrl.trim()) {
      setMaterialError('Enter both a link label and a URL starting with https://');
      return;
    }
    if (!isSafeExternalLink(newLinkUrl)) {
      setMaterialError('Links must start with https:// or http://.');
      return;
    }
    setMaterialError('');
    setMatLinks((prev) => [
      ...prev.slice(0, 14),
      { label: newLinkLabel.trim().slice(0, 100), url: newLinkUrl.trim().slice(0, 500) },
    ]);
    setNewLinkLabel('');
    setNewLinkUrl('');
  };

  const handleAddImageUrl = () => {
    if (!newImgUrl.trim()) return;
    if (!isSafeImageSrc(newImgUrl)) {
      setMaterialError('Image URL must start with https:// or http://.');
      return;
    }
    setMaterialError('');
    setMatImages((prev) => [
      ...prev.slice(0, 14),
      { caption: newImgCaption.trim().slice(0, 200), url: newImgUrl.trim().slice(0, 500) },
    ]);
    setNewImgCaption('');
    setNewImgUrl('');
  };

  const handleUploadStudyImage = async (file: File | null) => {
    if (!file) return;
    setMaterialError('');
    setUploadingImage(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication session expired. Please sign in again.');
      const base64 = await readFileAsBase64(file);
      const res = await fetch('/api/materials/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'image/png',
          dataBase64: base64,
        }),
      });
      const data = (await res.json()) as { fileUrl?: string; error?: string };
      if (!res.ok || !data.fileUrl) {
        throw new Error(data.error || 'Image upload failed.');
      }
      setMatImages((prev) => [
        ...prev.slice(0, 14),
        {
          caption: newImgCaption.trim().slice(0, 200) || file.name.replace(/\.[^.]+$/, ''),
          url: data.fileUrl!,
        },
      ]);
      setNewImgCaption('');
    } catch (err) {
      setMaterialError(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleTypeSelection = (t: QuestionType) => {
    setSelectedQuestionTypes((prev) =>
      prev.includes(t) ? (prev.length > 1 ? prev.filter((item) => item !== t) : prev) : [...prev, t]
    );
  };

  const handleSaveMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMaterialError('');
    setMaterialStatus('');

    if (!matTitle.trim() || !matSubject.trim()) {
      setMaterialError('Please enter a material title and subject.');
      return;
    }

    setSavingMaterial(true);
    try {
      let fileUrl = existingFileUrl;
      let fileName = existingFileName;
      let mimeType = existingMimeType;
      let fileBase64 = '';

      if (selectedFile) {
        const token = await getAuthToken();
        if (!token) throw new Error('Please sign in again to upload files.');
        setMaterialStatus('Uploading study file...');
        fileBase64 = await readFileAsBase64(selectedFile);
        const uploadRes = await fetch('/api/materials/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            fileName: selectedFile.name,
            mimeType: selectedFile.type || 'application/pdf',
            dataBase64: fileBase64,
          }),
        });
        const uploadData = (await uploadRes.json()) as {
          fileUrl?: string;
          fileName?: string;
          mimeType?: string;
          error?: string;
        };
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'File upload failed.');
        }
        fileUrl = uploadData.fileUrl || '';
        fileName = uploadData.fileName || selectedFile.name;
        mimeType = uploadData.mimeType || selectedFile.type || 'application/pdf';
      }

      let extractedSummary = existingSummary || matContentBody.trim().slice(0, 3500);
      let generatedQuestions: QuizQuestion[] = [];

      if (autoConvertQuiz) {
        if (!fileBase64 && !matContentBody.trim()) {
          throw new Error('Attach a PDF/file or add study notes text to auto-convert into a quiz.');
        }
        const token = await getAuthToken();
        if (!token) throw new Error('Please sign in again.');
        setMaterialStatus('Converting study material into interactive quiz questions...');
        const genRes = await fetch('/api/quiz/generate-from-material', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: matTitle.trim(),
            subject: matSubject.trim(),
            textContent: matContentBody.trim(),
            fileBase64: fileBase64 || undefined,
            mimeType: selectedFile ? mimeType : undefined,
            questionTypes: selectedQuestionTypes,
            questionCount: targetQuestionCount,
          }),
        });
        const genData = (await genRes.json()) as {
          extractedSummary?: string;
          questions?: QuizQuestion[];
          error?: string;
        };
        if (!genRes.ok) {
          throw new Error(genData.error || 'Automatic quiz conversion failed.');
        }
        extractedSummary = genData.extractedSummary || extractedSummary;
        generatedQuestions = genData.questions || [];
      }

      setMaterialStatus('Saving study material...');
      const savedMatId = await onSaveMaterial(
        {
          title: matTitle.trim().slice(0, 180),
          subject: matSubject.trim().slice(0, 40),
          chapterId: matChapterId,
          category: matCategory,
          description: matDescription.trim().slice(0, 2000),
          contentBody: matContentBody.trim().slice(0, 20000),
          links: matLinks,
          images: matImages,
          fileName: fileName.slice(0, 200),
          fileUrl: fileUrl.slice(0, 500),
          mimeType: mimeType.slice(0, 100),
          extractedSummary: extractedSummary.slice(0, 4000),
          linkedQuizId: existingLinkedQuizId,
        },
        editingMatId || undefined
      );

      setSelectedSubject(matSubject.trim());
      setSelectedItem({ kind: 'material', id: savedMatId });
      setMaterialModalOpen(false);

      if (autoConvertQuiz && generatedQuestions.length > 0) {
        setEditingQuizId(null);
        setEditingMaterialId(savedMatId);
        setQuizTitle(`${matTitle.trim()} — Interactive Quiz`.slice(0, 180));
        setQuizSubject(matSubject.trim());
        setQuizChapterId(matChapterId);
        setQuizDescription(`Generated from ${matTitle.trim()}`);
        setQuizPublished(true);
        setQuizTimeLimit(Math.max(10, generatedQuestions.length * 2));
        setQuizQuestions(generatedQuestions);
        setQuizError('');
        setQuizStatus(
          'Quiz draft generated from your material! Review questions below and click Save & Publish Quiz.'
        );
        setViewMode('quiz_builder');
      }
    } catch (error) {
      setMaterialError(error instanceof Error ? error.message : 'Failed to save material.');
    } finally {
      setSavingMaterial(false);
    }
  };

  // --- Flashcard Deck Handlers ---
  const openNewDeckModal = (presetChapterId = '') => {
    setEditingDeckId(null);
    setDeckTitle('');
    setDeckSubject(selectedSubject);
    setDeckChapterId(presetChapterId || subjectChapters[0]?.id || '');
    setDeckDesc('');
    setDeckCards([createEmptyCard(), createEmptyCard()]);
    setDeckError('');
    setDeckModalOpen(true);
  };

  const openEditDeckModal = (deck: FlashcardDeck) => {
    setEditingDeckId(deck.id);
    setDeckTitle(deck.title);
    setDeckSubject(deck.subject);
    setDeckChapterId(deck.chapterId || '');
    setDeckDesc(deck.description);
    setDeckCards(
      deck.cards.length > 0
        ? deck.cards.map((c) => ({ ...c }))
        : [createEmptyCard()]
    );
    setDeckError('');
    setDeckModalOpen(true);
  };

  const swapSingleCard = (idx: number) => {
    setDeckCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, front: c.back, back: c.front } : c))
    );
  };

  const swapAllDeckCards = () => {
    setDeckCards((prev) => prev.map((c) => ({ ...c, front: c.back, back: c.front })));
  };

  const handleSaveDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeckError('');
    const validCards = deckCards
      .map((c) => ({
        id: c.id,
        front: c.front.trim().slice(0, 1000),
        back: c.back.trim().slice(0, 1000),
      }))
      .filter((c) => c.front.length > 0 && c.back.length > 0);

    if (!deckTitle.trim() || validCards.length === 0) {
      setDeckError('Provide a deck title and at least 1 flashcard with both Front and Back.');
      return;
    }

    setSavingDeck(true);
    try {
      const savedId = await onSaveFlashcardDeck(
        {
          title: deckTitle.trim().slice(0, 180),
          subject: deckSubject.trim().slice(0, 40),
          chapterId: deckChapterId,
          description: deckDesc.trim().slice(0, 1000),
          cards: validCards,
          cardCount: validCards.length,
        },
        editingDeckId || undefined
      );
      setSelectedSubject(deckSubject.trim());
      setSelectedItem({ kind: 'flashcards', id: savedId });
      setDeckModalOpen(false);
    } catch (err) {
      setDeckError(err instanceof Error ? err.message : 'Failed to save flashcard deck.');
    } finally {
      setSavingDeck(false);
    }
  };

  // --- Quiz Builder Handlers ---
  const openNewManualQuiz = (presetChapterId = '') => {
    setEditingQuizId(null);
    setEditingMaterialId('');
    setQuizTitle('');
    setQuizSubject(selectedSubject);
    setQuizChapterId(presetChapterId || subjectChapters[0]?.id || '');
    setQuizDescription('');
    setQuizPublished(true);
    setQuizTimeLimit(15);
    setQuizQuestions([createEmptyQuestion('multiple_choice')]);
    setQuizError('');
    setQuizStatus('');
    setViewMode('quiz_builder');
  };

  const loadQuizIntoBuilder = (quiz: InteractiveQuiz) => {
    setEditingQuizId(quiz.id);
    setEditingMaterialId(quiz.sourceMaterialId || '');
    setQuizTitle(quiz.title);
    setQuizSubject(quiz.subject);
    setQuizChapterId(quiz.chapterId || '');
    setQuizDescription(quiz.description);
    setQuizPublished(quiz.published);
    setQuizTimeLimit(quiz.timeLimitMinutes);
    setQuizQuestions(quiz.questions.length > 0 ? quiz.questions : [createEmptyQuestion()]);
    setQuizError('');
    setQuizStatus('');
    setViewMode('quiz_builder');
  };

  const updateQuestion = (index: number, patch: Partial<QuizQuestion>) => {
    setQuizQuestions((prev) =>
      prev.map((q, idx) => (idx === index ? { ...q, ...patch } : q))
    );
  };

  const handleSaveQuizBuilder = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuizError('');
    const validQuestions = quizQuestions
      .map((q) => ({
        ...q,
        prompt: q.prompt.trim().slice(0, 2000),
        options:
          q.type === 'true_false'
            ? ['True', 'False']
            : q.type === 'multiple_choice'
              ? q.options.map((o) => o.trim()).filter(Boolean).slice(0, 6)
              : [],
        correctAnswer: q.correctAnswer.trim().slice(0, 1500),
        acceptedAnswers: (q.acceptedAnswers || []).map((a) => a.trim()).filter(Boolean),
        rubric: (q.rubric || '').trim().slice(0, 600),
        explanation: (q.explanation || '').trim().slice(0, 1000),
        points: Math.min(Math.max(Number(q.points) || 1, 1), 20),
      }))
      .filter((q) => q.prompt.length > 0);

    if (!quizTitle.trim() || !quizSubject.trim() || validQuestions.length === 0) {
      setQuizError('Provide a quiz title, subject, and at least 1 complete question.');
      return;
    }

    setSavingQuiz(true);
    try {
      const totalPoints = validQuestions.reduce((sum, q) => sum + q.points, 0);
      const savedQuizId = await onSaveQuiz(
        {
          title: quizTitle.trim().slice(0, 180),
          subject: quizSubject.trim().slice(0, 40),
          chapterId: quizChapterId,
          description: quizDescription.trim().slice(0, 2000),
          sourceMaterialId: editingMaterialId,
          published: quizPublished,
          timeLimitMinutes: Math.min(Math.max(Number(quizTimeLimit) || 0, 0), 240),
          questions: validQuestions,
          questionCount: validQuestions.length,
          totalPoints,
        },
        editingQuizId || undefined
      );

      if (editingMaterialId) {
        const sourceMat = materials.find((m) => m.id === editingMaterialId);
        if (sourceMat) {
          await onSaveMaterial(
            {
              title: sourceMat.title,
              subject: sourceMat.subject,
              chapterId: sourceMat.chapterId,
              category: sourceMat.category,
              description: sourceMat.description,
              contentBody: sourceMat.contentBody,
              links: sourceMat.links,
              images: sourceMat.images,
              fileName: sourceMat.fileName,
              fileUrl: sourceMat.fileUrl,
              mimeType: sourceMat.mimeType,
              extractedSummary: sourceMat.extractedSummary,
              linkedQuizId: savedQuizId,
            },
            sourceMat.id
          );
        }
      }

      setSelectedSubject(quizSubject.trim());
      setSelectedItem({ kind: 'quiz', id: savedQuizId });
      setEditingQuizId(null);
      setEditingMaterialId('');
      setQuizStatus('');
      setViewMode('workspace');
    } finally {
      setSavingQuiz(false);
    }
  };

  // --- Grading Handlers ---
  const openGradingModal = (attempt: QuizAttempt) => {
    setGradingAttempt(attempt);
    setEssayScores(attempt.essayFeedback || {});
  };

  const handleAiSuggestEssayGrade = async (question: QuizQuestion, studentAnswer: string) => {
    const token = await getAuthToken();
    if (!token) return;
    setAiGradingQId(question.id);
    try {
      const res = await fetch('/api/quiz/grade-essay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          questionPrompt: question.prompt,
          modelAnswer: question.correctAnswer,
          rubric: question.rubric,
          studentAnswer,
          maxPoints: question.points,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { suggestedScore: number; feedback: string };
        setEssayScores((prev) => ({
          ...prev,
          [question.id]: {
            score: data.suggestedScore,
            comment: data.feedback,
          },
        }));
      }
    } finally {
      setAiGradingQId(null);
    }
  };

  const handleSaveGrade = async () => {
    if (!gradingAttempt) return;
    const quiz = quizzes.find((q) => q.id === gradingAttempt.quizId);
    setSavingGrade(true);
    try {
      const essaySum = Object.values(essayScores).reduce(
        (acc, entry) => acc + (Number(entry.score) || 0),
        0
      );
      let baseObjective = gradingAttempt.autoScore;
      if (quiz) {
        const prevEssaySum = Object.values(gradingAttempt.essayFeedback || {}).reduce(
          (acc, entry) => acc + (Number(entry.score) || 0),
          0
        );
        baseObjective = Math.max(0, gradingAttempt.autoScore - prevEssaySum);
      }

      await onGradeAttempt(gradingAttempt.id, {
        autoScore: baseObjective + essaySum,
        essayPendingCount: 0,
        essayFeedback: essayScores,
        status: 'graded',
      });
      setGradingAttempt(null);
    } finally {
      setSavingGrade(false);
    }
  };

  // Helper to render outline items inside a chapter or unassigned group
  const renderOutlineItems = (
    chapMaterials: StudyMaterial[],
    chapDecks: FlashcardDeck[],
    chapQuizzes: InteractiveQuiz[]
  ) => (
    <div className="divide-y divide-[#F3EFFA]">
      {chapMaterials.map((mat) => {
        const active = selectedItem?.kind === 'material' && selectedItem.id === mat.id;
        return (
          <button
            key={mat.id}
            type="button"
            onClick={() => setSelectedItem({ kind: 'material', id: mat.id })}
            className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
              active
                ? 'bg-[#F3EFFA] border-l-3 border-[#6D28D9]'
                : 'hover:bg-[#FAF8FE]'
            }`}
          >
            <FileText
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                active ? 'text-[#6D28D9]' : 'text-[#8E86A8]'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs leading-snug line-clamp-2 ${
                  active ? 'font-bold text-[#1B162B]' : 'font-medium text-[#2E2744]'
                }`}
              >
                {mat.title}
              </div>
              <div className="text-[10px] text-[#7D7599] mt-0.5">
                {mat.category}
                {mat.fileUrl ? ' · PDF/File attached' : ''}
              </div>
            </div>
          </button>
        );
      })}

      {chapDecks.map((deck) => {
        const active = selectedItem?.kind === 'flashcards' && selectedItem.id === deck.id;
        return (
          <button
            key={deck.id}
            type="button"
            onClick={() => setSelectedItem({ kind: 'flashcards', id: deck.id })}
            className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
              active
                ? 'bg-[#F3EFFA] border-l-3 border-[#6D28D9]'
                : 'hover:bg-[#FAF8FE]'
            }`}
          >
            <Layers
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                active ? 'text-[#6D28D9]' : 'text-[#8E86A8]'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs leading-snug line-clamp-2 ${
                  active ? 'font-bold text-[#1B162B]' : 'font-medium text-[#2E2744]'
                }`}
              >
                {deck.title}
              </div>
              <div className="text-[10px] text-[#7D7599] mt-0.5 tabular-nums">
                Flashcards · {deck.cardCount} cards
              </div>
            </div>
          </button>
        );
      })}

      {chapQuizzes.map((quiz) => {
        const active = selectedItem?.kind === 'quiz' && selectedItem.id === quiz.id;
        return (
          <button
            key={quiz.id}
            type="button"
            onClick={() => setSelectedItem({ kind: 'quiz', id: quiz.id })}
            className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer ${
              active
                ? 'bg-[#F3EFFA] border-l-3 border-[#6D28D9]'
                : 'hover:bg-[#FAF8FE]'
            }`}
          >
            <ClipboardList
              className={`w-4 h-4 shrink-0 mt-0.5 ${
                active ? 'text-[#6D28D9]' : 'text-[#8E86A8]'
              }`}
            />
            <div className="min-w-0 flex-1">
              <div
                className={`text-xs leading-snug line-clamp-2 ${
                  active ? 'font-bold text-[#1B162B]' : 'font-medium text-[#2E2744]'
                }`}
              >
                {quiz.title}
              </div>
              <div className="text-[10px] text-[#7D7599] mt-0.5 tabular-nums">
                Quiz · {quiz.questionCount} Qs · {quiz.totalPoints} pts
                {!quiz.published ? ' · Draft' : ''}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  // Compute current flashcard inside player
  const effectiveDeckCards = useMemo(() => {
    if (!activeDeck) return [];
    if (!shuffledOrder || shuffledOrder.length !== activeDeck.cards.length) {
      return activeDeck.cards;
    }
    return shuffledOrder.map((idx) => activeDeck.cards[idx]).filter(Boolean);
  }, [activeDeck, shuffledOrder]);

  const currentCard = effectiveDeckCards[cardIndex] || effectiveDeckCards[0] || null;
  const frontText = currentCard
    ? swapStudySides
      ? currentCard.back
      : currentCard.front
    : '';
  const backText = currentCard
    ? swapStudySides
      ? currentCard.front
      : currentCard.back
    : '';

  return (
    <div className="space-y-5">
      <datalist id="ece1b-subject-codes">
        {ECE1B_SUBJECTS.map((subj) => (
          <option key={subj.code} value={subj.code}>
            {subj.title}
          </option>
        ))}
      </datalist>

      {/* Top Header + View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1B162B]">
            Reviewer, Flashcards & Quizzes
          </h1>
          <p className="text-sm text-[#615A78] mt-1">
            Organized by subject and chapter · PDFs, study notes, flashcards, and quizzes
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-white border border-[#E4DEF2] rounded-xl w-fit overflow-x-auto">
          <button
            type="button"
            onClick={() => setViewMode('workspace')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'workspace'
                ? 'bg-[#6D28D9] text-white'
                : 'text-[#615A78] hover:text-[#1B162B]'
            }`}
          >
            Study Workspace
          </button>
          <button
            type="button"
            onClick={() => setViewMode('attempts')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'attempts'
                ? 'bg-[#6D28D9] text-white'
                : 'text-[#615A78] hover:text-[#1B162B]'
            }`}
          >
            My Attempts ({myAttempts.length})
          </button>
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => setViewMode('grading')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'grading'
                    ? 'bg-[#6D28D9] text-white'
                    : 'text-[#615A78] hover:text-[#1B162B]'
                }`}
              >
                Submissions ({attempts.length})
              </button>
              {viewMode === 'quiz_builder' && (
                <button
                  type="button"
                  onClick={() => setViewMode('quiz_builder')}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#6D28D9] text-white whitespace-nowrap shrink-0"
                >
                  Quiz Builder
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* VIEW 1: STUDY WORKSPACE (Subject Tabs + Chapter Sidebar + Main Reader) */}
      {viewMode === 'workspace' && (
        <div className="space-y-4">
          {/* 12 Subject Tabs */}
          <div className="bg-white border border-[#E4DEF2] rounded-2xl p-2 overflow-x-auto">
            <div className="flex items-center gap-1.5 min-w-max" role="tablist" aria-label="ECE 1B Subjects">
              {ECE1B_SUBJECTS.map((subj) => {
                const active = selectedSubject === subj.code;
                const count = subjectCounts[subj.code] || 0;
                return (
                  <button
                    key={subj.code}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedSubject(subj.code)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-[#6D28D9] text-white shadow-xs'
                        : 'text-[#615A78] hover:bg-[#F3EFFA] hover:text-[#1B162B]'
                    }`}
                  >
                    <span className="font-mono">{subj.code}</span>
                    {count > 0 && (
                      <span
                        className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-[#EFE9FB] text-[#5B21B6]'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subject Banner & Officer Quick Actions */}
          <div className="bg-white border border-[#E4DEF2] rounded-2xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#615A78]">
                <span className="font-mono font-bold text-[#6D28D9]">{currentSubjectMeta.code}</span>
                {currentSubjectMeta.instructor && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{currentSubjectMeta.instructor}</span>
                  </>
                )}
                {currentSubjectMeta.rooms && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{currentSubjectMeta.rooms}</span>
                  </>
                )}
              </div>
              <h2 className="font-display text-lg font-bold text-[#1B162B] mt-0.5">
                {currentSubjectMeta.title}
              </h2>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreateChapterModal}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDD5EC] bg-white text-[#1B162B] text-xs font-semibold hover:bg-[#F5F1FC] cursor-pointer whitespace-nowrap"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-[#6D28D9]" />
                  Add Chapter
                </button>
                <button
                  type="button"
                  onClick={() => openNewMaterialModal('', false)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] cursor-pointer whitespace-nowrap"
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Add Material / PDF
                </button>
                <button
                  type="button"
                  onClick={() => openNewDeckModal('')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#EFE9FB] text-[#5B21B6] text-xs font-semibold hover:bg-[#E4DAF9] cursor-pointer whitespace-nowrap"
                >
                  <Layers className="w-3.5 h-3.5" />
                  New Flashcards
                </button>
                <button
                  type="button"
                  onClick={() => openNewManualQuiz('')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#DDD5EC] bg-white text-[#1B162B] text-xs font-semibold hover:bg-[#F5F1FC] cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-[#6D28D9]" />
                  New Quiz
                </button>
              </div>
            )}
          </div>

          {/* 2-Pane Study Layout (Left Chapter Outline + Right Main Stage) */}
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            {/* Left Collapsible Chapter & Lesson Outline */}
            {sidebarOpen ? (
              <aside className="w-full lg:w-80 shrink-0 bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
                <div className="p-3.5 border-b border-[#EFEBF7] flex items-center justify-between gap-2 bg-[#FAF8FE]">
                  <div className="min-w-0">
                    <div className="text-[11px] font-mono font-bold text-[#6D28D9] uppercase">
                      {currentSubjectMeta.code} Outline
                    </div>
                    <div className="text-xs font-semibold text-[#1B162B] truncate">
                      {subjectChapters.length} chapters ·{' '}
                      {subjectMaterials.length + subjectDecks.length + subjectQuizzes.length} items
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    title="Collapse chapter outline"
                    className="p-1.5 rounded-lg text-[#615A78] hover:bg-[#EDE8F7] cursor-pointer"
                  >
                    <PanelLeftClose className="w-4 h-4" />
                  </button>
                </div>

                {/* Search within Subject */}
                <div className="p-2.5 border-b border-[#EFEBF7]">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[#8E86A8] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={outlineSearch}
                      onChange={(e) => setOutlineSearch(e.target.value)}
                      placeholder={`Filter ${currentSubjectMeta.code}...`}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#E4DEF2] text-xs focus:outline-none focus:border-[#6D28D9]"
                    />
                  </div>
                </div>

                {/* Chapters Accordion List */}
                <div className="max-h-[640px] overflow-y-auto divide-y divide-[#E4DEF2]">
                  {subjectChapters.map((ch) => {
                    const chMats = subjectMaterials.filter((m) => m.chapterId === ch.id);
                    const chDecks = subjectDecks.filter((d) => d.chapterId === ch.id);
                    const chQuizzes = subjectQuizzes.filter((q) => q.chapterId === ch.id);
                    const expanded = isChapterExpanded(ch.id);

                    return (
                      <div key={ch.id}>
                        <div className="px-3.5 py-2.5 bg-[#FAF8FE] flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleChapter(ch.id)}
                            className="flex items-center gap-1.5 text-left min-w-0 flex-1 cursor-pointer"
                          >
                            {expanded ? (
                              <ChevronDown className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5 text-[#615A78] shrink-0" />
                            )}
                            <span className="text-xs font-bold text-[#1B162B] truncate">
                              {ch.title}
                            </span>
                          </button>

                          {isAdmin && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openEditChapterModal(ch)}
                                title="Edit chapter"
                                className="p-1 rounded text-[#8E86A8] hover:text-[#6D28D9] cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteChapter(ch.id)}
                                title="Delete chapter"
                                className="p-1 rounded text-[#8E86A8] hover:text-red-600 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>

                        {expanded && (
                          <div>
                            {chMats.length === 0 && chDecks.length === 0 && chQuizzes.length === 0 ? (
                              <div className="px-4 py-3 text-[11px] text-[#8E86A8]">
                                Empty chapter
                              </div>
                            ) : (
                              renderOutlineItems(chMats, chDecks, chQuizzes)
                            )}

                            {isAdmin && (
                              <div className="px-3 py-2 bg-[#FCFBFD] border-t border-[#F3EFFA] flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openNewMaterialModal(ch.id, false)}
                                  className="text-[10px] font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                                >
                                  + Material
                                </button>
                                <span className="text-[10px] text-[#C9C1DF]">·</span>
                                <button
                                  type="button"
                                  onClick={() => openNewDeckModal(ch.id)}
                                  className="text-[10px] font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                                >
                                  + Flashcards
                                </button>
                                <span className="text-[10px] text-[#C9C1DF]">·</span>
                                <button
                                  type="button"
                                  onClick={() => openNewManualQuiz(ch.id)}
                                  className="text-[10px] font-semibold text-[#6D28D9] hover:underline cursor-pointer"
                                >
                                  + Quiz
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unassigned / General items */}
                  {(unassignedMaterials.length > 0 ||
                    unassignedDecks.length > 0 ||
                    unassignedQuizzes.length > 0) && (
                    <div>
                      <div className="px-3.5 py-2.5 bg-[#FAF8FE] text-xs font-bold text-[#615A78]">
                        General & Uncategorized
                      </div>
                      {renderOutlineItems(unassignedMaterials, unassignedDecks, unassignedQuizzes)}
                    </div>
                  )}

                  {subjectChapters.length === 0 &&
                    subjectMaterials.length === 0 &&
                    subjectDecks.length === 0 &&
                    subjectQuizzes.length === 0 && (
                      <div className="p-6 text-center text-xs text-[#7D7599]">
                        No chapters or reviewers added for {currentSubjectMeta.code} yet.
                      </div>
                    )}
                </div>
              </aside>
            ) : (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E4DEF2] text-xs font-semibold text-[#5B21B6] hover:bg-[#F3EFFA] cursor-pointer shrink-0"
              >
                <PanelLeftOpen className="w-4 h-4" />
                Show Chapters
              </button>
            )}

            {/* Right Main Content Reader / Flashcards / Quiz Stage */}
            <section className="flex-1 min-w-0 w-full bg-white border border-[#E4DEF2] rounded-2xl p-5 sm:p-8 min-h-[480px]">
              {/* Case A: Study Material / PDF Reader */}
              {activeMaterial && (
                <div className="space-y-6">
                  {/* Top Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-5 border-b border-[#EFEBF7]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#615A78]">
                        <span className="font-mono font-bold text-[#6D28D9]">
                          {activeMaterial.subject}
                        </span>
                        {(() => {
                          const ch = chapters.find((c) => c.id === activeMaterial.chapterId);
                          return ch ? (
                            <>
                              <span aria-hidden="true">›</span>
                              <span>{ch.title}</span>
                            </>
                          ) : null;
                        })()}
                        <span aria-hidden="true">·</span>
                        <span>{activeMaterial.category}</span>
                      </div>

                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1B162B] mt-1.5">
                        {activeMaterial.title}
                      </h2>

                      <div className="text-xs text-[#7D7599] mt-1">
                        Prepared by {activeMaterial.authorName}
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditMaterialModal(activeMaterial)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#6D28D9]" />
                          Edit Material
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteMaterial(activeMaterial.id)}
                          aria-label={`Delete ${activeMaterial.title}`}
                          className="p-2 rounded-xl border border-[#DDD5EC] text-[#615A78] hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Quick External Links Row (like Khan Academy Teams / Reference links bar) */}
                  {activeMaterial.links && activeMaterial.links.length > 0 && (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pb-4 border-b border-[#EFEBF7]">
                      {activeMaterial.links.map((lnk, idx) =>
                        isSafeExternalLink(lnk.url) ? (
                          <a
                            key={`${lnk.url}_${idx}`}
                            href={lnk.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F3EFFA] text-[#5B21B6] text-xs font-semibold hover:bg-[#E7DDF8]"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>{lnk.label}</span>
                            <ExternalLink className="w-3 h-3 opacity-75" />
                          </a>
                        ) : null
                      )}
                    </div>
                  )}

                  {/* Summary / Objective Box */}
                  {(activeMaterial.description || activeMaterial.extractedSummary) && (
                    <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 sm:p-5 text-center sm:text-left">
                      {activeMaterial.description && (
                        <p className="text-sm font-medium text-[#2E2744] italic">
                          {activeMaterial.description}
                        </p>
                      )}
                      {activeMaterial.extractedSummary &&
                        activeMaterial.extractedSummary !== activeMaterial.contentBody && (
                          <p className="text-xs sm:text-sm text-[#4B4363] mt-2 leading-relaxed whitespace-pre-line">
                            {activeMaterial.extractedSummary}
                          </p>
                        )}
                    </div>
                  )}

                  {/* Rich Readable Notes */}
                  {activeMaterial.contentBody && (
                    <div className="prose prose-sm max-w-none text-[#1B162B] leading-relaxed whitespace-pre-line text-sm sm:text-[15px]">
                      {activeMaterial.contentBody}
                    </div>
                  )}

                  {/* Attached Study Images */}
                  {activeMaterial.images && activeMaterial.images.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="font-display text-sm font-bold text-[#1B162B] flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-[#6D28D9]" />
                        Diagrams & Reference Images
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {activeMaterial.images.map((img, idx) =>
                          isSafeImageSrc(img.url) ? (
                            <figure
                              key={`${img.url}_${idx}`}
                              className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl overflow-hidden"
                            >
                              <img
                                src={img.url}
                                alt={img.caption || `Study diagram ${idx + 1}`}
                                referrerPolicy="no-referrer"
                                className="w-full max-h-80 object-contain bg-white"
                              />
                              {img.caption && (
                                <figcaption className="px-3.5 py-2 text-xs text-[#615A78] border-t border-[#E4DEF2]">
                                  {img.caption}
                                </figcaption>
                              )}
                            </figure>
                          ) : null
                        )}
                      </div>
                    </div>
                  )}

                  {/* Embedded In-Website PDF / File Viewer */}
                  {activeMaterial.fileUrl && (
                    <div className="border border-[#E4DEF2] rounded-2xl overflow-hidden bg-[#FAF8FE]">
                      <div className="px-4 py-3 border-b border-[#E4DEF2] flex flex-wrap items-center justify-between gap-2 bg-white">
                        <div className="flex items-center gap-2 text-xs font-semibold text-[#1B162B] min-w-0">
                          <FileText className="w-4 h-4 text-[#6D28D9] shrink-0" />
                          <span className="truncate">{activeMaterial.fileName || 'Attached File'}</span>
                        </div>
                        <a
                          href={activeMaterial.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#6D28D9] hover:underline shrink-0"
                        >
                          Open in New Tab
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {activeMaterial.mimeType === 'application/pdf' ||
                      activeMaterial.fileUrl.toLowerCase().endsWith('.pdf') ? (
                        <iframe
                          src={activeMaterial.fileUrl}
                          title={activeMaterial.title}
                          className="w-full h-[640px] bg-white"
                        />
                      ) : activeMaterial.mimeType.startsWith('image/') ? (
                        <div className="p-4 flex justify-center bg-white">
                          <img
                            src={activeMaterial.fileUrl}
                            alt={activeMaterial.title}
                            className="max-h-[540px] object-contain rounded-xl"
                          />
                        </div>
                      ) : (
                        <div className="p-4 text-xs text-[#615A78]">
                          Click &ldquo;Open in New Tab&rdquo; above to view {activeMaterial.fileName}.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Linked Quiz Callout */}
                  {(() => {
                    const linkedQuiz = quizzes.find(
                      (q) =>
                        (activeMaterial.linkedQuizId && q.id === activeMaterial.linkedQuizId) ||
                        q.sourceMaterialId === activeMaterial.id
                    );
                    if (!linkedQuiz || (!isAdmin && !linkedQuiz.published)) return null;
                    return (
                      <div className="bg-[#14131D] text-white rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-mono font-semibold text-[#C4B5FD] uppercase">
                            Practice Quiz Available
                          </div>
                          <div className="font-display text-base font-bold mt-0.5">
                            {linkedQuiz.title}
                          </div>
                          <div className="text-xs text-[#B6B2C8] mt-0.5 tabular-nums">
                            {linkedQuiz.questionCount} questions · {linkedQuiz.totalPoints} pts
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveQuiz(linkedQuiz)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] cursor-pointer shrink-0"
                        >
                          <Play className="w-4 h-4" />
                          Take Linked Quiz
                        </button>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Case B: Interactive Flashcard Deck Player */}
              {activeDeck && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-[#EFEBF7]">
                    <div>
                      <div className="text-xs text-[#615A78]">
                        <span className="font-mono font-bold text-[#6D28D9]">
                          {activeDeck.subject}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">{activeDeck.cardCount} flashcards</span>
                      </div>
                      <h2 className="font-display text-2xl font-extrabold text-[#1B162B] mt-1">
                        {activeDeck.title}
                      </h2>
                      {activeDeck.description && (
                        <p className="text-xs sm:text-sm text-[#615A78] mt-1">
                          {activeDeck.description}
                        </p>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditDeckModal(activeDeck)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#6D28D9]" />
                          Edit Flashcards
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteFlashcardDeck(activeDeck.id)}
                          aria-label={`Delete ${activeDeck.title}`}
                          className="p-2 rounded-xl border border-[#DDD5EC] text-[#615A78] hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Study Direction & Shuffle Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-mono font-bold text-[#6D28D9] tabular-nums">
                      Card {Math.min(cardIndex + 1, effectiveDeckCards.length)} of{' '}
                      {effectiveDeckCards.length}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSwapStudySides((prev) => !prev);
                          setIsFlipped(false);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                          swapStudySides
                            ? 'bg-[#6D28D9] text-white border-[#6D28D9]'
                            : 'bg-white text-[#1B162B] border-[#DDD5EC] hover:bg-[#F3EFFA]'
                        }`}
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        {swapStudySides ? 'Showing Back First' : 'Showing Front First'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const indices = activeDeck.cards.map((_, i) => i);
                          for (let i = indices.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [indices[i], indices[j]] = [indices[j], indices[i]];
                          }
                          setShuffledOrder(indices);
                          setCardIndex(0);
                          setIsFlipped(false);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD5EC] bg-white text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
                      >
                        <Shuffle className="w-3.5 h-3.5 text-[#6D28D9]" />
                        Shuffle
                      </button>
                    </div>
                  </div>

                  {/* Tactile Flashcard Stage */}
                  {currentCard && (
                    <button
                      type="button"
                      onClick={() => setIsFlipped((prev) => !prev)}
                      className={`w-full min-h-[280px] rounded-2xl border p-8 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                        isFlipped
                          ? 'bg-[#14131D] border-[#2B283C] text-white'
                          : 'bg-[#FAF8FE] border-[#DFD4F6] text-[#1B162B] hover:border-[#6D28D9]'
                      }`}
                    >
                      <span
                        className={`text-[11px] font-mono font-bold uppercase tracking-wider mb-3 ${
                          isFlipped ? 'text-[#C4B5FD]' : 'text-[#6D28D9]'
                        }`}
                      >
                        {isFlipped
                          ? swapStudySides
                            ? 'Front'
                            : 'Back'
                          : swapStudySides
                            ? 'Back'
                            : 'Front'}
                      </span>
                      <div className="font-display text-xl sm:text-2xl font-bold max-w-xl leading-snug whitespace-pre-line">
                        {isFlipped ? backText : frontText}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] mt-6 ${
                          isFlipped ? 'text-[#9F98B8]' : 'text-[#7D7599]'
                        }`}
                      >
                        <RotateCw className="w-3 h-3" />
                        Click card to flip
                      </span>
                    </button>
                  )}

                  {/* Navigation Controls */}
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      disabled={cardIndex <= 0}
                      onClick={() => {
                        setCardIndex((prev) => Math.max(0, prev - 1));
                        setIsFlipped(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={cardIndex >= effectiveDeckCards.length - 1}
                      onClick={() => {
                        setCardIndex((prev) =>
                          Math.min(effectiveDeckCards.length - 1, prev + 1)
                        );
                        setIsFlipped(false);
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-40 cursor-pointer"
                    >
                      Next Card
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Case C: Quiz Detail Stage */}
              {activeQuizDetail && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-5 border-b border-[#EFEBF7]">
                    <div>
                      <div className="text-xs text-[#615A78]">
                        <span className="font-mono font-bold text-[#6D28D9]">
                          {activeQuizDetail.subject}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">
                          {activeQuizDetail.questionCount} questions
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">{activeQuizDetail.totalPoints} pts</span>
                        {!activeQuizDetail.published && (
                          <span className="ml-2 text-amber-700 font-semibold">Draft</span>
                        )}
                      </div>
                      <h2 className="font-display text-2xl font-extrabold text-[#1B162B] mt-1">
                        {activeQuizDetail.title}
                      </h2>
                      {activeQuizDetail.description && (
                        <p className="text-sm text-[#615A78] mt-1.5">
                          {activeQuizDetail.description}
                        </p>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => loadQuizIntoBuilder(activeQuizDetail)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5 text-[#6D28D9]" />
                          Edit Quiz
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteQuiz(activeQuizDetail.id)}
                          className="p-2 rounded-xl border border-[#DDD5EC] text-[#615A78] hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-[#14131D] text-white rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs font-mono text-[#C4B5FD] uppercase">
                        Ready to Practice
                      </div>
                      <div className="font-display text-lg font-bold">
                        {Array.from(new Set(activeQuizDetail.questions.map((q) => q.type)))
                          .map((t) => t.replace('_', ' '))
                          .join(' · ')}
                      </div>
                      <p className="text-xs text-[#B6B2C8]">
                        {activeQuizDetail.timeLimitMinutes > 0
                          ? `Timed session: ${activeQuizDetail.timeLimitMinutes} minutes`
                          : 'Untimed practice quiz'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveQuiz(activeQuizDetail)}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#6D28D9] text-white text-sm font-semibold hover:bg-[#5B21B6] cursor-pointer shrink-0"
                    >
                      <Play className="w-4 h-4" />
                      Start Interactive Quiz
                    </button>
                  </div>

                  {/* Student's Past Attempts for this quiz */}
                  {(() => {
                    const quizHistory = myAttempts.filter(
                      (a) => a.quizId === activeQuizDetail.id
                    );
                    if (quizHistory.length === 0) return null;
                    return (
                      <div className="space-y-2.5">
                        <h3 className="font-display text-sm font-bold text-[#1B162B]">
                          Your Previous Attempts
                        </h3>
                        <ul className="divide-y divide-[#F3EFFA] border border-[#E4DEF2] rounded-2xl overflow-hidden">
                          {quizHistory.map((att) => (
                            <li
                              key={att.id}
                              className="px-4 py-3 flex items-center justify-between text-xs bg-[#FAF8FE]"
                            >
                              <span className="text-[#615A78]">
                                {att.submittedAt
                                  ? att.submittedAt.toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })
                                  : 'Completed'}
                              </span>
                              <span className="font-mono font-bold text-[#6D28D9] tabular-nums">
                                {att.autoScore} / {att.totalPoints} pts
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Empty Subject Stage */}
              {!activeMaterial && !activeDeck && !activeQuizDetail && (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <BookOpen className="w-10 h-10 text-[#9F98B8]" />
                  <h3 className="font-display text-lg font-bold text-[#1B162B] mt-3">
                    {currentSubjectMeta.code} · {currentSubjectMeta.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#615A78] mt-1 max-w-md">
                    {isAdmin
                      ? 'Organize this subject by creating a chapter, uploading a PDF reviewer, building flashcards, or creating a quiz.'
                      : 'No reviewers, flashcards, or quizzes have been posted for this subject yet.'}
                  </p>
                  {isAdmin && (
                    <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                      <button
                        type="button"
                        onClick={openCreateChapterModal}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#1B162B] hover:bg-[#F3EFFA] cursor-pointer"
                      >
                        <FolderPlus className="w-3.5 h-3.5 text-[#6D28D9]" />
                        Create First Chapter
                      </button>
                      <button
                        type="button"
                        onClick={() => openNewMaterialModal('', false)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] cursor-pointer"
                      >
                        <FileUp className="w-3.5 h-3.5" />
                        Upload Study PDF / Notes
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* VIEW 2: MY QUIZ ATTEMPTS */}
      {viewMode === 'attempts' && (
        <div className="bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
          {myAttempts.length === 0 ? (
            <div className="p-10 text-center">
              <Layers className="w-8 h-8 text-[#8E86A8] mx-auto" />
              <h2 className="font-display text-base font-bold text-[#1B162B] mt-3">
                No quiz attempts yet
              </h2>
              <p className="text-xs text-[#615A78] mt-1">
                Take any interactive quiz inside the Study Workspace to track your scores.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#F3EFFA]">
              {myAttempts.map((att) => (
                <li
                  key={att.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs text-[#615A78]">
                      <span className="font-mono font-bold text-[#6D28D9]">{att.subject}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{att.status === 'graded' ? 'Graded' : 'Submitted'}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#1B162B] mt-0.5">{att.quizTitle}</h3>
                    {att.submittedAt && (
                      <p className="text-[11px] text-[#8E86A8] mt-0.5 tabular-nums">
                        {att.submittedAt.toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="font-display text-lg font-extrabold text-[#6D28D9] tabular-nums">
                      {att.autoScore} / {att.totalPoints}
                    </div>
                    <div className="text-[11px] text-[#615A78]">
                      {att.essayPendingCount > 0
                        ? `${att.essayPendingCount} essay pending review`
                        : 'Score finalized'}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* VIEW 3: OFFICER SUBMISSIONS GRADING */}
      {viewMode === 'grading' && isAdmin && (
        <div className="bg-white border border-[#E4DEF2] rounded-2xl overflow-hidden">
          {attempts.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#615A78]">
              No student quiz submissions yet.
            </div>
          ) : (
            <ul className="divide-y divide-[#F3EFFA]">
              {attempts.map((att) => (
                <li
                  key={att.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs text-[#615A78]">
                      <span className="font-mono font-bold text-[#6D28D9]">{att.subject}</span>
                      <span aria-hidden="true"> · </span>
                      <span className="font-semibold text-[#1B162B]">{att.studentName}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{att.status === 'graded' ? 'Graded' : 'Needs Review'}</span>
                    </div>
                    <h3 className="text-sm font-bold text-[#1B162B] mt-0.5">{att.quizTitle}</h3>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="font-mono text-sm font-bold text-[#6D28D9] tabular-nums">
                      {att.autoScore} / {att.totalPoints}
                    </span>
                    <button
                      type="button"
                      onClick={() => openGradingModal(att)}
                      className="px-3.5 py-2 rounded-xl bg-[#F3EFFA] text-[#5B21B6] text-xs font-semibold hover:bg-[#E7DDF8] cursor-pointer"
                    >
                      Review Answers
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* VIEW 4: MANUAL / AUTO-GENERATED QUIZ BUILDER */}
      {viewMode === 'quiz_builder' && isAdmin && (
        <form
          onSubmit={handleSaveQuizBuilder}
          className="bg-white border border-[#E4DEF2] rounded-2xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-[#1B162B]">
                {editingQuizId ? 'Edit Interactive Quiz' : 'Quiz Builder'}
              </h2>
              <p className="text-xs text-[#615A78] mt-0.5">
                Supports Multiple Choice, Identification, True/False, and Essay items.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#1B162B] cursor-pointer">
                <input
                  type="checkbox"
                  checked={quizPublished}
                  onChange={(e) => setQuizPublished(e.target.checked)}
                  className="accent-[#6D28D9]"
                />
                Publish to ECE 1B students
              </label>
              <button
                type="button"
                onClick={() => setViewMode('workspace')}
                className="px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#352E4D] cursor-pointer"
              >
                Back to Workspace
              </button>
            </div>
          </div>

          {quizError && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl px-4 py-3 text-xs">
              {quizError}
            </div>
          )}
          {quizStatus && (
            <div className="bg-[#F3EFFA] border border-[#DFD4F6] text-[#5B21B6] rounded-2xl px-4 py-3 text-xs font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{quizStatus}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#2E2744] mb-1">Quiz Title</label>
              <input
                type="text"
                required
                maxLength={180}
                value={quizTitle}
                onChange={(e) => setQuizTitle(e.target.value)}
                placeholder="COE 104 Quiz 2: Integration by Parts"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2E2744] mb-1">Subject</label>
              <select
                value={quizSubject}
                onChange={(e) => {
                  setQuizSubject(e.target.value);
                  setQuizChapterId('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono bg-white focus:outline-none focus:border-[#6D28D9]"
              >
                {ECE1B_SUBJECTS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                Chapter
              </label>
              <select
                value={quizChapterId}
                onChange={(e) => setQuizChapterId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white focus:outline-none focus:border-[#6D28D9]"
              >
                <option value="">General / Uncategorized</option>
                {chapters
                  .filter((c) => c.subject === quizSubject)
                  .sort((a, b) => a.order - b.order)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                Description / Coverage
              </label>
              <input
                type="text"
                maxLength={2000}
                value={quizDescription}
                onChange={(e) => setQuizDescription(e.target.value)}
                placeholder="Optional instructions for students"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm focus:outline-none focus:border-[#6D28D9]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                Timer (minutes, 0 = none)
              </label>
              <input
                type="number"
                min={0}
                max={240}
                value={quizTimeLimit}
                onChange={(e) => setQuizTimeLimit(Number(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm font-mono tabular-nums focus:outline-none focus:border-[#6D28D9]"
              />
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-4">
            {quizQuestions.map((q, idx) => (
              <div
                key={q.id}
                className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#6D28D9]">
                    Question {idx + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={q.type}
                      onChange={(e) => {
                        const nextType = e.target.value as QuestionType;
                        updateQuestion(idx, {
                          type: nextType,
                          options:
                            nextType === 'multiple_choice'
                              ? q.options.length >= 2
                                ? q.options
                                : ['Option A', 'Option B', 'Option C', 'Option D']
                              : nextType === 'true_false'
                                ? ['True', 'False']
                                : [],
                          correctAnswer:
                            nextType === 'true_false' ? 'True' : q.correctAnswer,
                        });
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-[#DDD5EC] text-xs bg-white"
                    >
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="identification">Identification</option>
                      <option value="true_false">True / False</option>
                      <option value="essay">Essay</option>
                    </select>

                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={q.points}
                      onChange={(e) =>
                        updateQuestion(idx, { points: Number(e.target.value) || 1 })
                      }
                      aria-label="Points"
                      className="w-16 px-2 py-1.5 rounded-lg border border-[#DDD5EC] text-xs font-mono tabular-nums bg-white"
                    />
                    <span className="text-[11px] text-[#615A78]">pts</span>

                    {quizQuestions.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuizQuestions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 rounded-lg text-[#8E86A8] hover:text-red-600 cursor-pointer"
                        aria-label="Remove question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={2}
                  required
                  value={q.prompt}
                  onChange={(e) => updateQuestion(idx, { prompt: e.target.value })}
                  placeholder="Enter question prompt..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm bg-white focus:outline-none focus:border-[#6D28D9]"
                />

                {q.type === 'multiple_choice' && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-[#615A78]">
                      Options (select the correct radio option):
                    </div>
                    {q.options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`builder_correct_${q.id}`}
                          checked={q.correctAnswer === opt && opt.trim().length > 0}
                          onChange={() => updateQuestion(idx, { correctAnswer: opt })}
                          className="accent-[#6D28D9]"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            const nextOpts = q.options.map((o, i) =>
                              i === optIdx ? nextVal : o
                            );
                            updateQuestion(idx, {
                              options: nextOpts,
                              correctAnswer:
                                q.correctAnswer === opt ? nextVal : q.correctAnswer,
                            });
                          }}
                          placeholder={`Option ${optIdx + 1}`}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-[#DDD5EC] text-xs bg-white"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'true_false' && (
                  <div className="flex items-center gap-4 text-xs">
                    <span className="font-semibold text-[#615A78]">Correct Answer:</span>
                    {['True', 'False'].map((val) => (
                      <label key={val} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name={`tf_${q.id}`}
                          checked={q.correctAnswer === val}
                          onChange={() => updateQuestion(idx, { correctAnswer: val })}
                          className="accent-[#6D28D9]"
                        />
                        <span>{val}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'identification' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                        Primary Answer
                      </label>
                      <input
                        type="text"
                        required
                        value={q.correctAnswer}
                        onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                        placeholder="Gauss Law"
                        className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                        Accepted Variants (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={(q.acceptedAnswers || []).join(', ')}
                        onChange={(e) =>
                          updateQuestion(idx, {
                            acceptedAnswers: e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Gauss's Law, Gauss Law"
                        className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                      />
                    </div>
                  </div>
                )}

                {q.type === 'essay' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                        Model Answer
                      </label>
                      <textarea
                        rows={2}
                        value={q.correctAnswer}
                        onChange={(e) => updateQuestion(idx, { correctAnswer: e.target.value })}
                        placeholder="Expected key points..."
                        className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                        Grading Rubric
                      </label>
                      <textarea
                        rows={2}
                        value={q.rubric || ''}
                        onChange={(e) => updateQuestion(idx, { rubric: e.target.value })}
                        placeholder="2 pts for formula, 3 pts for explanation..."
                        className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <input
                    type="text"
                    value={q.explanation}
                    onChange={(e) => updateQuestion(idx, { explanation: e.target.value })}
                    placeholder="Optional explanation shown after student submits..."
                    className="w-full px-3 py-1.5 rounded-lg border border-[#DDD5EC] text-xs bg-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { type: 'multiple_choice', label: '+ Multiple Choice' },
                  { type: 'identification', label: '+ Identification' },
                  { type: 'true_false', label: '+ True/False' },
                  { type: 'essay', label: '+ Essay' },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.type}
                  type="button"
                  onClick={() =>
                    setQuizQuestions((prev) => [...prev, createEmptyQuestion(btn.type)])
                  }
                  className="px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#5B21B6] hover:bg-[#F3EFFA] cursor-pointer"
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <button
              type="submit"
              disabled={savingQuiz}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              {savingQuiz ? 'Saving Quiz...' : editingQuizId ? 'Update Quiz' : 'Save & Publish Quiz'}
            </button>
          </div>
        </form>
      )}

      {/* MODAL 1: Create / Edit Chapter */}
      {chapterModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-md w-full p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <h2 className="font-display text-lg font-bold text-[#1B162B]">
                {editingChapterId ? 'Edit Chapter' : `New ${selectedSubject} Chapter`}
              </h2>
              <button
                type="button"
                onClick={() => setChapterModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveChapterSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Chapter Title
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={chapTitle}
                  onChange={(e) => setChapTitle(e.target.value)}
                  placeholder="Chapter 2: Trigonometric Substitution"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Chapter Order
                </label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={chapOrder}
                  onChange={(e) => setChapOrder(Number(e.target.value) || 0)}
                  className="w-28 px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm font-mono tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Short Description (optional)
                </label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={chapDesc}
                  onChange={(e) => setChapDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setChapterModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingChapter}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingChapter ? 'Saving...' : editingChapterId ? 'Update Chapter' : 'Save Chapter'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add / Edit Rich Study Material & PDF Upload */}
      {materialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1B162B]">
                  {editingMatId ? 'Edit Study Material' : 'Add Study Material / PDF'}
                </h2>
                <p className="text-xs text-[#615A78] mt-0.5">
                  Upload PDFs for inline viewing, edit study notes, and attach reference links or images.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMaterialModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {materialError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-2.5 text-xs">
                {materialError}
              </div>
            )}
            {materialStatus && (
              <div className="bg-[#F3EFFA] border border-[#DFD4F6] text-[#5B21B6] rounded-xl px-4 py-2.5 text-xs font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>{materialStatus}</span>
              </div>
            )}

            <form onSubmit={handleSaveMaterialSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Material Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={matTitle}
                    onChange={(e) => setMatTitle(e.target.value)}
                    placeholder="Module 2: Gauss Law Lecture Handout"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Subject</label>
                  <select
                    value={matSubject}
                    onChange={(e) => {
                      setMatSubject(e.target.value);
                      setMatChapterId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-sm font-mono bg-white"
                  >
                    {ECE1B_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Chapter</label>
                  <select
                    value={matChapterId}
                    onChange={(e) => setMatChapterId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="">General / Uncategorized</option>
                    {chapters
                      .filter((c) => c.subject === matSubject)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Category</label>
                  <select
                    value={matCategory}
                    onChange={(e) => setMatCategory(e.target.value as StudyMaterial['category'])}
                    className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="Reviewer">Reviewer</option>
                    <option value="Exam PDF">Exam PDF</option>
                    <option value="Lecture Slides">Lecture Slides</option>
                    <option value="Lab Manual">Lab Manual</option>
                    <option value="Notes">Notes</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Summary / Subtitle
                </label>
                <input
                  type="text"
                  maxLength={2000}
                  value={matDescription}
                  onChange={(e) => setMatDescription(e.target.value)}
                  placeholder="Brief summary shown at the top of the lesson"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                  Readable Study Notes (shown directly in the website)
                </label>
                <textarea
                  rows={5}
                  maxLength={20000}
                  value={matContentBody}
                  onChange={(e) => setMatContentBody(e.target.value)}
                  placeholder="Write formulas, explanations, worked examples, or exam reminders..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD5EC] text-sm"
                />
              </div>

              {/* PDF / File Attachment */}
              <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-2.5">
                <label className="block text-xs font-semibold text-[#2E2744]">
                  Attach PDF or Study File (viewed right inside the website — max 15 MB)
                </label>
                {existingFileUrl && !selectedFile && (
                  <div className="flex items-center justify-between gap-2 bg-white border border-[#E4DEF2] rounded-xl px-3 py-2 text-xs">
                    <span className="truncate font-medium text-[#5B21B6]">
                      Current file: {existingFileName || 'Attached file'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setExistingFileUrl('');
                        setExistingFileName('');
                        setExistingMimeType('');
                      }}
                      className="text-red-600 font-semibold hover:underline cursor-pointer shrink-0"
                    >
                      Remove file
                    </button>
                  </div>
                )}
                <input
                  type="file"
                  accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-[#615A78] file:mr-4 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-[#EFE9FB] file:text-[#5B21B6] hover:file:bg-[#E4DAF9] cursor-pointer"
                />
              </div>

              {/* External Links Editor */}
              <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-semibold text-[#2E2744]">
                  External Links (Teams, Drive, YouTube, Reference PDFs)
                </div>
                {matLinks.length > 0 && (
                  <ul className="space-y-1.5">
                    {matLinks.map((lnk, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-2 bg-white border border-[#E4DEF2] rounded-xl px-3 py-1.5 text-xs"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-semibold text-[#1B162B]">{lnk.label}</span>
                          <span className="text-[#8E86A8] ml-2">{lnk.url}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMatLinks((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[#8E86A8] hover:text-red-600 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    value={newLinkLabel}
                    onChange={(e) => setNewLinkLabel(e.target.value)}
                    placeholder="Label (e.g. Microsoft Teams)"
                    className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                  />
                  <input
                    type="url"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://..."
                    className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddExternalLink}
                    className="px-3 py-1.5 rounded-xl bg-[#EFE9FB] text-[#5B21B6] text-xs font-semibold hover:bg-[#E4DAF9] cursor-pointer"
                  >
                    + Add Link
                  </button>
                </div>
              </div>

              {/* Study Images Editor */}
              <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-semibold text-[#2E2744]">
                  Study Diagrams & Images
                </div>
                {matImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {matImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="bg-white border border-[#E4DEF2] rounded-xl p-2 flex flex-col justify-between gap-1.5"
                      >
                        {isSafeImageSrc(img.url) && (
                          <img
                            src={img.url}
                            alt={img.caption || 'Diagram'}
                            className="h-20 w-full object-contain rounded"
                          />
                        )}
                        <div className="flex items-center justify-between gap-1 text-[11px]">
                          <span className="truncate text-[#615A78]">{img.caption || 'Image'}</span>
                          <button
                            type="button"
                            onClick={() => setMatImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-red-600 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                  <input
                    type="text"
                    value={newImgCaption}
                    onChange={(e) => setNewImgCaption(e.target.value)}
                    placeholder="Caption (optional)"
                    className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                  />
                  <input
                    type="url"
                    value={newImgUrl}
                    onChange={(e) => setNewImgUrl(e.target.value)}
                    placeholder="Paste image URL https://..."
                    className="sm:col-span-2 px-3 py-1.5 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    className="px-3 py-1.5 rounded-xl bg-[#EFE9FB] text-[#5B21B6] text-xs font-semibold hover:bg-[#E4DAF9] cursor-pointer"
                  >
                    + Add URL
                  </button>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DDD5EC] bg-white text-xs font-semibold text-[#5B21B6] hover:bg-[#F3EFFA] cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" />
                    {uploadingImage ? 'Uploading image...' : 'Upload Image File (PNG/JPG/WEBP)'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingImage}
                      onChange={(e) => handleUploadStudyImage(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Optional Auto-Convert to Interactive Quiz */}
              <div className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-3">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-[#1B162B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoConvertQuiz}
                    onChange={(e) => setAutoConvertQuiz(e.target.checked)}
                    className="accent-[#6D28D9]"
                  />
                  Also auto-convert this PDF / notes into an interactive quiz draft
                </label>

                {autoConvertQuiz && (
                  <div className="pt-2 space-y-2.5 border-t border-[#E4DEF2]">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          { id: 'multiple_choice', label: 'Multiple Choice' },
                          { id: 'identification', label: 'Identification' },
                          { id: 'true_false', label: 'True / False' },
                          { id: 'essay', label: 'Essay' },
                        ] as const
                      ).map((qt) => {
                        const active = selectedQuestionTypes.includes(qt.id);
                        return (
                          <button
                            key={qt.id}
                            type="button"
                            onClick={() => toggleTypeSelection(qt.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                              active
                                ? 'bg-[#6D28D9] text-white border-[#6D28D9]'
                                : 'bg-white text-[#615A78] border-[#DDD5EC]'
                            }`}
                          >
                            {qt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-[#2E2744]">Target Questions:</span>
                      <input
                        type="number"
                        min={3}
                        max={35}
                        value={targetQuestionCount}
                        onChange={(e) => setTargetQuestionCount(Number(e.target.value) || 10)}
                        className="w-20 px-2.5 py-1 rounded-lg border border-[#DDD5EC] bg-white font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setMaterialModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMaterial}
                  className="px-5 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                >
                  {savingMaterial
                    ? 'Saving...'
                    : editingMatId
                      ? 'Save Material Changes'
                      : autoConvertQuiz
                        ? 'Save Material & Generate Quiz'
                        : 'Save Study Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Create / Edit Flashcard Deck (with Front <-> Back Swap) */}
      {deckModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEBF7]">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1B162B]">
                  {editingDeckId ? 'Edit Flashcard Deck' : 'Create Flashcard Deck'}
                </h2>
                <p className="text-xs text-[#615A78] mt-0.5">
                  Add terms and definitions, and swap which text sits on the Front or Back anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeckModalOpen(false)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F5F1FC] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deckError && (
              <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-2.5 text-xs">
                {deckError}
              </div>
            )}

            <form onSubmit={handleSaveDeckSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Deck Title
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={180}
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    placeholder="Chapter 1 Key Formulas & Terms"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Subject</label>
                  <select
                    value={deckSubject}
                    onChange={(e) => {
                      setDeckSubject(e.target.value);
                      setDeckChapterId('');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-sm font-mono bg-white"
                  >
                    {ECE1B_SUBJECTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">Chapter</label>
                  <select
                    value={deckChapterId}
                    onChange={(e) => setDeckChapterId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-sm bg-white"
                  >
                    <option value="">General / Uncategorized</option>
                    {chapters
                      .filter((c) => c.subject === deckSubject)
                      .sort((a, b) => a.order - b.order)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2E2744] mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    maxLength={1000}
                    value={deckDesc}
                    onChange={(e) => setDeckDesc(e.target.value)}
                    placeholder="Short note for classmates"
                    className="w-full px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs font-bold text-[#1B162B] tabular-nums">
                  Cards ({deckCards.length})
                </span>
                <button
                  type="button"
                  onClick={swapAllDeckCards}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EFE9FB] text-[#5B21B6] text-xs font-semibold hover:bg-[#E4DAF9] cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  Swap All Cards (Front ↔ Back)
                </button>
              </div>

              <div className="space-y-3">
                {deckCards.map((card, idx) => (
                  <div
                    key={card.id}
                    className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-3.5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-[#6D28D9]">
                        Card {idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => swapSingleCard(idx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#DDD5EC] text-[11px] font-semibold text-[#5B21B6] hover:bg-[#F3EFFA] cursor-pointer"
                        >
                          <ArrowLeftRight className="w-3 h-3" />
                          Swap Front ↔ Back
                        </button>
                        {deckCards.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setDeckCards((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-[#8E86A8] hover:text-red-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                          Front
                        </label>
                        <textarea
                          rows={2}
                          value={card.front}
                          onChange={(e) =>
                            setDeckCards((prev) =>
                              prev.map((c, i) =>
                                i === idx ? { ...c, front: e.target.value } : c
                              )
                            )
                          }
                          placeholder="Term, symbol, or question..."
                          className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                          Back
                        </label>
                        <textarea
                          rows={2}
                          value={card.back}
                          onChange={(e) =>
                            setDeckCards((prev) =>
                              prev.map((c, i) =>
                                i === idx ? { ...c, back: e.target.value } : c
                              )
                            )
                          }
                          placeholder="Definition, formula, or answer..."
                          className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setDeckCards((prev) => [...prev, createEmptyCard()])}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#5B21B6] hover:bg-[#F3EFFA] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Flashcard
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDeckModalOpen(false)}
                    className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#2E2744] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingDeck}
                    className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
                  >
                    {savingDeck
                      ? 'Saving...'
                      : editingDeckId
                        ? 'Update Flashcards'
                        : 'Save Flashcard Deck'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Officer Essay Grading Modal */}
      {gradingAttempt && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E4DEF2] rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[88vh] overflow-y-auto space-y-4">
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#EFEBF7]">
              <div>
                <h2 className="font-display text-lg font-bold text-[#1B162B]">
                  Grade Submission: {gradingAttempt.studentName}
                </h2>
                <p className="text-xs text-[#615A78] mt-0.5">{gradingAttempt.quizTitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setGradingAttempt(null)}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F3EFFA] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const quiz = quizzes.find((q) => q.id === gradingAttempt.quizId);
              if (!quiz) {
                return <p className="text-xs text-[#615A78]">Original quiz was deleted.</p>;
              }
              const essayQuestions = quiz.questions.filter((q) => q.type === 'essay');
              if (essayQuestions.length === 0) {
                return (
                  <p className="text-sm text-[#352E4D]">
                    This quiz contains only auto-graded items ({gradingAttempt.autoScore} /{' '}
                    {gradingAttempt.totalPoints}).
                  </p>
                );
              }
              return essayQuestions.map((eq) => {
                const studentText = gradingAttempt.answers[eq.id] || '';
                const currentEntry = essayScores[eq.id] || { score: 0, comment: '' };
                return (
                  <div
                    key={eq.id}
                    className="bg-[#FAF8FE] border border-[#E4DEF2] rounded-2xl p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#5B21B6]">
                        Essay ({eq.points} pts max)
                      </span>
                      <button
                        type="button"
                        disabled={aiGradingQId === eq.id}
                        onClick={() => handleAiSuggestEssayGrade(eq, studentText)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EFE9FB] text-[#5B21B6] text-[11px] font-semibold hover:bg-[#E4DAF9] cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        {aiGradingQId === eq.id ? 'Evaluating...' : 'AI Suggest Score'}
                      </button>
                    </div>
                    <p className="text-sm font-semibold text-[#1B162B]">{eq.prompt}</p>
                    <div className="bg-white border border-[#E4DEF2] rounded-xl p-3 text-xs text-[#1B162B]">
                      <div className="font-semibold text-[#615A78] mb-1">Student Response:</div>
                      {studentText || 'No response submitted.'}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                          Points (0–{eq.points})
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={eq.points}
                          value={currentEntry.score}
                          onChange={(e) =>
                            setEssayScores((prev) => ({
                              ...prev,
                              [eq.id]: {
                                ...currentEntry,
                                score: Math.min(
                                  Math.max(Number(e.target.value) || 0, 0),
                                  eq.points
                                ),
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs font-mono bg-white"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-[#615A78] mb-1">
                          Officer Feedback
                        </label>
                        <input
                          type="text"
                          value={currentEntry.comment}
                          onChange={(e) =>
                            setEssayScores((prev) => ({
                              ...prev,
                              [eq.id]: { ...currentEntry, comment: e.target.value },
                            }))
                          }
                          placeholder="Clear derivation and explanation..."
                          className="w-full px-3 py-2 rounded-xl border border-[#DDD5EC] text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setGradingAttempt(null)}
                className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#352E4D] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                disabled={savingGrade}
                onClick={handleSaveGrade}
                className="px-5 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
              >
                {savingGrade ? 'Saving...' : 'Save Final Grade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Quiz Runner Modal */}
      {activeQuiz && (
        <QuizRunnerModal
          quiz={activeQuiz}
          onClose={() => setActiveQuiz(null)}
          onSubmitAttempt={onSubmitQuizAttempt}
        />
      )}
    </div>
  );
};
