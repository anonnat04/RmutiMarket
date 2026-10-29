import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from '@/layouts/MainLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PrivateRoute } from '@/routes/PrivateRoute';
import { HomePage } from '@/pages/home/HomePage';
import { ProductListPage } from '@/pages/product/ProductListPage';
import { ProductDetailPage } from '@/pages/product/ProductDetailPage';
import { CreateProductPage } from '@/pages/product/CreateProductPage';
import { EditProductPage } from '@/pages/product/EditProductPage';
import { MyProductsPage } from '@/pages/product/MyProductsPage';
import { WishlistPage } from '@/pages/profile/WishlistPage';
import { ProfilePage } from '@/pages/profile/ProfilePage';
import { ReviewsPage } from '@/pages/profile/ReviewsPage';
import { ChatPage } from '@/pages/chat/ChatPage';
import { NotificationsPage } from '@/pages/notification/NotificationsPage';
import { ScheduleMeetupPage } from '@/pages/meetup/ScheduleMeetupPage';
import { MeetupListPage } from '@/pages/meetup/MeetupListPage';
import { MeetupCheckInPage } from '@/pages/meetup/MeetupCheckInPage';
import { TransactionHistoryPage } from '@/pages/transaction/TransactionHistoryPage';
import { WantToBuyPage } from '@/pages/want-to-buy/WantToBuyPage';
import { CreateWantToBuyPage } from '@/pages/want-to-buy/CreateWantToBuyPage';
import { ComingSoonPage } from '@/components/common/ComingSoonPage';

// Auth Pages
import { RegisterPage } from '@/pages/auth/RegisterPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { InterestPickerPage } from '@/pages/auth/InterestPickerPage';

// Admin Pages
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage';
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage';
import { AdminListingsPage } from '@/pages/admin/AdminListingsPage';
import { AdminReviewsPage } from '@/pages/admin/AdminReviewsPage';
import { AdminCategoriesPage } from '@/pages/admin/AdminCategoriesPage';
import { AdminDisputesPage } from '@/pages/admin/AdminDisputesPage';

export function AppRoutes() {
  return (
    <Routes>
      {/* ─── Auth Routes (ใช้ AuthShell จาก campus-auth-app) ─── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<LoginPage />} />

      {/* ─── Interest Picker (Full-screen) ─── */}
      <Route path="/register/interests" element={<InterestPickerPage />} />

      {/* ─── Main Student Market Portal ─── */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<ProductListPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/want-to-buy" element={<WantToBuyPage />} />

        {/* User Authenticated Pages */}
        <Route element={<PrivateRoute />}>
          <Route path="/products/create" element={<CreateProductPage />} />
          <Route path="/products/:id/edit" element={<EditProductPage />} />
          <Route path="/my-products" element={<MyProductsPage />} />
          <Route path="/wishlist" element={<WishlistPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:id" element={<ProfilePage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="/profile/:userId/reviews" element={<ReviewsPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/products/:id/meetup" element={<ScheduleMeetupPage />} />
          <Route path="/meetups" element={<MeetupListPage />} />
          {/* เพิ่มใหม่: route นี้หายไปทั้งที่ MeetupListPage.jsx มีลิงก์ไปหาอยู่แล้ว
              (<Link to={`/meetups/${m.id}/checkin`}>) ทำให้ React Router หาไม่เจอ
              แล้วโดน catch-all "*" ท้ายไฟล์เด้งกลับหน้าแรกทุกครั้งที่กด */}
          <Route path="/meetups/:id/checkin" element={<MeetupCheckInPage />} />
          <Route path="/transactions" element={<TransactionHistoryPage />} />
          <Route path="/want-to-buy/create" element={<CreateWantToBuyPage />} />
        </Route>
      </Route>

      {/* ─── Admin Management Portal ─── */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="listings" element={<AdminListingsPage />} />
        <Route path="reviews" element={<AdminReviewsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="disputes" element={<AdminDisputesPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}