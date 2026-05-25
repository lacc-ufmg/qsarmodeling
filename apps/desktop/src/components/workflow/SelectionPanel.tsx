import { Box, Button, Group, Paper, Radio, Stack, Text } from "@mantine/core";
import { IconListCheck } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { ExpandableSection } from "../ui/ExpandableSection";
import type { DatasetProfile, SelectionResult, SelectionSettings } from "../../lib/mockQsarBackend";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";

type SelectionPanelProps = {
  activeDataset: DatasetProfile | null;
  selectionResult: SelectionResult | null;
  selectionSettings: SelectionSettings;
  isLoading: boolean;
  isDisabled: boolean;
  onSettingsChange: (patch: Partial<SelectionSettings>) => void;
  onRunSelection: () => void;
};

export function SelectionPanel({
  activeDataset,
  selectionResult,
  selectionSettings,
  isLoading,
  isDisabled,
  onSettingsChange,
  onRunSelection,
}: SelectionPanelProps) {
  const isOps = selectionSettings.method === "ops";

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
              Choose selection method
            </Text>
            <Radio.Group
              value={selectionSettings.method}
              onChange={(v) => onSettingsChange({ method: v as "ops" | "ga" })}
            >
              <Group mt="xs">
                <Radio
                  value="ops"
                  label={
                    <Text size="sm">
                      OPS{" "}
                      <Text span size="xs" c="dimmed">
                        (Ordered Predictors Selection)
                      </Text>
                    </Text>
                  }
                />
                <Radio
                  value="ga"
                  label={
                    <Text size="sm">
                      GA{" "}
                      <Text span size="xs" c="dimmed">
                        (Genetic Algorithm)
                      </Text>
                    </Text>
                  }
                />
              </Group>
            </Radio.Group>
          </Paper>

          <Paper p="md" radius="sm">
            <Text size="sm" fw={500} mb="sm">
              Basic settings
            </Text>
            <Group grow>
              {isOps && (
                <SliderFieldWithTooltip
                  label="Latent variables (OPS)"
                  help="Number of latent variables used during OPS selection process. Higher values increase computational cost but may improve robustness."
                  value={selectionSettings.latentVarsOps}
                  min={1}
                  max={Math.min(20, activeDataset.rows - 2, activeDataset.descriptors)}
                  step={1}
                  onChange={(v) => onSettingsChange({ latentVarsOps: v })}
                />
              )}
              <SliderFieldWithTooltip
                label="Latent variables (model)"
                help="Number of latent variables (PLS components) in the final model. Higher values provide better quality with longer calculations."
                value={selectionSettings.latentVarsModel}
                min={1}
                max={Math.min(20, activeDataset.rows - 2, isOps ? selectionSettings.latentVarsOps : selectionSettings.maxVarsModel)}
                step={1}
                onChange={(v) => onSettingsChange({ latentVarsModel: v })}
              />
            </Group>
          </Paper>

          <ExpandableSection
            title={`${isOps ? "OPS" : "GA"} fine-tuning`}
          >
            <Stack gap="md">
              {isOps ? (
                <SliderFieldWithTooltip
                  label="Variables percentage"
                  sliderLabel={(v) => `${v}%`}
                  help="Percentage of descriptors to evaluate during OPS selection. Lower values reduce search space but may miss optimal features."
                  value={selectionSettings.varsPercentage}
                  min={1}
                  max={99}
                  step={1}
                  onChange={(v) => onSettingsChange({ varsPercentage: v })}
                />
              ) : (
                <>
                  <Group grow>
                    <SliderFieldWithTooltip
                      label="Min vars per model"
                      help="Minimum number of descriptors in any candidate model. Higher values create more complex models but reduce overfitting risk."
                      value={selectionSettings.minVarsModel}
                      min={2}
                      max={selectionSettings.maxVarsModel}
                      step={1}
                      onChange={(v) => onSettingsChange({ minVarsModel: v })}
                    />
                    <SliderFieldWithTooltip
                      label="Max vars per model"
                      help="Maximum number of descriptors in any candidate model. Lower values favor simpler models; higher values allow more complex solutions."
                      value={selectionSettings.maxVarsModel}
                      min={2}
                      max={activeDataset.descriptors}
                      step={1}
                      onChange={(v) => onSettingsChange({ maxVarsModel: v })}
                    />
                  </Group>
                  <Group grow>
                    <SliderFieldWithTooltip
                      label="Population size"
                      help="Number of models in each generation of the genetic algorithm. Larger populations explore the search space better but increase computation time."
                      value={selectionSettings.populationSize}
                      min={2}
                      max={300}
                      step={1}
                      onChange={(v) => onSettingsChange({ populationSize: v })}
                    />
                    <SliderFieldWithTooltip
                      label="Generations"
                      help="Number of generations to evolve in the genetic algorithm. More generations improve convergence but require longer computation."
                      value={selectionSettings.generations}
                      min={1}
                      max={500}
                      step={1}
                      onChange={(v) => onSettingsChange({ generations: v })}
                    />
                  </Group>
                </>
              )}
            </Stack>
          </ExpandableSection>

          <Box>
            <Button
              onClick={onRunSelection}
              disabled={isDisabled}
              loading={isLoading}
              variant="default"
              leftSection={<IconListCheck size="1rem" />}
            >
              Run {selectionSettings.method.toUpperCase()}
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
              <Text fw={600}>{selectionResult.method.toUpperCase()}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Descriptors:
              </Text>
              <Text fw={600}>{selectionResult.selectedDescriptors}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Q²:
              </Text>
              <Text fw={600}>{selectionResult.q2.toFixed(3)}</Text>
            </Box>
          </Group>
          <Group grow mt="sm">
            <Box>
              <Text size="xs" c="dimmed">
                R²:
              </Text>
              <Text fw={600}>{selectionResult.r2.toFixed(3)}</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">
                Latent variables:
              </Text>
              <Text fw={600}>{selectionResult.latentVariables}</Text>
            </Box>
          </Group>
        </ResultCard>
      )}
    </StepCard>
  );
}
