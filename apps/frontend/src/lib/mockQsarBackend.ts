export type DatasetProfile = {
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
  method: SelectionMethod;
  selectedDescriptors: number;
  latentVariables: number;
  q2: number;
  r2: number;
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

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const scoreByName = (text: string): number =>
  Array.from(text).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

export async function mockLoadDataset(
  matrixName: string,
  vectorName: string
): Promise<DatasetProfile> {
  await wait(850);
  const seed = scoreByName(`${matrixName}:${vectorName}`);
  const rows = 48 + (seed % 120);
  const descriptors = 180 + (seed % 540);
  return {
    id: `dataset-${seed}`,
    matrixName,
    vectorName,
    rows,
    descriptors,
    source: "uploaded",
  };
}

export async function mockRunFilters(
  dataset: DatasetProfile,
  settings: FilterSettings
): Promise<DatasetProfile> {
  await wait(1100);
  const filterPressure =
    settings.varCut * 0.35 + settings.corrCut * 0.3 + settings.autocorrCut * 0.3;
  const scaleBonus = settings.autoscale ? 0.03 : 0;
  const ljBonus = settings.ljTransform ? 0.02 : 0;
  const retention = clamp(1 - filterPressure + scaleBonus + ljBonus, 0.14, 0.95);
  return {
    ...dataset,
    id: `${dataset.id}-f`,
    descriptors: Math.max(8, Math.floor(dataset.descriptors * retention)),
    source: "filtered",
  };
}

export async function mockRunSelection(
  dataset: DatasetProfile,
  settings: SelectionSettings
): Promise<SelectionResult> {
  await wait(1200);
  const baseByComplexity = clamp(0.82 - dataset.descriptors / 1500, 0.55, 0.82);
  if (settings.method === "ops") {
    const selected = Math.max(
      6,
      Math.min(
        dataset.descriptors,
        Math.floor(dataset.descriptors * (settings.varsPercentage / 100))
      )
    );
    const q2 = clamp(baseByComplexity + settings.latentVarsOps * 0.01, 0.52, 0.89);
    return {
      method: "ops",
      selectedDescriptors: selected,
      latentVariables: settings.latentVarsModel,
      q2,
      r2: clamp(q2 + 0.07, 0.62, 0.96),
    };
  }

  const maxVars = Math.min(dataset.descriptors, settings.maxVarsModel);
  const selected = clamp(
    Math.floor((settings.minVarsModel + maxVars) / 2),
    6,
    dataset.descriptors
  );
  const evolutionGain = clamp(
    settings.populationSize / 400 + settings.generations / 500,
    0.02,
    0.12
  );
  const q2 = clamp(baseByComplexity + evolutionGain, 0.5, 0.91);
  return {
    method: "ga",
    selectedDescriptors: selected,
    latentVariables: settings.latentVarsModel,
    q2,
    r2: clamp(q2 + 0.06, 0.6, 0.97),
  };
}

export async function mockRunValidations(
  selection: SelectionResult,
  settings: ValidationSettings
): Promise<ValidationResult> {
  await wait(1000);
  const out: ValidationResult = {};

  if (settings.runCrossValidation) {
    out.cv = {
      q2: clamp(selection.q2 - 0.02, 0.45, 0.9),
      rmse: Number((0.38 - selection.q2 / 4).toFixed(3)),
    };
  }
  if (settings.runYRandomization) {
    const score = clamp(0.18 + (1 - selection.q2) * 0.25, 0.06, 0.42);
    out.yr = { score, passed: score <= settings.yrandCutoff };
  }
  if (settings.runLNO) {
    const score = clamp(0.07 + (1 - selection.q2) * 0.18, 0.03, 0.31);
    out.lno = { score, passed: score <= settings.lnoCutoff };
  }
  if (settings.runExternalValidation) {
    out.ext = {
      r2Pred: clamp(selection.r2 - settings.testSetRatio * 0.08, 0.42, 0.93),
      rmsep: Number((0.42 - selection.q2 / 5).toFixed(3)),
    };
  }
  return out;
}
