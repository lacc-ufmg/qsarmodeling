import { Badge, Box, Button, Group, Paper, Progress, SegmentedControl, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconGauge, IconListCheck, IconSparkles } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { NumberFieldWithTooltip } from "../ui/NumberFieldWithTooltip";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";
import type { DatasetMetadata, GAConfig, GAResult, OpsConfig, OpsResult } from "../../generated";
import type { GAProgressEvent } from "../../generated";
import { StatsRing } from "../ui/StatsRing";

type SelectionMode = "ops" | "ga";

type SelectionResult = OpsResult | GAResult;

type SelectionPanelProps = {
  activeDataset: DatasetMetadata | null;
  selectionMode: SelectionMode;
  selectionResult: SelectionResult | null;
  opsSelectionSettings: OpsConfig;
  gaSelectionSettings: GAConfig;
  gaProgress: GAProgressEvent | null;
  isLoading: boolean;
  isDisabled: boolean;
  onSelectionModeChange: (mode: SelectionMode) => void;
  onOpsSettingsChange: (patch: Partial<OpsConfig>) => void;
  onGaSettingsChange: (patch: Partial<GAConfig>) => void;
  onRunSelection: () => void;
};

function isGaResult(result: SelectionResult | null): result is GAResult {
  const isGa = result != null && "bestMask" in result;
  if (result) {
    console.log("Checking result type:", { isGa, resultKeys: Object.keys(result) });
  }
  return isGa;
}

function formatScore(value: number | null | undefined) {
  if (value == null) {
    console.warn("formatScore received null/undefined value:", value);
    return "N/A";
  }
  if (!isFinite(value)) {
    return "N/A";
  }
  return value.toFixed(3);
}

export function SelectionPanel({
  activeDataset,
  selectionMode,
  selectionResult,
  opsSelectionSettings,
  gaSelectionSettings,
  gaProgress,
  isLoading,
  isDisabled,
  onSelectionModeChange,
  onOpsSettingsChange,
  onGaSettingsChange,
  onRunSelection,
}: SelectionPanelProps) {
  const maxLatentVariables = activeDataset ? Math.max(1, Math.min(20, activeDataset.n_samples - 2, activeDataset.n_features)) : 1;
  const maxFeatureCount = activeDataset?.n_features ?? 1;
  const selectedCount = selectionResult
    ? isGaResult(selectionResult)
      ? selectionResult.selectedCount
      : selectionResult.selectedIndices.length
    : 0;
  const methodLabel = selectionMode === "ga" ? "GA" : "OPS";

  return (
    <StepCard
      step={3}
      title="Select variables"
      description="Choose the best subset of descriptors for your model"
      isComplete={Boolean(selectionResult)}
      disabled={isDisabled}
      futurePreview
    >
      {activeDataset ? (
        <Stack>
          <Paper p="md" radius="sm">
            <Group justify="space-between" align="center" mb="sm">
              <Text size="sm" fw={500}>
                Selection method
              </Text>
              <Badge variant="light" color={selectionMode === "ga" ? "grape" : "blue"} leftSection={selectionMode === "ga" ? <IconSparkles size="0.8rem" /> : <IconGauge size="0.8rem" />}>
                {methodLabel}
              </Badge>
            </Group>
            <SegmentedControl
              fullWidth
              value={selectionMode}
              onChange={(value) => onSelectionModeChange(value as SelectionMode)}
              data={[
                { label: "OPS", value: "ops" },
                { label: "GA", value: "ga" },
              ]}
            />
          </Paper>

          {selectionMode === "ops" ? (
            <Paper p="md" radius="sm">
              <Text size="sm" fw={500} mb="sm">
                OPS settings
              </Text>
              <Group grow align="flex-start">
                <SliderFieldWithTooltip
                  label="Latent variables (OPS)"
                  help="Number of latent variables used during OPS ranking. Higher values increase computational cost but may improve robustness."
                  value={opsSelectionSettings.latentVarsOps}
                  min={1}
                  max={maxLatentVariables}
                  step={1}
                  onChange={(v) => onOpsSettingsChange({ latentVarsOps: v })}
                />
                <SliderFieldWithTooltip
                  label="Latent variables (model)"
                  help="Number of latent variables (PLS components) used in the final OPS candidate models."
                  value={opsSelectionSettings.latentVarsModel}
                  min={1}
                  max={maxLatentVariables}
                  step={1}
                  onChange={(v) => onOpsSettingsChange({ latentVarsModel: v })}
                />
              </Group>
              <Group grow align="flex-start" mt="md">
                <SliderFieldWithTooltip
                  label="Variables percentage"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Percentage of descriptors to evaluate per OPS step. Lower values reduce the search space but may miss the best subset."
                  value={opsSelectionSettings.varsPercentage}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onChange={(v) => onOpsSettingsChange({ varsPercentage: v })}
                />
                <SliderFieldWithTooltip
                  label="Min vars per model"
                  help="Minimum number of descriptors considered for OPS candidate models."
                  value={opsSelectionSettings.minVarsModel}
                  min={1}
                  max={maxFeatureCount}
                  step={1}
                  onChange={(v) => onOpsSettingsChange({ minVarsModel: v })}
                />
              </Group>
            </Paper>
          ) : (
            <Paper p="md" radius="sm">
              <Text size="sm" fw={500} mb="sm">
                GA settings
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <NumberFieldWithTooltip
                  label="Population size"
                  help="Number of chromosomes kept in each GA population."
                  value={gaSelectionSettings.populationSize}
                  min={20}
                  max={1000}
                  step={10}
                  onChange={(v) => onGaSettingsChange({ populationSize: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
                <NumberFieldWithTooltip
                  label="Max generations"
                  help="Upper bound on the number of generations the GA can evolve."
                  value={gaSelectionSettings.maxGenerations}
                  min={10}
                  max={2000}
                  step={10}
                  onChange={(v) => onGaSettingsChange({ maxGenerations: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
                <NumberFieldWithTooltip
                  label="Stale generations"
                  help="Stop once the GA has not improved for this many generations."
                  value={gaSelectionSettings.maxStaleGenerations}
                  min={1}
                  max={1000}
                  step={1}
                  onChange={(v) => onGaSettingsChange({ maxStaleGenerations: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
                <NumberFieldWithTooltip
                  label="CV folds"
                  help="Number of cross-validation folds used to score candidate subsets."
                  value={gaSelectionSettings.cvFolds}
                  min={2}
                  max={10}
                  step={1}
                  onChange={(v) => onGaSettingsChange({ cvFolds: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
                <SliderFieldWithTooltip
                  label="Mutation probability"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Probability of mutating each chromosome."
                  value={gaSelectionSettings.mutationProbability}
                  min={0.01}
                  max={0.5}
                  step={0.01}
                  onChange={(v) => onGaSettingsChange({ mutationProbability: v })}
                />
                <SliderFieldWithTooltip
                  label="Size penalty"
                  help="Penalty applied to larger selected subsets."
                  value={gaSelectionSettings.sizePenalty}
                  min={0}
                  max={0.2}
                  step={0.005}
                  onChange={(v) => onGaSettingsChange({ sizePenalty: v })}
                />
                <SliderFieldWithTooltip
                  label="Crossover rate"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Probability that a selected pair performs crossover."
                  value={gaSelectionSettings.crossoverRate}
                  min={0.1}
                  max={1}
                  step={0.01}
                  onChange={(v) => onGaSettingsChange({ crossoverRate: v })}
                />
                <SliderFieldWithTooltip
                  label="Selection rate"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Fraction of parents selected for crossover."
                  value={gaSelectionSettings.crossoverSelectionRate}
                  min={0.1}
                  max={1}
                  step={0.01}
                  onChange={(v) => onGaSettingsChange({ crossoverSelectionRate: v })}
                />
                <SliderFieldWithTooltip
                  label="Elitism rate"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Fraction preserved as elite in each generation."
                  value={gaSelectionSettings.elitismRate}
                  min={0.01}
                  max={0.2}
                  step={0.005}
                  onChange={(v) => onGaSettingsChange({ elitismRate: v })}
                />
                <SliderFieldWithTooltip
                  label="Replacement rate"
                  sliderLabel={(v) => `${Math.round(v * 100)} %`}
                  help="Selection pressure for tournament replacement."
                  value={gaSelectionSettings.replacementRate}
                  min={0.1}
                  max={1}
                  step={0.01}
                  onChange={(v) => onGaSettingsChange({ replacementRate: v })}
                />
                <SliderFieldWithTooltip
                  label="Fitness precision"
                  help="Precision used to scale the floating-point fitness score into an integer."
                  value={gaSelectionSettings.fitnessPrecision}
                  min={1e-9}
                  max={1e-3}
                  step={1e-6}
                  onChange={(v) => onGaSettingsChange({ fitnessPrecision: v })}
                />
                <NumberFieldWithTooltip
                  label="Min features"
                  help="Minimum number of selected variables allowed by GA."
                  value={gaSelectionSettings.minFeatures}
                  min={1}
                  max={maxFeatureCount}
                  step={1}
                  onChange={(v) => onGaSettingsChange({ minFeatures: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
                <NumberFieldWithTooltip
                  label="Max features"
                  help="Maximum number of selected variables allowed by GA."
                  value={gaSelectionSettings.maxFeatures ?? maxFeatureCount}
                  min={gaSelectionSettings.minFeatures}
                  max={maxFeatureCount}
                  step={1}
                  onChange={(v) => onGaSettingsChange({ maxFeatures: v })}
                  decimalScale={0}
                  fixedDecimalScale={false}
                />
              </SimpleGrid>
            </Paper>
          )}

          {selectionMode === "ga" && (
            <Paper p="md" radius="sm">
              <Group justify="space-between" align="center" mb="xs">
                <Text size="sm" fw={500}>
                  GA progress
                </Text>
                <Badge variant="light" color="grape">
                  {gaProgress ? `${Math.round(gaProgress.progress)}%` : "Idle"}
                </Badge>
              </Group>
              <Progress value={gaProgress?.progress ?? 0} size="md" radius="xl" />
              <Group justify="space-between" mt="xs">
                <Text size="xs" c="dimmed">
                  Generation {gaProgress ? gaProgress.currentGeneration + 1 : 0} / {gaProgress?.maxGenerations ?? gaSelectionSettings.maxGenerations}
                </Text>
                <Text size="xs" c="dimmed">
                  Stale {gaProgress?.staleGenerations ?? 0}
                </Text>
              </Group>
            </Paper>
          )}

          <Box>
            <Button
              onClick={onRunSelection}
              disabled={isDisabled}
              loading={isLoading}
              variant="default"
              leftSection={<IconListCheck size="1rem" />}
            >
              Run {methodLabel}
            </Button>
          </Box>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Complete preprocessing first to enable variable selection.
        </Text>
      )}

      {selectionResult && (
        <ResultCard title="Selection completed">
          {selectionMode === "ops" && !isGaResult(selectionResult) ? (
            <>
              <Group grow>
                <Box>
                  <Text size="xs" c="dimmed">
                    Method:
                  </Text>
                  <Text fw={600}>OPS</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Selected descriptors:
                  </Text>
                  <Text fw={600}>{selectedCount}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Best RMSECV:
                  </Text>
                  <Text fw={600}>{formatScore(selectionResult.bestRmsecv)}</Text>
                </Box>
              </Group>
              <Group grow mt="sm">
                <Box>
                  <Text size="xs" c="dimmed">
                    Ranked descriptors:
                  </Text>
                  <Text fw={600}>{selectionResult.rankedIndices?.length ?? 0}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Evaluation steps:
                  </Text>
                  <Text fw={600}>{selectionResult.evaluationTrace?.length ?? 0}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Latent variables:
                  </Text>
                  <Text fw={600}>{opsSelectionSettings.latentVarsModel}</Text>
                </Box>
              </Group>
            </>
          ) : isGaResult(selectionResult) ? (
            <>
              <StatsRing
                stats={[
                  {
                    label: "Selected",
                    stats: selectionResult.selectedCount?.toString() ?? "0",
                    progress: selectionResult.selectedCount ? (selectionResult.selectedCount / maxFeatureCount) * 100 : 0,
                    color: "grape",
                    icon: <IconSparkles size="1.2rem" />,
                  },
                  {
                    label: "Raw Q²",
                    stats: formatScore(selectionResult.rawCvScore),
                    progress: selectionResult.rawCvScore != null ? Math.max(0, Math.min(100, selectionResult.rawCvScore * 100)) : 0,
                    color: "blue",
                    icon: <IconGauge size="1.2rem" />,
                  },
                  {
                    label: "Penalized",
                    stats: formatScore(selectionResult.penalizedScore),
                    progress: selectionResult.penalizedScore != null ? Math.max(0, Math.min(100, selectionResult.penalizedScore * 100)) : 0,
                    color: "cyan",
                    icon: <IconListCheck size="1.2rem" />,
                  },
                ]}
              />
              <Group grow mt="sm">
                <Box>
                  <Text size="xs" c="dimmed">
                    Fitness score:
                  </Text>
                  <Text fw={600}>{selectionResult.fitnessScore ?? "N/A"}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Best generation:
                  </Text>
                  <Text fw={600}>{selectionResult.bestGeneration ?? "-"}</Text>
                </Box>
                <Box>
                  <Text size="xs" c="dimmed">
                    Solution found:
                  </Text>
                  <Text fw={600}>{selectionResult.foundSolution ? "Yes" : "No"}</Text>
                </Box>
              </Group>
            </>
          ) : null}
        </ResultCard>
      )}
    </StepCard>
  );
}
