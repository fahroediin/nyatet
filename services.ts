// services.ts
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import ServiceAccountManager from "./service-manager";

// Konfigurasi Gemini (Gunakan API KEY dari Google AI Studio)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY");

// Gunakan model Pro untuk vision capability terbaik
// Nanti bisa diganti "gemini-3.0-pro-preview" jika sudah rilis
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

export async function uploadImageToDrive(fileBlob: Blob, fileName: string, userId?: number) {
  const buffer = Buffer.from(await fileBlob.arrayBuffer());

  // Get dynamic service account configuration
  const { drive, serviceAccount } = ServiceAccountManager.getServiceAccountForUser(userId);
  console.log(`Using service account: ${serviceAccount ? serviceAccount.name : 'file-based'}`);

  // Upload ke Drive agar bisa dilink di Spreadsheet
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: fileBlob.type,
      parents: process.env.DRIVE_FOLDER_ID ? [process.env.DRIVE_FOLDER_ID] : undefined, // ID Folder di Google Drive (Opsional)
    },
    media: {
      mimeType: fileBlob.type,
      body: (await import("stream")).Readable.from(buffer),
    },
    fields: "id, webViewLink, thumbnailLink",
  });

  return res.data; // Mengembalikan link file
}

export async function analyzeWithGemini(textNote: string, imageBlob: Blob) {
  const imageBuffer = Buffer.from(await imageBlob.arrayBuffer());
  
  const prompt = `
    Act as a Senior Business Analyst Assistant.
    
    Input:
    1. My Meeting Note: "${textNote}"
    2. Attached Image: (See screenshot)

    Tasks:
    1. SUMMARY: Summarize the meeting context combining my note and the image info.
    2. COMPARE: Check if my note matches the image. Does the text note contradict the image? 
       - If yes, strictly verify. Example: If I wrote "Profit 10%" but image shows "Profit 5%", flag it as MISMATCH.
       - If information is missing in one but present in other, mention it.
    3. EXTRACT: Extract all relevant data/text/tables from the image into a structured string.

    Output must be valid JSON format:
    {
      "summary": "...",
      "comparison_status": "MATCH" or "MISMATCH" or "PARTIAL",
      "comparison_note": "...",
      "extracted_data": "..."
    }
  `;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: imageBlob.type,
      },
    },
  ]);

  const responseText = result.response.text();
  // Bersihkan format markdown json ```json ... ``` jika ada
  const cleanedJson = responseText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleanedJson);
}

export async function saveToSheet(spreadsheetId: string, aiResult: any, driveLink: string, originalNote: string, userId?: number) {
  const timestamp = new Date().toISOString();

  // Get dynamic service account configuration
  const { sheets, serviceAccount } = ServiceAccountManager.getServiceAccountForUser(userId);
  console.log(`Using service account for sheets: ${serviceAccount ? serviceAccount.name : 'file-based'}`);

  // 1. Tab "Summary"
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Summary!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        timestamp,
        originalNote,
        aiResult.summary,
        aiResult.comparison_status,
        aiResult.comparison_note
      ]],
    },
  });

  // 2. Tab "Extracted"
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Extracted!A:C",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[timestamp, aiResult.extracted_data, driveLink]],
    },
  });

  // 3. Tab "Doc" (Menampilkan Gambar via Formula)
  // Note: driveLink harus public atau accessible agar =IMAGE() bekerja,
  // atau kita simpan Link-nya saja.
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: "Doc!A:C",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[timestamp, driveLink, `=IMAGE("${driveLink}")`]], // Kolom C mencoba render gambar
    },
  });
}