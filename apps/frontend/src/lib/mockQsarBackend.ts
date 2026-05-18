export type DatasetProfile = {
  sessionId: string;
  id: string;
  matrixName: string;
  vectorName: string;
  rows: number;
  descriptors: number;
  source: "uploaded" | "filtered";
};

export type FilterSettings = {
  varCut: number;
  corrCut: number;
  autocorrCut: number;
  autoscale: boolean;
  ljTransform: boolean;
};

export type SelectionMethod = "ops" | "ga";

export type SelectionSettings = {
  method: SelectionMethod;
  latentVarsModel: number;
  latentVarsOps: number;
  varsPercentage: number;
  minVarsModel: number;
  maxVarsModel: number;
  populationSize: number;
  generations: number;
};

export type SelectionResult = {
  sessionId: string;
  method: SelectionMethod;
  selectedDescriptors: number;
  latentVariables: number;
  q2: number;
  r2: number;
  validationPassed: boolean;
};

export type ValidationSettings = {
  runCrossValidation: boolean;
  runYRandomization: boolean;
  runLNO: boolean;
  runExternalValidation: boolean;
  yrandCutoff: number;
  lnoCutoff: number;
  testSetRatio: number;
};

export type ValidationResult = {
  cv?: { q2: number; rmse: number };
  yr?: { score: number; passed: boolean };
  lno?: { score: number; passed: boolean };
  ext?: { r2Pred: number; rmsep: number };
};

const API_BASE = process.env.NEXT_PUBLIC_QSAR_API_BASE ?? "http://127.0.0.1:8000";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function loadDataset(matrixFile: File, vectorFile: File): Promise<DatasetProfile> {
  const formData = new FormData();
  formData.append("matrix_file", matrixFile);
  formData.append("vector_file", vectorFile);

  const response = await fetch(`${API_BASE}/load`, {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse<DatasetProfile>(response);
}

export async function runFilters(
  sessionId: string,
  settings: FilterSettings
): Promise<DatasetProfile> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/filters`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });

  return parseJsonResponse<DatasetProfile>(response);
}

export async function runSelection(
  sessionId: string,
  filterSettings: FilterSettings,
  selectionSettings: SelectionSettings
): Promise<SelectionResult> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/selection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filterSettings, selectionSettings }),
  });

  return parseJsonResponse<SelectionResult>(response);
}

export async function runValidations(
  sessionId: string,
  settings: ValidationSettings
): Promise<ValidationResult> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ validationSettings: settings }),
  });

  return parseJsonResponse<ValidationResult>(response);
}

export async function runPipeline(
  sessionId: string,
  filterSettings: FilterSettings,
  selectionSettings: SelectionSettings,
  validationSettings: ValidationSettings
): Promise<{
  dataset: DatasetProfile;
  selection: SelectionResult;
  validation: ValidationResult;
}> {
  const response = await fetch(`${API_BASE}/sessions/${sessionId}/pipeline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filterSettings,
      selectionSettings,
      validationSettings,
    }),
  });

  return parseJsonResponse<{
    dataset: DatasetProfile;
    selection: SelectionResult;
    validation: ValidationResult;
  }>(response);
}
