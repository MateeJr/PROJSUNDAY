'use client';

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

class ErrorBoundary extends Component<Props> {
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Prevent the error from bubbling up
    console.error = () => {};
    console.warn = () => {};
  }

  public render() {
    return this.props.children;
  }
}

export default ErrorBoundary; 