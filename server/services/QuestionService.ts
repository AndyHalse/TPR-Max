/**
 * Question generation service with AI and fallback support
 */

import type { IQuestionGenerator, Question, Result, IAiChatClient } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';

export class QuestionService implements IQuestionGenerator {
  constructor(private aiClient: IAiChatClient) {}

  async generate(script: string, scenes: any[], roleType: string): Promise<Result<Question[]>> {
    console.log(`🧠 Generating AI questions for ${roleType} induction video...`);
    
    try {
      const prompt = this.buildPrompt(script, roleType);
      const schemaHints = `{
        "questions": [
          {
            "questionText": "string",
            "questionType": "multiple_choice",
            "correctAnswer": "string (A, B, C, or D)",
            "optionA": "string",
            "optionB": "string", 
            "optionC": "string",
            "optionD": "string",
            "explanation": "string",
            "category": "string",
            "roleType": "${roleType}"
          }
        ]
      }`;

      const result = await this.aiClient.completeJson(prompt, schemaHints);
      
      if (ResultUtils.isSuccess(result)) {
        const questions = this.parseAndValidateQuestions(result.data, roleType);
        if (questions.length > 0) {
          console.log(`✅ Generated ${questions.length} AI questions for ${roleType}`);
          return ResultUtils.success(questions);
        }
      }

      console.log(`⚠️ AI question generation failed, using fallback questions for ${roleType}`);
      return this.getFallbackQuestions(roleType);

    } catch (error: any) {
      console.error('❌ Error generating questions from script:', error);
      return this.getFallbackQuestions(roleType);
    }
  }

  private buildPrompt(script: string, roleType: string): string {
    return `Based on the following ${roleType} safety induction video content, generate 8-12 comprehensive multiple choice questions that test understanding of the key safety concepts covered.

INDUCTION VIDEO SCRIPT:
${script}

Requirements:
- Create questions that test practical understanding, not just memorization
- Focus on safety procedures, compliance requirements, and emergency protocols
- Include scenario-based questions where applicable
- Ensure questions are appropriate for ${roleType} personnel
- Each question should have 4 plausible options with clear explanations
- Questions should cover different safety categories (PPE, Emergency, Hazards, etc.)

Generate questions that help verify the person understood the safety training content and can apply it in real workplace situations.`;
  }

  private parseAndValidateQuestions(data: any, roleType: string): Question[] {
    try {
      const questions = data.questions || data || [];
      
      return questions
        .filter((q: any) => q.questionText && q.optionA && q.optionB && q.optionC && q.optionD)
        .map((q: any): Question => ({
          questionText: String(q.questionText || '').trim(),
          questionType: String(q.questionType || 'multiple_choice'),
          correctAnswer: String(q.correctAnswer || 'A').toUpperCase(),
          optionA: String(q.optionA || '').trim(),
          optionB: String(q.optionB || '').trim(),
          optionC: String(q.optionC || '').trim(),
          optionD: String(q.optionD || '').trim(),
          explanation: String(q.explanation || '').trim(),
          category: String(q.category || 'Safety').trim(),
          roleType: roleType
        }))
        .filter((q: Question) => 
          q.questionText.length > 0 && 
          q.optionA.length > 0 && 
          ['A', 'B', 'C', 'D'].includes(q.correctAnswer)
        );
    } catch (error) {
      console.error('❌ Failed to parse questions:', error);
      return [];
    }
  }

  private getFallbackQuestions(roleType: string): Promise<Result<Question[]>> {
    const fallbackQuestions: Question[] = [
      {
        questionText: `What is the most important safety requirement for ${roleType} personnel?`,
        questionType: "multiple_choice",
        correctAnswer: "B",
        optionA: "Completing work quickly",
        optionB: "Following all safety procedures",
        optionC: "Working independently", 
        optionD: "Avoiding supervision",
        explanation: "Following all safety procedures is the most important requirement to prevent accidents and ensure workplace safety.",
        category: "General Safety",
        roleType: roleType
      },
      {
        questionText: "In case of an emergency, what should you do first?",
        questionType: "multiple_choice", 
        correctAnswer: "A",
        optionA: "Follow the emergency evacuation procedures",
        optionB: "Continue working until told to stop",
        optionC: "Wait for further instructions",
        optionD: "Try to fix the problem yourself",
        explanation: "Emergency evacuation procedures should be followed immediately to ensure everyone's safety.",
        category: "Emergency Procedures",
        roleType: roleType
      }
    ];

    console.log(`✅ Using ${fallbackQuestions.length} fallback questions for ${roleType}`);
    return Promise.resolve(ResultUtils.success(fallbackQuestions));
  }
}