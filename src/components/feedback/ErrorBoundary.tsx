import {Component, type ErrorInfo, type ReactNode} from 'react';
import {appLogger} from '@/src/lib/logger';
import {Alert} from '@/src/components/feedback/Alert';
import {Button} from '@/src/components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {hasError: false};
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {hasError: true};
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log sanitized error metadata internally without exposing stack traces in the UI
    appLogger.error('Unhandled React boundary error', {
      errorName: error.name,
      errorMessage: error.message,
      hasComponentStack: Boolean(info.componentStack),
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-8 max-w-lg px-4">
          <Alert
            variant="error"
            title={this.props.fallbackTitle ?? 'Something went wrong while displaying this section.'}
          >
            <p className="mb-3">
              {this.props.fallbackDescription ??
                'Please try refreshing this view. No sensitive details have been affected.'}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => this.setState({hasError: false})}
            >
              Try Again
            </Button>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}
