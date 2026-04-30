import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { 
  inductionTokens, 
  inductionQuestions, 
  inductionAnswers, 
  type InductionToken,
  type InductionQuestion,
  type InsertInductionToken,
  type InsertInductionAnswer
} from "@shared/schema";
import { EmailService } from "./emailService";
import { logger } from './utils/logger';

// Shared helper — determines the public base URL for induction links.
// Priority: FRONTEND_URL (user override) → REPLIT_DOMAINS (auto-detected) → localhost fallback
function getAppBaseUrl(): string {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL;
  const replitDomains = process.env.REPLIT_DOMAINS?.split(',').map(d => d.trim()).filter(Boolean) || [];
  if (replitDomains.length > 0) return `https://${replitDomains[0]}`;
  return 'http://localhost:5000';
}

export class InductionService {
  // Generate secure token for induction link
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Get token by value
  async getTokenByValue(token: string): Promise<InductionToken | null> {
    try {
      const [tokenData] = await db
        .select()
        .from(inductionTokens)
        .where(eq(inductionTokens.token, token));
      
      return tokenData || null;
    } catch (error) {
      logger.error('Error getting token by value:', error);
      return null;
    }
  }

  // Create induction token for any person type (visitor, staff, contractor)
  async createInductionToken(workerId: string, personName?: string, personEmail?: string, customerId?: string): Promise<string> {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

    const insertData: InsertInductionToken = {
      workerId,
      personType: 'contractor',
      personName: personName || 'Unknown',
      personEmail: personEmail || '',
      token,
      expiresAt,
      status: 'pending',
      ...(customerId ? { customerId } : {})
    };

    await db.insert(inductionTokens).values(insertData);
    return token;
  }

  // Create universal induction token for any person type
  async createUniversalInductionToken(params: {
    personType: 'visitor' | 'staff' | 'contractor';
    personName: string;
    personEmail: string;
    workerId?: string;
    visitorId?: string;
    staffId?: string;
    customerId?: string;
  }): Promise<string> {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days validity

    const insertData: InsertInductionToken = {
      personType: params.personType,
      personName: params.personName,
      personEmail: params.personEmail,
      workerId: params.workerId,
      visitorId: params.visitorId,
      staffId: params.staffId,
      token,
      expiresAt,
      status: 'pending',
      ...(params.customerId ? { customerId: params.customerId } : {})
    };

    await db.insert(inductionTokens).values(insertData);
    return token;
  }

  // Send induction email to worker
  async sendInductionEmail(workerId: string, customerId?: string, workerName?: string, workerEmail?: string): Promise<boolean> {
    try {
      // Workers live in isolated customer schemas — always pass name/email from the route
      if (!workerEmail) {
        throw new Error('Worker has no email address on file');
      }
      const resolvedName = workerName || 'Contractor Worker';
      const resolvedEmail = workerEmail;

      // Create induction token (pass customerId so quiz completion can write notes to the right isolated schema)
      const token = await this.createInductionToken(workerId, resolvedName, resolvedEmail, customerId);
      
      // Get token details including expiration date
      const [tokenRecord] = await db
        .select()
        .from(inductionTokens)
        .where(eq(inductionTokens.token, token));
      
      if (!tokenRecord) {
        throw new Error('Token not found after creation');
      }
      
      const expiresAt = new Date(tokenRecord.expiresAt);
      
      // Update token record to mark email as sent
      await db
        .update(inductionTokens)
        .set({ 
          emailSent: true, 
          emailSentAt: new Date() 
        })
        .where(eq(inductionTokens.token, token));

      const inductionUrl = `${getAppBaseUrl()}/induction/${token}`;
      
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
              <h2>Hello ${resolvedName},</h2>
              
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
Site Induction Required - ${resolvedName}

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

      const emailSvc = new EmailService(customerId);
      await emailSvc.sendEmail({
        to: resolvedEmail,
        subject: emailSubject,
        html: emailHtml,
        text: emailText
      });

      return true;
    } catch (error) {
      logger.error('Failed to send induction email:', error);
      return false;
    }
  }

  // Universal send induction email - supports visitors, staff, and contractors
  async sendUniversalInductionEmail(params: {
    personType: 'visitor' | 'staff' | 'contractor';
    personName: string;
    personEmail: string;
    workerId?: string;
    visitorId?: string;
    staffId?: string;
    companyName?: string;
    customerId?: string;
  }): Promise<boolean> {
    try {
      if (!params.personEmail) {
        throw new Error('Email address is required');
      }

      // Create universal induction token (pass customerId for note-writing on completion)
      const token = await this.createUniversalInductionToken({
        personType: params.personType,
        personName: params.personName,
        personEmail: params.personEmail,
        workerId: params.workerId,
        visitorId: params.visitorId,
        staffId: params.staffId,
        customerId: params.customerId
      });

      // Get token details including expiration date
      const [tokenRecord] = await db
        .select()
        .from(inductionTokens)
        .where(eq(inductionTokens.token, token));
      
      if (!tokenRecord) {
        throw new Error('Token not found after creation');
      }
      
      const expiresAt = new Date(tokenRecord.expiresAt);
      
      // Update token record to mark email as sent
      await db
        .update(inductionTokens)
        .set({ 
          emailSent: true, 
          emailSentAt: new Date() 
        })
        .where(eq(inductionTokens.token, token));

      const inductionUrl = `${getAppBaseUrl()}/induction/${token}`;

      const personTypeLabel = params.personType === 'visitor' ? 'Visitor' : 
                              params.personType === 'staff' ? 'Staff Member' : 
                              'Contractor';
      
      const emailSubject = `🎯 Site Induction Required - ${personTypeLabel} - VisiGate Pro`;
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
              <p>Health & Safety Compliance - ${personTypeLabel}</p>
            </div>
            <div class="content">
              <h2>Hello ${params.personName},</h2>
              
              <p>You are required to complete a site-specific health and safety induction before you can access the work site${params.companyName ? ` at ${params.companyName}` : ''}.</p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong> You must complete this induction to be authorized for site access. This is a legal requirement under UK Health & Safety regulations.
              </div>
              
              <h3>What you need to do:</h3>
              <ol>
                <li><strong>Watch the AI-generated site induction video</strong> (approx. 15-20 minutes)</li>
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
                <li>✅ One-time completion required per visit</li>
                <li>✅ Automatic status update upon completion</li>
              </ul>
              
              <p><strong>Link expires:</strong> ${expiresAt.toLocaleDateString('en-GB')}</p>
              
              <p>If you have any questions, please contact site management.</p>
            </div>
            <div class="footer">
              <p><strong>VisiGate Pro</strong> - Visitor Management System<br>
              This email was sent automatically. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const emailText = `
Site Induction Required - ${params.personName}

You must complete a site-specific health and safety induction before accessing the work site${params.companyName ? ` at ${params.companyName}` : ''}.

Complete your induction here: ${inductionUrl}

Requirements:
- Watch the AI-generated site induction video (approx. 15-20 minutes)  
- Answer UK H&S questions (minimum 80% pass rate required)
- Confirm completion to update your authorization status

Link expires: ${expiresAt.toLocaleDateString('en-GB')}

This is a legal requirement under UK Health & Safety regulations.

VisiGate Pro - Visitor Management System
      `;

      const emailSvc = new EmailService(params.customerId);
      await emailSvc.sendEmail({
        to: params.personEmail,
        subject: emailSubject,
        html: emailHtml,
        text: emailText
      });

      logger.info(`✅ Induction email sent to ${params.personType}: ${params.personName} (${params.personEmail})`);
      return true;
    } catch (error) {
      logger.error('Failed to send universal induction email:', error);
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
  async submitQuizAnswers(tokenId: string, answers: { questionId: string; selectedAnswer: string }[]): Promise<{ score: number; passed: boolean; total: number; correct: number }> {
    const allQuestions = await this.getInductionQuestions();
    // Build a lookup map for fast answer checking
    const questionMap = new Map(allQuestions.map(q => [q.id, q]));
    
    let correctAnswers = 0;
    let validAnswerCount = 0;
    const attemptNumber = await this.getNextAttemptNumber(tokenId);

    // Save all answers — skip any with unknown questionIds
    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        logger.warn(`⚠️ [InductionService] Unknown questionId "${answer.questionId}" in submission — skipping`);
        continue;
      }
      validAnswerCount++;
      const isCorrect = question.correctAnswer === answer.selectedAnswer;
      
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

    // Score based on valid answers only
    const score = validAnswerCount > 0 ? Math.round((correctAnswers / validAnswerCount) * 100) : 0;
    
    // Read pass threshold from the token (default 80% — UK H&S requirement)
    const [tokenRecord] = await db.select({ passThreshold: inductionTokens.passThreshold }).from(inductionTokens).where(eq(inductionTokens.id, tokenId));
    const threshold = tokenRecord?.passThreshold ?? 80;
    const passed = score >= threshold;

    // Update token with quiz results.
    // quizCompletedAt is set on every attempt (not just passes) so the
    // submit-quiz rate limiter can enforce the 10-minute retry cooldown.
    const now = new Date();
    await db
      .update(inductionTokens)
      .set({
        quizAttempts: attemptNumber,
        quizCompleted: passed,
        quizCompletedAt: now,
        quizPassed: passed ? true : undefined,
        quizScore: score,
        status: passed ? 'completed' : 'in_progress',
        completedAt: passed ? now : undefined
      })
      .where(eq(inductionTokens.id, tokenId));

    // NOTE: Updating the worker/staff/visitor inductionCompleted flag is handled
    // in the routes.ts submit-quiz handler using the isolated customer DB, because
    // those records live in per-customer isolated schemas, not the shared DB.

    return {
      score,
      passed,
      total: validAnswerCount,
      correct: correctAnswers
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