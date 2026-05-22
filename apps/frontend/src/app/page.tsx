"use client";

import { useMemo, useState } from "react";
import {
  Container,
  Title,
  Text,
  Paper,
  Group,
  Stack,
  FileInput,
  Button,
  NumberInput,
  Checkbox,
  Radio,
  Tooltip,
  Alert,
  Badge,
  Collapse,
  ActionIcon,
  ThemeIcon,
  Timeline,
  Box,
  Divider,
  useMantineColorScheme,
  RangeSlider,
  Slider
} from "@mantine/core";
import {
  IconCheck,
  IconAlertCircle,
  IconChevronDown,
  IconChevronUp,
  IconQuestionMark,
  IconUpload,
  IconPlayerPlay,
  IconDatabase,
  IconFilter,
  IconListCheck,
  IconSun,
  IconMoon
} from "@tabler/icons-react";
import {
  type DatasetProfile,
  type FilterSettings,
  type SelectionResult,
  type SelectionSettings,
  type ValidationResult,
  type ValidationSettings,
  loadDataset,
  runFilters,
  runSelection,
  runValidations,
  runPipeline,
} from "@/lib/mockQsarBackend";

function HelpTooltip ({ text }: { text: string; }) {
  return (
    <Tooltip label={text} multiline w={250} withArrow>
      <ActionIcon variant="light" size="xs" radius="xl" color="gray">
        <IconQuestionMark size="0.8rem" />
      </ActionIcon>
    </Tooltip>
  );
}

function ExpandableSection ({ title, children }: { title: string; children: React.ReactNode; }) {
  const [opened, setOpened] = useState(false);
  return (
    <Box mt="md">
      <Divider my="sm" />
      <Group
        onClick={() => setOpened((o) => !o)}
        style={{ cursor: "pointer" }}
        gap="xs"
      >
        {opened ? <IconChevronUp size="1.2rem" /> : <IconChevronDown size="1.2rem" />}
        <Text size="sm" fw={500} c="dimmed">
          {title}
        </Text>
      </Group>
      <Collapse in={opened}>
        <Box mt="md">{children}</Box>
      </Collapse>
    </Box>
  );
}

function ResultCard ({ title, children }: { title: string; children: React.ReactNode; }) {
  return (
    <Box mt="md">
      <Divider my="sm" />
      <Group gap="xs" mb="sm">
        <ThemeIcon color="green" size="sm" radius="xl" variant="light">
          <IconCheck size="0.8rem" />
        </ThemeIcon>
        <Text size="sm" fw={600} c="green">
          {title}
        </Text>
      </Group>
      <Box>{children}</Box>
    </Box>
  );
}

function NumberFieldWithTooltip ({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <NumberInput
      label={
        <Group gap="xs">
          {label}
          <HelpTooltip text={help} />
        </Group>
      }
      value={value}
      min={min}
      max={max}
      step={step}
      allowedDecimalSeparators={['.', ',']}
      onChange={(val) => onChange(Number(val) || 0)}
    />
  );
}

function SliderFieldWithTooltip ({
  label,
  help,
  value,
  min,
  max,
  step,
  onChange,
  inverted
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  inverted?: boolean;
}) {
  return (
    <Box>
      <Group gap="xs" mb="xs">
        <Text size="sm" fw={500}>{label}</Text>
        <HelpTooltip text={help} />
      </Group>
      <Group gap="md">
        <Slider
          label
          inverted={inverted}
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={onChange}
          style={{ flex: 1 }}
        />
        <NumberInput
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(val) => onChange(Number(val) || 0)}
          w={72}
          allowedDecimalSeparators={['.', ',']}
        />
      </Group>
    </Box>
  );
}

type BusyState = "idle" | "loading-data" | "filtering" | "selecting" | "validating";

export default function Home () {
  const { toggleColorScheme } = useMantineColorScheme();
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [vectorFile, setVectorFile] = useState<File | null>(null);

  const [uploadedDataset, setUploadedDataset] = useState<DatasetProfile | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetProfile | null>(null);
  const [selectionResult, setSelectionResult] = useState<SelectionResult | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    varCut: 0.3,
    corrCut: 0.25,
    autocorrCut: 0.85,
    autoscale: true,
    ljTransform: false,
  });

  const [selectionSettings, setSelectionSettings] = useState<SelectionSettings>({
    method: "ops",
    latentVarsModel: 6,
    latentVarsOps: 4,
    varsPercentage: 15,
    minVarsModel: 8,
    maxVarsModel: 30,
    populationSize: 80,
    generations: 40,
  });

  const [validationSettings, setValidationSettings] = useState<ValidationSettings>({
    runCrossValidation: true,
    runYRandomization: true,
    runLNO: true,
    runExternalValidation: true,
    yrandCutoff: 0.3,
    lnoCutoff: 0.1,
    testSetRatio: 0.2,
  });

  const busyCopy: Record<BusyState, { label: string; description: string; }> = {
    idle: {
      label: "Ready",
      description: "Choose the input files, then step through preprocessing, selection, and validation.",
    },
    "loading-data": {
      label: "Loading dataset",
      description: "The app is loading the uploaded CSV files into a backend session.",
    },
    filtering: {
      label: "Applying filters",
      description: "Descriptor cuts and transforms are being applied to the active matrix.",
    },
    selecting: {
      label: "Selecting variables",
      description: "OPS or GA is running against the filtered matrix.",
    },
    validating: {
      label: "Running validations",
      description: "Cross validation and stability checks are being evaluated.",
    },
  };

  const currentBusyCopy = busyCopy[busyState];

  const appendHistory = (message: string): void => {
    setHistory((current) => [
      `${new Date().toLocaleTimeString()} - ${message}`,
      ...current.slice(0, 7),
    ]);
  };

  const nextStepMessage = useMemo(() => {
    if (busyState !== "idle") {
      return `Wait for ${currentBusyCopy.label.toLowerCase()} to finish before moving on.`;
    }
    if (!matrixFile || !vectorFile) {
      return "Select both CSV files to unlock the dataset loader.";
    }
    if (!uploadedDataset) {
      return "Load the dataset first so preprocessing and selection can use the active matrix.";
    }
    if (!selectionResult) {
      return "Review the preprocessing settings, then run variable selection.";
    }
    if (!validationResult) {
      return "Run the validation suite to confirm model quality and stability.";
    }
    return "Try a different filter or selection configuration to compare outcomes.";
  }, [busyState, currentBusyCopy.label, matrixFile, vectorFile, uploadedDataset, selectionResult, validationResult]);

  const canRunFilters = Boolean(activeDataset) && busyState === "idle";
  const canRunSelection = Boolean(activeDataset) && busyState === "idle";
  const canRunValidation = Boolean(selectionResult) && busyState === "idle";
  const canRunPipeline = Boolean(matrixFile && vectorFile) && busyState === "idle";
  const canLoadData = Boolean(matrixFile && vectorFile) && busyState === "idle";

  async function handleLoadData (): Promise<void> {
    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before loading.");
      return;
    }
    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      setUploadedDataset(loaded);
      setActiveDataset(loaded);
      setSelectionResult(null);
      setValidationResult(null);
      appendHistory(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dataset.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunFilters (): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("filtering");
    try {
      const filtered = await runFilters(uploadedDataset.sessionId, filterSettings);
      setActiveDataset(filtered);
      setSelectionResult(null);
      setValidationResult(null);
      appendHistory(`Applied descriptor filters. Active matrix now has ${filtered.descriptors} descriptors.`);
    } catch (filterError) {
      setError(filterError instanceof Error ? filterError.message : "Failed to run descriptor filters.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunSelection (): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("selecting");
    try {
      const selected = await runSelection(uploadedDataset.sessionId, filterSettings, selectionSettings);
      setSelectionResult(selected);
      setValidationResult(null);
      appendHistory(
        `${selected.method.toUpperCase()} selected ${selected.selectedDescriptors} descriptors (Q² ${selected.q2.toFixed(3)}).`
      );
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to run variable selection.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunValidation (): Promise<void> {
    if (!uploadedDataset) return;
    setBusyState("validating");
    try {
      const results = await runValidations(uploadedDataset.sessionId, validationSettings);
      setValidationResult(results);
      appendHistory("Validation suite completed.");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Failed to run validations.");
    } finally {
      setBusyState("idle");
    }
  }

  async function handleRunPipeline (): Promise<void> {
    if (!matrixFile || !vectorFile) {
      setError("Select both X matrix and y vector files before running the full pipeline.");
      return;
    }

    setError("");
    setBusyState("loading-data");
    try {
      const loaded = await loadDataset(matrixFile, vectorFile);
      setUploadedDataset(loaded);
      setSelectionResult(null);
      setValidationResult(null);
      appendHistory(`Loaded dataset (${loaded.rows} rows, ${loaded.descriptors} descriptors).`);

      setBusyState("filtering");
      const pipeline = await runPipeline(
        loaded.sessionId,
        filterSettings,
        selectionSettings,
        validationSettings
      );
      setActiveDataset(pipeline.dataset);
      setSelectionResult(pipeline.selection);
      setValidationResult(pipeline.validation);
      appendHistory(`Applied descriptor filters. Active matrix now has ${pipeline.dataset.descriptors} descriptors.`);
      appendHistory(
        `${pipeline.selection.method.toUpperCase()} selected ${pipeline.selection.selectedDescriptors} descriptors (Q² ${pipeline.selection.q2.toFixed(3)}).`
      );
      appendHistory("Validation suite completed.");
      appendHistory("Full pipeline finished with backend results.");
    } catch (pipelineError) {
      setError(pipelineError instanceof Error ? pipelineError.message : "Failed to run the full pipeline.");
    } finally {
      setBusyState("idle");
    }
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Group justify="space-between" align="flex-start">
          <Box>
            <Text c="blue" fw={600} tt="uppercase" lts={2} size="sm">
              Guided workflow
            </Text>
            <Title order={1} mt="xs">
              QSAR Model Builder
            </Title>
            <Text c="dimmed" mt="sm">
              A guided workflow for QSAR model development. Follow the steps in order, and we&apos;ll help you at each stage with sensible defaults and detailed explanations.
            </Text>
          </Box>
          <ActionIcon
            onClick={() => toggleColorScheme()}
            variant="default"
            size="lg"
            aria-label="Toggle color scheme"
          >
            <IconSun className="mantine-light-hidden" stroke={1.5} />
            <IconMoon className="mantine-dark-hidden" stroke={1.5} />
          </ActionIcon>
        </Group>

        {error && (
          <Alert icon={<IconAlertCircle size="1rem" />} title="Error" color="red">
            {error}
          </Alert>
        )}

        {/* Step 1: Load Data */}
        <Paper withBorder p="lg" radius="md" shadow="sm">
          <Group justify="space-between" mb="md">
            <Group>
              <ThemeIcon size="lg" radius="xl" variant="light" color="blue">
                1
              </ThemeIcon>
              <Box>
                <Title order={3}>Load your data</Title>
                <Text size="sm" c="dimmed">Upload CSV files for the descriptor matrix (X) and target variable (y)</Text>
              </Box>
            </Group>
            {uploadedDataset && <IconCheck color="var(--mantine-color-green-6)" />}
          </Group>

          <Stack>
            <Group grow>
              <FileInput
                label="X matrix (.csv)"
                placeholder="Choose file"
                accept=".csv"
                value={matrixFile}
                onChange={setMatrixFile}
                leftSection={<IconUpload size="1rem" />}
              />
              <FileInput
                label="y vector (.csv)"
                placeholder="Choose file"
                accept=".csv"
                value={vectorFile}
                onChange={setVectorFile}
                leftSection={<IconUpload size="1rem" />}
              />
            </Group>
            <Box>
              <Button
                onClick={handleLoadData}
                disabled={!canLoadData}
                loading={busyState === "loading-data"}
                leftSection={<IconDatabase size="1rem" />}
              >
                Load dataset
              </Button>
            </Box>
          </Stack>

          {uploadedDataset && (
            <ResultCard title="Dataset loaded successfully">
              <Group grow>
                <Box>
                  <Text size="xs" c="dimmed">Rows:</Text>
                  <Text fw={600}>{uploadedDataset.rows}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Descriptors:</Text>
                  <Text fw={600}>{uploadedDataset.descriptors}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Files:</Text>
                  <Text fw={600} size="sm">{uploadedDataset.matrixName}, {uploadedDataset.vectorName}</Text>
                </Box>
              </Group>
            </ResultCard>
          )}
        </Paper>

        {/* Step 2: Preprocessing */}
        <Paper withBorder p="lg" radius="md" shadow="sm" opacity={!uploadedDataset ? 0.5 : 1}>
          <Group justify="space-between" mb="md">
            <Group>
              <ThemeIcon size="lg" radius="xl" variant="light" color="blue">
                2
              </ThemeIcon>
              <Box>
                <Title order={3}>Filter descriptors</Title>
                <Text size="sm" c="dimmed">Remove noisy variables before model selection</Text>
              </Box>
            </Group>
            {activeDataset?.source === "filtered" && <IconCheck color="var(--mantine-color-green-6)" />}
          </Group>

          {uploadedDataset ? (
            <Stack>
              <Paper p="md" radius="sm">
                <Text size="sm" fw={500} mb="sm">Basic settings (recommended for most datasets)</Text>
                <Box>
                  <SliderFieldWithTooltip
                    label="Variance cut"
                    help="Removes descriptors with low variance across samples. Higher values filter more aggressively."
                    value={filterSettings.varCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setFilterSettings((prev) => ({ ...prev, varCut: v }))}
                  />

                  <SliderFieldWithTooltip
                    label="Correlation cut"
                    help="Removes highly correlated descriptors to reduce multicollinearity. Higher values filter more aggressively."
                    value={filterSettings.corrCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setFilterSettings((prev) => ({ ...prev, corrCut: v }))}
                  />

                  <SliderFieldWithTooltip
                    label="Autocorrelation cut"
                    help="Removes descriptors with high autocorrelation within themselves. Lower values filter more aggressively."
                    inverted
                    value={filterSettings.autocorrCut}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setFilterSettings((prev) => ({ ...prev, autocorrCut: v }))}
                  />
                </Box>
              </Paper>

              <ExpandableSection title="Fine-tune settings">
                <Stack gap="sm">
                  <Checkbox
                    label={<Text size="sm">Autoscale <Text span c="dimmed">(mean-center and scale to unit variance)</Text></Text>}
                    checked={filterSettings.autoscale}
                    onChange={(e) => setFilterSettings((prev) => ({ ...prev, autoscale: e.currentTarget.checked }))}
                  />
                  <Checkbox
                    label={<Text size="sm">LJ transform <Text span c="dimmed">(apply Lennard-Jones descriptor transformation)</Text></Text>}
                    checked={filterSettings.ljTransform}
                    onChange={(e) => setFilterSettings((prev) => ({ ...prev, ljTransform: e.currentTarget.checked }))}
                  />
                </Stack>
              </ExpandableSection>

              <Box>
                <Button
                  onClick={handleRunFilters}
                  disabled={!canRunFilters}
                  loading={busyState === "filtering"}
                  variant="default"
                  leftSection={<IconFilter size="1rem" />}
                >
                  Apply filters
                </Button>
              </Box>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Load a dataset first to enable filtering.</Text>
          )}

          {activeDataset?.source === "filtered" && (
            <ResultCard title="Filters applied successfully">
              <Group grow>
                <Box>
                  <Text size="xs" c="dimmed">Active descriptors:</Text>
                  <Text fw={600}>{activeDataset.descriptors}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Removed:</Text>
                  <Text fw={600}>{uploadedDataset ? uploadedDataset.descriptors - activeDataset.descriptors : 0}</Text>
                </Box>
              </Group>
            </ResultCard>
          )}
        </Paper>

        {/* Step 3: Selection */}
        <Paper withBorder p="lg" radius="md" shadow="sm" opacity={!activeDataset ? 0.5 : 1}>
          <Group justify="space-between" mb="md">
            <Group>
              <ThemeIcon size="lg" radius="xl" variant="light" color="blue">
                3
              </ThemeIcon>
              <Box>
                <Title order={3}>Select variables</Title>
                <Text size="sm" c="dimmed">Choose the best subset of descriptors for your model</Text>
              </Box>
            </Group>
            {selectionResult && <IconCheck color="var(--mantine-color-green-6)" />}
          </Group>

          {activeDataset ? (
            <Stack>
              <Paper p="md" radius="sm">
                <Text size="sm" fw={500} mb="sm">Choose selection method</Text>
                <Radio.Group
                  value={selectionSettings.method}
                  onChange={(v: "ops" | "ga") => setSelectionSettings((prev) => ({ ...prev, method: v }))}
                >
                  <Group mt="xs">
                    <Radio value="ops" label={<Text size="sm">OPS <Text span size="xs" c="dimmed">(Orthogonal Projections to Latent Structures)</Text></Text>} />
                    <Radio value="ga" label={<Text size="sm">GA <Text span size="xs" c="dimmed">(Genetic Algorithm)</Text></Text>} />
                  </Group>
                </Radio.Group>
              </Paper>

              <Paper p="md" radius="sm">
                <Text size="sm" fw={500} mb="sm">Basic settings</Text>
                <Group grow>
                  <NumberFieldWithTooltip
                    label="Latent variables (model)"
                    help="Number of latent variables (PLS components) in the final model. Higher values provide better quality with longer calculations."
                    value={selectionSettings.latentVarsModel}
                    min={1}
                    max={30}
                    step={1}
                    onChange={(v) => setSelectionSettings((prev) => ({ ...prev, latentVarsModel: v }))}
                  />
                  {selectionSettings.method === "ops" && (
                    <NumberFieldWithTooltip
                      label="Latent variables (OPS)"
                      help="Number of latent variables used during OPS selection process. Higher values increase computational cost but may improve robustness."
                      value={selectionSettings.latentVarsOps}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(v) => setSelectionSettings((prev) => ({ ...prev, latentVarsOps: v }))}
                    />
                  )}
                </Group>
              </Paper>

              <ExpandableSection title={`${selectionSettings.method === "ops" ? "OPS" : "GA"} fine-tuning`}>
                <Stack gap="md">
                  {selectionSettings.method === "ops" ? (
                    <NumberFieldWithTooltip
                      label="Variables percentage"
                      help="Percentage of descriptors to evaluate during OPS selection. Lower values reduce search space but may miss optimal features."
                      value={selectionSettings.varsPercentage}
                      min={1}
                      max={60}
                      step={1}
                      onChange={(v) => setSelectionSettings((prev) => ({ ...prev, varsPercentage: v }))}
                    />
                  ) : (
                    <>
                      <Group grow>
                        <NumberFieldWithTooltip
                          label="Min vars per model"
                          help="Minimum number of descriptors in any candidate model. Higher values create more complex models but reduce overfitting risk."
                          value={selectionSettings.minVarsModel}
                          min={1}
                          max={50}
                          step={1}
                          onChange={(v) => setSelectionSettings((prev) => ({ ...prev, minVarsModel: v }))}
                        />
                        <NumberFieldWithTooltip
                          label="Max vars per model"
                          help="Maximum number of descriptors in any candidate model. Lower values favor simpler models; higher values allow more complex solutions."
                          value={selectionSettings.maxVarsModel}
                          min={2}
                          max={200}
                          step={1}
                          onChange={(v) => setSelectionSettings((prev) => ({ ...prev, maxVarsModel: v }))}
                        />
                      </Group>
                      <Group grow>
                        <NumberFieldWithTooltip
                          label="Population size"
                          help="Number of models in each generation of the genetic algorithm. Larger populations explore the search space better but increase computation time."
                          value={selectionSettings.populationSize}
                          min={20}
                          max={300}
                          step={1}
                          onChange={(v) => setSelectionSettings((prev) => ({ ...prev, populationSize: v }))}
                        />
                        <NumberFieldWithTooltip
                          label="Generations"
                          help="Number of generations to evolve in the genetic algorithm. More generations improve convergence but require longer computation."
                          value={selectionSettings.generations}
                          min={10}
                          max={500}
                          step={1}
                          onChange={(v) => setSelectionSettings((prev) => ({ ...prev, generations: v }))}
                        />
                      </Group>
                    </>
                  )}
                </Stack>
              </ExpandableSection>

              <Box>
                <Button
                  onClick={handleRunSelection}
                  disabled={!canRunSelection}
                  loading={busyState === "selecting"}
                  variant="default"
                  leftSection={<IconListCheck size="1rem" />}
                >
                  Run {selectionSettings.method.toUpperCase()}
                </Button>
              </Box>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Complete preprocessing first to enable variable selection.</Text>
          )}

          {selectionResult && (
            <ResultCard title="Selection completed">
              <Group grow>
                <Box>
                  <Text size="xs" c="dimmed">Method:</Text>
                  <Text fw={600}>{selectionResult.method.toUpperCase()}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Descriptors:</Text>
                  <Text fw={600}>{selectionResult.selectedDescriptors}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Q²:</Text>
                  <Text fw={600}>{selectionResult.q2.toFixed(3)}</Text>
                </Box>
              </Group>
              <Group grow mt="sm">
                <Box>
                  <Text size="xs" c="dimmed">R²:</Text>
                  <Text fw={600}>{selectionResult.r2.toFixed(3)}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">Latent variables:</Text>
                  <Text fw={600}>{selectionResult.latentVariables}</Text>
                </Box>
              </Group>
            </ResultCard>
          )}
        </Paper>

        {/* Step 4: Validation */}
        <Paper withBorder p="lg" radius="md" shadow="sm" opacity={!selectionResult ? 0.5 : 1}>
          <Group justify="space-between" mb="md">
            <Group>
              <ThemeIcon size="lg" radius="xl" variant="light" color="blue">
                4
              </ThemeIcon>
              <Box>
                <Title order={3}>Validate model</Title>
                <Text size="sm" c="dimmed">Run validation tests to confirm model quality and stability</Text>
              </Box>
            </Group>
            {validationResult && <IconCheck color="var(--mantine-color-green-6)" />}
          </Group>

          {selectionResult ? (
            <Stack>
              <Paper p="md" radius="sm">
                <Text size="sm" fw={500} mb="sm">Choose validation tests</Text>
                <Group>
                  <Checkbox
                    label="Cross validation"
                    checked={validationSettings.runCrossValidation}
                    onChange={(e) => setValidationSettings((prev) => ({ ...prev, runCrossValidation: e.currentTarget.checked }))}
                  />
                  <Checkbox
                    label="Y-randomization"
                    checked={validationSettings.runYRandomization}
                    onChange={(e) => setValidationSettings((prev) => ({ ...prev, runYRandomization: e.currentTarget.checked }))}
                  />
                  <Checkbox
                    label="Leave-N-Out"
                    checked={validationSettings.runLNO}
                    onChange={(e) => setValidationSettings((prev) => ({ ...prev, runLNO: e.currentTarget.checked }))}
                  />
                  <Checkbox
                    label="External validation"
                    checked={validationSettings.runExternalValidation}
                    onChange={(e) => setValidationSettings((prev) => ({ ...prev, runExternalValidation: e.currentTarget.checked }))}
                  />
                </Group>
              </Paper>

              <ExpandableSection title="Fine-tune thresholds">
                <Group grow>
                  <NumberFieldWithTooltip
                    label="Y-rand cutoff"
                    help="Threshold for Y-randomization test. Models above this are likely overfit."
                    value={validationSettings.yrandCutoff}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setValidationSettings((prev) => ({ ...prev, yrandCutoff: v }))}
                  />
                  <NumberFieldWithTooltip
                    label="LNO cutoff"
                    help="Threshold for Leave-N-Out test. Lower values are stricter; higher values accept more variation."
                    value={validationSettings.lnoCutoff}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(v) => setValidationSettings((prev) => ({ ...prev, lnoCutoff: v }))}
                  />
                  <NumberFieldWithTooltip
                    label="Test set ratio"
                    help="Fraction of data to use for external validation."
                    value={validationSettings.testSetRatio}
                    min={0.1}
                    max={0.5}
                    step={0.01}
                    onChange={(v) => setValidationSettings((prev) => ({ ...prev, testSetRatio: v }))}
                  />
                </Group>
              </ExpandableSection>

              <Group mt="md">
                <Button
                  onClick={handleRunValidation}
                  disabled={!canRunValidation}
                  loading={busyState === "validating"}
                  variant="default"
                  leftSection={<IconListCheck size="1rem" />}
                >
                  Run validation
                </Button>
                <Button
                  onClick={handleRunPipeline}
                  disabled={!canRunPipeline}
                  loading={busyState !== "idle" && busyState !== "validating"}
                  color="orange"
                  leftSection={<IconPlayerPlay size="1rem" />}
                >
                  Run full pipeline
                </Button>
              </Group>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">Complete variable selection first to enable validation.</Text>
          )}

          {validationResult && (
            <ResultCard title="Validation completed">
              <Stack gap="xs" mt="sm">
                {validationResult.cv && (
                  <Group justify="space-between">
                    <Text size="sm">Cross validation Q²:</Text>
                    <Text size="sm" fw={600}>{validationResult.cv.q2.toFixed(3)}</Text>
                  </Group>
                )}
                {validationResult.yr && (
                  <Group justify="space-between">
                    <Text size="sm">Y-randomization:</Text>
                    <Text size="sm" fw={600} c={validationResult.yr.passed ? "green" : "red"}>
                      {validationResult.yr.score.toFixed(3)} {validationResult.yr.passed ? "✓ PASS" : "✗ FAIL"}
                    </Text>
                  </Group>
                )}
                {validationResult.lno && (
                  <Group justify="space-between">
                    <Text size="sm">Leave-N-Out:</Text>
                    <Text size="sm" fw={600} c={validationResult.lno.passed ? "green" : "red"}>
                      {validationResult.lno.score.toFixed(3)} {validationResult.lno.passed ? "✓ PASS" : "✗ FAIL"}
                    </Text>
                  </Group>
                )}
                {validationResult.ext && (
                  <Group justify="space-between">
                    <Text size="sm">External validation R²pred:</Text>
                    <Text size="sm" fw={600}>{validationResult.ext.r2Pred.toFixed(3)}</Text>
                  </Group>
                )}
              </Stack>
            </ResultCard>
          )}
        </Paper>

        {/* Workflow Timeline */}
        {history.length > 0 && (
          <Paper withBorder p="lg" radius="md" shadow="sm">
            <Title order={3} mb="lg">Workflow history</Title>
            <Timeline active={history.length} bulletSize={24} lineWidth={2}>
              {history.map((item, index) => {
                const [time, ...msgParts] = item.split(" - ");
                const msg = msgParts.join(" - ");
                return (
                  <Timeline.Item key={index} title={msg}>
                    <Text c="dimmed" size="xs" mt={4}>{time}</Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
