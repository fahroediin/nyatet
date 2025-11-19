// index.ts
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import db from "./db";
import { uploadImageToDrive, analyzeWithGemini, saveToSheet } from "./services";
import ServiceAccountManager from "./service-manager";

const app = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "secret-kunci-rahasia",
    })
  )
  // --- Auth Routes ---
  .post(
    "/register",
    async ({ body }) => {
      const hashedPassword = await Bun.password.hash(body.password);
      try {
        db.run(
          "INSERT INTO users (email, password, spreadsheet_id) VALUES (?, ?, ?)",
          [body.email, hashedPassword, body.spreadsheet_id]
        );
        return { success: true, message: "User registered" };
      } catch (e) {
        return { success: false, message: "Email already exists" };
      }
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
        spreadsheet_id: t.String(),
      }),
    }
  )
  .post(
    "/login",
    async ({ body, jwt }) => {
      const user = db.query("SELECT * FROM users WHERE email = ?").get(body.email) as any;
      if (!user) return { success: false, message: "User not found" };

      const isMatch = await Bun.password.verify(body.password, user.password);
      if (!isMatch) return { success: false, message: "Wrong password" };

      return {
        success: true,
        token: await jwt.sign({ id: user.id, spreadsheet_id: user.spreadsheet_id }),
      };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    }
  )

  // --- Service Account Management Routes (Admin) ---
  .post(
    "/admin/service-accounts",
    async ({ body, jwt, request }) => {
      // Simple admin check (can be enhanced with proper roles)
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      try {
        const serviceAccount = ServiceAccountManager.addServiceAccount(
          body.name,
          body.service_account_json
        );
        return { success: true, serviceAccount };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
    {
      body: t.Object({
        name: t.String(),
        service_account_json: t.String(),
      }),
    }
  )
  .get(
    "/admin/service-accounts",
    async ({ jwt, request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      const serviceAccounts = ServiceAccountManager.listServiceAccounts();
      return { success: true, serviceAccounts };
    }
  )
  .put(
    "/admin/service-accounts/:id/toggle",
    async ({ params, body, jwt, request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      try {
        const serviceAccount = ServiceAccountManager.toggleServiceAccount(
          parseInt(params.id),
          body.is_active
        );
        return { success: true, serviceAccount };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        is_active: t.Boolean(),
      }),
    }
  )
  .delete(
    "/admin/service-accounts/:id",
    async ({ params, jwt, request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      const deleted = ServiceAccountManager.deleteServiceAccount(parseInt(params.id));
      return { success: true, deleted };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  .post(
    "/admin/service-accounts/test",
    async ({ body, jwt, request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      const result = await ServiceAccountManager.testServiceAccount(body.service_account_json);
      return result;
    },
    {
      body: t.Object({
        service_account_json: t.String(),
      }),
    }
  )
  .post(
    "/admin/service-accounts/assign",
    async ({ body, jwt, request }) => {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);

      if (!profile) return { error: "Invalid Token" };

      const success = ServiceAccountManager.assignServiceAccountToUser(
        body.user_id,
        body.service_account_id
      );
      return { success };
    },
    {
      body: t.Object({
        user_id: t.Number(),
        service_account_id: t.Number(),
      }),
    }
  )

  // --- Main Feature Route (Protected) ---
  .post(
    "/analyze-meeting",
    async ({ body, jwt, request }) => {
      // 1. Verifikasi Token
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return { error: "Unauthorized" };
      const token = authHeader.split(" ")[1];
      const profile = await jwt.verify(token);
      
      if (!profile) return { error: "Invalid Token" };

      const { note, image } = body;

      // 2. Upload ke Google Drive
      const driveFile = await uploadImageToDrive(image, `meeting-img-${Date.now()}.jpg`, profile.id);
      // Kita ambil thumbnailLink atau webViewLink. 
      // Note: Untuk =IMAGE() di sheet, gambar harus accessible public atau di drive yg sama.
      // Disini kita pakai webViewLink untuk referensi.
      const fileLink = driveFile.webViewLink || "";

      // 3. Analisa dengan Gemini AI
      console.log("Analyzing with AI...");
      const aiAnalysis = await analyzeWithGemini(note, image);

      // 4. Simpan ke Google Sheet milik user
      console.log("Saving to Spreadsheet...");
      await saveToSheet(profile.spreadsheet_id, aiAnalysis, fileLink, note, profile.id);

      return {
        status: "success",
        data: aiAnalysis,
        file: fileLink,
      };
    },
    {
      body: t.Object({
        note: t.String(),
        image: t.File(), // Fitur Elysia untuk handle multipart file
      }),
    }
  )
  .listen(3000);

console.log(
  `🦊 Business Analyst Assistant is running at ${app.server?.hostname}:${app.server?.port}`
);