import { createContext, useContext, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { DatasetMetadata } from "../../generated";

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
  value: WorkflowContextValue;
  children: ReactNode;
};

export function WorkflowProvider({ value, children }: WorkflowProviderProps) {
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflowContext() {
  const context = useContext(WorkflowContext);

  if (!context) {
    throw new Error("useWorkflowContext must be used within a WorkflowProvider");
  }

  return context;
}
