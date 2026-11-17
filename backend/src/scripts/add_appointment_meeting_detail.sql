-- รายละเอียดจุดนัดรับเพิ่มเติม แยกจาก location_detail ซึ่งเก็บข้อมูลจุดเดิม
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS meeting_detail varchar(300);

COMMENT ON COLUMN public.appointments.meeting_detail IS
  'รายละเอียดเพิ่มเติมที่ผู้ใช้นัดหมาย เช่น จุดรอหรือทางเข้าอาคาร';
