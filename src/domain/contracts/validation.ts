// Validation issue contract (PLAN.md §3.3, §8.1).

export type Severity = 'error' | 'warning' | 'recommendation' | 'information';
export type IssueCategory = 'schema' | 'structure' | 'semantics' | 'capability' | 'experiment' | 'educational';

export interface ValidationIssue {
  code: string;
  severity: Severity;
  category: IssueCategory;
  path: string;
  message: string;
  consequence?: string;
  suggestion?: string;
  lessonId?: string;
}

export const hasErrors = (issues: readonly ValidationIssue[]) => issues.some((i) => i.severity === 'error');
