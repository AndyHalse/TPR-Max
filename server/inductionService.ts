import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { 
  inductionTokens, 
  inductionQuestions, 
  inductionAnswers, 
  contractorWorkers,
  type InductionToken,
  type InductionQuestion,
  type InsertInductionToken,
  type InsertInductionAnswer
} from "@shared/schema";
import { sendInductionEmail } from "./emailService";

export class InductionService {
  // Generate secure token for induction link
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create induction token for worker
  async createInductionToken(workerId: string): Promise<string> {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

    const insertData: InsertInductionToken = {
      workerId,
      token,
      expiresAt,
      status: 'pending'
    };

    await db.insert(inductionTokens).values(insertData);
    return token;
  }

  // Send induction email to worker
  async sendInductionEmail(workerId: string): Promise<boolean> {
    try {
      // Get worker details
      const [worker] = await db
        .select()
        .from(contractorWorkers)
        .where(eq(contractorWorkers.id, workerId));

      if (!worker || !worker.email) {
        throw new Error('Worker not found or no email address');
      }

      // Create induction token
      const token = await this.createInductionToken(workerId);
      
      // Update token record to mark email as sent
      await db
        .update(inductionTokens)
        .set({ 
          emailSent: true, 
          emailSentAt: new Date() 
        })
        .where(eq(inductionTokens.token, token));

      const inductionUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/induction/${token}`;
      
      const emailSubject = "🎯 Site Induction Required - VisiGate Pro";
      const emailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Site Induction Required</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f97316, #ea580c); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #ddd; border-top: 0; }
            .button { display: inline-block; background: #f97316; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
            .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; border-radius: 0 0 8px 8px; }
            .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🛡️ Site Induction Required</h1>
              <p>Health & Safety Compliance</p>
            </div>
            <div class="content">
              <h2>Hello ${worker.firstName} ${worker.lastName},</h2>
              
              <p>You are required to complete a site-specific health and safety induction before you can access the work site.</p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> You must complete this induction to be authorized for site access. This is a legal requirement under UK Health & Safety regulations.
              </div>
              
              <h3>What you need to do:</h3>
              <ol>
                <li><strong>Watch the site induction video</strong> (approx. 15 minutes)</li>
                <li><strong>Answer UK H&S questions</strong> (minimum 80% pass rate required)</li>
                <li><strong>Confirm completion</strong> to update your authorization status</li>
              </ol>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inductionUrl}" class="button">START INDUCTION NOW</a>
              </div>
              
              <h3>Key Requirements:</h3>
              <ul>
                <li>✅ Pass rate: 80% minimum (UK H&S standard)</li>
                <li>✅ Time limit: Complete within 7 days</li>
                <li>✅ One-time completion required</li>
                <li>✅ Automatic status update upon completion</li>
              </ul>
              
              <p><strong>Link expires:</strong> ${expiresAt.toLocaleDateString('en-GB')}</p>
              
              <p>If you have any questions, please contact site management.</p>
            </div>
            <div class="footer">
              <p><strong>VisiGate Pro</strong> - Contractor Management System<br>
              This email was sent automatically. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Site Induction Required - ${worker.firstName} ${worker.lastName}

You must complete a site-specific health and safety induction before accessing the work site.

Complete your induction here: ${inductionUrl}

Requirements:
- Watch the site induction video (approx. 15 minutes)  
- Answer UK H&S questions (minimum 80% pass rate required)
- Confirm completion to update your authorization status

Link expires: ${expiresAt.toLocaleDateString('en-GB')}

This is a legal requirement under UK Health & Safety regulations.

VisiGate Pro - Contractor Management System
      `;

      await sendInductionEmail({
        to: worker.email,
        subject: emailSubject,
        html: emailHtml,
        text: emailText
      });

      return true;
    } catch (error) {
      console.error('Failed to send induction email:', error);
      return false;
    }
  }

  // Get induction token details
  async getInductionToken(token: string): Promise<InductionToken | null> {
    const [tokenRecord] = await db
      .select()
      .from(inductionTokens)
      .where(eq(inductionTokens.token, token));

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      return null;
    }

    return tokenRecord;
  }

  // Get all active induction questions
  async getInductionQuestions(): Promise<InductionQuestion[]> {
    return await db
      .select()
      .from(inductionQuestions)
      .where(eq(inductionQuestions.isActive, true))
      .orderBy(inductionQuestions.orderIndex);
  }

  // Submit quiz answers and calculate score
  async submitQuizAnswers(tokenId: string, answers: { questionId: string; selectedAnswer: string }[]): Promise<{ score: number; passed: boolean; total: number }> {
    const questions = await this.getInductionQuestions();
    let correctAnswers = 0;
    const attemptNumber = await this.getNextAttemptNumber(tokenId);

    // Save all answers
    for (const answer of answers) {
      const question = questions.find(q => q.id === answer.questionId);
      const isCorrect = question?.correctAnswer === answer.selectedAnswer;
      
      if (isCorrect) {
        correctAnswers++;
      }

      const insertAnswer: InsertInductionAnswer = {
        tokenId,
        questionId: answer.questionId,
        attemptNumber,
        selectedAnswer: answer.selectedAnswer,
        isCorrect
      };

      await db.insert(inductionAnswers).values(insertAnswer);
    }

    const score = Math.round((correctAnswers / questions.length) * 100);
    const passed = score >= 80; // UK H&S requirement: 80% pass rate

    // Update token with quiz results
    await db
      .update(inductionTokens)
      .set({
        quizAttempts: attemptNumber,
        quizCompleted: passed,
        quizCompletedAt: passed ? new Date() : undefined,
        quizScore: score,
        status: passed ? 'completed' : 'in_progress',
        completedAt: passed ? new Date() : undefined
      })
      .where(eq(inductionTokens.id, tokenId));

    // Update worker induction status if passed
    if (passed) {
      const [token] = await db
        .select()
        .from(inductionTokens)
        .where(eq(inductionTokens.id, tokenId));

      if (token) {
        await db
          .update(contractorWorkers)
          .set({
            inductionCompleted: true,
            inductionCompletedAt: new Date()
          })
          .where(eq(contractorWorkers.id, token.workerId));
      }
    }

    return {
      score,
      passed,
      total: questions.length
    };
  }

  // Mark video as watched
  async markVideoWatched(tokenId: string): Promise<void> {
    await db
      .update(inductionTokens)
      .set({
        videoWatched: true,
        videoWatchedAt: new Date(),
        status: 'in_progress'
      })
      .where(eq(inductionTokens.id, tokenId));
  }

  // Get next attempt number for worker
  private async getNextAttemptNumber(tokenId: string): Promise<number> {
    const existingAnswers = await db
      .select()
      .from(inductionAnswers)
      .where(eq(inductionAnswers.tokenId, tokenId));

    if (existingAnswers.length === 0) {
      return 1;
    }

    const maxAttempt = Math.max(...existingAnswers.map(a => a.attemptNumber));
    return maxAttempt + 1;
  }
}

export const inductionService = new InductionService();