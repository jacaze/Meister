import { EducationPolicyGuard, type EducationAnswer } from '../../domain/EducationPolicyGuard.js';

export function askEducation(question: string): EducationAnswer {
  return EducationPolicyGuard.answerQuestion(question);
}
