import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    // ล้าง localStorage ที่อาจเสียหายหรือค้าง แล้วรีเฟรช
    try {
      localStorage.removeItem("rmuti-auth");
      localStorage.removeItem("cm-feed-storage");
    } catch {}
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-gray-100 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-500 mx-auto flex items-center justify-center mb-4">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 mb-2">
              เกิดข้อผิดพลาดในการโหลดหน้าเว็บ
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 mb-6">
              ระบบตรวจพบข้อผิดพลาดที่ไม่คาดคิด สามารถกดรีเฟรชหรือล้างแคชเพื่อเข้าสู่ระบบใหม่ได้
            </p>

            {this.state.error && (
              <div className="text-left bg-gray-50 rounded-2xl p-4 mb-6 border border-gray-100 overflow-auto max-h-48 text-xs font-mono text-red-600">
                <p className="font-bold mb-1">{this.state.error.toString()}</p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[10px] text-gray-400 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#f95721] hover:bg-orange-600 text-white font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <RefreshCw size={14} /> รีเฟรชหน้านี้
              </button>
              <button
                onClick={this.handleReset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-all active:scale-95"
              >
                <Home size={14} /> ล้างข้อมูล & กลับหน้าแรก
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
