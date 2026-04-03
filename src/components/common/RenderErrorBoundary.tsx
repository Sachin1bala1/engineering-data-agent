import React from "react";

type RenderErrorBoundaryProps = {
  children: React.ReactNode;
  title?: string;
};

type RenderErrorBoundaryState = {
  error: Error | null;
};

export class RenderErrorBoundary extends React.Component<RenderErrorBoundaryProps, RenderErrorBoundaryState> {
  state: RenderErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RenderErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("RenderErrorBoundary caught error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="font-semibold">{this.props.title || "Component failed to render"}</div>
          <div className="mt-2 whitespace-pre-wrap break-words font-mono text-xs">
            {this.state.error.message}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
