import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { DatasetMetadata } from "../../generated";
import { useState, useMemo } from "react";


export type GlobalBusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

export type WorkflowContextValue = {
  uploadedDataset: DatasetMetadata | null;
  activeDataset: DatasetMetadata | null;
  globalBusyState: GlobalBusyState;
  setUploadedDataset: Dispatch<SetStateAction<DatasetMetadata | null>>;
  setActiveDataset: Dispatch<SetStateAction<DatasetMetadata | null>>;
  setGlobalBusyState: Dispatch<SetStateAction<GlobalBusyState>>;
};

const WorkflowContext = createContext<WorkflowContextValue | null>(null);

type WorkflowProviderProps = {
  children: ReactNode;
};

export function WorkflowProvider({ children }: WorkflowProviderProps) {

  // Global shared state managed at App level
  const [uploadedDataset, setUploadedDataset] = useState<DatasetMetadata | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetMetadata | null>(null);
  const [globalBusyState, setGlobalBusyState] = useState<GlobalBusyState>("idle");

  // Create context value for WorkflowProvider
  const workflowContextValue = useMemo<WorkflowContextValue>(
    () => ({
      uploadedDataset,
      activeDataset,
      globalBusyState,
      setUploadedDataset,
      setActiveDataset,
      setGlobalBusyState,
    }),
    [uploadedDataset, activeDataset, globalBusyState],
  );
  return <WorkflowContext.Provider value={workflowContextValue}>{children}</WorkflowContext.Provider>;
}

export function useWorkflowContext() {
  const context = useContext(WorkflowContext);

  if (!context) {
    throw new Error("useWorkflowContext must be used within a WorkflowProvider");
  }

  return context;
}
