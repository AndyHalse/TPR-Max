import type { CompanySettings } from "@shared/schema";

interface BiostarConnectionResult {
  success: boolean;
  message: string;
  serverInfo?: any;
}

interface BiostarDeviceSync {
  devices: string[];
  deviceSettings: Record<string, any>;
}

// Test connection to Biostar API
export async function testBiostarConnection(settings: CompanySettings): Promise<BiostarConnectionResult> {
  try {
    const { biostarServerUrl, biostarUsername, biostarPassword, biostarApiKey } = settings;
    
    if (!biostarServerUrl || !biostarUsername || !biostarPassword) {
      return {
        success: false,
        message: "Missing required Biostar connection settings"
      };
    }

    // Basic auth for Biostar API
    const auth = Buffer.from(`${biostarUsername}:${biostarPassword}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-API-KEY': biostarApiKey || ''
    };

    // Test connection by getting server info
    const response = await fetch(`${biostarServerUrl}/api/server/info`, {
      method: 'GET',
      headers,
      // Ignore SSL certificate errors for development
      ...({} as any) // TypeScript workaround
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Connection failed: ${response.status} ${response.statusText}`
      };
    }

    const serverInfo = await response.json();
    
    return {
      success: true,
      message: "Successfully connected to Biostar server",
      serverInfo
    };
  } catch (error) {
    console.error("Biostar connection test error:", error);
    return {
      success: false,
      message: `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Sync devices from Biostar
export async function syncBiostarDevices(settings: CompanySettings): Promise<BiostarDeviceSync> {
  try {
    const { biostarServerUrl, biostarUsername, biostarPassword, biostarApiKey, biostarDatabaseId } = settings;
    
    const auth = Buffer.from(`${biostarUsername}:${biostarPassword}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-API-KEY': biostarApiKey || ''
    };

    // Get all devices from Biostar
    const response = await fetch(`${biostarServerUrl}/api/devices`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      throw new Error(`Failed to sync devices: ${response.status} ${response.statusText}`);
    }

    const devices = await response.json();
    
    // Extract device IDs and settings
    const deviceIds = devices.records?.map((device: any) => device.id?.toString()) || [];
    const deviceSettings = devices.records?.reduce((acc: any, device: any) => {
      acc[device.id] = {
        name: device.name,
        type: device.type,
        ip: device.ip,
        status: device.status
      };
      return acc;
    }, {}) || {};

    return {
      devices: deviceIds,
      deviceSettings
    };
  } catch (error) {
    console.error("Biostar device sync error:", error);
    throw error;
  }
}

// Get staff attendance status from Biostar
export async function getBiostarStaffStatus(settings: CompanySettings): Promise<any[]> {
  try {
    const { biostarServerUrl, biostarUsername, biostarPassword, biostarApiKey, biostarDatabaseId } = settings;
    
    const auth = Buffer.from(`${biostarUsername}:${biostarPassword}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'X-API-KEY': biostarApiKey || ''
    };

    // Get attendance events for today
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    const response = await fetch(`${biostarServerUrl}/api/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Query: {
          conditions: [
            {
              column: 'datetime',
              operator: '>=',
              values: [Math.floor(startOfDay.getTime() / 1000)]
            },
            {
              column: 'datetime',
              operator: '<=',
              values: [Math.floor(endOfDay.getTime() / 1000)]
            }
          ]
        },
        Limit: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to get staff status: ${response.status} ${response.statusText}`);
    }

    const events = await response.json();
    
    // Process events to get current staff status
    const staffStatus = processAttendanceEvents(events.records || []);
    
    return staffStatus;
  } catch (error) {
    console.error("Biostar staff status error:", error);
    throw error;
  }
}

// Process attendance events to determine current staff status
function processAttendanceEvents(events: any[]): any[] {
  const staffMap = new Map();
  
  // Process events chronologically
  events
    .sort((a: any, b: any) => a.datetime - b.datetime)
    .forEach((event: any) => {
      const userId = event.user_id?.toString();
      if (userId) {
        staffMap.set(userId, {
          userId,
          userName: event.user_name || 'Unknown',
          lastEvent: event.event_type_code,
          lastEventTime: new Date(event.datetime * 1000),
          isOnSite: isCheckInEvent(event.event_type_code),
          deviceId: event.device_id?.toString(),
          department: event.department || 'Unknown'
        });
      }
    });

  return Array.from(staffMap.values());
}

// Determine if event type is a check-in event
function isCheckInEvent(eventTypeCode: number): boolean {
  // Common Biostar event codes:
  // 0x1000: Normal Access
  // 0x2000: Denied Access
  // 0x4000: Door Open
  // Add more based on your Biostar configuration
  return eventTypeCode === 0x1000 || eventTypeCode === 0x4000;
}

export default {
  testBiostarConnection,
  syncBiostarDevices,
  getBiostarStaffStatus
};