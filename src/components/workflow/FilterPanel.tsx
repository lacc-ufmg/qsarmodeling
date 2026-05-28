import { Box, Button, Checkbox, Paper, Stack, Text } from "@mantine/core";
import { IconFilter, IconX, IconCheck } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";
import type { DatasetMetadata, FilterConfig } from "../../generated";
import { StatsRing } from "../ui/StatsRing";

type FilterPanelProps = {
  uploadedDataset: DatasetMetadata | null;
  activeDataset: DatasetMetadata | null;
  filterSettings: FilterConfig;
  isFiltered: boolean;
  isLoading: boolean;
  isDisabled: boolean;
  onSettingsChange: (patch: Partial<FilterConfig>) => void;
  onRunFilters: () => void;
};

export function FilterPanel ({
  uploadedDataset,
  activeDataset,
  filterSettings,
  isFiltered,
  isLoading,
  isDisabled,
  onSettingsChange,
  onRunFilters,
}: FilterPanelProps) {
  const isComplete = isFiltered;

  return (
    <StepCard
      step={2}
      title="Filter descriptors"
      description="Remove noisy variables before model selection"
      isComplete={isComplete}
      disabled={isDisabled}
    >
      {uploadedDataset ? (
        <Stack>
          <Paper p="md" radius="sm">
            <Text size="sm" fw={500} mb="sm">
              Basic settings (recommended for most datasets)
            </Text>
            <Box>
              <SliderFieldWithTooltip
                label="Variance filter"
                help="Minimum variance to keep a feature. Higher values filter more aggressively."
                inverted
                value={filterSettings.varianceCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ varianceCut: v })}
              />

              <SliderFieldWithTooltip
                label="Correlation filter"
                help="Minimum feature-target correlation threshold. Higher values filter more aggressively."
                value={filterSettings.correlationCut}
                inverted
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ correlationCut: v })}
              />

              <SliderFieldWithTooltip
                label="Collinearity filter"
                help="Maximum correlation between features. Lower values filter more aggressively."
                value={filterSettings.autocorrelationCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ autocorrelationCut: v })}
              />
            </Box>
          </Paper>

            <Stack gap="sm">
              <Checkbox
                label={
                  <Text size="sm">
                    Autoscale{" "}
                    <Text span c="dimmed">
                      (mean-center and scale to unit variance)
                    </Text>
                  </Text>
                }
                checked={filterSettings.autoscale}
                onChange={(e) => onSettingsChange({ autoscale: e.currentTarget.checked })}
              />
            </Stack>

          <Box>
            <Button
              onClick={onRunFilters}
              disabled={isDisabled}
              loading={isLoading}
              variant="default"
              leftSection={<IconFilter size="1rem" />}
            >
              Apply filters
            </Button>
          </Box>
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Load a dataset first to enable filtering.
        </Text>
      )}

      {uploadedDataset && activeDataset && isComplete && (
        <ResultCard title="Filters applied successfully">
          <StatsRing stats={[
            {
              label: "Active descriptors",
              stats: activeDataset.n_features.toString(),
              progress: (activeDataset.n_features / uploadedDataset.n_features) * 100,
              color: "blue",
              icon: <IconCheck />,
            },
            {
              label: "Removed",
              stats: (uploadedDataset.n_features - activeDataset.n_features).toString(),
              progress: (1 - activeDataset.n_features / uploadedDataset.n_features) * 100,
              color: "red",
              icon: <IconX />,
            },
          ]} />
        </ResultCard>
      )}
    </StepCard>
  );
}
