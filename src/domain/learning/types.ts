// Lesson and challenge contracts. Content is plain data plus pure predicates
// evaluated with the same headless engine as the app. Text is rendered as plain text, never HTML.
import type { Model } from '../contracts/model';
import type { ExperimentDefinition } from '../experiments/experiment';
import type { RunResult } from '../experiments/execute';

export interface ChoiceQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  /** Shown after answering, right or wrong. */
  explanation: string;
}

export interface LessonDemo {
  build: () => Model;
  /** Transition seed (stochastic demos). */
  seed?: string;
  /** Plain description of the exact configuration, shown next to the demo. */
  caption: string;
}

export interface Lesson {
  id: string;
  version: number;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  objective: string;
  explanation: string[];
  demo: LessonDemo;
  /** Asked before the student steps the demo. */
  prediction: ChoiceQuestion;
  mistake: { title: string; text: string };
  exercise: { text: string; challengeId?: string };
  check: ChoiceQuestion[];
  reflection: string;
}

/** Evidence a challenge can inspect: the student's model and the experiments run on it. */
export interface ChallengeContext {
  model: Model;
  /** Project transition seed. */
  seed: string;
  experiments: Array<{ definition: ExperimentDefinition; status: string; conclusion: string; runs: RunResult[] }>;
  answers: Record<string, string>;
}

export interface PredicateResult {
  id: string;
  passed: boolean;
  observed: string;
  expected: string;
  explanation: string;
}

export interface Predicate {
  id: string;
  description: string;
  check(ctx: ChallengeContext): Omit<PredicateResult, 'id'>;
}

export interface ChallengeQuestion {
  id: string;
  prompt: string;
  /** 'number' answers are compared numerically within `tolerance`. */
  kind: 'number' | 'text';
  tolerance?: number;
}

export interface Challenge {
  id: string;
  version: number;
  title: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  task: string;
  /** Starting model for the student's project; omitted when the student starts from any project. */
  start?: () => Model;
  startSeed?: string;
  questions: ChallengeQuestion[];
  predicates: Predicate[];
  hints: string[];
  reflection: { prompt: string; rubric: string[] };
  lessonId?: string;
}

export const pass = (observed: string, expected: string, explanation: string) => ({ passed: true, observed, expected, explanation });
export const fail = (observed: string, expected: string, explanation: string) => ({ passed: false, observed, expected, explanation });
