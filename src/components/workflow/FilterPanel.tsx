import { Alert, Box, Button, Checkbox, Paper, Stack, Text } from "@mantine/core";
import { IconFilter, IconX, IconCheck, IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { applyFilterCmd, type FilterConfig, type DatasetMetadata } from "../../generated";
import { useWorkflowContext } from "../contexts/WorkflowContext";
import { StepCard } from "../ui/StepCard";
import { ResultCard } from "../ui/ResultCard";
import { SliderFieldWithTooltip } from "../ui/SliderFieldWithTooltip";
import { StatsRing } from "../ui/StatsRing";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function FilterPanel() {
  const { uploadedDataset, activeDataset, globalBusyState, setActiveDataset, setGlobalBusyState } = useWorkflowContext();

  const [filterSettings, setFilterSettings] = useState<FilterConfig>({
    varianceCut: 0.3,
    correlationCut: 0.25,
    autocorrelationCut: 0.85,
    autoscale: true,
  });

  const [isFiltered, setIsFiltered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback((patch: Partial<FilterConfig>) => {
    setFilterSettings((s) => ({ ...s, ...patch }));
  }, []);

  const runFilters = useCallback(async () => {
    if (!uploadedDataset) return;

    try {
      setIsLoading(true);
      setGlobalBusyState("filtering");

      const result = await applyFilterCmd({ config: filterSettings });
      const descriptors = result.state.kept.length;

      const newActive: DatasetMetadata = {
        ...uploadedDataset,
        n_features: descriptors,
      };

      setActiveDataset(newActive);
      setIsFiltered(true);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, "Failed to run descriptor filters."));
    } finally {
      setIsLoading(false);
      setGlobalBusyState("idle");
    }
  }, [uploadedDataset, filterSettings, setActiveDataset, setGlobalBusyState]);

  const isDisabled = globalBusyState !== "idle";

  return (
    <StepCard
      step={2}
      title="Filter descriptors"
      description="Remove noisy variables before model selection"
      isComplete={isFiltered}
      disabled={isDisabled}
    >
      {error && (
        <Alert icon={<IconAlertCircle size="1rem" />} color="red">
          {error}
        </Alert>
      )}
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
                onChange={(v) => updateSettings({ varianceCut: v })}
              />

              <SliderFieldWithTooltip
                label="Correlation filter"
                help="Minimum feature-target correlation threshold. Higher values filter more aggressively."
                value={filterSettings.correlationCut}
                inverted
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateSettings({ correlationCut: v })}
              />

              <SliderFieldWithTooltip
                label="Collinearity filter"
                help="Maximum correlation between features. Lower values filter more aggressively."
                value={filterSettings.autocorrelationCut}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => updateSettings({ autocorrelationCut: v })}
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
                onChange={(e) => updateSettings({ autoscale: e.currentTarget.checked })}
              />
            </Stack>

          <Box>
            <Button
              onClick={runFilters}
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

      {uploadedDataset && activeDataset && isFiltered && (
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
