// Validation issue contract.

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
