import { useNavigate, useParams } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { SelfProfilePage } from './SelfProfilePage';
import { PublicProfilePage } from './PublicProfilePage';

export function ProfilePage() {
  const { id } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  // id จาก URL param (useParams) เป็น string เสมอ แต่ currentUser?.id จากฐานข้อมูล
  // (bigint) มักเป็น number — เทียบด้วย === ระหว่าง string กับ number จะได้ false เสมอ
  // จึงแปลงเป็น string ทั้งคู่ก่อนเทียบ
  const isSelf = !id || id === 'me' || String(id) === String(currentUser?.id);
  const targetId = isSelf ? (currentUser?.id || 'me') : id;

  if (isSelf) {
    return <SelfProfilePage user={currentUser} logout={logout} navigate={navigate} />;
  }
  return <PublicProfilePage targetId={targetId} navigate={navigate} />;
}