import { Box, Button, Checkbox, Paper, Stack, Text } from "@mantine/core";
import { IconFilter, IconX, IconCheck } from "@tabler/icons-react";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { ExpandableSection } from "../ui/ExpandableSection";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";
import type { DatasetProfile, FilterSettings } from "../../lib/mockQsarBackend";
import { StatsRing } from "../ui/StatsRing";

type FilterPanelProps = {
  uploadedDataset: DatasetProfile | null;
  activeDataset: DatasetProfile | null;
  filterSettings: FilterSettings;
  isLoading: boolean;
  isDisabled: boolean;
  onSettingsChange: (patch: Partial<FilterSettings>) => void;
  onRunFilters: () => void;
};

export function FilterPanel ({
  uploadedDataset,
  activeDataset,
  filterSettings,
  isLoading,
  isDisabled,
  onSettingsChange,
  onRunFilters,
}: FilterPanelProps) {
  const isComplete = activeDataset?.source === "filtered";

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
                label="Variance cut"
                help="Removes descriptors with low variance across samples. Higher values filter more aggressively."
                value={filterSettings.varCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ varCut: v })}
              />

              <SliderFieldWithTooltip
                label="Correlation cut"
                help="Removes highly correlated descriptors to reduce multicollinearity. Higher values filter more aggressively."
                value={filterSettings.corrCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ corrCut: v })}
              />

              <SliderFieldWithTooltip
                label="Autocorrelation cut"
                help="Removes descriptors with high autocorrelation within themselves. Lower values filter more aggressively."
                inverted
                value={filterSettings.autocorrCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onSettingsChange({ autocorrCut: v })}
              />
            </Box>
          </Paper>

          <ExpandableSection title="Fine-tune settings">
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
              <Checkbox
                label={
                  <Text size="sm">
                    LJ transform{" "}
                    <Text span c="dimmed">
                      (apply Lennard-Jones descriptor transformation)
                    </Text>
                  </Text>
                }
                checked={filterSettings.ljTransform}
                onChange={(e) => onSettingsChange({ ljTransform: e.currentTarget.checked })}
              />
            </Stack>
          </ExpandableSection>

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
              stats: activeDataset.descriptors.toString(),
              progress: (activeDataset.descriptors / uploadedDataset.descriptors) * 100,
              color: "blue",
              icon: <IconCheck />,
            },
            {
              label: "Removed",
              stats: (uploadedDataset.descriptors - activeDataset.descriptors).toString(),
              progress: (1 - activeDataset.descriptors / uploadedDataset.descriptors) * 100,
              color: "red",
              icon: <IconX />,
            },
          ]} />
        </ResultCard>
      )}
    </StepCard>
  );
}
