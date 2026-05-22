import { Toaster } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Layout } from "./components/Layout";
import { HISTORY_QUERY_KEY } from "./hooks/useHistory";
import { EvalPage } from "./pages/EvalPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ReportingPage } from "./pages/ReportingPage";
import type { Tab } from "./types";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("eval");
  // Key counter forces EvalPage to fully unmount/remount on "New Evaluation"
  const [evalKey, setEvalKey] = useState(0);
  const queryClient = useQueryClient();

  const handleTabChange = useCallback(
    (tab: Tab) => {
      if (tab === "history" || tab === "reporting") {
        void queryClient.invalidateQueries({ queryKey: HISTORY_QUERY_KEY });
      }
      setActiveTab(tab);
    },
    [queryClient],
  );

  // Called by EvalPage's "New Evaluation" button — bump key to force full reset
  const handleNewEvaluation = useCallback(() => {
    setEvalKey((k) => k + 1);
    setActiveTab("eval");
  }, []);

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange}>
      {activeTab === "eval" ? (
        <EvalPage key={evalKey} onNewEvaluation={handleNewEvaluation} />
      ) : activeTab === "history" ? (
        <HistoryPage />
      ) : (
        <ReportingPage />
      )}
      <Toaster position="bottom-right" duration={3000} />
    </Layout>
  );
}
