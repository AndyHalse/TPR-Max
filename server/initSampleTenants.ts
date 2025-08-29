import { storage } from './storage';

export async function initializeSampleTenants() {
  console.log('🏢 Initializing sample tenant companies...');

  const sampleTenants = [
    {
      companyName: "TechFlow Solutions",
      slug: "techflow",
      subscriptionTier: "premium" as const,
      description: "Cutting-edge software development and digital transformation consultancy",
      industry: "Technology",
      contactEmail: "admin@techflow.com",
      contactPhone: "+44 20 7123 4567",
      website: "https://techflow.com",
      employeeCount: 25
    },
    {
      companyName: "Green Energy Innovations",
      slug: "green-energy",
      subscriptionTier: "premium" as const,
      description: "Renewable energy solutions and sustainability consulting",
      industry: "Energy",
      contactEmail: "contact@greenenergy.co.uk",
      contactPhone: "+44 20 7234 5678",
      website: "https://greenenergy.co.uk",
      employeeCount: 18
    },
    {
      companyName: "Legal Advisors LLP",
      slug: "legal-advisors",
      subscriptionTier: "business" as const,
      description: "Full-service law firm specializing in corporate and commercial law",
      industry: "Legal",
      contactEmail: "info@legaladvisors.co.uk",
      contactPhone: "+44 20 7345 6789",
      website: "https://legaladvisors.co.uk",
      employeeCount: 12
    },
    {
      companyName: "Digital Marketing Hub",
      slug: "digital-marketing",
      subscriptionTier: "business" as const,
      description: "Performance-driven digital marketing and brand strategy agency",
      industry: "Marketing",
      contactEmail: "hello@digitalmarketing.agency",
      contactPhone: "+44 20 7456 7890",
      website: "https://digitalmarketing.agency",
      employeeCount: 15
    },
    {
      companyName: "FinTech Dynamics",
      slug: "fintech-dynamics",
      subscriptionTier: "premium" as const,
      description: "Financial technology solutions for modern banking and payments",
      industry: "Financial Services",
      contactEmail: "team@fintechdynamics.com",
      contactPhone: "+44 20 7567 8901",
      website: "https://fintechdynamics.com",
      employeeCount: 30
    },
    {
      companyName: "Creative Design Studio",
      slug: "creative-design",
      subscriptionTier: "standard" as const,
      description: "Award-winning design agency for branding, web, and product design",
      industry: "Design",
      contactEmail: "studio@creativedesign.co.uk",
      contactPhone: "+44 20 7678 9012",
      website: "https://creativedesign.co.uk",
      employeeCount: 8
    },
    {
      companyName: "BioMed Research Ltd",
      slug: "biomed-research",
      subscriptionTier: "business" as const,
      description: "Biomedical research and pharmaceutical development company",
      industry: "Healthcare",
      contactEmail: "research@biomedltd.com",
      contactPhone: "+44 20 7789 0123",
      website: "https://biomedltd.com",
      employeeCount: 22
    },
    {
      companyName: "Quantum Consulting",
      slug: "quantum-consulting",
      subscriptionTier: "standard" as const,
      description: "Strategic business consulting for emerging technologies",
      industry: "Consulting",
      contactEmail: "info@quantumconsulting.co.uk",
      contactPhone: "+44 20 7890 1234",
      website: "https://quantumconsulting.co.uk",
      employeeCount: 6
    },
    {
      companyName: "Urban Architecture Firm",
      slug: "urban-architecture",
      subscriptionTier: "business" as const,
      description: "Sustainable urban planning and architectural design specialists",
      industry: "Architecture",
      contactEmail: "contact@urbanarch.co.uk",
      contactPhone: "+44 20 7901 2345",
      website: "https://urbanarch.co.uk",
      employeeCount: 14
    },
    {
      companyName: "DataVision Analytics",
      slug: "datavision",
      subscriptionTier: "premium" as const,
      description: "Big data analytics and business intelligence solutions",
      industry: "Technology",
      contactEmail: "analytics@datavision.com",
      contactPhone: "+44 20 7012 3456",
      website: "https://datavision.com",
      employeeCount: 28
    }
  ];

  try {
    // Check if we have multi-tenant methods available
    if (typeof storage.createTenantCompany === 'function') {
      for (const tenant of sampleTenants) {
        const created = await storage.createTenantCompany(tenant);
        console.log(`✅ Created tenant: ${created.companyName}`);
      }
      
      // Now assign existing staff to these companies
      await assignStaffToTenants();
      
      console.log('🎉 Sample tenant initialization complete!');
      return true;
    } else {
      console.log('⚠️  Multi-tenant methods not available - using DatabaseStorage');
      return false;
    }
  } catch (error) {
    console.error('❌ Error initializing sample tenants:', error);
    return false;
  }
}

async function assignStaffToTenants() {
  console.log('👥 Assigning staff to tenant companies...');
  
  try {
    const allStaff = await storage.getAllStaff();
    const allTenants = await storage.getAllTenantCompanies();
    
    if (allTenants.length === 0) {
      console.log('⚠️  No tenants available for staff assignment');
      return;
    }
    
    // Distribute staff across tenants
    let tenantIndex = 0;
    for (const staff of allStaff) {
      const tenant = allTenants[tenantIndex % allTenants.length];
      
      // Update staff with tenant company ID
      await storage.updateStaff(staff.id, {
        tenantCompanyId: tenant.id
      });
      
      console.log(`👤 Assigned ${staff.firstName} ${staff.lastName} to ${tenant.companyName}`);
      tenantIndex++;
    }
    
    console.log('✅ Staff assignment complete!');
  } catch (error) {
    console.error('❌ Error assigning staff to tenants:', error);
  }
}