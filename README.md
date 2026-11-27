# RMUTI Market

ตลาดซื้อขายสินค้ามือหนึ่ง–มือสองสำหรับนักศึกษาและบุคลากร มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน (มทร.อีสาน) ลงขาย แชท นัดรับในจุดปลอดภัยภายในมหาวิทยาลัย และยืนยันการพบกันด้วย GPS พร้อมระบบคะแนนความน่าเชื่อถือ (Trust Score) เพื่อลดปัญหาการเบี้ยวนัด

---

## ฟีเจอร์หลัก

- **สมัครและยืนยันตัวตน**: สมัครด้วยอีเมลมหาวิทยาลัย (`@rmuti.ac.th` / `@korat.rmuti.ac.th`) พร้อมยืนยันรหัส OTP ทางอีเมล (Mailjet) และป้องกันบอทด้วย Cloudflare Turnstile
- **ลงประกาศและค้นหาสินค้า**: อัปโหลดรูปภาพได้สูงสุด 5 รูป (บีบอัดอัตโนมัติและจัดเก็บใน Supabase Storage) ค้นหาและกรองตามหมวดหมู่ ช่วงราคา สภาพสินค้า และเรียงลำดับ พร้อมระบบ Wishlist
- **โพสต์ตามหาสินค้า (Want to Buy)**: ประกาศตามหาสินค้าพร้อมงบประมาณ ให้ผู้ขายเสนอสินค้าตรงเข้าห้องแชทได้ทันที
- **แชทเรียลไทม์ (Socket.IO)**: ห้องแชท 1 ต่อ 1 ที่ผูกกับรายการสินค้า รองรับการส่งรูปภาพ ข้อเสนอสินค้า และการ์ดนัดหมาย
- **นัดรับและเช็คอินด้วย GPS**: เลือกจุดนัดรับภายในมหาวิทยาลัยบนแผนที่ (Leaflet) และยืนยันตัวตนเมื่อถึงจุดนัดด้วย GPS (รัศมีไม่เกิน **50 เมตร**, ความแม่นยำ GPS ไม่เกิน **35 เมตร**)
- **คะแนนความน่าเชื่อถือ (Trust Score)**: เริ่มต้นที่ **100 คะแนน** มีระบบตัดคะแนนเมื่อยกเลิกกระชั้นชิดหรือไม่มาตามนัด (No-Show เกิน **45 นาที** หลังเวลานัด) จำกัดสิทธิ์การขาย/เสนอขายเมื่อคะแนนต่ำกว่า **50 คะแนน** และมีระบบฟื้นฟูคะแนนรายสัปดาห์
- **รีวิวและคืนสินค้า**: ให้คะแนน 1–5 ดาว เขียนรีวิวพร้อมรูปภาพหลังจบธุรกรรม และรองรับคำขอคืนสินค้า/ข้อพิพาท
- **ระบบผู้ดูแลระบบ (Admin Console)**: แดชบอร์ดสถิติภาพรวม จัดการผู้ใช้ ซ่อน/ตรวจสอบประกาศที่ผิดระเบียบ จัดการหมวดหมู่ รีวิว และรายงานปัญหา

---

## Tech Stack

| ส่วน | เทคโนโลยี |
|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Zustand, React Router, Lucide React, Leaflet (`react-leaflet`), Socket.IO Client |
| **Backend** | Node.js, Express.js, Socket.IO, JWT, Bcrypt, Multer, Express Rate Limit, Helmet |
| **Database & Storage** | Supabase (PostgreSQL + Supabase Storage) |
| **Email & Security** | Mailjet API (ส่ง OTP), Cloudflare Turnstile |

---

## โครงสร้างโปรเจกต์

```text
campusmarket-frontend/
├── frontend/                   # React + Vite + Tailwind CSS + Zustand
│   ├── public/
│   ├── src/
│   │   ├── assets/             # รูปภาพและไฟล์ประกอบ
│   │   ├── components/         # UI, Layout, Chat, Meetup, Product Components
│   │   ├── constants/          # หมวดหมู่สินค้า และจุดนัดรับในมหาวิทยาลัย
│   │   ├── layouts/            # MainLayout, AuthLayout, AdminLayout
│   │   ├── lib/                # Axios API client และ utilities
│   │   ├── pages/              # หน้าเว็บทั้งหมด (Home, Product, Chat, Meetup, Profile, Admin, Auth)
│   │   ├── routes/             # AppRoutes และ PrivateRoute
│   │   ├── services/           # productService และ Socket.IO client
│   │   ├── store/              # Zustand stores
│   │   ├── styles/             # Tailwind CSS และ theme
│   │   └── utils/              # บีบอัดรูป, วันที่/เวลา, ระยะทาง, แปลงค่าเงิน
│   ├── .env
│   └── package.json
├── backend/                    # Node.js + Express + Socket.IO + Supabase
│   ├── src/
│   │   ├── config/             # ตั้งค่า Supabase client และ constants
│   │   ├── controllers/        # Business logic ของแต่ละโมดูล
│   │   ├── middleware/         # userAuth, adminAuth, trustGuard, rateLimiter, errorHandler
│   │   ├── routes/             # Express API routes
│   │   ├── scripts/            # สคริปต์สร้าง Admin และ SQL migrations
│   │   ├── services/           # Socket.IO, Mailjet, OTP
│   │   ├── utils/              # response helper, status helper, validators, notify
│   │   └── server.js           # Entry point (Express + Socket.IO + Background Jobs)
│   ├── .env.example
│   └── package.json
├── .gitignore
└── README.md
```

---

## เริ่มต้นใช้งาน

**สิ่งที่ต้องมี:** Node.js 18+ (แนะนำ 20+), บัญชี Supabase (PostgreSQL + Storage) และ Mailjet API Key

```bash
git clone https://github.com/anonnat04/RmutiMarket.git
cd RmutiMarket
```

### 1. ติดตั้งและรัน Backend

```bash
cd backend
cp .env.example .env      # แก้ไขค่า Supabase, JWT และ Mailjet ใน .env
npm install
npm run dev               # รันเซิร์ฟเวอร์ที่ http://localhost:4000
```

> สามารถสร้างบัญชีผู้ดูแลระบบเริ่มต้นได้ด้วยคำสั่ง `npm run seed:admin`

### 2. ติดตั้งและรัน Frontend (เปิดอีก Terminal)

```bash
cd frontend
npm install
```

สร้างไฟล์ `frontend/.env` แล้วกำหนด URL ของ Backend:

```env
VITE_API_BASE_URL=http://localhost:4000
```

จากนั้นรัน Frontend:

```bash
npm run dev               # เปิดใช้งานที่ http://localhost:5173
```

### ตั้งค่าฐานข้อมูล (Supabase PostgreSQL)

1. สร้างโปรเจกต์บน [Supabase](https://supabase.com) และสร้าง Storage Bucket ชื่อ `campus-market` (ตั้งค่าให้ตรงกับ `SUPABASE_STORAGE_BUCKET`)
2. นำ `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` และ `SUPABASE_ANON_KEY` จาก Project Settings → API มาใส่ใน `backend/.env`
3. หากต้องการอัปเดตสคีมาเพิ่มเติม สามารถรันไฟล์ SQL ใน `backend/src/scripts/` (เช่น `add_appointment_meeting_detail.sql`, `add_unconfirmed_status.sql`, `fix_cascade_delete.sql`) ผ่าน Supabase SQL Editor

---

## Environment Variables

### Backend (`backend/.env`)

| ตัวแปร | ใช้ทำอะไร | ตัวอย่าง |
|---|---|---|
| `PORT` | พอร์ตของ Backend API และ Socket.IO | `4000` |
| `NODE_ENV` | โหมดการทำงาน (`development` / `production`) | `development` |
| `CLIENT_ORIGIN` | Origin ของ Frontend สำหรับ CORS (คั่นหลายค่าด้วย `,`) | `http://localhost:5173` |
| `SUPABASE_URL` | URL ของโปรเจกต์ Supabase | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service Role Key สำหรับเชื่อมต่อ DB จากฝั่ง Server | `(จาก Supabase Dashboard)` |
| `SUPABASE_ANON_KEY` | Anon Key ของ Supabase | `(จาก Supabase Dashboard)` |
| `SUPABASE_STORAGE_BUCKET` | ชื่อ Bucket สำหรับเก็บรูปสินค้า/แชท/รีวิว | `campus-market` |
| `JWT_SECRET` | คีย์สำหรับเซ็น User Access Token (`JWT_EXPIRES_IN=7d`) | `(สุ่มเอง)` |
| `ADMIN_JWT_SECRET` | คีย์สำหรับเซ็น Admin Token (`ADMIN_JWT_EXPIRES_IN=8h`) | `(สุ่มเอง)` |
| `MAILJET_API_KEY` | API Key ของ Mailjet สำหรับส่งอีเมล OTP | `(จาก Mailjet)` |
| `MAILJET_SECRET_KEY` | Secret Key ของ Mailjet | `(จาก Mailjet)` |
| `MAILJET_SENDER_EMAIL` | อีเมลผู้ส่ง OTP | `noreply@rmuti.ac.th` |
| `MAILJET_SENDER_NAME` | ชื่อผู้ส่งในอีเมล | `RMUTI Market` |
| `TURNSTILE_SECRET` | Secret Key ของ Cloudflare Turnstile (เว้นว่างได้ใน dev) | |
| `MAX_FILE_SIZE` | ขนาดไฟล์อัปโหลดสูงสุด (bytes) | `5242880` |

### Frontend (`frontend/.env`)

| ตัวแปร | ใช้ทำอะไร | ตัวอย่าง |
|---|---|---|
| `VITE_API_BASE_URL` | URL หลักของ Backend API และ Socket.IO | `http://localhost:4000` |

---

## การตรวจสอบสถานะเซิร์ฟเวอร์

สามารถตรวจสอบการทำงานของ Backend หลังรันได้ผ่าน Health Check Endpoint:

```bash
GET http://localhost:4000/api/health
```

---

## ข้อจำกัดที่ทราบ

- ยังไม่มีระบบชำระเงินออนไลน์ (เป็นการตกลงซื้อขายและนัดรับสินค้าด้วยตนเองภายในมหาวิทยาลัย)
- การเช็คอิน GPS ขึ้นอยู่กับความแม่นยำของสัญญาณอุปกรณ์ โดยเฉพาะเมื่ออยู่ภายในอาคาร (ระบบจำกัดความคลาดเคลื่อนไม่เกิน 35 เมตร และรัศมีจุดนัดรับ 50 เมตร)

---

## Roadmap

- [ ] Web Push Notification นอกเหนือจากการแจ้งเตือนเรียลไทม์บนหน้าเว็บ
- [ ] ปรับโครงสร้างโปรเจกต์ตามแผน Refactor (Layered Architecture & Feature-based Modules)
- [ ] รองรับการใช้งานแบบ PWA / แอปมือถือเต็มรูปแบบ

---

## ผู้พัฒนา

ทีมพัฒนาระบบ RMUTI Market — มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน

---

## License

MIT License
