import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { InteractiveQuiz, QuizAttempt, QuizQuestion } from '../types';

interface QuizRunnerModalProps {
  quiz: InteractiveQuiz;
  onClose: () => void;
  onSubmitAttempt: (payload: {
    quiz: InteractiveQuiz;
    answers: Record<string, string>;
    autoScore: number;
    maxAutoScore: number;
    essayPendingCount: number;
  }) => Promise<QuizAttempt>;
}

function normalizeAnswer(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isObjectiveCorrect(question: QuizQuestion, studentAnswer: string): boolean {
  const normStudent = normalizeAnswer(studentAnswer || '');
  if (!normStudent) return false;
  if (question.type === 'multiple_choice' || question.type === 'true_false') {
    return normStudent === normalizeAnswer(question.correctAnswer);
  }
  if (question.type === 'identification') {
    const candidates = [question.correctAnswer, ...(question.acceptedAnswers || [])]
      .filter(Boolean)
      .map(normalizeAnswer);
    return candidates.includes(normStudent);
  }
  return false;
}

export const QuizRunnerModal: React.FC<QuizRunnerModalProps> = ({
  quiz,
  onClose,
  onSubmitAttempt,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedAttempt, setSubmittedAttempt] = useState<QuizAttempt | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    quiz.timeLimitMinutes > 0 ? quiz.timeLimitMinutes * 60 : 0
  );

  useEffect(() => {
    if (quiz.timeLimitMinutes <= 0 || submittedAttempt) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [quiz.timeLimitMinutes, submittedAttempt]);

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submitting || submittedAttempt) return;
    setSubmitting(true);
    try {
      let autoScore = 0;
      let maxAutoScore = 0;
      let essayPendingCount = 0;

      for (const q of quiz.questions) {
        if (q.type === 'essay') {
          essayPendingCount += 1;
        } else {
          maxAutoScore += q.points;
          if (isObjectiveCorrect(q, answers[q.id] || '')) {
            autoScore += q.points;
          }
        }
      }

      const attempt = await onSubmitAttempt({
        quiz,
        answers,
        autoScore,
        maxAutoScore,
        essayPendingCount,
      });
      setSubmittedAttempt(attempt);
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = quiz.questions.filter(
    (q) => (answers[q.id] || '').trim().length > 0
  ).length;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-[#F7F6F9] border border-[#E4DEF2] rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Top Bar */}
        <div className="bg-white border-b border-[#E4DEF2] px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-[#615A78]">
              <span className="font-mono font-bold text-[#6D28D9]">{quiz.subject}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{quiz.questionCount} questions</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{quiz.totalPoints} pts</span>
            </div>
            <h2 className="font-display text-base sm:text-lg font-bold text-[#1B162B] truncate mt-0.5">
              {quiz.title}
            </h2>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {quiz.timeLimitMinutes > 0 && !submittedAttempt && (
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-xs font-semibold tabular-nums ${
                  remainingSeconds <= 60
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-[#F3EFFA] text-[#5B21B6]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-[#615A78] hover:bg-[#F3EFFA] cursor-pointer"
              aria-label="Close quiz"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {submittedAttempt ? (
            <div className="space-y-5">
              {/* Score Summary Card */}
              <div className="bg-[#14131D] border border-[#2B283C] text-white rounded-2xl p-6">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#C4B5FD]">
                  Quiz Submitted
                </div>
                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <div className="font-display text-3xl sm:text-4xl font-extrabold tabular-nums">
                      {submittedAttempt.autoScore} / {submittedAttempt.maxAutoScore}
                      <span className="text-base font-medium text-[#C4B5FD] ml-2">
                        auto-graded pts
                      </span>
                    </div>
                    {submittedAttempt.essayPendingCount > 0 && (
                      <p className="text-xs text-[#D5CEEB] mt-1.5">
                        Includes {submittedAttempt.essayPendingCount} essay{' '}
                        {submittedAttempt.essayPendingCount === 1 ? 'item' : 'items'} awaiting officer review (compare against the model answer below).
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] cursor-pointer"
                  >
                    Done Reviewing
                  </button>
                </div>
              </div>

              {/* Per-Question Review */}
              {quiz.questions.map((q, idx) => {
                const studentAns = answers[q.id] || '';
                const isEssay = q.type === 'essay';
                const correct = !isEssay && isObjectiveCorrect(q, studentAns);

                return (
                  <div
                    key={q.id}
                    className="bg-white border border-[#E4DEF2] rounded-2xl p-5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-[#615A78]">
                        <span className="font-mono font-bold text-[#6D28D9]">Q{idx + 1}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="capitalize">{q.type.replace('_', ' ')}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="tabular-nums">{q.points} pts</span>
                      </div>

                      {isEssay ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#5B21B6]">
                          <HelpCircle className="w-3.5 h-3.5" />
                          Model Answer Provided
                        </span>
                      ) : correct ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" />
                          Correct (+{q.points})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                          <XCircle className="w-4 h-4" />
                          Incorrect (0/{q.points})
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-[#1B162B]">{q.prompt}</p>

                    <div className="bg-[#FAF8FE] border border-[#E9E4F5] rounded-xl p-3 text-xs space-y-1.5">
                      <div>
                        <span className="font-semibold text-[#615A78]">Your answer: </span>
                        <span className="text-[#1B162B]">
                          {studentAns.trim() ? studentAns : 'No answer provided'}
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-[#5B21B6]">
                          {isEssay ? 'Model answer: ' : 'Correct answer: '}
                        </span>
                        <span className="text-[#1B162B]">{q.correctAnswer}</span>
                      </div>
                      {q.explanation && (
                        <div className="pt-1 border-t border-[#E4DEF2] text-[#615A78]">
                          <span className="font-semibold">Explanation: </span>
                          {q.explanation}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <form id="quiz-runner-form" onSubmit={handleSubmit} className="space-y-4">
              {quiz.description && (
                <div className="bg-[#F3EFFA] border border-[#DFD4F6] rounded-2xl px-4 py-3 text-xs text-[#41287A]">
                  {quiz.description}
                </div>
              )}

              {quiz.questions.map((q, idx) => {
                const value = answers[q.id] || '';
                return (
                  <div
                    key={q.id}
                    className="bg-white border border-[#E4DEF2] rounded-2xl p-5 space-y-3.5"
                  >
                    <div className="flex items-center justify-between text-xs text-[#615A78]">
                      <div>
                        <span className="font-mono font-bold text-[#6D28D9]">
                          Question {idx + 1}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="capitalize">{q.type.replace('_', ' ')}</span>
                      </div>
                      <span className="font-mono tabular-nums">{q.points} pts</span>
                    </div>

                    <p className="text-sm sm:text-base font-semibold text-[#1B162B] leading-snug">
                      {q.prompt}
                    </p>

                    {(q.type === 'multiple_choice' || q.type === 'true_false') && (
                      <div className="grid grid-cols-1 gap-2">
                        {q.options.map((option, optIdx) => {
                          const selected = value === option;
                          return (
                            <label
                              key={`${q.id}_opt_${optIdx}`}
                              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm cursor-pointer transition-colors ${
                                selected
                                  ? 'border-[#6D28D9] bg-[#F3EFFA] text-[#1B162B] font-semibold'
                                  : 'border-[#E4DEF2] hover:border-[#C5B6EC] text-[#352E4D]'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`question_${q.id}`}
                                value={option}
                                checked={selected}
                                onChange={() => setAnswer(q.id, option)}
                                className="accent-[#6D28D9]"
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {q.type === 'identification' && (
                      <div>
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder="Type your exact answer..."
                          className="w-full px-4 py-2.5 rounded-xl border border-[#DDD5EC] text-sm bg-white focus:outline-none focus:border-[#6D28D9]"
                        />
                      </div>
                    )}

                    {q.type === 'essay' && (
                      <div className="space-y-1.5">
                        <textarea
                          rows={4}
                          value={value}
                          onChange={(e) => setAnswer(q.id, e.target.value)}
                          placeholder="Write your explanation or step-by-step solution..."
                          className="w-full px-4 py-3 rounded-xl border border-[#DDD5EC] text-sm bg-white focus:outline-none focus:border-[#6D28D9]"
                        />
                        {q.rubric && (
                          <p className="text-[11px] text-[#615A78]">
                            Criteria: {q.rubric}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </form>
          )}
        </div>

        {/* Sticky Footer when taking quiz */}
        {!submittedAttempt && (
          <div className="bg-white border-t border-[#E4DEF2] px-5 py-3.5 flex items-center justify-between gap-4">
            <span className="text-xs text-[#615A78] tabular-nums">
              {answeredCount} of {quiz.questions.length} answered
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#DDD5EC] text-xs font-semibold text-[#352E4D] hover:bg-[#F5F1FC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="quiz-runner-form"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold hover:bg-[#5B21B6] disabled:opacity-60 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {submitting ? 'Submitting...' : 'Submit Quiz'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
