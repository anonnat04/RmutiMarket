# 🛒 RmutiMarket (ระบบตลาดซื้อขายสินค้าภายในมหาวิทยาลัย)

<p align="center">
  <b>แพลตฟอร์มตลาดซื้อขายและส่งต่อสินค้ามือหนึ่ง-มือสอง ปลอดภัยภายในมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน (มทร.อีสาน)</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Frontend-React%20%7C%20Vite%20%7C%20TailwindCSS-blue" alt="Frontend" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20Socket.IO-green" alt="Backend" />
  <img src="https://img.shields.io/badge/Database-Supabase%20(PostgreSQL)-emerald" alt="Database" />
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License" />
</p>

---

## 📖 เกี่ยวกับโปรเจกต์ (About Project)

**RmutiMarket** เป็นเว็บแอปพลิเคชันตลาดกลางสำหรับนักศึกษาและบุคลากร มทร.อีสาน เพื่อใช้แลกเปลี่ยน ซื้อขาย และส่งต่อสิ่งของเครื่องใช้ เช่น หนังสือเรียน, อุปกรณ์การเรียน, เสื้อผ้า, เครื่องใช้ไฟฟ้า และของใช้หอพัก โดยเน้นการนัดรับสินค้าในพื้นที่ปลอดภัยภายในมหาวิทยาลัย (Campus Safe Zone) พร้อมระบบยืนยันตัวตนด้วยอีเมลสถาบัน เพื่อความปลอดภัยและความน่าเชื่อถือสูงสุดในการทำธุรกรรม

---

## ✨ ฟีเจอร์เด่นของระบบ (Key Features)

### 🛍️ 1. ระบบตลาดซื้อขายสินค้า (Marketplace & Listings)
- **ค้นหาและกรองสินค้า**: ค้นหาตามชื่อสินค้า, รายละเอียด, ช่วงราคา (Min - Max Range), สภาพสินค้า (มือหนึ่ง / มือสอง) และหมวดหมู่
- **จัดเรียงสินค้า**: เรียงตามสินค้าใหม่ล่าสุด, ราคาต่ำไปสูง, ราคาสูงไปต่ำ
- **หน้ารายละเอียดสินค้า**: แสดงแกลเลอรีรูปภาพแบบคมชัด, ข้อมูลสภาพสินค้า, ราคา, ประวัติและคะแนนผู้ขาย, ปุ่มส่งข้อความ และปุ่มเริ่มนัดรับสินค้า
- **รายการที่บันทึกไว้ (Wishlist)**: บันทึกสินค้าที่สนใจไว้ดูภายหลัง

### 📸 2. ระบบลงขายและจัดการประกาศ (Product Management)
- **ลงขายสินค้าสะดวกรวดเร็ว**: กรอกข้อมูลชื่อ หมวดหมู่ ราคา สภาพสินค้า และรายละเอียด
- **อัปโหลดรูปภาพสูงสุด 5 รูป**:
  - รองรับการอัปโหลดได้สูงสุด 5 รูป
  - ระบบบีบอัดรูปภาพอัตโนมัติก่อนส่งขึ้นคลาวด์ เพื่อให้โหลดหน้าเว็บได้รวดเร็วและประหยัดพื้นที่
  - กำหนดรูปภาพหน้าปก (Cover Image) และลากจัดลำดับรูปได้ง่ายดาย
- **จัดการสินค้าของฉัน**: ติดตามสถานะสินค้า (กำลังขาย / ติดจอง / ขายแล้ว) พร้อมแก้ไขข้อมูลหรือลบประกาศได้ตลอดเวลา

### 🙋‍♂️ 3. ระบบตามหาสินค้า (Want to Buy - WTB)
- โพสต์แจ้งความต้องการสินค้าที่กำลังตามหา พร้อมระบุงบประมาณที่ต้องการ
- แสดงแถบประกาศตามหาสินค้าล่าสุด (Marquee) บนหน้าแรก
- ผู้ขายสามารถกดส่งข้อเสนอสินค้าที่ตรงตามความต้องการให้กับผู้โพสต์ได้โดยตรงผ่านแชท

### 💬 4. ระบบแชทแบบเรียลไทม์ (Real-time Chat)
- สนทนาระหว่างผู้ซื้อและผู้ขายแบบ 1 ต่อ 1 ผ่าน **Socket.IO**
- ส่งข้อความและแนบรูปภาพในห้องแชทได้ทันที
- มีปุ่มลัดสำหรับส่งข้อเสนอซื้อขาย และนัดหมายส่งมอบสินค้าได้จากหน้าต่างแชท

### 📍 5. ระบบนัดรับสินค้าและจุดปลอดภัย (Meetup & Campus Safe Zone)
- กำหนดวัน เวลา และจุดนัดรับที่ปลอดภัยภายในมหาวิทยาลัย
- **Interactive Campus Map**: แสดงแผนที่และตำแหน่งจุดนัดรับยอดนิยมภายใน มทร.อีสาน (ด้วย Leaflet Map)
- **ระบบ Check-in**: ยืนยันเมื่อเดินทางถึงจุดนัดรับ
- ระบบยืนยันปิดการขายเมื่อได้รับสินค้าเรียบร้อย

### ⭐ 6. ระบบรีวิวและคะแนนความน่าเชื่อถือ (Reviews & Trust Score)
- ให้คะแนน (1-5 ดาว) เขียนรีวิว และแนบรูปภาพหลังจากการซื้อขายสำเร็จ
- ระบบคำนวณ **Trust Score** ของผู้ขายแบบไดนามิก เพื่อสร้างความมั่นใจให้กับผู้ซื้อ
- แสดงป้ายระดับความน่าเชื่อถือและสถานะการยืนยันตัวตนของนักศึกษา

### 🔔 7. ระบบการแจ้งเตือน (Notifications)
- แจ้งเตือนข้อความแชทใหม่
- แจ้งเตือนการนัดหมายและอัปเดตสถานะการซื้อขาย

### 🛡️ 8. ระบบผู้ดูแลระบบ (Admin Dashboard)
- แดชบอร์ดสรุปสถิติภาพรวม (จำนวนผู้ใช้, สินค้าที่ลงขาย, ธุรกรรมที่สำเร็จ, รายงานปัญหา)
- จัดการผู้ใช้งาน (ดูประวัติ, ระงับการใช้งานบัญชี / ปลดแบน)
- ตรวจสอบและจัดการรายงานปัญหา (Reports) จากผู้ใช้งาน
- จัดการหมวดหมู่สินค้าในระบบ

### 🔐 9. ความปลอดภัยและการยืนยันตัวตน (Authentication & Security)
- สมัครและเข้าสู่ระบบด้วยอีเมลมหาวิทยาลัย (`@rmuti.ac.th`, `@korat.rmuti.ac.th` ฯลฯ)
- ยืนยันรหัส OTP ผ่านอีเมล (Mailjet API)
- จัดเก็บรหัสผ่านอย่างปลอดภัยด้วยการเข้ารหัส Bcrypt
- ยืนยันความปลอดภัยด้วย JWT Authentication
- ป้องกันสแปมและบอทด้วย Cloudflare Turnstile

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

### **Frontend**
- **Core**: React 18, Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Maps**: Leaflet, React-Leaflet
- **State Management & Store**: Zustand / React Context

### **Backend**
- **Runtime & Framework**: Node.js, Express.js
- **Real-time Engine**: Socket.IO
- **Database Client**: `@supabase/supabase-js` (PostgreSQL)
- **File Upload**: Multer, Supabase Storage
- **Security & Auth**: JWT (jsonwebtoken), Bcrypt, Turnstile

### **Database & Cloud Services**
- **Database**: Supabase (PostgreSQL พร้อม Trigger & Stored Procedures)
- **Storage**: Supabase Storage Buckets
- **Email Service**: Mailjet SMTP / REST API

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
campusmarket-frontend/
├── frontend/                     # ซอร์สโค้ดฝั่งหน้าบ้าน (Client)
│   ├── src/
│   │   ├── assets/              # รูปภาพ โลโก้ และไอคอนต่างๆ
│   │   ├── components/          # Reusable Components (UI, Chat, Meetup, Product)
│   │   ├── layouts/             # โครงสร้าง Layout (MainLayout, AdminLayout)
│   │   ├── pages/               # หน้าเว็บต่างๆ (Home, Product, Chat, Meetup, Admin, Auth)
│   │   ├── routes/              # จัดการ Routing และ PrivateRoute
│   │   ├── services/            # API Services และ Socket connection
│   │   ├── store/               # State Store (Auth, Chat, Listings, ฯลฯ)
│   │   └── utils/               # ฟังก์ชันช่วยเหลือ (บีบอัดรูป, แปลงค่าเงิน, วันที่)
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # ซอร์สโค้ดฝั่งหลังบ้าน (API Server)
│   ├── src/
│   │   ├── config/              # ตั้งค่า Database Supabase และ Constants
│   │   ├── controllers/         # ควบคุม Logic การทำงาน (Auth, Listings, Chat, Admin ฯลฯ)
│   │   ├── middleware/          # ตรวจสอบสิทธิ์ (userAuth, adminAuth, rateLimiter)
│   │   ├── routes/              # กำหนด API Endpoints
│   │   ├── services/            # บริการภายนอก (Socket.IO, MailService, OTP)
│   │   └── utils/               # ตัวช่วยตรวจสอบข้อมูล (Validators, Status Helper)
│   ├── package.json
│   └── server.js
│
├── .gitignore
└── README.md
```

---

## 🚀 วิธีการติดตั้งและรันในเครื่อง (Getting Started)

### 1. โคลน Repository
```bash
git clone https://github.com/anonnat04/RmutiMarket.git
cd RmutiMarket
```

---

### 2. ติดตั้งและเริ่มทำงาน Backend

```bash
cd backend
npm install
```

สร้างไฟล์ `.env` ในโฟลเดอร์ `backend/` โดยอ้างอิงจาก `.env.example`:
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# Supabase Credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_STORAGE_BUCKET=campus-market

# JWT Secret
JWT_SECRET=your-secret-key-here

# Mailjet API (สำหรับส่ง OTP)
MAILJET_API_KEY=your-mailjet-api-key
MAILJET_SECRET_KEY=your-mailjet-secret-key
MAILJET_SENDER_EMAIL=your-sender-email@example.com
```

เริ่มรันเซิร์ฟเวอร์ Backend:
```bash
npm run dev
# เซิร์ฟเวอร์จะเปิดทำงานที่ http://localhost:5000
```

---

### 3. ติดตั้งและเริ่มทำงาน Frontend

เปิด Terminal ใหม่อีกหน้าต่างหนึ่ง:
```bash
cd frontend
npm install
```

สร้างไฟล์ `.env` ในโฟลเดอร์ `frontend/`:
```env
VITE_API_BASE_URL=http://localhost:5000
```

เริ่มรัน Frontend:
```bash
npm run dev
# เปิดใช้งานหน้าเว็บที่ http://localhost:5173
```

---

## 🧑‍💻 การนำโค้ดขึ้น GitHub (Git Workflow)

หากต้องการบันทึกการแก้ไขและส่งขึ้น GitHub ให้เป็นเวอร์ชันล่าสุด ใช้คำสั่งดังนี้:

```bash
# 1. ตรวจสอบไฟล์ที่แก้ไข
git status

# 2. เพิ่มไฟล์ทั้งหมดเข้า Staging
git add .

# 3. บันทึก Commit พร้อมข้อความอธิบายการแก้ไข
git commit -m "feat: limit product images to 5 and update project documentation"

# 4. ส่งขึ้น GitHub ไปยัง Branch main
git push origin main
```

---

## 📄 ใบอนุญาต (License)

โปรเจกต์นี้จัดทำขึ้นเพื่อการศึกษาและการใช้งานภายในมหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน ภายใต้สัญญาอนุญาต [MIT License](LICENSE)
