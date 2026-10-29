import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from '@/routes/AppRoutes';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { useAuthStore } from '@/store/authStore';

function App() {
  const verifyToken = useAuthStore((s) => s.verifyToken);

  // ตรวจสอบ token ทุกครั้งที่เปิดเว็บหรือรีเฟรชหน้า
  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
