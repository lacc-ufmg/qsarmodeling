import { Box, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import type { DatasetMetadata, OpsResult, OpsConfig } from "../../generated";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";

type SelectionPanelProps = {
  activeDataset: DatasetMetadata | null;
  selectionResult: OpsResult | null;
  selectionSettings: OpsConfig;
  isLoading: boolean;
  isDisabled: boolean;
  onSettingsChange: (patch: Partial<OpsConfig>) => void;
  onRunSelection: () => void;
};

export function SelectionPanel ({
  activeDataset,
  selectionResult,
  selectionSettings,
  isLoading,
  isDisabled,
  onSettingsChange,
  onRunSelection,
}: SelectionPanelProps) {
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
            <Text size="sm" fw={500} mb="sm">
              Selection method
            </Text>
            <Text size="sm">Using OPS (Ordered Predictors Selection)</Text>
          </Paper>

          <Paper p="md" radius="sm">
            <Text size="sm" fw={500} mb="sm">
              Basic settings
            </Text>
            <Group grow>
              <SliderFieldWithTooltip
                label="Latent variables (OPS)"
                help="Number of latent variables used during OPS selection process. Higher values increase computational cost but may improve robustness."
                value={selectionSettings.latentVarsOps}
                min={1}
                max={Math.min(20, activeDataset.n_samples - 2, activeDataset.n_features)}
                step={1}
                onChange={(v) => onSettingsChange({ latentVarsOps: v })}
              />
              <SliderFieldWithTooltip
                label="Latent variables (model)"
                help="Number of latent variables (PLS components) in the final model. Higher values provide better quality with longer calculations."
                value={selectionSettings.latentVarsModel}
                min={1}
                max={Math.min(20, activeDataset.n_samples - 2, activeDataset.n_features)}
                step={1}
                onChange={(v) => onSettingsChange({ latentVarsModel: v })}
              />
            </Group>
            <Group grow>
              <SliderFieldWithTooltip
                label="Variables percentage"
                sliderLabel={(v) => `${Math.round(v * 100)} %`}
                help="Percentage of descriptors to evaluate during OPS selection. Lower values reduce search space but may miss optimal features."
                value={selectionSettings.varsPercentage}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ varsPercentage: v })}
              />

              <SliderFieldWithTooltip
                label="Min vars per model"
                help="Minimum number of descriptors in any candidate model. Higher values create more complex models but reduce overfitting risk."
                value={selectionSettings.minVarsModel}
                min={1}
                max={activeDataset.n_features}
                step={1}
                onChange={(v) => onSettingsChange({ minVarsModel: v })}
              />
            </Group>
          </Paper>

          <Box>
            <Button
              onClick={onRunSelection}
              disabled={isDisabled}
              loading={isLoading}
              variant="default"
              leftSection={<IconListCheck size="1rem" />}
            >
              Run OPS
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
          <Group grow>
            <Box>
              <Text size="xs" c="dimmed">
                Method:
              </Text>
              <Text fw={600}>OPS</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Descriptors:
              </Text>
              <Text fw={600}>{selectionResult.selectedIndices.length}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Best RMSECV:
              </Text>
              <Text fw={600}>{selectionResult.bestRmsecv.toFixed(3)}</Text>
            </Box>
          </Group>
          <Group grow mt="sm">
            <Box>
              <Text size="xs" c="dimmed">
                Ranked descriptors:
              </Text>
              <Text fw={600}>{selectionResult.rankedIndices.length}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Evaluation steps:
              </Text>
              <Text fw={600}>{selectionResult.evaluationTrace.length}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Latent variables:
              </Text>
              <Text fw={600}>{selectionSettings.latentVarsModel}</Text>
            </Box>
          </Group>
        </ResultCard>
      )}
    </StepCard>
  );
}
