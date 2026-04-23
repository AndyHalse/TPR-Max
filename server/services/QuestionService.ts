/**
 * Question generation service with AI and fallback support
 * Generates exactly 10 questions across 5 key UK HSE safety categories
 */

import type { IQuestionGenerator, Question, Result, IAiChatClient, AiModelOptions } from '../interfaces/ai';
import { ResultUtils } from '../utils/result';

const REQUIRED_CATEGORIES = [
  { key: 'Emergency Procedures', count: 2 },
  { key: 'PPE & Equipment', count: 2 },
  { key: 'Legal Responsibilities', count: 2 },
  { key: 'Hazard Identification', count: 2 },
  { key: 'Site Rules & Safe Working', count: 2 },
];

export class QuestionService implements IQuestionGenerator {
  constructor(private aiClient: IAiChatClient) {}

  async generate(script: string, scenes: any[], roleType: string, options?: AiModelOptions): Promise<Result<Question[]>> {
    const modelLabel = options?.model || 'default';
    console.log(`🧠 Generating AI questions for ${roleType} induction video (model: ${modelLabel})...`);
    
    try {
      const prompt = this.buildPrompt(script, roleType);
      const schemaHints = `{
        "questions": [
          {
            "questionText": "string - scenario-based question testing practical understanding",
            "questionType": "multiple_choice",
            "correctAnswer": "string (A, B, C, or D)",
            "optionA": "string",
            "optionB": "string", 
            "optionC": "string",
            "optionD": "string",
            "explanation": "string - why the answer is correct and others are wrong",
            "category": "Emergency Procedures | PPE & Equipment | Legal Responsibilities | Hazard Identification | Site Rules & Safe Working",
            "roleType": "${roleType}"
          }
        ]
      }`;

      const result = await this.aiClient.completeJson(prompt, schemaHints, options);
      
      if (ResultUtils.isSuccess(result)) {
        const questions = this.parseAndValidateQuestions(result.data, roleType);
        if (questions.length >= 8) {
          console.log(`✅ Generated ${questions.length} AI questions for ${roleType}`);
          return ResultUtils.success(questions);
        }
        console.log(`⚠️ Only got ${questions.length} valid questions, trying fallback`);
      }

      console.log(`⚠️ AI question generation insufficient, using fallback questions for ${roleType}`);
      return this.getFallbackQuestions(roleType);

    } catch (error: any) {
      console.error('❌ Error generating questions from script:', error);
      return this.getFallbackQuestions(roleType);
    }
  }

  private buildPrompt(script: string, roleType: string): string {
    const categoryList = REQUIRED_CATEGORIES.map(c => `- ${c.key} (${c.count} questions)`).join('\n');
    
    return `You are a UK Health & Safety training expert. Based on the following ${roleType} safety induction script, generate EXACTLY 10 multiple-choice questions that test real understanding of safety procedures.

INDUCTION SCRIPT:
${script}

MANDATORY CATEGORY DISTRIBUTION (2 questions per category):
${categoryList}

REQUIREMENTS FOR EACH QUESTION:
- Use scenario-based language: "What should you do if...", "Which action is correct when...", "A colleague asks you to... what do you do?"
- All 4 options must be plausible — avoid obviously wrong answers
- The explanation must reference the specific script content and UK HSE guidance
- Questions must directly relate to content covered in the script above
- Appropriate difficulty for ${roleType} personnel in a UK workplace
- Use UK terminology: "muster point" not "assembly area", "HSE" not "OSHA", etc.

Produce exactly 10 questions in the JSON format specified. Each question must have a "category" field matching one of: "Emergency Procedures", "PPE & Equipment", "Legal Responsibilities", "Hazard Identification", "Site Rules & Safe Working".`;
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
          category: String(q.category || 'Site Rules & Safe Working').trim(),
          roleType: roleType
        }))
        .filter((q: Question) => 
          q.questionText.length > 10 && 
          q.optionA.length > 0 && 
          ['A', 'B', 'C', 'D'].includes(q.correctAnswer)
        );
    } catch (error) {
      console.error('❌ Failed to parse questions:', error);
      return [];
    }
  }

  private getFallbackQuestions(roleType: string): Promise<Result<Question[]>> {
    const isContractor = roleType === 'contractor';
    const isStaff = roleType === 'staff';

    const fallbackQuestions: Question[] = [
      // Emergency Procedures (2)
      {
        questionText: "You hear the fire alarm sounding. What should you do immediately?",
        questionType: "multiple_choice",
        correctAnswer: "B",
        optionA: "Continue working until a supervisor confirms it is a real fire",
        optionB: "Stop work, follow evacuation procedures, and proceed to the muster point",
        optionC: "Investigate the source of the alarm before leaving",
        optionD: "Wait for the all-clear announcement before evacuating",
        explanation: "On hearing the fire alarm you must immediately stop work and evacuate to the designated muster point — never wait for confirmation or investigate.",
        category: "Emergency Procedures",
        roleType
      },
      {
        questionText: "You witness a colleague collapse suddenly. What is your first action?",
        questionType: "multiple_choice",
        correctAnswer: "A",
        optionA: "Call for help immediately and alert the first aider or call 999",
        optionB: "Try to move them to a more comfortable position",
        optionC: "Continue working and report it at the end of your shift",
        optionD: "Give them water and wait to see if they recover",
        explanation: "Immediate medical assistance must be sought — call for first aid or emergency services without delay. Do not move the person unless there is immediate danger.",
        category: "Emergency Procedures",
        roleType
      },
      // PPE & Equipment (2)
      {
        questionText: "Your employer provides you with PPE for a specific task. When must you wear it?",
        questionType: "multiple_choice",
        correctAnswer: "C",
        optionA: "Only when a manager is present and watching",
        optionB: "When you personally judge the risk to be high enough",
        optionC: "Whenever you carry out that task, as required by law",
        optionD: "Only if the task takes longer than 30 minutes",
        explanation: "Under the Personal Protective Equipment at Work Regulations 1992, you are legally required to use PPE provided to you whenever carrying out the task it was provided for.",
        category: "PPE & Equipment",
        roleType
      },
      {
        questionText: "You notice your safety helmet is cracked. What should you do?",
        questionType: "multiple_choice",
        correctAnswer: "D",
        optionA: "Continue using it — a crack does not affect protection significantly",
        optionB: "Repair it with tape before using it for the rest of the day",
        optionC: "Use it for low-risk tasks only",
        optionD: "Stop using it immediately and report it to get a replacement",
        explanation: "Damaged PPE must never be used. A cracked helmet has compromised structural integrity and must be taken out of service and replaced immediately.",
        category: "PPE & Equipment",
        roleType
      },
      // Legal Responsibilities (2)
      {
        questionText: `Under the Health and Safety at Work Act 1974, what is YOUR primary responsibility as a ${roleType}?`,
        questionType: "multiple_choice",
        correctAnswer: "B",
        optionA: "To ensure profits are not impacted by safety delays",
        optionB: "To take reasonable care of your own health and safety and that of others affected by your work",
        optionC: "Safety is the employer's responsibility — you are not legally liable",
        optionD: "To complete all tasks as quickly as possible",
        explanation: "The Health and Safety at Work Act 1974 places a legal duty on ALL workers to take reasonable care for their own safety and the safety of those affected by their work.",
        category: "Legal Responsibilities",
        roleType
      },
      {
        questionText: "Who is responsible for reporting a near-miss incident at work?",
        questionType: "multiple_choice",
        correctAnswer: "A",
        optionA: "Anyone who witnesses or is involved in the near-miss",
        optionB: "Only the site manager or safety officer",
        optionC: "Only the person who was nearly injured",
        optionD: "Near-misses do not need to be reported if nobody was hurt",
        explanation: "All near-misses must be reported by anyone who witnessed or was involved. Near-misses provide vital information to prevent future accidents and are a legal requirement under RIDDOR.",
        category: "Legal Responsibilities",
        roleType
      },
      // Hazard Identification (2)
      {
        questionText: "You notice a wet floor in a walkway with no warning sign. What should you do?",
        questionType: "multiple_choice",
        correctAnswer: "C",
        optionA: "Walk carefully around it and continue with your work",
        optionB: "Tell a colleague about it when you next see them",
        optionC: "Place a warning sign, report it immediately, and prevent others from entering if possible",
        optionD: "Clean it up yourself even though it is not your responsibility",
        explanation: "Hazards must be controlled immediately to prevent injury. Place a warning sign, restrict access if possible, and report it straight away to the responsible person.",
        category: "Hazard Identification",
        roleType
      },
      {
        questionText: "When carrying out a task for the first time, what should you do before starting?",
        questionType: "multiple_choice",
        correctAnswer: "D",
        optionA: "Start work and identify hazards as you go",
        optionB: "Ask a colleague to watch you in case something goes wrong",
        optionC: "Assume the task is safe as it has been done before by others",
        optionD: "Review the risk assessment or method statement and raise any concerns before starting",
        explanation: "Risk assessments and method statements must be reviewed before starting new or unfamiliar tasks. You must raise any concerns with your supervisor before work begins.",
        category: "Hazard Identification",
        roleType
      },
      // Site Rules & Safe Working (2)
      {
        questionText: isContractor 
          ? "As a contractor, what must you obtain before starting any work that could affect building systems?"
          : isStaff 
          ? "As a staff member, what must you do before undertaking any non-routine maintenance task?"
          : "As a visitor to the site, what must you do at all times?",
        questionType: "multiple_choice",
        correctAnswer: "A",
        optionA: isContractor 
          ? "Obtain a permit to work from the authorised site manager"
          : isStaff
          ? "Obtain authorisation and review the relevant risk assessment"
          : "Stay with your designated escort and follow their instructions",
        optionB: "Proceed if you have previous experience doing similar work",
        optionC: "Start work and inform the manager afterwards",
        optionD: "Check with a colleague if they think it is okay to proceed",
        explanation: isContractor
          ? "Contractors must always obtain a formal permit to work before carrying out tasks that could affect building systems, services, or other workers."
          : isStaff
          ? "Non-routine tasks require prior authorisation and review of risk assessments to ensure hazards are controlled before work begins."
          : "Visitors must remain with their escort at all times for their own safety and the security of the site.",
        category: "Site Rules & Safe Working",
        roleType
      },
      {
        questionText: "You are unsure whether a task is safe to proceed with. What is the correct course of action?",
        questionType: "multiple_choice",
        correctAnswer: "B",
        optionA: "Carry out the task as instructed — safety is the employer's concern",
        optionB: "Stop work and raise your concerns with your supervisor before continuing",
        optionC: "Complete the task as quickly as possible to reduce the risk",
        optionD: "Ask a colleague if they have done it safely before",
        explanation: "You have both a legal right and a duty to stop work and raise safety concerns. Supervisors must address safety concerns before work continues — never proceed if you are unsure.",
        category: "Site Rules & Safe Working",
        roleType
      }
    ];

    console.log(`✅ Using ${fallbackQuestions.length} structured fallback questions for ${roleType}`);
    return Promise.resolve(ResultUtils.success(fallbackQuestions));
  }
}
