export function LandingFooter() {
  return (
    <footer className="border-t border-forge-border/20 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-forge-accent to-red-600 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">6-&#x03C7;</span>
          </div>
          <span className="text-sm font-medium text-forge-text-dim">Six-Chi</span>
        </div>

        <div className="flex items-center gap-6 text-xs text-forge-text-dim/50">
          <a
            href="https://github.com/Leigh12-93/forge"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-forge-text-dim transition-colors"
          >
            GitHub
          </a>
          <span>&copy; 2026 Six-Chi</span>
        </div>
      </div>
    </footer>
  )
}
