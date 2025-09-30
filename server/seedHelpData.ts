import { db } from "./db";
import { helpCategories, helpArticles, insertHelpArticleSchema } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedHelpData() {
  try {
    console.log('🌱 Seeding help system data...');
    
    // Check if help data already exists
    const existingCategories = await db.select().from(helpCategories);
    const existingArticles = await db.select().from(helpArticles);
    
    if (existingCategories.length > 0 && existingArticles.length > 0) {
      console.log('Help data already exists, skipping seeding');
      return;
    }

    // Seed Help Categories
    console.log('📚 Seeding help categories...');
    const categoriesData = [
      {
        name: "Getting Started",
        description: "Essential guides to help you get started with VisiGate Pro",
        icon: "rocket",
        color: "#3b82f6",
        sortOrder: 1,
        isActive: true
      },
      {
        name: "Visitor Management",
        description: "Everything about managing visitors, check-ins, and visitor badges",
        icon: "users",
        color: "#10b981",
        sortOrder: 2,
        isActive: true
      },
      {
        name: "Staff Management",
        description: "Managing staff profiles, access control, and staff badges",
        icon: "user-check",
        color: "#8b5cf6",
        sortOrder: 3,
        isActive: true
      },
      {
        name: "Contractor Management",
        description: "Managing contractors, compliance documents, and safety requirements",
        icon: "hard-hat",
        color: "#f59e0b",
        sortOrder: 4,
        isActive: true
      },
      {
        name: "Safety & Compliance",
        description: "Safety inductions, compliance tracking, and health & safety features",
        icon: "shield-check",
        color: "#ef4444",
        sortOrder: 5,
        isActive: true
      },
      {
        name: "Reports & Analytics",
        description: "Generating reports, viewing analytics, and exporting data",
        icon: "chart-bar",
        color: "#06b6d4",
        sortOrder: 6,
        isActive: true
      },
      {
        name: "Settings & Configuration",
        description: "System settings, customization, and administrative features",
        icon: "settings",
        color: "#6b7280",
        sortOrder: 7,
        isActive: true
      },
      {
        name: "Troubleshooting",
        description: "Common issues and their solutions",
        icon: "tool",
        color: "#dc2626",
        sortOrder: 8,
        isActive: true
      }
    ];

    const insertedCategories = await db.insert(helpCategories).values(categoriesData).returning();
    console.log(`✅ Seeded ${insertedCategories.length} help categories`);

    // Seed Help Articles
    console.log('📄 Seeding help articles...');
    
    const gettingStartedCategory = insertedCategories.find(cat => cat.name === "Getting Started");
    const visitorMgmtCategory = insertedCategories.find(cat => cat.name === "Visitor Management");
    const staffMgmtCategory = insertedCategories.find(cat => cat.name === "Staff Management");
    const contractorMgmtCategory = insertedCategories.find(cat => cat.name === "Contractor Management");
    const safetyCategory = insertedCategories.find(cat => cat.name === "Safety & Compliance");
    const reportsCategory = insertedCategories.find(cat => cat.name === "Reports & Analytics");
    const settingsCategory = insertedCategories.find(cat => cat.name === "Settings & Configuration");
    const troubleshootingCategory = insertedCategories.find(cat => cat.name === "Troubleshooting");

    // Helper function to create URL-friendly slugs
    const createSlug = (title: string): string => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .trim();
    };

    const articlesData = [
      // Getting Started Articles
      {
        categoryId: gettingStartedCategory?.id,
        title: "Welcome to VisiGate Pro",
        slug: createSlug("Welcome to VisiGate Pro"),
        summary: "Learn the basics of VisiGate Pro and how to navigate the dashboard",
        content: `# Welcome to VisiGate Pro

VisiGate Pro is a comprehensive visitor management system designed to streamline your reception area and enhance security.

## Key Features
- **Visitor Check-in**: Quick and easy visitor registration
- **Staff Management**: Manage staff profiles and access
- **Contractor Tracking**: Handle contractor compliance and safety
- **Real-time Dashboard**: Monitor site activity in real-time
- **Safety Compliance**: Integrated safety inductions and tracking

## Getting Around
The main navigation is located in the sidebar. Key sections include:
- **Dashboard**: Overview of current site activity
- **Visitors**: Manage visitor check-ins and history
- **Staff**: Staff directory and management
- **Contractors**: Contractor companies and workers
- **Settings**: System configuration and preferences

## Quick Start
1. First, set up your company settings in the Settings page
2. Add your staff members to the Staff section
3. Configure any contractor companies you work with
4. Start checking in visitors using the Visitors page

Need help? Use this help panel anytime by clicking the help button.`,
        targetPages: ["dashboard", "home"],
        searchKeywords: ["welcome", "getting started", "basics", "navigation", "overview"],
        estimatedReadTime: 3,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: true,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: gettingStartedCategory?.id,
        title: "First Time Setup Guide",
        slug: createSlug("First Time Setup Guide"),
        summary: "Complete setup guide for new VisiGate Pro installations",
        content: `# First Time Setup Guide

Follow these steps to get VisiGate Pro configured for your organization.

## Step 1: Company Information
1. Navigate to **Settings** > **Company Settings**
2. Enter your company name and address
3. Upload your company logo
4. Set your time zone and working hours

## Step 2: User Accounts
1. Go to **Settings** > **User Management**
2. Create user accounts for your reception staff
3. Assign appropriate permission levels
4. Set up login credentials

## Step 3: Staff Directory
1. Visit the **Staff** section
2. Import your staff list or add manually
3. Include photos and contact information
4. Set access levels and departments

## Step 4: Visitor Types
1. In **Settings** > **Visitor Types**
2. Configure different visitor categories
3. Set up required fields for each type
4. Define any special requirements

## Step 5: Testing
1. Create a test visitor check-in
2. Verify badge printing (if enabled)
3. Test the check-out process
4. Review the visitor log

You're now ready to start using VisiGate Pro!`,
        targetPages: ["settings"],
        searchKeywords: ["setup", "configuration", "first time", "installation", "getting started"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: true,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Visitor Management Articles
      {
        categoryId: visitorMgmtCategory?.id,
        title: "How to Check In a Visitor",
        slug: createSlug("How to Check In a Visitor"),
        summary: "Step-by-step guide to checking in visitors",
        content: `# How to Check In a Visitor

Follow these simple steps to check in visitors quickly and efficiently.

## Quick Check-in Process
1. Click **"New Visitor"** on the Visitors page
2. Enter the visitor's name and company
3. Select the host (staff member they're visiting)
4. Choose the visitor type
5. Take a photo (optional but recommended)
6. Click **"Check In"**

## Walk-in Visitors
For unexpected visitors:
1. Use the **"Walk-in"** option
2. Collect basic information
3. Contact the intended host for approval
4. Complete check-in once approved

## Pre-registered Visitors
For scheduled visits:
1. Search for the visitor by name or company
2. Verify the appointment details
3. Update any changed information
4. Complete the check-in

## Visitor Badges
- Badges print automatically if a printer is connected
- Include visitor photo, name, company, and host
- Ensure visitors wear badges visibly
- Collect badges during check-out

## Special Requirements
Some visitors may need:
- Safety inductions for site access
- Additional documentation
- Escort requirements
- Restricted access areas

The system will prompt you for any special requirements based on the visitor type selected.`,
        targetPages: ["visitors"],
        searchKeywords: ["check in", "visitor", "badge", "walk-in", "registration"],
        estimatedReadTime: 4,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Staff Management Articles
      {
        categoryId: staffMgmtCategory?.id,
        title: "Managing Staff Profiles",
        slug: createSlug("Managing Staff Profiles"),
        summary: "How to add, edit, and manage staff member information",
        content: `# Managing Staff Profiles

Keep your staff directory up to date with these management features.

## Adding New Staff
1. Go to the **Staff** section
2. Click **"Add Staff Member"**
3. Fill in required information:
   - Full name and employee ID
   - Department and job title
   - Contact information
   - Photo (for badge printing)
4. Set access permissions
5. Save the profile

## Editing Staff Information
1. Find the staff member in the list
2. Click on their name or the edit button
3. Update the necessary fields
4. Save changes

## Staff Status Management
- **Active**: Currently employed, can host visitors
- **Inactive**: Temporarily unavailable
- **Terminated**: No longer with company

## Bulk Operations
For large organizations:
- Import staff from CSV files
- Bulk update departments or access levels
- Export staff lists for external use

## Access Control
Configure what each staff member can access:
- Visitor hosting privileges
- System administration rights
- Report viewing permissions
- Settings modification access

Regular maintenance of staff profiles ensures accurate visitor hosting and proper access control.`,
        targetPages: ["staff"],
        searchKeywords: ["staff", "employees", "profiles", "directory", "manage"],
        estimatedReadTime: 3,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Contractor Management Articles
      {
        categoryId: contractorMgmtCategory?.id,
        title: "Contractor Compliance Management",
        slug: createSlug("Contractor Compliance Management"),
        summary: "Managing contractor safety compliance and documentation",
        content: `# Contractor Compliance Management

Ensure all contractors meet safety and compliance requirements before site access.

## Setting Up Contractor Companies
1. Go to **Contractors** > **Companies**
2. Add contractor company details
3. Set compliance requirements
4. Upload master agreements and certifications

## Required Documentation
Standard documents typically include:
- Public Liability Insurance
- Employers Liability Insurance
- Health & Safety Policy
- Risk Assessments
- Method Statements

## Document Verification
1. Review uploaded documents
2. Check expiry dates
3. Approve or reject submissions
4. Set renewal reminders

## Contractor Workers
For each contractor worker:
- Verify qualifications and certifications
- Complete safety inductions
- Assign access levels
- Issue security passes

## Compliance Tracking
Monitor compliance status:
- **Green**: All documents current and approved
- **Amber**: Documents expiring soon
- **Red**: Expired or missing documents

## Red and Yellow Card System
Track safety violations:
- **Yellow Cards**: Minor safety infractions
- **Red Cards**: Serious safety violations
- Automatic access restrictions for repeated violations

Regular compliance monitoring ensures a safe working environment for all site users.`,
        targetPages: ["contractors"],
        searchKeywords: ["contractors", "compliance", "safety", "documentation", "certificates"],
        estimatedReadTime: 5,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Safety & Compliance Articles
      {
        categoryId: safetyCategory?.id,
        title: "Safety Induction System",
        slug: createSlug("Safety Induction System"),
        summary: "How to set up and manage safety inductions for visitors and contractors",
        content: `# Safety Induction System

Ensure all site users receive proper safety training with the integrated induction system.

## Induction Types
Configure different inductions for:
- **Visitors**: Basic site safety awareness
- **Contractors**: Comprehensive safety training
- **Staff**: Role-specific safety requirements
- **Emergency Personnel**: Specialized access requirements

## Setting Up Inductions
1. Go to **Settings** > **Safety Inductions**
2. Create or edit induction content
3. Add questions and assessments
4. Set passing requirements
5. Configure automatic triggers

## Induction Content
Include essential safety information:
- Site emergency procedures
- PPE requirements
- Hazard identification
- Safe work practices
- Emergency contact information

## Assessment Questions
Create questions to verify understanding:
- Multiple choice questions
- True/false statements
- Image-based scenarios
- Hazard identification tests

## Tracking and Compliance
Monitor induction completion:
- View completion status
- Track assessment scores
- Generate compliance reports
- Set renewal requirements

## AI-Generated Content
The system can generate:
- Safety images for different scenarios
- Role-specific induction content
- Customized assessment questions
- Visual hazard identification materials

Effective safety inductions reduce accidents and ensure regulatory compliance.`,
        targetPages: ["safety", "inductions"],
        searchKeywords: ["safety", "induction", "training", "compliance", "assessment"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Reports & Analytics Articles
      {
        categoryId: reportsCategory?.id,
        title: "Generating Visitor Reports",
        slug: createSlug("Generating Visitor Reports"),
        summary: "How to create and export visitor activity reports",
        content: `# Generating Visitor Reports

Create comprehensive reports for management, security, and compliance purposes.

## Report Types Available
- **Daily Visitor Log**: All visitors for a specific day
- **Weekly Activity**: Summary of weekly visitor patterns
- **Monthly Statistics**: Comprehensive monthly analytics
- **Contractor Reports**: Contractor-specific activity
- **Security Reports**: Security-focused visitor data

## Creating Reports
1. Navigate to **Reports** section
2. Select report type
3. Choose date range
4. Apply filters (optional):
   - Visitor type
   - Host department
   - Company name
   - Check-in/out status
5. Generate report

## Export Options
Reports can be exported as:
- PDF for formal documentation
- Excel/CSV for data analysis
- Email delivery to stakeholders

## Scheduled Reports
Set up automatic report generation:
1. Configure report parameters
2. Set delivery schedule (daily, weekly, monthly)
3. Add recipient email addresses
4. Enable automatic delivery

## Key Metrics
Reports typically include:
- Total visitor count
- Peak visit times
- Average visit duration
- Top visiting companies
- Most popular hosts

## Compliance Documentation
For audit purposes:
- Security clearance records
- Safety induction completion
- Document expiry tracking
- Access violation logs

Regular reporting helps identify patterns, improve security, and maintain compliance records.`,
        targetPages: ["reports"],
        searchKeywords: ["reports", "analytics", "export", "statistics", "compliance"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Settings & Configuration Articles
      {
        categoryId: settingsCategory?.id,
        title: "Customizing System Settings",
        slug: createSlug("Customizing System Settings"),
        summary: "How to configure VisiGate Pro to match your organization's needs",
        content: `# Customizing System Settings

Tailor VisiGate Pro to your organization's specific requirements and branding.

## Company Branding
Customize the appearance:
1. Upload company logo
2. Set brand colors
3. Customize welcome messages
4. Configure email templates

## Visitor Types Configuration
Set up different visitor categories:
- Business visitors
- Contractors
- Delivery personnel
- Interview candidates
- Service providers

For each type, configure:
- Required information fields
- Badge template design
- Security clearance level
- Automatic processes

## Badge Printing Setup
Configure badge printing:
1. Connect thermal or standard printers
2. Design badge templates
3. Set printing preferences
4. Test print functionality

## Notifications Settings
Configure automated notifications:
- Host notification when visitor arrives
- Security alerts for unauthorized access
- Reminder emails for compliance
- Daily/weekly activity summaries

## Access Control Integration
Connect with existing systems:
- Door access control systems
- CCTV management
- Fire evacuation systems
- Time and attendance

## Data Retention
Set data retention policies:
- Visitor log retention period
- Image storage duration
- Report archival settings
- Compliance documentation periods

## Email Configuration
Set up email notifications:
1. Configure SMTP settings
2. Set sender addresses
3. Design email templates
4. Test email delivery

Proper configuration ensures VisiGate Pro works seamlessly with your existing processes.`,
        targetPages: ["settings"],
        searchKeywords: ["settings", "configuration", "customization", "branding", "setup"],
        estimatedReadTime: 6,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Additional Settings & Configuration Articles
      {
        categoryId: settingsCategory?.id,
        title: "Managing User Accounts and Invitations",
        slug: createSlug("Managing User Accounts and Invitations"),
        summary: "How to invite new users, manage accounts, and handle user permissions",
        content: `# Managing User Accounts and Invitations

Control who has access to your VisiGate Pro system with user management features.

## Inviting New Users
1. Navigate to **Settings** > **User Management**
2. Click **"Invite User"** button
3. Enter the user's email address
4. Select the appropriate role:
   - **Admin**: Full system access and user management
   - **User**: Standard access for daily operations
5. Optionally add a personal message
6. Click **"Send Invitation"**

## Sharing Invitation Links
If email delivery is not working or you prefer direct sharing:
1. Find the pending invitation in the user list
2. Click the **"Copy Link"** button (📋 icon) next to the invitation
3. Share the copied link directly with the invitee via your preferred method
4. The invitee can use this link to complete their registration

## Invitation Status
Monitor invitation status in the user list:
- **Active Users**: Shown with blue avatar and username
- **Pending Invitations**: Shown with amber/yellow avatar and "Awaiting" badge
- **Email Address**: Displayed for pending invitations

## Managing Pending Invitations
- **Delete Invitation**: Remove pending invitations that are no longer needed
- **Resend Invitation**: If an invitation expires or is lost, delete and create a new one
- **Copy Link**: Share invitation link directly without relying on email

## Accepting an Invitation
When a user receives an invitation:
1. Click the invitation link (from email or shared link)
2. Enter desired username
3. Create a secure password (8+ characters)
4. Confirm password
5. Click **"Create Account"**
6. Log in with new credentials

## Editing User Accounts
Admins can modify existing user accounts:
1. Find the user in the user list
2. Click the **"Edit"** button (✏️ icon)
3. Update user information:
   - First and last name
   - Username
   - Email address
   - Role (admin only)
   - Password (optional - leave blank to keep current)
4. Save changes

## User Roles and Permissions
- **Admin**: Can invite users, edit all accounts, change roles, and delete users
- **User**: Can use the system but cannot manage other users

## Security Best Practices
- Only invite users who need system access
- Assign the minimum required permission level
- Regularly review user accounts and remove unused accounts
- Use strong passwords with mix of letters, numbers, and symbols
- Delete invitations that won't be used

## Deleting User Accounts
Admins can remove user accounts:
1. Locate the user in the user list
2. Click the delete button (🗑️ icon)
3. Confirm the deletion
4. User will be immediately logged out and unable to access the system

User management ensures proper access control and maintains system security.`,
        targetPages: ["settings"],
        searchKeywords: ["users", "invitations", "invite", "accounts", "permissions", "roles", "admin", "copy link"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: settingsCategory?.id,
        title: "User Roles and Permissions",
        slug: createSlug("User Roles and Permissions"),
        summary: "Understanding different user roles and their access levels",
        content: `# User Roles and Permissions

VisiGate Pro uses role-based access control to ensure users have appropriate system access.

## Available Roles

### Admin Role
Full system access including:
- All visitor, staff, and contractor management features
- Create, edit, and delete user accounts
- Send user invitations
- Change user roles
- Access all settings and configurations
- View and generate all reports
- Manage compliance and safety features

### User Role
Standard operational access:
- Check in/out visitors, staff, and contractors
- View visitor and staff information
- Generate standard reports
- Access dashboard and analytics
- Update their own profile
- Cannot manage other user accounts

## Assigning Roles
Only admin users can assign or change roles:
1. Edit the user account
2. Select the appropriate role from dropdown
3. Save changes
4. User's permissions update immediately

## Role-Based UI Features
The system automatically shows/hides features based on role:
- **Admin users see**: User management buttons, edit/delete options, role selectors
- **Standard users see**: Operational features only, no user management

## Permission Restrictions
Standard users cannot:
- Create or delete user accounts
- Change user roles (including their own)
- Send system invitations
- Modify critical system settings
- Access advanced configuration options

## Security Considerations
- Always assign the minimum required role
- Regularly review user roles during security audits
- Remove admin access when no longer needed
- Monitor admin actions through audit logs

## Changing Your Own Role
Users cannot change their own role - this must be done by another admin user to prevent unauthorized privilege escalation.

Proper role assignment ensures system security while allowing users to perform their jobs effectively.`,
        targetPages: ["settings"],
        searchKeywords: ["roles", "permissions", "access", "admin", "user", "security"],
        estimatedReadTime: 4,
        difficulty: "intermediate",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 3,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },

      // Troubleshooting Articles
      {
        categoryId: troubleshootingCategory?.id,
        title: "Common Issues and Solutions",
        slug: createSlug("Common Issues and Solutions"),
        summary: "Quick fixes for the most common VisiGate Pro issues",
        content: `# Common Issues and Solutions

Quick solutions to frequently encountered problems.

## Badge Printer Not Working
**Symptoms**: Badges not printing or poor print quality

**Solutions**:
1. Check printer connection and power
2. Verify correct printer driver installation
3. Replace thermal paper or ink cartridges
4. Clean printer heads
5. Test with different badge template

## Visitor Photos Not Capturing
**Symptoms**: Camera not working or photos appear black

**Solutions**:
1. Check browser camera permissions
2. Ensure adequate lighting
3. Try a different browser
4. Check camera hardware connection
5. Update browser to latest version

## Slow System Performance
**Symptoms**: Pages loading slowly or timeouts

**Solutions**:
1. Check internet connection speed
2. Clear browser cache and cookies
3. Close unnecessary browser tabs
4. Restart the browser
5. Contact IT support if persistent

## Email Notifications Not Sending
**Symptoms**: Hosts not receiving visitor notifications

**Solutions**:
1. Verify email settings in configuration
2. Check spam/junk folders
3. Test email connectivity
4. Verify recipient email addresses
5. Check SMTP server settings

## Data Not Syncing
**Symptoms**: Recent changes not appearing across devices

**Solutions**:
1. Refresh the browser page
2. Check network connectivity
3. Log out and log back in
4. Clear browser cache
5. Contact support for data conflicts

## Access Control Not Working
**Symptoms**: Door locks not responding to visitor badges

**Solutions**:
1. Check integration settings
2. Verify access control system status
3. Test with known working badge
4. Check network connectivity
5. Contact access control provider

## Getting Additional Help
If these solutions don't resolve your issue:
1. Use the help chat feature
2. Contact your system administrator
3. Submit a support ticket
4. Check for system updates

Most issues can be resolved quickly with these troubleshooting steps.`,
        targetPages: ["dashboard", "visitors", "staff", "contractors"],
        searchKeywords: ["troubleshooting", "problems", "issues", "help", "solutions", "printer", "camera"],
        estimatedReadTime: 5,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: true,
        isQuickStart: false,
        sortOrder: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      },
      {
        categoryId: troubleshootingCategory?.id,
        title: "Invitation and User Account Issues",
        slug: createSlug("Invitation and User Account Issues"),
        summary: "Troubleshooting problems with user invitations and account access",
        content: `# Invitation and User Account Issues

Solutions for common problems with user invitations and account management.

## Invitation Emails Not Arriving
**Symptoms**: Invited users don't receive invitation emails

**Solutions**:
1. Check user's spam/junk folder
2. Verify email address is correct
3. Use the **"Copy Link"** button to share invitation directly
4. Ask recipient to whitelist sender email address
5. Contact email administrator to check email server logs

## Copy Link Not Working
**Symptoms**: Copied invitation link doesn't work when pasted

**Solutions**:
1. Ensure the entire link is copied (no truncation)
2. Copy link again and paste in incognito/private browser window
3. Check that invitation hasn't been deleted
4. Verify link hasn't expired (delete and create new invitation)
5. Try different browser or device

## Can't Accept Invitation
**Symptoms**: Error when trying to accept invitation or create account

**Solutions**:
1. Check that invitation link is complete and not broken
2. Verify invitation hasn't been deleted by admin
3. Try clearing browser cache and cookies
4. Use a different browser
5. Request a new invitation from admin

## Password Requirements Not Met
**Symptoms**: Error when creating password during invitation acceptance

**Solutions**:
1. Ensure password is at least 8 characters long
2. Include mix of uppercase and lowercase letters
3. Add numbers to your password
4. Include special characters if required
5. Make sure password and confirmation match exactly

## Username Already Taken
**Symptoms**: "Username already exists" error during account creation

**Solutions**:
1. Choose a different username
2. Add numbers or underscores to make it unique
3. Contact admin to check if old account should be removed
4. Try variations of your name

## Cannot Edit User Account
**Symptoms**: Edit button not visible or changes won't save

**Solutions**:
1. Verify you have admin role permissions
2. Refresh the page and try again
3. Check you're not trying to edit your own role
4. Ensure all required fields are filled
5. Contact another admin if you're locked out

## Pending Invitation Shows Wrong Email
**Symptoms**: Invitation sent to incorrect email address

**Solutions**:
1. Delete the incorrect invitation
2. Create new invitation with correct email
3. Use copy link feature to share with correct recipient
4. Verify email address before sending

## User Can't Change Their Own Role
**Symptoms**: Unable to give yourself admin access

**Expected Behavior**: This is a security feature
- Users cannot change their own role
- Another admin must change your role
- Prevents unauthorized privilege escalation
- Contact another admin for role changes

## Invitation Link Expired
**Symptoms**: Link shows "invalid or expired" error

**Solutions**:
1. Request admin to delete old invitation
2. Admin creates fresh invitation
3. Use the new link immediately
4. Use copy link feature for direct sharing

## Mass Invitation Problems
**Symptoms**: Multiple invitations failing or slow to send

**Solutions**:
1. Send invitations in smaller batches
2. Wait between sending each invitation
3. Use copy link for bulk sharing
4. Check email server sending limits
5. Contact system administrator

## Account Access Issues After Creation
**Symptoms**: New account created but can't login

**Solutions**:
1. Verify username and password are correct
2. Check caps lock is off
3. Wait a few minutes and try again
4. Clear browser cache and cookies
5. Contact admin to verify account is active

Most invitation and account issues can be resolved using the copy link feature or by creating a fresh invitation.`,
        targetPages: ["settings"],
        searchKeywords: ["invitation", "invite", "email", "account", "password", "user", "troubleshooting", "copy link"],
        estimatedReadTime: 6,
        difficulty: "beginner",
        isPublished: true,
        isFeatured: false,
        isQuickStart: false,
        sortOrder: 2,
        helpfulCount: 0,
        notHelpfulCount: 0,
        viewCount: 0
      }
    ];

    // Filter out any articles with undefined categoryId and assert type
    const validArticles = articlesData.filter((article): article is typeof article & { categoryId: string } => 
      article.categoryId !== undefined
    );
    const insertedArticles = await db.insert(helpArticles).values(validArticles).returning();
    console.log(`✅ Seeded ${insertedArticles.length} help articles`);

    console.log('🎉 Help system data seeding completed successfully!');
    console.log(`Total categories: ${insertedCategories.length}`);
    console.log(`Total articles: ${insertedArticles.length}`);

  } catch (error) {
    console.error('❌ Error seeding help data:', error);
    throw error;
  }
}

// Run seeding if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedHelpData()
    .then(() => {
      console.log('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seeding failed:', error);
      process.exit(1);
    });
}