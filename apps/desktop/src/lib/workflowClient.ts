import { invoke } from "@tauri-apps/api/core";
import type {
  DatasetProfile,
  FilterSettings,
  SelectionMethod,
  SelectionResult,
  SelectionSettings,
  ValidationResult,
  ValidationSettings,
} from "../lib/mockQsarBackend";

export type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

export type WorkflowSnapshot = {
  uploadedDataset: DatasetProfile | null;
  activeDataset: DatasetProfile | null;
  selectionResult: SelectionResult | null;
  validationResult: ValidationResult | null;
  busyState: BusyState;
  error: string | null;
  history: string[];
  filterSettings: FilterSettings;
  selectionSettings: SelectionSettings;
  validationSettings: ValidationSettings;
};

export type FilterSettingsPatch = Partial<FilterSettings>;
export type SelectionSettingsPatch = Partial<Omit<SelectionSettings, "method">> & {
  method?: SelectionMethod;
};
export type ValidationSettingsPatch = Partial<ValidationSettings>;

export async function getWorkflowSnapshot(): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("get_workflow_snapshot");
}

export async function updateFilterSettings(patch: FilterSettingsPatch): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("update_filter_settings", { patch });
}

export async function updateSelectionSettings(patch: SelectionSettingsPatch): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("update_selection_settings", { patch });
}

export async function updateValidationSettings(patch: ValidationSettingsPatch): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("update_validation_settings", { patch });
}

export async function loadDataset(matrixPath: string, vectorPath: string): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("load_dataset", {
    input: {
      matrixPath,
      vectorPath,
    },
  });
}

export async function runFilters(): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("run_descriptor_filters");
}

export async function runSelection(): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("run_variable_selection");
}

export async function runValidations(): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("run_validation_suite");
}

export async function runPipeline(): Promise<WorkflowSnapshot> {
  return invoke<WorkflowSnapshot>("run_full_pipeline");
}
