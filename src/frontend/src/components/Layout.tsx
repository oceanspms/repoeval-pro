import {
  Activity,
  BarChart2,
  Clock,
  Moon,
  PlusCircle,
  Sun,
} from "lucide-react";
import { useCacheStats } from "../hooks/useCacheStats";
import { useTheme } from "../hooks/useTheme";
import type { Tab } from "../types";

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const NAV_TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "eval",
    label: "New Evaluation",
    icon: <PlusCircle className="w-3.5 h-3.5" />,
  },
  { id: "history", label: "History", icon: <Clock className="w-3.5 h-3.5" /> },
  {
    id: "reporting",
    label: "Reporting Center",
    icon: <BarChart2 className="w-3.5 h-3.5" />,
  },
];

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { theme, toggle } = useTheme();
  const { data: cacheStats } = useCacheStats();

  const year = new Date().getFullYear();
  const hostname = encodeURIComponent(window.location.hostname);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-13 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
              <Activity
                className="w-3.5 h-3.5 text-accent"
                aria-hidden="true"
              />
            </div>
            <span className="font-display font-bold text-sm tracking-tight">
              <span className="text-accent">RepoEval</span>
              <span className="text-foreground"> Pro</span>
            </span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-mono font-semibold text-primary uppercase tracking-widest">
              v14
            </span>
          </div>

          <button
            type="button"
            data-ocid="theme.toggle"
            onClick={toggle}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="p-2 rounded-md hover:bg-muted transition-smooth text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Tab bar */}
        <div className="max-w-5xl mx-auto px-4 flex border-t border-border/60 bg-card">
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-ocid={`nav.${tab.id}_tab`}
              onClick={() => onTabChange(tab.id)}
              className={[
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-200 relative",
                activeTab === tab.id
                  ? "border-accent text-accent bg-accent/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/30",
              ].join(" ")}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "reporting" && activeTab !== "reporting" && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent/70 inline-block" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 bg-background">
        <div className="max-w-5xl mx-auto px-4 py-8">{children}</div>
      </main>

      {/* Footer */}
      <footer className="bg-card border-t border-border">
        <div className="max-w-5xl mx-auto px-4 h-10 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            © {year}.{" "}
            <a
              href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-smooth"
            >
              Built with love using caffeine.ai
            </a>
          </span>

          <div
            data-ocid="footer.cache_stats"
            className="flex items-center gap-3 text-xs text-muted-foreground font-mono"
          >
            {cacheStats && (
              <>
                <span>
                  cache:{" "}
                  <span className="text-accent">
                    {cacheStats.entries.toString()}
                  </span>{" "}
                  entries
                </span>
                {cacheStats.lastHit && (
                  <span className="text-accent/70 uppercase tracking-widest text-[10px]">
                    hit
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
