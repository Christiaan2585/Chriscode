import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

// Catches any uncaught error thrown while rendering the app (for example: a
// crash triggered by unexpected data from an import, or a bug in a page
// component) and shows a visible, recoverable error screen instead of
// letting the whole window go blank/black and stop responding.
//
// Without this, React unmounts the entire tree on any render-time exception
// and there is nothing left on screen at all - which is exactly what a
// "black, frozen" window looks like from the outside, with no error message
// anywhere the user can see (only in DevTools, if it happens to be open).
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Also goes to the terminal running `npm run dev` (and to DevTools if
    // it's open), so this is visible even if the on-screen message alone
    // isn't enough to diagnose the cause.
    console.error("Render crash caught by ErrorBoundary:", error, info);
    this.setState({ info });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-8">
          <div className="max-w-lg w-full bg-white border border-red-200 rounded-xl shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle size={28} />
              <h1 className="text-xl font-bold">Something went wrong</h1>
            </div>
            <p className="text-slate-600 text-sm">
              The app hit an unexpected error while displaying this screen. Your data in
              the database file has not been affected - this is just a display problem.
              Reloading usually fixes it.
            </p>
            <details className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
              <summary className="cursor-pointer font-medium text-slate-500">
                Technical details
              </summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {String(this.state.error?.message || this.state.error)}
                {this.state.info?.componentStack ? `\n\n${this.state.info.componentStack}` : ""}
              </pre>
            </details>
            <button
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              <RotateCcw size={16} /> Reload the app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
