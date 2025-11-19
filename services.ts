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

export async function saveToSheet(spreadsheetId: string, aiResults: any | any[], driveLinks: string[], originalNote: string, userId?: number) {
  const timestamp = new Date().toISOString();

  // Get dynamic service account configuration
  const { sheets, serviceAccount } = ServiceAccountManager.getServiceAccountForUser(userId);
  console.log(`Using service account for sheets: ${serviceAccount ? serviceAccount.name : 'file-based'}`);

  // Handle single result (backward compatibility) or multiple results
  const results = Array.isArray(aiResults) ? aiResults : [aiResults];
  const links = Array.isArray(driveLinks) ? driveLinks : [driveLinks];

  if (results.length === 0) return;

  // For multiple images, create a combined summary
  if (results.length > 1) {
    const combinedSummary = `Analyzed ${results.length} images. ` +
      results.map((result, index) =>
        `Image ${index + 1}: ${result.analysis?.summary?.substring(0, 100) || 'No summary'}...`
      ).join(' ');

    const overallStatus = results.every(r => r.analysis?.comparison_status === 'MATCH') ? 'MATCH' :
                          results.some(r => r.analysis?.comparison_status === 'MISMATCH') ? 'MISMATCH' : 'PARTIAL';

    const overallNote = `Batch analysis of ${results.length} meeting images. Individual statuses: ` +
      results.map((r, i) => `Image ${i + 1}: ${r.analysis?.comparison_status || 'UNKNOWN'}`).join(', ');

    // Save combined summary
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Summary!A:E",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          timestamp,
          originalNote,
          combinedSummary,
          overallStatus,
          overallNote
        ]],
      },
    });

    // Save individual extracted data for each image
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const link = links[i] || '';

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Extracted!A:C",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            `${timestamp} - Image ${i + 1}`,
            result.analysis?.extracted_data || 'No data extracted',
            link
          ]],
        },
      });

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: "Doc!A:C",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            `${timestamp} - Image ${i + 1}`,
            link,
            `=IMAGE("${link}")`
          ]],
        },
      });
    }
  } else {
    // Single image (original logic)
    const aiResult = Array.isArray(results[0]) ? results[0] : results[0].analysis || results[0];
    const driveLink = links[0];

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

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Extracted!A:C",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[timestamp, aiResult.extracted_data, driveLink]],
      },
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Doc!A:C",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[timestamp, driveLink, `=IMAGE("${driveLink}")`]],
      },
    });
  }
}