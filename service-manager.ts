// service-manager.ts
import { google } from "googleapis";
import db from "./db";

export interface ServiceAccount {
  id: number;
  name: string;
  service_account_json: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class ServiceAccountManager {
  // Get active service account for a user, fallback to system default
  static getServiceAccountForUser(userId?: number): { auth: any; sheets: any; drive: any; serviceAccount: ServiceAccount | null } {
    let serviceAccount: ServiceAccount | null = null;

    if (userId) {
      // Try to get user-specific service account
      const userServiceAccount = db.query(`
        SELECT sa.* FROM service_accounts sa
        JOIN user_service_accounts usa ON sa.id = usa.service_account_id
        WHERE usa.user_id = ? AND sa.is_active = 1
        LIMIT 1
      `).get(userId) as ServiceAccount;

      if (userServiceAccount) {
        serviceAccount = userServiceAccount;
      }
    }

    // Fallback to any active service account
    if (!serviceAccount) {
      serviceAccount = db.query(`
        SELECT * FROM service_accounts WHERE is_active = 1 LIMIT 1
      `).get() as ServiceAccount;
    }

    // Fallback to file-based service account
    if (!serviceAccount) {
      try {
        const auth = new google.auth.GoogleAuth({
          keyFile: "service-account.json",
          scopes: [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
          ],
        });

        return {
          auth,
          sheets: google.sheets({ version: "v4", auth }),
          drive: google.drive({ version: "v3", auth }),
          serviceAccount: null
        };
      } catch (error) {
        throw new Error("No service account configured. Please add one via API or service-account.json file");
      }
    }

    // Use database service account
    const credentials = JSON.parse(serviceAccount.service_account_json);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
      ],
    });

    return {
      auth,
      sheets: google.sheets({ version: "v4", auth }),
      drive: google.drive({ version: "v3", auth }),
      serviceAccount
    };
  }

  // Add new service account
  static addServiceAccount(name: string, serviceAccountJson: string): ServiceAccount {
    try {
      // Validate JSON
      JSON.parse(serviceAccountJson);

      const result = db.run(`
        INSERT INTO service_accounts (name, service_account_json, is_active)
        VALUES (?, ?, 1)
      `, [name, serviceAccountJson]);

      const newAccount = db.query("SELECT * FROM service_accounts WHERE id = ?").get(result.lastInsertRowid) as ServiceAccount;

      console.log(`✅ Service account "${name}" added successfully`);
      return newAccount;
    } catch (error) {
      throw new Error(`Invalid service account JSON: ${error}`);
    }
  }

  // List all service accounts
  static listServiceAccounts(): ServiceAccount[] {
    return db.query(`
      SELECT * FROM service_accounts
      ORDER BY is_active DESC, created_at DESC
    `).all() as ServiceAccount[];
  }

  // Toggle service account active status
  static toggleServiceAccount(id: number, isActive: boolean): ServiceAccount {
    // If activating this account, deactivate others (optional - allows multiple active)
    if (isActive) {
      db.run("UPDATE service_accounts SET is_active = 0");
    }

    db.run(`
      UPDATE service_accounts
      SET is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [isActive ? 1 : 0, id]);

    const updated = db.query("SELECT * FROM service_accounts WHERE id = ?").get(id) as ServiceAccount;
    console.log(`✅ Service account "${updated.name}" ${isActive ? 'activated' : 'deactivated'}`);

    return updated;
  }

  // Delete service account
  static deleteServiceAccount(id: number): boolean {
    const serviceAccount = db.query("SELECT name FROM service_accounts WHERE id = ?").get(id) as any;

    if (!serviceAccount) {
      return false;
    }

    // Delete user associations first
    db.run("DELETE FROM user_service_accounts WHERE service_account_id = ?", [id]);

    // Delete service account
    db.run("DELETE FROM service_accounts WHERE id = ?", [id]);

    console.log(`✅ Service account "${serviceAccount.name}" deleted`);
    return true;
  }

  // Assign service account to user
  static assignServiceAccountToUser(userId: number, serviceAccountId: number): boolean {
    try {
      // Remove existing assignments for this user
      db.run("DELETE FROM user_service_accounts WHERE user_id = ?", [userId]);

      // Add new assignment
      db.run(`
        INSERT INTO user_service_accounts (user_id, service_account_id)
        VALUES (?, ?)
      `, [userId, serviceAccountId]);

      console.log(`✅ Service account assigned to user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to assign service account:', error);
      return false;
    }
  }

  // Test service account credentials
  static async testServiceAccount(serviceAccountJson: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const credentials = JSON.parse(serviceAccountJson);

      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: [
          "https://www.googleapis.com/auth/spreadsheets",
          "https://www.googleapis.com/auth/drive",
        ],
      });

      // Test authentication by trying to access Drive API
      const drive = google.drive({ version: "v3", auth });
      await drive.files.list({ pageSize: 1 });

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export default ServiceAccountManager;