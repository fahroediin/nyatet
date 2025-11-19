# Nyatet - Business Analyst Assistant API

**Nyatet** adalah API berbasis **Elysia Framework** yang dirancang khusus untuk membantu Business Analyst dalam menganalisis meeting notes dan gambar/screenshots dengan bantuan AI (Google Gemini) serta menyimpan hasilnya ke Google Sheets.

## 🚀 Fitur Utama

### 1. **Autentikasi Pengguna**
- **Registrasi**: Pengguna dapat mendaftar dengan email, password, dan spreadsheet ID Google Sheets
- **Login**: Sistem autentikasi menggunakan JWT (JSON Web Token) untuk keamanan session
- Password di-hash menggunakan `Bun.password.hash` untuk keamanan

### 2. **Analisis Meeting AI-Powered**
- **Multi-input Analysis**: Menganalisis text notes + gambar secara bersamaan
- **Google Gemini Integration**: Menggunakan AI model `gemini-1.5-pro` untuk:
  - ✅ **Summary**: Meringkas konteks meeting dari note dan gambar
  - ✅ **Comparison**: Membandingkan kesesuaian note dengan gambar (MATCH/MISMATCH/PARTIAL)
  - ✅ **Data Extraction**: Mengekstrak data/table/text dari gambar
- **Smart JSON Output**: Hasil analisis dalam format JSON terstruktur

### 3. **Google Workspace Integration**
- **Google Drive Upload**: Upload gambar meeting ke Google Drive
- **Google Sheets Automation**: Simpan hasil analisis ke 3 tab berbeda:
  - 📊 **Summary**: Data ringkasan dan hasil perbandingan
  - 📋 **Extracted**: Data yang diekstrak dari gambar + link drive
  - 🖼️ **Doc**: Dokumentasi lengkap dengan link gambar

### 4. **Database Management**
- **SQLite Database**: Menyimpan data pengguna dan logs
- **User Management**: Setiap user dapat memiliki spreadsheet yang berbeda
- **Audit Trail**: Pencatatan aktivitas dalam tabel logs

## 📋 Struktur Database

### Tabel `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  spreadsheet_id TEXT  -- Google Sheets ID per user
);
```

### Tabel `logs`
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabel `service_accounts` (NEW)
```sql
CREATE TABLE service_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  service_account_json TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabel `user_service_accounts` (NEW)
```sql
CREATE TABLE user_service_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  service_account_id INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id),
  FOREIGN KEY (service_account_id) REFERENCES service_accounts (id)
);
```

## 🔗 API Endpoints

### Autentikasi

#### `POST /register`
**Deskripsi**: Registrasi pengguna baru
**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "spreadsheet_id": "your_google_sheet_id"
}
```

#### `POST /login`
**Deskripsi**: Login pengguna
**Body**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```
**Response**:
```json
{
  "success": true,
  "token": "jwt_token_here"
}
```

### Analisis Meeting (Protected)

#### `POST /analyze-meeting`
**Deskripsi**: Menganalisis meeting note + gambar
**Headers**: `Authorization: Bearer {jwt_token}`
**Content-Type**: `multipart/form-data`

**Body**:
```
note: "Meeting text notes here..."
image: (file) - Screenshot/gambar meeting
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "summary": "Meeting summary text...",
    "comparison_status": "MATCH|MISMATCH|PARTIAL",
    "comparison_note": "Detailed comparison result...",
    "extracted_data": "Extracted text/tables from image..."
  },
  "file": "https://drive.google.com/file/d/..."
}
```

### Service Account Management (Admin)

#### `GET /admin`
**Deskripsi**: Admin interface untuk mengelola service accounts
**Headers**: `Authorization: Bearer {jwt_token}`

#### `POST /admin/service-accounts`
**Deskripsi**: Tambah service account baru
**Headers**: `Authorization: Bearer {jwt_token}`
**Body**:
```json
{
  "name": "Production Account",
  "service_account_json": "{...}"
}
```

#### `GET /admin/service-accounts`
**Deskripsi**: Daftar semua service accounts
**Headers**: `Authorization: Bearer {jwt_token}`

#### `PUT /admin/service-accounts/:id/toggle`
**Deskripsi**: Aktifkan/non-aktifkan service account
**Headers**: `Authorization: Bearer {jwt_token}`
**Body**:
```json
{
  "is_active": true
}
```

#### `DELETE /admin/service-accounts/:id`
**Deskripsi**: Hapus service account
**Headers**: `Authorization: Bearer {jwt_token}`

#### `POST /admin/service-accounts/test`
**Deskripsi**: Test service account credentials
**Headers**: `Authorization: Bearer {jwt_token}`
**Body**:
```json
{
  "service_account_json": "{...}"
}
```

#### `POST /admin/service-accounts/assign`
**Deskripsi**: Assign service account ke user
**Headers**: `Authorization: Bearer {jwt_token}`
**Body**:
```json
{
  "user_id": 1,
  "service_account_id": 2
}
```

## ⚙️ Konfigurasi Environment

### File `.env`
```env
GEMINI_API_KEY=your_google_gemini_api_key
DRIVE_FOLDER_ID=your_google_drive_folder_id
JWT_SECRET=your_jwt_secret_key
```

### Google Service Account

**Multiple Configuration Options:**

1. **File-Based (Legacy)**:
   ```bash
   # Upload service-account.json ke project root
   ```

2. **Environment Variable (Alternative)**:
   ```env
   GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"your-project-id",...}
   ```

3. **Database Management (NEW - Recommended)**:
   - Use admin interface at `http://localhost:3000/admin`
   - Add multiple service accounts
   - Assign specific accounts to users
   - Dynamic switching without restart

**API Access Required:**
- Google Drive API
- Google Sheets API

### Google Sheets Structure
Spreadsheet harus memiliki 3 tabs:
1. **Summary** - Kolom: A(Timestamp), B(Note), C(Summary), D(Status), E(Comparison)
2. **Extracted** - Kolom: A(Timestamp), B(Extracted Data), C(Drive Link)
3. **Doc** - Kolom: A(Timestamp), B(Drive Link), C(Image Formula)

## 🛠️ Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast all-in-one JavaScript runtime
- **Framework**: [Elysia](https://elysiajs.com) - Modern web framework
- **Database**: SQLite dengan `bun:sqlite`
- **Authentication**: JWT dengan `@elysiajs/jwt`
- **AI**: Google Gemini AI dengan `@google/generative-ai`
- **Google APIs**: Google Sheets & Drive API dengan `googleapis`
- **TypeScript**: Full TypeScript support dengan strict mode

## 📦 Instalasi & Setup

### Prerequisites
- [Bun](https://bun.sh) v1.2.15+
- Google Cloud Project dengan APIs enabled
- Google Service Account JSON file

### Installation
```bash
# Clone repository
git clone <repository_url>
cd nyatet

# Install dependencies
bun install

# Setup environment
cp .env.example .env
# Edit .env dengan credentials Anda
```

### Google Setup
1. **Google Cloud Console**:
   - Enable Google Drive API & Google Sheets API
   - Create Service Account
   - Download service-account.json ke project root

2. **Google Drive**:
   - Buat folder untuk upload gambar
   - Copy folder ID ke `.env` (DRIVE_FOLDER_ID)
   - Share folder dengan service account email

3. **Google Sheets**:
   - Buat spreadsheet dengan 3 tabs (Summary, Extracted, Doc)
   - Share spreadsheet dengan service account email

### Running the Application
```bash
# Development
bun run index.ts

# Production
bun start
```

Server akan berjalan di `http://localhost:3000`

## 🧪 Testing

### Test Registrasi & Login
```bash
# Register user
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","spreadsheet_id":"your_sheet_id"}'

# Login
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Test Analisis Meeting
```bash
# Analyze meeting (ganti YOUR_JWT_TOKEN)
curl -X POST http://localhost:3000/analyze-meeting \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "note=Meeting discusses Q3 revenue targets" \
  -F "image=@path/to/meeting-screenshot.jpg"
```

### Test Service Account Management
```bash
# Test service account credentials
curl -X POST http://localhost:3000/admin/service-accounts/test \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"service_account_json":"{\"type\":\"service_account\",...}"}'

# Add new service account
curl -X POST http://localhost:3000/admin/service-accounts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"name":"Production","service_account_json":"{\"type\":\"service_account\",...}"}'

# List service accounts
curl -X GET http://localhost:3000/admin/service-accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Access admin interface
# Open browser: http://localhost:3000/admin
```

## 🔒 Keamanan

- ✅ JWT-based authentication
- ✅ Password hashing dengan Bun
- ✅ Environment variable untuk sensitive data
- ✅ Input validation dengan Elysia schemas
- ✅ SQL injection prevention (parameterized queries)

## 📝 Flow Proses

1. **User Authentication** → Register/Login → JWT Token
2. **Submit Analysis** → Upload note + gambar
3. **Image Processing** → Upload to Google Drive
4. **AI Analysis** → Gemini processes text + image
5. **Data Storage** → Save to 3 tabs di Google Sheets
6. **Response** → Return analysis results + file links

## 🤝 Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push ke branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is private and proprietary.

## 🆘 Troubleshooting

### Common Issues
- **Google API Error**: Pastikan service account.json benar dan APIs enabled
- **Drive Upload Failed**: Check folder sharing permissions
- **Sheets Access Error**: Pastikan spreadsheet di-share dengan service account
- **Gemini API Error**: Verify GEMINI_API_KEY valid dan quota available

### Debug Mode
Server logs akan menampilkan proses:
```
🦊 Business Analyst Assistant is running at localhost:3000
Analyzing with AI...
Saving to Spreadsheet...
```

---

**Created with ❤️ using [Bun](https://bun.sh) and [Elysia](https://elysiajs.com)**# nyatet
