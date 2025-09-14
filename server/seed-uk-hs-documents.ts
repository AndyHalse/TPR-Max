import { db } from "./db";
import { eq } from "drizzle-orm";
import { ukHSDocumentTemplates, documentAutoFillMapping } from "@shared/schema";

/**
 * Seed the 6 UK H&S compliance document templates based on the provided documentation
 * Only seeds if templates don't already exist for the customer
 */
export async function seedUKHSDocuments() {
  console.log('🌱 Checking UK H&S compliance document templates...');
  
  const customerId = 'dev-customer-001'; // Development customer ID
  
  try {
    // Check if UK H&S document templates already exist for this customer
    const existingTemplates = await db.select()
      .from(ukHSDocumentTemplates)
      .where(eq(ukHSDocumentTemplates.customerId, customerId));
    
    if (existingTemplates.length > 0) {
      console.log(`✅ UK H&S document templates already exist (${existingTemplates.length} templates found), skipping seeding`);
      return;
    }
    
    console.log('🌱 Seeding UK H&S compliance document templates...');
    
    // Define the 6 UK H&S document templates
    const documentTemplates = [
    {
      documentCode: 'right_to_work',
      documentName: 'Right to Work Documentation',
      documentDescription: 'Before starting any work, you must prove your legal right to work in the UK to your employer or client.',
      complianceCategory: 'immigration',
      legalReference: 'UK Immigration Laws - Prevention of Illegal Working',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}}</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>Right to Work Documentation</h2>
          <p><strong>Date:</strong> {{current_date}}</p>
          
          <div class="worker-details">
            <h3>Worker Information</h3>
            <p><strong>Full Name:</strong> {{worker_full_name}}</p>
            <p><strong>Email:</strong> {{worker_email}}</p>
            <p><strong>Phone:</strong> {{worker_phone}}</p>
            <p><strong>Address:</strong> {{worker_address}}</p>
          </div>
          
          <div class="requirements">
            <h3>UK Right to Work Requirements</h3>
            <p>Before starting any work, you must prove your legal right to work in the UK.</p>
            
            <h4>British/Irish Citizens:</h4>
            <ul>
              <li>Passport (current or expired)</li>
              <li>Birth certificate</li>
              <li>Certificate of naturalisation</li>
              <li>Official letter from HMRC or DWP showing your name and National Insurance number</li>
            </ul>
            
            <h4>Non-British/Irish Citizens:</h4>
            <ul>
              <li>Valid visa</li>
              <li>Biometric residence permit</li>
              <li>Share code to prove immigration status via UK government online service</li>
            </ul>
            
            <p><strong>Purpose:</strong> Ensures compliance with UK immigration laws and avoids illegal working penalties.</p>
          </div>
          
          <div class="confirmation">
            <h3>Worker Confirmation</h3>
            <p>I, {{worker_full_name}}, confirm that I have the legal right to work in the UK and will provide the necessary documentation before commencing work at {{company_name}}.</p>
            
            <div class="signature-area">
              <p>Worker Signature: _________________________</p>
              <p>Date: {{current_date}}</p>
            </div>
            
            <div class="employer-verification">
              <p>Employer Verification: _________________________</p>
              <p>Verified by: {{company_contact_name}}</p>
              <p>Date: {{current_date}}</p>
            </div>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'worker_full_name', 'worker_email', 'worker_phone', 'worker_address', 'current_date', 'company_contact_name']
    },
    
    {
      documentCode: 'ladder_safety',
      documentName: 'Ladder Safety Training Certification',
      documentDescription: 'If your work involves using ladders or stepladders, competency training is required.',
      complianceCategory: 'safety_training',
      legalReference: 'Work at Height Regulations 2005',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}}</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>Ladder Safety Training Certification</h2>
          <p><strong>Date:</strong> {{current_date}}</p>
          
          <div class="worker-details">
            <h3>Worker Information</h3>
            <p><strong>Full Name:</strong> {{worker_full_name}}</p>
            <p><strong>Employee/Contractor ID:</strong> {{worker_id}}</p>
            <p><strong>Company:</strong> {{contractor_company_name}}</p>
          </div>
          
          <div class="training-requirements">
            <h3>Training Requirements</h3>
            <p>Falls from height are a leading cause of workplace fatalities. This certification demonstrates competence in safe ladder use under the Work at Height Regulations 2005.</p>
            
            <h4>Training Coverage:</h4>
            <ul>
              <li>Risk assessment for working at height</li>
              <li>Proper equipment selection and use</li>
              <li>Pre-use inspection procedures</li>
              <li>Safe positioning and angle (4:1 rule)</li>
              <li>Three points of contact rule</li>
              <li>Weather and environmental considerations</li>
              <li>Emergency procedures</li>
            </ul>
            
            <h4>Equipment Covered:</h4>
            <ul>
              <li>Stepladders</li>
              <li>Extension ladders</li>
              <li>Platform ladders</li>
              <li>Combination ladders</li>
            </ul>
          </div>
          
          <div class="certification">
            <h3>Certification Confirmation</h3>
            <p>I confirm that {{worker_full_name}} has received training in ladder safety and understands the requirements for safe working at height.</p>
            
            <div class="trainer-details">
              <p>Training provided by: The Ladder Association accredited course</p>
              <p>Certificate valid for: 5 years</p>
              <p>LadderCard issued: Yes/No</p>
            </div>
            
            <div class="signature-area">
              <p>Worker Signature: _________________________</p>
              <p>Date: {{current_date}}</p>
              
              <p>Supervisor Signature: _________________________</p>
              <p>Name: {{company_contact_name}}</p>
              <p>Date: {{current_date}}</p>
            </div>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'worker_full_name', 'worker_id', 'contractor_company_name', 'current_date', 'company_contact_name']
    },
    
    {
      documentCode: 'permit_to_work',
      documentName: 'Permit to Work (PTW)',
      documentDescription: 'A formal system for managing high-risk activities (e.g., hot work, electrical isolation, confined space entry).',
      complianceCategory: 'work_permit',
      legalReference: 'Health and Safety at Work Act 1974',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}} - Permit to Work</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>PERMIT TO WORK (PTW)</h2>
          <p><strong>Permit Number:</strong> PTW-{{permit_number}}</p>
          <p><strong>Date Issued:</strong> {{current_date}}</p>
          <p><strong>Valid Until:</strong> {{permit_expiry_date}}</p>
          
          <div class="work-details">
            <h3>Work Details</h3>
            <p><strong>Work Description:</strong> {{work_description}}</p>
            <p><strong>Location:</strong> {{work_location}}</p>
            <p><strong>Contractor:</strong> {{contractor_company_name}}</p>
            <p><strong>Workers:</strong> {{worker_full_name}}</p>
          </div>
          
          <div class="hazard-assessment">
            <h3>Hazard Identification & Control Measures</h3>
            <table border="1" style="width:100%; border-collapse: collapse;">
              <tr>
                <th>Hazard</th>
                <th>Control Measures</th>
                <th>Responsible Person</th>
              </tr>
              <tr>
                <td>{{hazard_1}}</td>
                <td>{{control_measure_1}}</td>
                <td>{{responsible_person_1}}</td>
              </tr>
              <tr>
                <td>{{hazard_2}}</td>
                <td>{{control_measure_2}}</td>
                <td>{{responsible_person_2}}</td>
              </tr>
            </table>
          </div>
          
          <div class="isolation-requirements">
            <h3>Isolation Requirements</h3>
            <ul>
              <li>Electrical isolation: {{electrical_isolation_required}}</li>
              <li>Gas isolation: {{gas_isolation_required}}</li>
              <li>Mechanical isolation: {{mechanical_isolation_required}}</li>
              <li>Lock-out/Tag-out procedures: {{lockout_procedures}}</li>
            </ul>
          </div>
          
          <div class="authorizations">
            <h3>Authorizations</h3>
            
            <div class="site-manager-authorization">
              <h4>Site Manager Authorization</h4>
              <p>I confirm that all hazards have been identified, control measures are in place, and work may proceed.</p>
              <p>Site Manager: {{company_contact_name}}</p>
              <p>Signature: _________________________ Date: {{current_date}}</p>
            </div>
            
            <div class="contractor-acceptance">
              <h4>Contractor Acceptance</h4>
              <p>I understand the hazards and control measures outlined above and agree to comply with all requirements.</p>
              <p>Contractor: {{worker_full_name}}</p>
              <p>Company: {{contractor_company_name}}</p>
              <p>Signature: _________________________ Date: {{current_date}}</p>
            </div>
          </div>
          
          <div class="work-completion">
            <h3>Work Completion</h3>
            <p>Work completed by: _________________________</p>
            <p>Date/Time: _________________________</p>
            <p>All tools and materials removed: Yes/No</p>
            <p>Area left in safe condition: Yes/No</p>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'permit_number', 'current_date', 'permit_expiry_date', 'work_description', 'work_location', 'contractor_company_name', 'worker_full_name', 'company_contact_name']
    },
    
    {
      documentCode: 'contractor_agreement',
      documentName: 'Independent Contractor Agreement',
      documentDescription: 'Essential contract defining the terms of engagement, scope of services, and legal obligations.',
      complianceCategory: 'contract',
      legalReference: 'UK Employment Law and IR35 Regulations',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}}</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>INDEPENDENT CONTRACTOR AGREEMENT</h2>
          <p><strong>Date:</strong> {{current_date}}</p>
          
          <div class="parties">
            <h3>Parties to Agreement</h3>
            <p><strong>Client:</strong> {{company_name}}<br>
            Address: {{company_address}}<br>
            Contact: {{company_contact_name}}</p>
            
            <p><strong>Contractor:</strong> {{contractor_company_name}}<br>
            Contact Person: {{worker_full_name}}<br>
            Email: {{worker_email}}<br>
            Phone: {{worker_phone}}</p>
          </div>
          
          <div class="scope-of-services">
            <h3>Scope of Services</h3>
            <p>The Contractor agrees to provide the following services:</p>
            <p>{{services_description}}</p>
            
            <p><strong>Project Location:</strong> {{work_location}}</p>
            <p><strong>Expected Duration:</strong> {{contract_duration}}</p>
            <p><strong>Start Date:</strong> {{start_date}}</p>
          </div>
          
          <div class="payment-terms">
            <h3>Payment Terms</h3>
            <p><strong>Rate:</strong> £{{hourly_rate}} per hour</p>
            <p><strong>Payment Schedule:</strong> {{payment_schedule}}</p>
            <p><strong>Invoice Terms:</strong> Payment due within 30 days of invoice</p>
            <p><strong>Expenses:</strong> Pre-approved expenses will be reimbursed</p>
          </div>
          
          <div class="contractor-status">
            <h3>Independent Contractor Status</h3>
            <p>This agreement establishes an independent contractor relationship. The Contractor:</p>
            <ul>
              <li>Is responsible for their own tax obligations and National Insurance contributions</li>
              <li>Will determine the manner and means of performing the services</li>
              <li>Is not entitled to employee benefits</li>
              <li>May engage other contractors with client approval</li>
              <li>Is responsible for their own equipment and tools</li>
            </ul>
          </div>
          
          <div class="health-safety">
            <h3>Health and Safety Obligations</h3>
            <p>The Contractor agrees to:</p>
            <ul>
              <li>Comply with all applicable health and safety regulations</li>
              <li>Follow {{company_name}}'s health and safety policies</li>
              <li>Use appropriate personal protective equipment</li>
              <li>Report any accidents or incidents immediately</li>
              <li>Maintain valid insurance coverage</li>
            </ul>
          </div>
          
          <div class="insurance-liability">
            <h3>Insurance and Liability</h3>
            <p><strong>Public Liability Insurance:</strong> Minimum £{{insurance_amount}} required</p>
            <p><strong>Professional Indemnity:</strong> As applicable to services provided</p>
            <p><strong>Employers' Liability:</strong> Required if Contractor employs others</p>
          </div>
          
          <div class="confidentiality">
            <h3>Confidentiality</h3>
            <p>Contractor agrees to maintain confidentiality of all proprietary information and not disclose client information to third parties.</p>
          </div>
          
          <div class="termination">
            <h3>Termination</h3>
            <p>Either party may terminate this agreement with {{termination_notice}} notice in writing.</p>
          </div>
          
          <div class="signatures">
            <h3>Agreement</h3>
            <p>By signing below, both parties agree to the terms outlined in this agreement.</p>
            
            <div style="display: flex; justify-content: space-between; margin-top: 40px;">
              <div>
                <p><strong>Client:</strong></p>
                <p>Signature: _________________________</p>
                <p>Name: {{company_contact_name}}</p>
                <p>Title: {{company_contact_title}}</p>
                <p>Date: {{current_date}}</p>
              </div>
              
              <div>
                <p><strong>Contractor:</strong></p>
                <p>Signature: _________________________</p>
                <p>Name: {{worker_full_name}}</p>
                <p>Company: {{contractor_company_name}}</p>
                <p>Date: {{current_date}}</p>
              </div>
            </div>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'current_date', 'contractor_company_name', 'worker_full_name', 'worker_email', 'worker_phone', 'company_contact_name']
    },
    
    {
      documentCode: 'risk_assessment',
      documentName: 'Health and Safety Risk Assessment',
      documentDescription: 'Legal requirement under the Health and Safety at Work Act 1974 to identify hazards and control measures.',
      complianceCategory: 'risk_management',
      legalReference: 'Health and Safety at Work Act 1974',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}} - Risk Assessment</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>HEALTH AND SAFETY RISK ASSESSMENT</h2>
          <p><strong>Assessment Date:</strong> {{current_date}}</p>
          <p><strong>Assessment Reference:</strong> RA-{{assessment_reference}}</p>
          
          <div class="assessment-details">
            <h3>Assessment Details</h3>
            <p><strong>Activity/Task:</strong> {{task_description}}</p>
            <p><strong>Location:</strong> {{work_location}}</p>
            <p><strong>Assessed by:</strong> {{assessor_name}}</p>
            <p><strong>Review Date:</strong> {{review_date}}</p>
          </div>
          
          <div class="people-at-risk">
            <h3>People at Risk</h3>
            <ul>
              <li>Contractors: {{worker_full_name}} ({{contractor_company_name}})</li>
              <li>Site personnel: {{site_personnel}}</li>
              <li>Visitors to the area</li>
              <li>General public (if applicable)</li>
            </ul>
          </div>
          
          <div class="risk-assessment-matrix">
            <h3>Risk Assessment - STEP Methodology</h3>
            <p><strong>S</strong>ite - <strong>T</strong>ask - <strong>E</strong>quipment - <strong>P</strong>eople</p>
            
            <table border="1" style="width:100%; border-collapse: collapse;">
              <tr>
                <th>Hazard</th>
                <th>Risk</th>
                <th>Likelihood (1-5)</th>
                <th>Severity (1-5)</th>
                <th>Risk Score</th>
                <th>Control Measures</th>
                <th>Residual Risk</th>
              </tr>
              <tr>
                <td>Working at Height</td>
                <td>Falls causing injury/death</td>
                <td>3</td>
                <td>5</td>
                <td>15 (High)</td>
                <td>Proper ladder training, 3-point contact, safety harness where required</td>
                <td>6 (Medium)</td>
              </tr>
              <tr>
                <td>Electrical Hazards</td>
                <td>Electrocution, burns</td>
                <td>2</td>
                <td>5</td>
                <td>10 (Medium)</td>
                <td>Qualified electrician, lockout procedures, test before work</td>
                <td>4 (Low)</td>
              </tr>
              <tr>
                <td>Manual Handling</td>
                <td>Back injury, strains</td>
                <td>4</td>
                <td>3</td>
                <td>12 (High)</td>
                <td>Proper lifting techniques, mechanical aids, team lifting</td>
                <td>6 (Medium)</td>
              </tr>
              <tr>
                <td>Hazardous Substances</td>
                <td>Chemical exposure</td>
                <td>2</td>
                <td>4</td>
                <td>8 (Medium)</td>
                <td>COSHH assessment, PPE, ventilation, safe storage</td>
                <td>3 (Low)</td>
              </tr>
            </table>
          </div>
          
          <div class="control-measures">
            <h3>Hierarchy of Control Measures</h3>
            <ol>
              <li><strong>Elimination:</strong> Remove the hazard completely</li>
              <li><strong>Substitution:</strong> Replace with something safer</li>
              <li><strong>Engineering Controls:</strong> Physical measures to control risk</li>
              <li><strong>Administrative Controls:</strong> Training, procedures, signage</li>
              <li><strong>PPE:</strong> Personal protective equipment as last resort</li>
            </ol>
          </div>
          
          <div class="emergency-procedures">
            <h3>Emergency Procedures</h3>
            <p><strong>First Aid:</strong> {{first_aider_name}} - {{first_aider_contact}}</p>
            <p><strong>Emergency Services:</strong> 999</p>
            <p><strong>Site Emergency Contact:</strong> {{emergency_contact_name}} - {{emergency_contact_number}}</p>
            <p><strong>Assembly Point:</strong> {{assembly_point_location}}</p>
          </div>
          
          <div class="worker-briefing">
            <h3>Worker Briefing Confirmation</h3>
            <p>I confirm that I have been briefed on the risks identified in this assessment and understand the control measures that must be followed.</p>
            
            <p><strong>Worker:</strong> {{worker_full_name}}</p>
            <p><strong>Company:</strong> {{contractor_company_name}}</p>
            <p>Signature: _________________________ Date: {{current_date}}</p>
          </div>
          
          <div class="assessment-approval">
            <h3>Assessment Approval</h3>
            <p>This risk assessment has been reviewed and approved.</p>
            
            <p><strong>Approved by:</strong> {{company_contact_name}}</p>
            <p><strong>Position:</strong> {{company_contact_title}}</p>
            <p>Signature: _________________________ Date: {{current_date}}</p>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'current_date', 'assessment_reference', 'task_description', 'work_location', 'assessor_name', 'review_date', 'worker_full_name', 'contractor_company_name', 'company_contact_name', 'company_contact_title']
    },
    
    {
      documentCode: 'site_induction',
      documentName: 'Site-Specific Inductions and Forms',
      documentDescription: 'Site induction covering site rules, emergency procedures, and hazard awareness.',
      complianceCategory: 'induction',
      legalReference: 'CDM Regulations 2015 and Health and Safety at Work Act 1974',
      templateContent: `
        <div class="uk-hs-document">
          <div class="document-header">
            <div class="company-logo">{{company_logo}}</div>
            <h1>{{company_name}} - Site Induction</h1>
            <p>{{company_address}}</p>
            <p>Phone: {{company_phone}} | Email: {{company_email}}</p>
          </div>
          
          <h2>SITE-SPECIFIC INDUCTION</h2>
          <p><strong>Induction Date:</strong> {{current_date}}</p>
          <p><strong>Site:</strong> {{work_location}}</p>
          
          <div class="worker-details">
            <h3>Inductee Information</h3>
            <p><strong>Name:</strong> {{worker_full_name}}</p>
            <p><strong>Company:</strong> {{contractor_company_name}}</p>
            <p><strong>Role:</strong> {{worker_role}}</p>
            <p><strong>Experience Level:</strong> {{experience_level}}</p>
            <p><strong>Emergency Contact:</strong> {{worker_emergency_contact}}</p>
          </div>
          
          <div class="site-rules">
            <h3>Site Rules and Regulations</h3>
            <ul>
              <li>All personnel must sign in/out at reception</li>
              <li>Hard hats, hi-vis, and safety boots mandatory in designated areas</li>
              <li>No smoking except in designated areas</li>
              <li>Speed limit on site: 10 mph</li>
              <li>Visitors must be accompanied at all times</li>
              <li>No unauthorized photography</li>
              <li>Report all accidents and near misses immediately</li>
              <li>Follow permit to work procedures for high-risk activities</li>
            </ul>
          </div>
          
          <div class="emergency-procedures">
            <h3>Emergency Procedures</h3>
            <h4>Fire Alarm</h4>
            <p>Continuous alarm - evacuate immediately to assembly point: {{assembly_point_location}}</p>
            
            <h4>Emergency Contacts</h4>
            <ul>
              <li>Emergency Services: 999</li>
              <li>Site Manager: {{site_manager_name}} - {{site_manager_contact}}</li>
              <li>First Aider: {{first_aider_name}} - {{first_aider_contact}}</li>
              <li>Security: {{security_contact}}</li>
            </ul>
            
            <h4>Accident Reporting</h4>
            <p>All accidents must be reported to the site manager immediately and recorded in the accident book.</p>
          </div>
          
          <div class="hazard-awareness">
            <h3>Site-Specific Hazards</h3>
            <ul>
              <li><strong>Vehicle Movement:</strong> Designated pedestrian routes, banksman required for reversing</li>
              <li><strong>Working at Height:</strong> Edge protection, safety harnesses, competent person supervision</li>
              <li><strong>Excavations:</strong> Barriers, safe access/egress, support systems</li>
              <li><strong>Confined Spaces:</strong> Permit required, atmospheric testing, emergency procedures</li>
              <li><strong>Noise:</strong> Hearing protection required in designated areas</li>
              <li><strong>Dust:</strong> Respiratory protection, dust suppression measures</li>
            </ul>
          </div>
          
          <div class="ppe-requirements">
            <h3>Personal Protective Equipment (PPE)</h3>
            <h4>Minimum Site Requirements:</h4>
            <ul>
              <li>Hard hat (EN 397)</li>
              <li>Hi-visibility clothing (Class 2 minimum)</li>
              <li>Safety footwear (S3 minimum)</li>
              <li>Eye protection when required</li>
              <li>Gloves appropriate to task</li>
            </ul>
            
            <h4>Additional PPE as Required:</h4>
            <ul>
              <li>Respiratory protection</li>
              <li>Hearing protection</li>
              <li>Fall protection harnesses</li>
              <li>Cut-resistant gloves</li>
            </ul>
          </div>
          
          <div class="environmental">
            <h3>Environmental Requirements</h3>
            <ul>
              <li>Waste segregation - follow site waste management plan</li>
              <li>Spill prevention and response procedures</li>
              <li>Water course protection measures</li>
              <li>Noise management - considerate construction</li>
              <li>Dust control measures</li>
            </ul>
          </div>
          
          <div class="access-security">
            <h3>Site Access and Security</h3>
            <p><strong>Site Hours:</strong> {{site_hours}}</p>
            <p><strong>Access Points:</strong> {{access_points}}</p>
            <p><strong>Parking:</strong> {{parking_arrangements}}</p>
            <p><strong>Welfare Facilities:</strong> {{welfare_facilities}}</p>
          </div>
          
          <div class="induction-completion">
            <h3>Induction Completion</h3>
            <p>I confirm that I have received and understood the site induction. I agree to comply with all site rules and procedures.</p>
            
            <div class="questions">
              <h4>Induction Questions (Must answer correctly to complete)</h4>
              <ol>
                <li>What is the site speed limit? _______________</li>
                <li>Where is the assembly point? _______________</li>
                <li>Who is the site first aider? _______________</li>
                <li>What PPE is required at all times? _______________</li>
                <li>What number do you call for emergencies? _______________</li>
              </ol>
            </div>
            
            <div class="signatures">
              <div>
                <p><strong>Inductee Signature:</strong> _________________________</p>
                <p>Name: {{worker_full_name}}</p>
                <p>Date: {{current_date}}</p>
              </div>
              
              <div style="margin-top: 20px;">
                <p><strong>Conducted by:</strong> _________________________</p>
                <p>Name: {{inductor_name}}</p>
                <p>Position: {{inductor_position}}</p>
                <p>Date: {{current_date}}</p>
              </div>
            </div>
          </div>
          
          <div class="review-renewal">
            <h3>Review and Renewal</h3>
            <p><strong>Induction Valid Until:</strong> {{induction_expiry_date}}</p>
            <p><strong>Annual Refresher Required:</strong> Yes</p>
            <p><strong>Additional Training Requirements:</strong> {{additional_training}}</p>
          </div>
        </div>
      `,
      autoFillFields: ['company_logo', 'company_name', 'company_address', 'company_phone', 'company_email', 'current_date', 'work_location', 'worker_full_name', 'contractor_company_name', 'worker_role', 'experience_level', 'worker_emergency_contact', 'assembly_point_location', 'site_manager_name', 'site_manager_contact', 'first_aider_name', 'first_aider_contact', 'security_contact', 'site_hours', 'access_points', 'parking_arrangements', 'welfare_facilities', 'inductor_name', 'inductor_position', 'induction_expiry_date', 'additional_training']
    }
    ];

    // Insert document templates
    const insertedTemplates = await db
      .insert(ukHSDocumentTemplates)
      .values(documentTemplates.map(template => ({
        ...template,
        customerId
      })))
      .returning();

    console.log(`✅ Seeded ${insertedTemplates.length} UK H&S document templates`);

    // Create auto-fill mappings for common fields
    const commonMappings = [
      // Company data mappings
      { placeholder: 'company_logo', dataSource: 'company_settings', sourceField: 'logoUrl', fallback: '' },
      { placeholder: 'company_name', dataSource: 'company_settings', sourceField: 'companyName', fallback: 'Company Name' },
      { placeholder: 'company_address', dataSource: 'company_settings', sourceField: 'address', fallback: '' },
      { placeholder: 'company_phone', dataSource: 'company_settings', sourceField: 'phone', fallback: '' },
      { placeholder: 'company_email', dataSource: 'company_settings', sourceField: 'email', fallback: '' },
      
      // Worker data mappings
      { placeholder: 'worker_full_name', dataSource: 'contractor_worker', sourceField: 'firstName,lastName', fallback: '' },
      { placeholder: 'worker_email', dataSource: 'contractor_worker', sourceField: 'email', fallback: '' },
      { placeholder: 'worker_phone', dataSource: 'contractor_worker', sourceField: 'phone', fallback: '' },
      { placeholder: 'worker_id', dataSource: 'contractor_worker', sourceField: 'id', fallback: '' },
      
      // Contractor company mappings
      { placeholder: 'contractor_company_name', dataSource: 'contractor_company', sourceField: 'name', fallback: 'Contractor Company' },
      
      // System generated fields
      { placeholder: 'current_date', dataSource: 'system_generated', sourceField: 'current_date', fallback: '' },
      { placeholder: 'permit_number', dataSource: 'system_generated', sourceField: 'unique_id', fallback: 'AUTO' },
      { placeholder: 'assessment_reference', dataSource: 'system_generated', sourceField: 'unique_id', fallback: 'AUTO' }
    ];

    // Create mappings for each template
    const mappings = [];
    for (const template of insertedTemplates) {
      for (const mapping of commonMappings) {
        if (template.autoFillFields && template.autoFillFields.includes(mapping.placeholder)) {
          mappings.push({
            customerId,
            documentTemplateId: template.id,
            placeholderName: mapping.placeholder,
            dataSource: mapping.dataSource,
            sourceField: mapping.sourceField,
            fallbackValue: mapping.fallback,
            isRequired: ['worker_full_name', 'company_name', 'current_date'].includes(mapping.placeholder)
          });
        }
      }
    }

    if (mappings.length > 0) {
      await db
        .insert(documentAutoFillMapping)
        .values(mappings);
      
      console.log(`✅ Created ${mappings.length} auto-fill mappings`);
    }

    console.log('🎉 UK H&S document templates seeded successfully!');
    
  } catch (error) {
    console.error('❌ Failed to seed UK H&S document templates:', error);
    throw error;
  }
}