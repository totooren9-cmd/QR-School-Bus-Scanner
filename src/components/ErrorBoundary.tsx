import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  isFirestorePermissionError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    isFirestorePermissionError: false,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let message = error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
    let isPerm = false;

    try {
      const parsed = JSON.parse(error.message);
      if (parsed && parsed.operationType && parsed.error) {
        isPerm = String(parsed.error).toLowerCase().includes('permission') ||
          String(parsed.error).toLowerCase().includes('missing or insufficient');
        message = isPerm
          ? `ไม่มีสิทธิ์เข้าถึงข้อมูล Firebase (${parsed.operationType}: ${parsed.path || 'unknown'}) กรุณาเข้าสู่ระบบด้วยบัญชี Google ที่ได้รับสิทธิ์`
          : `ข้อผิดพลาด Firebase (${parsed.operationType}): ${parsed.error}`;
      }
    } catch {
      // Standard runtime error
    }

    return {
      hasError: true,
      errorMessage: message,
      isFirestorePermissionError: isPerm,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application ErrorBoundary caught:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, errorMessage: '', isFirestorePermissionError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-3xl p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">
                {this.state.isFirestorePermissionError
                  ? 'สิทธิ์การเชื่อมต่อ Firebase Firestore'
                  : 'เกิดข้อผิดพลาดในระบบ'}
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed break-words">
                {this.state.errorMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>โหลดหน้าใหม่</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
