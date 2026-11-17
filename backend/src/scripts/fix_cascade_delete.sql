-- ============================================================
-- SQL Script: ตั้งค่า ON DELETE CASCADE สำหรับทุกตารางที่เชื่อมกับ users
-- เพื่อให้สามารถลบบัญชีผู้ใช้ได้โดยไม่ติด Foreign Key Constraint
-- และเมื่อลบบัญชีแล้ว แชท, สินค้า, โพสต์ตามหา และประวัติที่เกี่ยวข้องจะหายทั้งหมด
--
-- วิธีใช้: นำคำสั่งทั้งหมดนี้ไปวางในหน้า Supabase Dashboard -> SQL Editor แล้วกด "Run"
-- ============================================================

-- 1. แก้ไขตารางธุรกรรมและนัดหมาย (Transactions & Appointments)
ALTER TABLE IF EXISTS public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_buyer_id_fkey,
  ADD CONSTRAINT transactions_buyer_id_fkey 
    FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_seller_id_fkey,
  ADD CONSTRAINT transactions_seller_id_fkey 
    FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.transactions 
  DROP CONSTRAINT IF EXISTS transactions_product_id_fkey,
  ADD CONSTRAINT transactions_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.appointments 
  DROP CONSTRAINT IF EXISTS appointments_transaction_id_fkey,
  ADD CONSTRAINT appointments_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.return_requests 
  DROP CONSTRAINT IF EXISTS return_requests_transaction_id_fkey,
  ADD CONSTRAINT return_requests_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

-- 2. แก้ไขตารางสินค้า (Products & Product Images)
ALTER TABLE IF EXISTS public.products 
  DROP CONSTRAINT IF EXISTS products_seller_id_fkey,
  ADD CONSTRAINT products_seller_id_fkey 
    FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.product_images 
  DROP CONSTRAINT IF EXISTS product_images_product_id_fkey,
  ADD CONSTRAINT product_images_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

-- 3. แก้ไขตารางโพสต์ตามหาสินค้า (Wanted Posts)
ALTER TABLE IF EXISTS public.wanted_posts 
  DROP CONSTRAINT IF EXISTS wanted_posts_buyer_id_fkey,
  ADD CONSTRAINT wanted_posts_buyer_id_fkey 
    FOREIGN KEY (buyer_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 4. แก้ไขตารางแชทและข้อความ (Conversations, Messages, Attachments)
ALTER TABLE IF EXISTS public.conversations 
  DROP CONSTRAINT IF EXISTS conversations_product_id_fkey,
  ADD CONSTRAINT conversations_product_id_fkey 
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.conversation_members 
  DROP CONSTRAINT IF EXISTS conversation_members_conversation_id_fkey,
  ADD CONSTRAINT conversation_members_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.conversation_members 
  DROP CONSTRAINT IF EXISTS conversation_members_user_id_fkey,
  ADD CONSTRAINT conversation_members_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.messages 
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey,
  ADD CONSTRAINT messages_conversation_id_fkey 
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.messages 
  DROP CONSTRAINT IF EXISTS messages_sender_id_fkey,
  ADD CONSTRAINT messages_sender_id_fkey 
    FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.message_attachments 
  DROP CONSTRAINT IF EXISTS message_attachments_message_id_fkey,
  ADD CONSTRAINT message_attachments_message_id_fkey 
    FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;

-- 5. แก้ไขรายการโปรด, รีวิว, รายงาน, และการแจ้งเตือน (Wishlists, Reviews, Reports, Notifications)
ALTER TABLE IF EXISTS public.wishlists 
  DROP CONSTRAINT IF EXISTS wishlists_user_id_fkey,
  ADD CONSTRAINT wishlists_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.wishlists 
  DROP CONSTRAINT IF EXISTS wishlists_listing_id_fkey,
  ADD CONSTRAINT wishlists_listing_id_fkey 
    FOREIGN KEY (listing_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.reviews 
  DROP CONSTRAINT IF EXISTS reviews_reviewer_id_fkey,
  ADD CONSTRAINT reviews_reviewer_id_fkey 
    FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.reviews 
  DROP CONSTRAINT IF EXISTS reviews_reviewee_id_fkey,
  ADD CONSTRAINT reviews_reviewee_id_fkey 
    FOREIGN KEY (reviewee_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.reviews 
  DROP CONSTRAINT IF EXISTS reviews_transaction_id_fkey,
  ADD CONSTRAINT reviews_transaction_id_fkey 
    FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.review_images 
  DROP CONSTRAINT IF EXISTS review_images_review_id_fkey,
  ADD CONSTRAINT review_images_review_id_fkey 
    FOREIGN KEY (review_id) REFERENCES public.reviews(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.reports 
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey,
  ADD CONSTRAINT reports_reporter_id_fkey 
    FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.notifications 
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey,
  ADD CONSTRAINT notifications_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 6. แก้ไขประวัติคะแนน, โทษ, ตั๋วสนับสนุน, ความสนใจ และ Auth tokens
ALTER TABLE IF EXISTS public.user_penalties 
  DROP CONSTRAINT IF EXISTS user_penalties_user_id_fkey,
  ADD CONSTRAINT user_penalties_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.user_score_history 
  DROP CONSTRAINT IF EXISTS user_score_history_user_id_fkey,
  ADD CONSTRAINT user_score_history_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.user_interests 
  DROP CONSTRAINT IF EXISTS user_interests_user_id_fkey,
  ADD CONSTRAINT user_interests_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE IF EXISTS public.support_tickets 
  DROP CONSTRAINT IF EXISTS support_tickets_user_id_fkey,
  ADD CONSTRAINT support_tickets_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 7. สคริปต์อัตโนมัติ: ค้นหาและตั้งค่า ON DELETE CASCADE ให้ Foreign Key ทุกตัวที่ชี้มายัง public.users(id)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tc.table_schema, 
            tc.table_name, 
            tc.constraint_name, 
            kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users'
          AND ccu.column_name = 'id'
          AND tc.table_schema = 'public'
    ) LOOP
        EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I;', r.table_schema, r.table_name, r.constraint_name);
        EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE CASCADE;', 
            r.table_schema, r.table_name, r.constraint_name, r.column_name);
    END LOOP;
END $$;
